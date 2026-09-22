const CLOUD_FUNCTION = "quickstartFunctions";
const LOGIN_EXPIRE_MS = 30 * 24 * 60 * 60 * 1000;

const passTypes = [
  { label: "基础版", value: "basic" },
  { label: "豪华版", value: "premium" },
];

const pets = [];

const roles = [
  { label: "我要接火", value: "buyer" },
  { label: "我要传火", value: "seller" },
];

const statusMap = {
  matching: "匹配中",
  matched: "已匹配",
  open: "匹配中",
  contacted: "已匹配",
  completed: "已完成",
  closed: "已关闭",
};

const contactTypeMap = {
  qq: "QQ",
  wechat: "微信",
  group: "群号",
  other: "其他",
};

const call = async (type, data = {}) => {
  const resp = await wx.cloud.callFunction({
    name: CLOUD_FUNCTION,
    data: {
      type,
      data,
    },
  });
  const result = resp.result || {};
  if (!result.success) {
    throw result;
  }
  return result.data;
};

const clearLoginState = () => {
  wx.removeStorageSync("loginState");
  wx.removeStorageSync("wechatProfile");
};

const getLoginState = () => {
  const state = wx.getStorageSync("loginState") || null;
  if (!state || !state.openid || !state.loginAt) return null;
  if (Date.now() - state.loginAt > LOGIN_EXPIRE_MS) {
    clearLoginState();
    return null;
  }
  return state;
};

const isLoggedIn = () => Boolean(getLoginState()?.openid);

const login = async () => {
  const data = await call("login");
  wx.setStorageSync("loginState", {
    openid: data.openid,
    userId: data.user?._id || "",
    loginAt: Date.now(),
  });
  const app = getApp();
  if (app && app.globalData) {
    app.globalData.openid = data.openid;
    app.globalData.user = data.user;
  }
  return data;
};

const getErrorMessage = (error, fallback = "操作失败") =>
  error?.message || error?.errMsg || error?.errmsg || fallback;

const loginWithWechatProfile = async () => {
  if (typeof wx.getUserProfile !== "function") {
    throw new Error("当前微信版本不支持 wx.getUserProfile");
  }
  const profileResp = await new Promise((resolve, reject) => {
    wx.getUserProfile({
      desc: "用于传火匹配登录",
      success: resolve,
      fail: reject,
    });
  });
  wx.setStorageSync("wechatProfile", profileResp.userInfo || {});
  return login();
};

const replaceOptions = (target, source) => {
  target.splice(0, target.length, ...(Array.isArray(source) ? source : []));
};

const loadPassConfig = async () => {
  const config = await call("getPassConfig");
  if (Array.isArray(config.passTypes) && config.passTypes.length) {
    replaceOptions(passTypes, config.passTypes);
  }
  if (Array.isArray(config.pets) && config.pets.length) {
    replaceOptions(pets, config.pets);
  }
  return {
    passTypes,
    pets,
  };
};

const findLabel = (options, value) => {
  const item = options.find((option) => option.value === value);
  return item ? item.label : value || "";
};

const formatPost = (post) => ({
  ...post,
  roleLabel: findLabel(roles, post.role),
  targetRoleLabel: post.role === "buyer" ? "接火方" : "传火方",
  flowStatusLabel:
    post.status === "matched" || post.status === "contacted"
      ? post.role === "buyer"
        ? "接火中"
        : "传火中"
      : statusMap[post.status] || post.status,
  passTypeLabel: findLabel(passTypes, post.passType),
  petLabel: post.petName || findLabel(pets, post.petId),
  statusLabel: statusMap[post.status] || post.status,
  contactTypeLabel: contactTypeMap[post.contactType] || post.contactType || "",
});

module.exports = {
  call,
  passTypes,
  pets,
  roles,
  statusMap,
  contactTypeMap,
  findLabel,
  formatPost,
  getLoginState,
  clearLoginState,
  getErrorMessage,
  isLoggedIn,
  login,
  loginWithWechatProfile,
  loadPassConfig,
};
