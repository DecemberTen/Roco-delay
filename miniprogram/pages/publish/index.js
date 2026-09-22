const {
  call,
  passTypes,
  pets,
  roles,
  findLabel,
  getErrorMessage,
  isLoggedIn,
  loadPassConfig,
  loginWithWechatProfile,
} = require("../../utils/api");

Page({
  data: {
    roles,
    passTypes,
    pets,
    role: "buyer",
    passType: "basic",
    petId: "petA",
    remark: "",
    submitting: false,
    isLoggedIn: false,
    loggingIn: false,
  },

  onLoad() {
    this.loadConfig();
  },

  onShow() {
    this.setData({ isLoggedIn: isLoggedIn() });
    const defaultRole = wx.getStorageSync("publishDefaultRole");
    if (defaultRole === "buyer" || defaultRole === "seller") {
      this.setData({ role: defaultRole });
      wx.removeStorageSync("publishDefaultRole");
    }
  },

  async loadConfig() {
    try {
      const config = await loadPassConfig();
      const nextPassType =
        config.passTypes.find((item) => item.value === this.data.passType)?.value ||
        config.passTypes[0]?.value ||
        "";
      const nextPetId =
        config.pets.find((item) => item.value === this.data.petId)?.value ||
        config.pets[0]?.value ||
        "";
      this.setData({
        passTypes: config.passTypes,
        pets: config.pets,
        passType: nextPassType,
        petId: nextPetId,
      });
    } catch (error) {
      console.error("load pass config failed", error);
    }
  },

  async handleLogin() {
    if (this.data.loggingIn) return;
    this.setData({ loggingIn: true });
    try {
      await loginWithWechatProfile();
      this.setData({ isLoggedIn: true });
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

  onRoleChange(e) {
    this.setData({ role: e.currentTarget.dataset.value });
  },

  onPassTypeChange(e) {
    this.setData({ passType: e.currentTarget.dataset.value });
  },

  onPetChange(e) {
    this.setData({ petId: e.currentTarget.dataset.value });
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  async submit() {
    if (!this.data.isLoggedIn) {
      wx.showToast({
        title: "请先微信登录",
        icon: "none",
      });
      return;
    }
    if (this.data.submitting) return;
    if (!this.data.passType || !this.data.petId) {
      wx.showToast({
        title: "请选择版本和精灵",
        icon: "none",
      });
      return;
    }
    this.setData({ submitting: true });

    try {
      const petName = findLabel(pets, this.data.petId);
      await call("createPost", {
        role: this.data.role,
        passType: this.data.passType,
        petId: this.data.petId,
        petName,
        remark: this.data.remark,
      });
      wx.showToast({
        title: "发布成功",
      });
      this.setData({ remark: "" });
      setTimeout(() => {
        wx.switchTab({
          url: "/pages/index/index",
        });
      }, 600);
    } catch (error) {
      if (error.code === "PROFILE_REQUIRED") {
        wx.showModal({
          title: "需要先绑定资料",
          content: "发布前请先绑定洛克王国 UID 和联系方式。",
          confirmText: "去绑定",
          success: (res) => {
            if (res.confirm) {
              wx.switchTab({
                url: "/pages/me/index",
              });
            }
          },
        });
        return;
      }

      if (error.code === "ACTIVE_POST_EXISTS") {
        wx.showModal({
          title: "已有进行中的发布",
          content: error.message || "你已有进行中的发布，请先完成或关闭后再发布。",
          confirmText: "去管理",
          success: (res) => {
            if (res.confirm) {
              wx.switchTab({
                url: "/pages/me/index",
              });
            }
          },
        });
        return;
      }

      wx.showToast({
        title: error.message || "发布失败",
        icon: "none",
      });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
