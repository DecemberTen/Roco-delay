const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;
const passConfig = require("./passConfig");

const COLLECTIONS = ["users", "posts", "matches"];
const PASS_TYPES = passConfig.passTypes.map((item) => item.value);
const PET_IDS = passConfig.pets.map((item) => item.value);
const ROLES = ["buyer", "seller"];
const POST_STATUS = ["matching", "matched", "open", "contacted", "completed", "closed"];
const POOL_STATUS = ["matching"];

const ok = (data = {}) => ({
  success: true,
  data,
});

const fail = (message, code = "BAD_REQUEST") => ({
  success: false,
  code,
  message,
});

const now = () => db.serverDate();

const getWxContext = () => {
  const wxContext = cloud.getWXContext();
  if (!wxContext.OPENID) {
    throw new Error("OPENID_NOT_FOUND");
  }
  return wxContext;
};

const ensureCollections = async () => {
  await Promise.all(
    COLLECTIONS.map(async (name) => {
      try {
        await db.createCollection(name);
      } catch (error) {
        // 集合已存在时会抛错，这里忽略即可。
      }
    })
  );
};

const getOpenId = async () => {
  const wxContext = getWxContext();
  return ok({
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  });
};

const getPassConfig = async () =>
  ok({
    passTypes: passConfig.passTypes,
    pets: passConfig.pets,
  });

const login = async () => {
  const wxContext = getWxContext();
  const openid = wxContext.OPENID;
  const users = db.collection("users");
  const userResp = await users.where({ _openid: openid }).limit(1).get();

  if (!userResp.data.length) {
    const addResp = await users.add({
      data: {
        _openid: openid,
        rocoUid: "",
        rocoName: "",
        contactType: "",
        contactValue: "",
        role: "user",
        createdAt: now(),
        updatedAt: now(),
        lastLoginAt: now(),
      },
    });
    return ok({
      openid,
      user: {
        _id: addResp._id,
        _openid: openid,
        rocoUid: "",
        rocoName: "",
        contactType: "",
        contactValue: "",
        role: "user",
      },
    });
  }

  const user = userResp.data[0];
  await users.doc(user._id).update({
    data: {
      lastLoginAt: now(),
      updatedAt: now(),
    },
  });
  return ok({
    openid,
    user,
  });
};

const getProfile = async () => {
  const { OPENID } = getWxContext();
  const resp = await db.collection("users").where({ _openid: OPENID }).limit(1).get();
  return ok(resp.data[0] || null);
};

const saveUserProfile = async (event) => {
  const { OPENID } = getWxContext();
  const data = event.data || {};
  const rocoUid = String(data.rocoUid || "").trim();
  const rocoName = String(data.rocoName || "").trim();
  const contactType = String(data.contactType || "").trim();
  const contactValue = String(data.contactValue || "").trim();

  if (!rocoUid) return fail("请填写洛克王国 UID");
  if (!contactType) return fail("请选择联系方式类型");
  if (!contactValue) return fail("请填写联系方式");

  const users = db.collection("users");
  const payload = {
    rocoUid,
    rocoName,
    contactType,
    contactValue,
    updatedAt: now(),
  };
  const userResp = await users.where({ _openid: OPENID }).limit(1).get();

  if (!userResp.data.length) {
    const addResp = await users.add({
      data: {
        _openid: OPENID,
        ...payload,
        role: "user",
        createdAt: now(),
        lastLoginAt: now(),
      },
    });
    return ok({
      _id: addResp._id,
      _openid: OPENID,
      ...payload,
    });
  }

  const user = userResp.data[0];
  await users.doc(user._id).update({ data: payload });
  return ok({
    ...user,
    ...payload,
  });
};

const assertProfileReady = async (openid) => {
  const resp = await db.collection("users").where({ _openid: openid }).limit(1).get();
  const user = resp.data[0];
  if (!user || !user.rocoUid || !user.contactType || !user.contactValue) {
    return null;
  }
  return user;
};

