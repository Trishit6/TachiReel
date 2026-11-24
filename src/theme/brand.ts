export const brand = {
  reelRed: '#C8341D',
  inkBlack: '#1C1814',
  paperCream: '#F8F0E6',
  white: '#FFFFFF',
} as const;

export type BrandColor = (typeof brand)[keyof typeof brand];
