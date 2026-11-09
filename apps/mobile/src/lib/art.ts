import type { ImageSourcePropType } from 'react-native';

/**
 * Illustrations from docs/ART_BRIEF.md. Each stays null until its artwork arrives; then it
 * becomes `require('@/assets/images/art/<name>.png')` and every screen using it picks it up.
 */
export const ART = {
  'intro-bib': null,
  'intro-rules': null,
  'intro-medals': null,
  'intro-crew': null,
  'intro-pin': null,
  'no-race': null,
  invite: null,
} satisfies Record<string, ImageSourcePropType | null>;

export type ArtName = keyof typeof ART;