const createPost = async (event) => {
  const { OPENID } = getWxContext();
  const user = await assertProfileReady(OPENID);
  if (!user) return fail("请先绑定洛克王国 UID 和联系方式", "PROFILE_REQUIRED");

  const data = event.data || {};
  const role = String(data.role || "").trim();
  const passType = String(data.passType || "").trim();
  const petId = String(data.petId || "").trim();
  const petName = String(data.petName || "").trim();
  const remark = String(data.remark || "").trim();

  if (!ROLES.includes(role)) return fail("请选择发布身份");
  if (!PASS_TYPES.includes(passType)) return fail("请选择通行证版本");
  if (!PET_IDS.includes(petId)) return fail("请选择通行证精灵");

  const activeResp = await db
    .collection("posts")
    .where({
      _openid: OPENID,
      status: _.in(["matching", "matched"]),
    })
    .limit(1)
    .get();
  if ((activeResp.data || []).length > 0) {
    return fail("你已有进行中的发布，请先完成或关闭后再发布", "ACTIVE_POST_EXISTS");
  }

  const addResp = await db.collection("posts").add({
    data: {
      _openid: OPENID,
      role,
      passType,
      petId,
      petName,
      remark,
      status: "matching",
      matchId: "",
      rocoUid: user.rocoUid,
      rocoName: user.rocoName || "",
      contactType: user.contactType,
      contactValue: user.contactValue,
      createdAt: now(),
      updatedAt: now(),
    },
  });

  return ok({
    _id: addResp._id,
  });
};

const buildPostQuery = (filters = {}) => {
  const query = {};
  if (filters.role && ROLES.includes(filters.role)) query.role = filters.role;
  if (filters.passType && PASS_TYPES.includes(filters.passType)) query.passType = filters.passType;
  if (filters.petId && PET_IDS.includes(filters.petId)) query.petId = filters.petId;
  if (Array.isArray(filters.statuses)) {
    const statuses = filters.statuses.filter((status) => POST_STATUS.includes(status));
    if (statuses.length) query.status = _.in(statuses);
  } else if (filters.status && POST_STATUS.includes(filters.status)) {
    query.status = filters.status;
  } else {
    query.status = _.in(POOL_STATUS);
  }
  return query;
};

const listMatches = async (event) => {
  const data = event.data || {};
  const role = data.requesterRole === "seller" ? "buyer" : "seller";
  const query = buildPostQuery({
    role,
    passType: data.passType,
    petId: data.petId,
    statuses: POOL_STATUS,
  });

  const resp = await db
    .collection("posts")
    .where(query)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();
  return ok(resp.data);
};

const listPosts = async (event) => {
  const data = event.data || {};
  const query = buildPostQuery(data);
  const resp = await db
    .collection("posts")
    .where(query)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();
  return ok(resp.data);
};

const getHomeSummary = async () => {
  await ensureCollections();
  const [openResp, completedResp] = await Promise.all([
    db
      .collection("posts")
      .where({
        status: _.in(POOL_STATUS),
      })
      .orderBy("createdAt", "desc")
      .limit(100)
      .get(),
    db
      .collection("matches")
      .where({
        status: "completed",
      })
      .count(),
  ]);
  const posts = openResp.data || [];

  const summary = posts.reduce(
    (acc, post) => {
      if (post.role === "buyer") acc.buyers += 1;
      if (post.role === "seller") acc.sellers += 1;
      return acc;
    },
    {
      buyers: 0,
      sellers: 0,
      completed: completedResp.total || 0,
      total: posts.length,
    }
  );

  return ok({
    summary,
  });
};

const listLatestPosts = async (event) => {
  const data = event.data || {};
  const query = buildPostQuery({
    passType: data.passType,
    petId: data.petId,
    statuses: ["matching", "matched"],
  });
  const resp = await db
    .collection("posts")
    .where(query)
    .orderBy("createdAt", "desc")
    .limit(20)
    .get();

  return ok(resp.data || []);
};

const listMyMatchedPosts = async () => {
  const { OPENID } = getWxContext();
  const resp = await db
    .collection("posts")
    .where({
      _openid: OPENID,
      status: "matched",
    })
    .orderBy("createdAt", "desc")
    .limit(20)
    .get();
  return ok(resp.data || []);
};

const listMyActivePosts = async () => {
  const { OPENID } = getWxContext();
  const resp = await db
    .collection("posts")
    .where({
      _openid: OPENID,
      status: _.in(["matching", "matched"]),
    })
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();
  return ok(resp.data || []);
};

const getPostByTransaction = async (transaction, id) => {
  const resp = await transaction.collection("posts").doc(id).get();
  return resp.data;
};

