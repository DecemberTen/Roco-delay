const {
  call,
  contactTypeMap,
  formatPost,
  getErrorMessage,
  isLoggedIn,
  loginWithWechatProfile,
} = require("../../utils/api");

Page({
  data: {
    profile: null,
    rocoUid: "",
    rocoName: "",
    contactType: "qq",
    contactValue: "",
    contactTypes: [
      { label: "QQ", value: "qq" },
      { label: "微信", value: "wechat" },
      { label: "群号", value: "group" },
      { label: "其他", value: "other" },
    ],
    posts: [],
    saving: false,
    loading: false,
    loggingIn: false,
    isLoggedIn: false,
    isEditingProfile: false,
  },

  onLoad() {
    this.initPage();
  },

  onShow() {
    const loggedIn = isLoggedIn();
    this.setData({ isLoggedIn: loggedIn });
    if (loggedIn) {
      this.loadMyPosts();
    }
  },

  onTabItemTap() {
    if (!isLoggedIn()) {
      this.handleLogin();
    }
  },

  initPage() {
    const loggedIn = isLoggedIn();
    this.setData({ isLoggedIn: loggedIn });
    if (loggedIn) {
      this.loadPage();
    }
  },

  async handleLogin() {
    if (this.data.loggingIn) return;
    this.setData({ loggingIn: true });
    try {
      await loginWithWechatProfile();
      this.setData({ isLoggedIn: true });
      await this.loadPage();
      wx.showToast({ title: "登录成功" });
    } catch (error) {
      console.error("login failed", error);
      const message = getErrorMessage(error, "登录失败");
      if (/tap gesture|user TAP/i.test(message)) {
        wx.showModal({
          title: "请点击按钮登录",
          content: "微信授权弹窗需要通过页面按钮触发，请点击页面里的“微信授权登录”。",
          showCancel: false,
        });
      } else {
        wx.showToast({
          title: message.includes("auth deny") ? "已取消登录" : message,
          icon: "none",
        });
      }
    } finally {
      this.setData({ loggingIn: false });
    }
  },

  async loadPage() {
    this.setData({ loading: true });
    try {
      const profile = await call("getProfile");
      this.applyProfile(profile);
      await this.loadMyPosts();
    } catch (error) {
      wx.showToast({
        title: error.message || "加载失败",
        icon: "none",
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  applyProfile(profile) {
    const normalizedProfile = profile
      ? {
          ...profile,
          contactTypeLabel: contactTypeMap[profile.contactType] || profile.contactType || "",
        }
      : null;
    this.setData({
      profile: normalizedProfile,
      rocoUid: profile?.rocoUid || "",
      rocoName: profile?.rocoName || "",
      contactType: profile?.contactType || "qq",
      contactValue: profile?.contactValue || "",
      isEditingProfile: false,
    });
  },

  editProfile() {
    this.setData({ isEditingProfile: true });
  },

  cancelEditProfile() {
    this.applyProfile(this.data.profile);
  },

  onInput(e) {
    this.setData({
      [e.currentTarget.dataset.field]: e.detail.value,
    });
  },

  onContactTypeChange(e) {
    this.setData({ contactType: e.currentTarget.dataset.value });
  },

  async saveProfile() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      const profile = await call("saveUserProfile", {
        rocoUid: this.data.rocoUid,
        rocoName: this.data.rocoName,
        contactType: this.data.contactType,
        contactValue: this.data.contactValue,
      });
      this.applyProfile(profile);
      wx.showToast({
        title: "已保存",
      });
    } catch (error) {
      wx.showToast({
        title: error.message || "保存失败",
        icon: "none",
      });
    } finally {
      this.setData({ saving: false });
    }
  },

  async loadMyPosts() {
    try {
      const posts = await call("listMyPosts");
      this.setData({
        posts: posts.map(formatPost),
      });
    } catch (error) {
      console.error("load my posts failed", error);
    }
  },

  goDetail(e) {
    wx.navigateTo({
      url: `/pages/detail/index?id=${e.currentTarget.dataset.id}`,
    });
  },

  async updateStatus(e) {
    const { id, status } = e.currentTarget.dataset;
    const label = status === "completed" ? "标记完成" : status === "closed" ? "关闭" : "重新开放";
    wx.showModal({
      title: label,
      content: `确认${label}这条发布吗？`,
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await call("updatePostStatus", { id, status });
          wx.showToast({ title: "已更新" });
          this.loadMyPosts();
        } catch (error) {
          wx.showToast({
            title: error.message || "更新失败",
            icon: "none",
          });
        }
      },
    });
  },

  contactTypeLabel(value) {
    return contactTypeMap[value] || value;
  },
});
