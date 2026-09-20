const CLOUD_FUNCTION = "quickstartFunctions";

const passTypes = [
  { label: "基础版", value: "basic" },
  { label: "豪华版", value: "premium" },
];

const pets = [
  { label: "通行证精灵 A", value: "petA" },
  { label: "通行证精灵 B", value: "petB" },
];

const roles = [
  { label: "我要接火", value: "buyer" },
  { label: "我要传火", value: "seller" },
];

const statusMap = {
  open: "待匹配",
  contacted: "已联系",
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

const findLabel = (options, value) => {
  const item = options.find((option) => option.value === value);
  return item ? item.label : value || "";
};

const formatPost = (post) => ({
  ...post,
  roleLabel: findLabel(roles, post.role),
  targetRoleLabel: post.role === "buyer" ? "接火方" : "传火方",
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
};