const tryCreateMatch = async (buyerPostId, sellerPostId) => {
  try {
    const result = await db.runTransaction(async (transaction) => {
      const [buyerPost, sellerPost] = await Promise.all([
        getPostByTransaction(transaction, buyerPostId),
        getPostByTransaction(transaction, sellerPostId),
      ]);

      if (!buyerPost || !sellerPost) return null;
      if (buyerPost.role !== "buyer" || sellerPost.role !== "seller") return null;
      if (!POOL_STATUS.includes(buyerPost.status) || !POOL_STATUS.includes(sellerPost.status)) return null;
      if (buyerPost.matchId || sellerPost.matchId) return null;
      if (buyerPost._openid === sellerPost._openid) return null;
      if (buyerPost.passType !== sellerPost.passType || buyerPost.petId !== sellerPost.petId) return null;

      const matchResp = await transaction.collection("matches").add({
        data: {
          buyerPostId,
          sellerPostId,
          buyerOpenid: buyerPost._openid,
          sellerOpenid: sellerPost._openid,
          passType: buyerPost.passType,
          petId: buyerPost.petId,
          petName: buyerPost.petName || sellerPost.petName || "",
          status: "matched",
          createdAt: now(),
          updatedAt: now(),
        },
      });
      const matchId = matchResp._id;
      await Promise.all([
        transaction.collection("posts").doc(buyerPostId).update({
          data: {
            status: "matched",
            matchId,
            matchedAt: now(),
            updatedAt: now(),
          },
        }),
        transaction.collection("posts").doc(sellerPostId).update({
          data: {
            status: "matched",
            matchId,
            matchedAt: now(),
            updatedAt: now(),
          },
        }),
      ]);

      return {
        matchId,
        buyerPostId,
        sellerPostId,
      };
    });
    return result;
  } catch (error) {
    console.error("try create match failed", error);
    return null;
  }
};

