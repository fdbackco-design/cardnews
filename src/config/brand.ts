export const brand = {
  brandName: "TY Life Partners",
  seriesLabel: "라이프 가이드",
  primaryColor: "#FF6B3D",
  secondaryColors: {
    white: "#FFFFFF",
    black: "#000000",
    lightBg: "#FFF8F5",
    accent: "#FF3D00",
  },
  cardWidth: 1080,
  cardHeight: 1350,
  outputScale: 2,
  fonts: {
    label: "BMKkubulim",
    body: "Pretendard",
  },
  text: {
    maxBodyChars: 120,
    maxTitleChars: 30,
    maxBulletChars: 50,
  },
} as const;

export type Brand = typeof brand;
