const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

const COLLECTIONS = ["users", "posts"];
const PASS_TYPES = ["basic", "premium"];
const PET_IDS = ["petA", "petB"];
const ROLES = ["buyer", "seller"];
const POST_STATUS = ["open", "contacted", "completed", "closed"];

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

  const addResp = await db.collection("posts").add({
    data: {
      _openid: OPENID,
      role,
      passType,
      petId,
      petName,
      remark,
      status: "open",
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
  if (filters.status && POST_STATUS.includes(filters.status)) {
    query.status = filters.status;
  } else {
    query.status = "open";
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
    status: "open",
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
  const [openResp, completedResp] = await Promise.all([
    db
      .collection("posts")
      .where({
        status: "open",
      })
      .orderBy("createdAt", "desc")
      .limit(100)
      .get(),
    db
      .collection("posts")
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
    status: "open",
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
  const myResp = await db
    .collection("posts")
    .where({
      _openid: OPENID,
      status: "open",
    })
    .orderBy("createdAt", "desc")
    .limit(20)
    .get();
  const myPosts = myResp.data || [];

  const groups = await Promise.all(
    myPosts.map(async (post) => {
      const oppositeRole = post.role === "buyer" ? "seller" : "buyer";
      const matchResp = await db
        .collection("posts")
        .where({
          role: oppositeRole,
          status: "open",
          passType: post.passType,
          petId: post.petId,
          _openid: _.neq(OPENID),
        })
        .orderBy("createdAt", "desc")
        .limit(5)
        .get();

      return {
        post,
        matchCount: matchResp.data.length,
        matches: matchResp.data,
      };
    })
  );

  return ok(groups.filter((group) => group.matchCount > 0));
};

const listMyActivePosts = async () => {
  const { OPENID } = getWxContext();
  const resp = await db
    .collection("posts")
    .where({
      _openid: OPENID,
      status: _.in(["open", "contacted"]),
    })
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();
  return ok(resp.data || []);
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
  return ok(resp.data);
};

const updatePostStatus = async (event) => {
  const { OPENID } = getWxContext();
  const data = event.data || {};
  const id = String(data.id || "").trim();
  const status = String(data.status || "").trim();

  if (!id) return fail("缺少发布 ID");
  if (!POST_STATUS.includes(status)) return fail("状态不正确");

  const postResp = await db.collection("posts").doc(id).get();
  const post = postResp.data;
  if (!post || post._openid !== OPENID) {
    return fail("只能修改自己的发布", "FORBIDDEN");
  }

  await db.collection("posts").doc(id).update({
    data: {
      status,
      updatedAt: now(),
    },
  });
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
    switch (event.type) {
      case "getOpenId":
        return await getOpenId();
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