const autoMatchBatch = async () => {
  console.log("[autoMatchBatch] 开始执行批量撮合");
  await ensureCollections();
  const [buyersResp, sellersResp] = await Promise.all([
    db
      .collection("posts")
      .where({
        role: "buyer",
        status: _.in(POOL_STATUS),
        matchId: _.in(["", null]),
      })
      .orderBy("createdAt", "asc")
      .limit(100)
      .get(),
    db
      .collection("posts")
      .where({
        role: "seller",
        status: _.in(POOL_STATUS),
        matchId: _.in(["", null]),
      })
      .orderBy("createdAt", "asc")
      .limit(100)
      .get(),
  ]);
  const sellersByKey = (sellersResp.data || []).reduce((acc, seller) => {
    const key = `${seller.passType}:${seller.petId}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(seller);
    return acc;
  }, {});
  const usedSellerIds = {};
  const created = [];

  for (const buyer of buyersResp.data || []) {
    const key = `${buyer.passType}:${buyer.petId}`;
    const seller = (sellersByKey[key] || []).find(
      (item) => !usedSellerIds[item._id] && item._openid !== buyer._openid
    );
    if (!seller) continue;
    usedSellerIds[seller._id] = true;

    const match = await tryCreateMatch(buyer._id, seller._id);
    if (match) created.push(match);
  }

  return ok({
    matchedCount: created.length,
    matches: created,
  });
};

const listMyPosts = async () => {
  const { OPENID } = getWxContext();
  const resp = await db
    .collection("posts")
    .where({
      _openid: OPENID,
    })
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();
  return ok(resp.data);
};

const getPostDetail = async (event) => {
  const id = String((event.data && event.data.id) || "").trim();
  if (!id) return fail("缺少发布 ID");

  const resp = await db.collection("posts").doc(id).get();
  const post = resp.data;
  if (!post) return ok(null);

  let match = null;
  let counterpart = null;
  if (post.matchId) {
    try {
      const matchResp = await db.collection("matches").doc(post.matchId).get();
      match = matchResp.data || null;
      if (match) {
        const counterpartPostId = post.role === "buyer" ? match.sellerPostId : match.buyerPostId;
        if (counterpartPostId) {
          const counterpartResp = await db.collection("posts").doc(counterpartPostId).get();
          counterpart = counterpartResp.data || null;
        }
      }
    } catch (error) {
      console.error("load match detail failed", error);
    }
  }

  return ok({
    post,
    match,
    counterpart,
  });
};

const updatePostStatus = async (event) => {
  const { OPENID } = getWxContext();
  const data = event.data || {};
  const id = String(data.id || "").trim();
  const status = String(data.status || "").trim();

  if (!id) return fail("缺少发布 ID");
  if (!["matching", "completed", "closed"].includes(status)) return fail("状态不正确");

  const postResp = await db.collection("posts").doc(id).get();
  const post = postResp.data;
  if (!post || post._openid !== OPENID) {
    return fail("只能修改自己的发布", "FORBIDDEN");
  }

  const validTransitions = {
    matching: ["closed"],
    matched: ["completed", "closed"],
    completed: [],
    closed: [],
  };
  if (!validTransitions[post.status]?.includes(status)) {
    return fail("当前状态不允许该操作", "INVALID_STATUS_TRANSITION");
  }

  const currentTime = now();

  if (post.status === "matched" && ["completed", "closed"].includes(status)) {
    const matchStatus = status === "completed" ? "completed" : "canceled";
    await db.runTransaction(async (transaction) => {
      const matchResp = await transaction.collection("matches").doc(post.matchId).get();
      const match = matchResp.data;
      if (!match) {
        throw new Error("MATCH_NOT_FOUND");
      }
      const counterpartPostId = post.role === "buyer" ? match.sellerPostId : match.buyerPostId;

      const selfUpdate = {
        status,
        updatedAt: currentTime,
      };
      if (status === "completed") selfUpdate.completedAt = currentTime;
      if (status === "closed") selfUpdate.closedAt = currentTime;
      await transaction.collection("posts").doc(id).update({ data: selfUpdate });

      if (counterpartPostId) {
        const counterpartUpdate =
          status === "completed"
            ? { status: "completed", completedAt: currentTime, updatedAt: currentTime }
            : {
                status: "matching",
                matchId: "",
                matchedAt: _.remove(),
                updatedAt: currentTime,
              };
        await transaction.collection("posts").doc(counterpartPostId).update({ data: counterpartUpdate });
      }

      const matchUpdate = {
        status: matchStatus,
        updatedAt: currentTime,
      };
      if (status === "completed") matchUpdate.completedAt = currentTime;
      if (status === "closed") {
        matchUpdate.canceledAt = currentTime;
        matchUpdate.canceledBy = OPENID;
      }
      await transaction.collection("matches").doc(post.matchId).update({ data: matchUpdate });
    });
  } else {
    const updateData = {
      status,
      updatedAt: currentTime,
    };
    if (status === "closed") updateData.closedAt = currentTime;
    if (status === "matching") {
      updateData.matchId = "";
      updateData.matchedAt = _.remove();
    }
    await db.collection("posts").doc(id).update({
      data: updateData,
    });
  }
  return ok({
    id,
    status,
  });
};

const createCollection = async () => {
  await ensureCollections();
  return ok({
    collections: COLLECTIONS,
  });
};

exports.main = async (event) => {
  try {
    if (!event.type && (event.Type === "Timer" || event.triggerName || event.TriggerName)) {
      return await autoMatchBatch();
    }

    switch (event.type) {
      case "getOpenId":
        return await getOpenId();
      case "getPassConfig":
        return await getPassConfig();
      case "login":
        return await login();
      case "getProfile":
        return await getProfile();
      case "saveUserProfile":
        return await saveUserProfile(event);
      case "createPost":
        return await createPost(event);
      case "listMatches":
        return await listMatches(event);
      case "listPosts":
        return await listPosts(event);
      case "getHomeSummary":
        return await getHomeSummary();
      case "listLatestPosts":
        return await listLatestPosts(event);
      case "listMyMatchedPosts":
        return await listMyMatchedPosts();
      case "listMyActivePosts":
        return await listMyActivePosts();
      case "autoMatchBatch":
        return await autoMatchBatch();
      case "listMyPosts":
        return await listMyPosts();
      case "getPostDetail":
        return await getPostDetail(event);
      case "updatePostStatus":
        return await updatePostStatus(event);
      case "createCollection":
        return await createCollection();
      default:
        return fail("未知操作类型");
    }
  } catch (error) {
    return fail(error.message || "服务异常", "SERVER_ERROR");
  }
};
