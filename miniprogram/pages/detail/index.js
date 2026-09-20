const { call, formatPost } = require("../../utils/api");

Page({
  data: {
    id: "",
    post: null,
    loading: true,
  },

  onLoad(options) {
    this.setData({ id: options.id || "" });
    this.loadDetail();
  },

  async loadDetail() {
    if (!this.data.id) {
      wx.showToast({
        title: "缺少发布 ID",
        icon: "none",
      });
      return;
    }

    this.setData({ loading: true });
    try {
      const post = await call("getPostDetail", { id: this.data.id });
      this.setData({ post: formatPost(post) });
    } catch (error) {
      wx.showToast({
        title: error.message || "加载失败",
        icon: "none",
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  copyContact() {
    const contact = this.data.post && this.data.post.contactValue;
    if (!contact) return;
    wx.setClipboardData({
      data: contact,
      success: () => {
        wx.showToast({
          title: "已复制",
        });
      },
    });
  },
});
