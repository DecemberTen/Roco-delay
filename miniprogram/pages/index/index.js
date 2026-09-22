const { call, formatPost, passTypes, pets, isLoggedIn, loadPassConfig } = require("../../utils/api");

const getAllPassTypes = () => [{ label: "全部版本", value: "" }, ...passTypes];
const getAllPets = () => [{ label: "全部精灵", value: "" }, ...pets];

Page({
  data: {
    passTypes: getAllPassTypes(),
    pets: getAllPets(),
    latestPassTypeIndex: 0,
    latestPetIndex: 0,
    latestPassTypeLabel: "全部版本",
    latestPetLabel: "全部精灵",
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
      await loadPassConfig();
      const nextPassTypes = getAllPassTypes();
      const nextPets = getAllPets();
      this.setData({
        passTypes: nextPassTypes,
        pets: nextPets,
        latestPassTypeIndex: 0,
        latestPetIndex: 0,
        latestPassTypeLabel: nextPassTypes[0].label,
        latestPetLabel: nextPets[0].label,
      });
    } catch (error) {
      console.error("load pass config failed", error);
    }
    this.loadHome();
  },

  async loadHome() {
    this.setData({ loading: true });
    try {
      const selectedPassType = (this.data.passTypes[this.data.latestPassTypeIndex] || this.data.passTypes[0]).value;
      const selectedPet = (this.data.pets[this.data.latestPetIndex] || this.data.pets[0]).value;
      const shouldLoadMine = isLoggedIn();
      const [home, latestPosts, activePosts] = await Promise.all([
        call("getHomeSummary"),
        call("listLatestPosts", {
          passType: selectedPassType,
          petId: selectedPet,
        }),
        shouldLoadMine ? call("listMyActivePosts").catch(() => []) : Promise.resolve([]),
      ]);

      this.setData({
        summary: home.summary,
        latestPosts: (latestPosts || []).map(formatPost),
        activePosts: (activePosts || []).map(formatPost),
        matchedGroups: [],
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
