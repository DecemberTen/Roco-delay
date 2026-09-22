const { call, formatPost } = require("../../utils/api");

Page({
  data: {
    id: "",
    post: null,
    match: null,
    counterpart: null,
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
      const detail = await call("getPostDetail", { id: this.data.id });
      const post = detail && detail.post ? detail.post : detail;
      const counterpart = detail && detail.counterpart ? detail.counterpart : null;
      this.setData({
        post: post ? formatPost(post) : null,
        match: detail && detail.match ? detail.match : null,
        counterpart: counterpart ? formatPost(counterpart) : null,
      });
    } catch (error) {
      wx.showToast({
        title: error.message || "加载失败",
        icon: "none",
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  copyContact(e) {
    const type = e.currentTarget.dataset.type || "post";
    const source = type === "counterpart" ? this.data.counterpart : this.data.post;
    const contact = source && source.contactValue;
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
