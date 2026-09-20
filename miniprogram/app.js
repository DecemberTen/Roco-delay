// app.js
App({
  onLaunch: function () {
    this.globalData = {
      // env 参数说明：
      // env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会请求到哪个云环境的资源
      // 此处请填入环境 ID, 环境 ID 可在微信开发者工具右上顶部工具栏点击云开发按钮打开获取
      env: "cloudbase-d6g33px9802a7fb9a",
      user: null,
      openid: "",
    };
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      const cloudConfig = {
        traceUser: true,
      };
      if (this.globalData.env) {
        cloudConfig.env = this.globalData.env;
      }
      if (!wx.cloud.__rocoInited) {
        try {
          wx.cloud.init(cloudConfig);
          wx.cloud.__rocoInited = true;
        } catch (error) {
          if (!String(error && error.message).includes("no need to be called multiple times")) {
            throw error;
          }
          wx.cloud.__rocoInited = true;
        }
      }
    }
  },
});
