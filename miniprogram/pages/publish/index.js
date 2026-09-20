const { call, passTypes, pets, roles, findLabel } = require("../../utils/api");

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
  },

  onShow() {
    const defaultRole = wx.getStorageSync("publishDefaultRole");
    if (defaultRole === "buyer" || defaultRole === "seller") {
      this.setData({ role: defaultRole });
      wx.removeStorageSync("publishDefaultRole");
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
    if (this.data.submitting) return;
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

      wx.showToast({
        title: error.message || "发布失败",
        icon: "none",
      });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
