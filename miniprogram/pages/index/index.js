const { call, formatPost, passTypes, pets } = require("../../utils/api");

const allPassTypes = [{ label: "全部版本", value: "" }, ...passTypes];
const allPets = [{ label: "全部精灵", value: "" }, ...pets];

Page({
  data: {
    passTypes: allPassTypes,
    pets: allPets,
    latestPassTypeIndex: 0,
    latestPetIndex: 0,
    latestPassTypeLabel: allPassTypes[0].label,
    latestPetLabel: allPets[0].label,
    summary: {
      buyers: 0,
      sellers: 0,
      completed: 0,
      total: 0,
    },
    latestPosts: [],
    activePosts: [],
    matchedGroups: [],
    loading: false,
    hasLoaded: false,
  },

  onLoad() {
    this.bootstrap();
  },

  onShow() {
    if (this.data.hasLoaded) {
      this.loadHome();
    }
  },

  async bootstrap() {
    try {
      await call("login");
    } catch (error) {
      console.error("bootstrap failed", error);
    } finally {
      this.loadHome();
    }
  },

  async loadHome() {
    this.setData({ loading: true });
    try {
      const selectedPassType = this.data.passTypes[this.data.latestPassTypeIndex].value;
      const selectedPet = this.data.pets[this.data.latestPetIndex].value;
      const [home, latestPosts, activePosts, matchedGroups] = await Promise.all([
        call("getHomeSummary"),
        call("listLatestPosts", {
          passType: selectedPassType,
          petId: selectedPet,
        }),
        call("listMyActivePosts").catch(() => []),
        call("listMyMatchedPosts").catch(() => []),
      ]);
      const matchCountMap = (matchedGroups || []).reduce((acc, group) => {
        if (group.post && group.post._id) {
          acc[group.post._id] = group.matchCount || 0;
        }
        return acc;
      }, {});

      this.setData({
        summary: home.summary,
        latestPosts: (latestPosts || []).map(formatPost),
        activePosts: (activePosts || []).map((post) => ({
          ...formatPost(post),
          matchCount: matchCountMap[post._id] || 0,
        })),
        matchedGroups: (matchedGroups || []).map((group) => ({
          ...group,
          post: formatPost(group.post),
          matches: (group.matches || []).map(formatPost),
        })),
        hasLoaded: true,
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

  onLatestPassTypeChange(e) {
    const latestPassTypeIndex = Number(e.detail.value);
    this.setData(
      {
        latestPassTypeIndex,
        latestPassTypeLabel: this.data.passTypes[latestPassTypeIndex].label,
      },
      () => {
        this.loadHome();
      }
    );
  },

  onLatestPetChange(e) {
    const latestPetIndex = Number(e.detail.value);
    this.setData(
      {
        latestPetIndex,
        latestPetLabel: this.data.pets[latestPetIndex].label,
      },
      () => {
        this.loadHome();
      }
    );
  },

  goDetail(e) {
    wx.navigateTo({
      url: `/pages/detail/index?id=${e.currentTarget.dataset.id}`,
    });
  },
});
