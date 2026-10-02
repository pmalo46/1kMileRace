import { Platform, type TextStyle } from 'react-native';

/** Sunrise: the brand gradient, used for progress, primary actions, and celebrations. */
export const Sunrise = ['#FF4D6D', '#FF8A3D', '#FFC94A'] as const;

export const Palette = {
  light: {
    background: '#FFF8F1',
    surface: '#FFFFFF',
    surfaceAlt: '#FBEEE2',
    border: '#EFE2D6',
    text: '#1C1433',
    textMuted: '#6E6584',
    accent: '#F2552C',
    onAccent: '#FFFFFF',
    onPace: '#12A386',
    behindPace: '#E07A12',
    danger: '#D62F4B',
    track: '#F3E4D7',
  },
  dark: {
    background: '#120D1F',
    surface: '#1D1630',
    surfaceAlt: '#271E3E',
    border: '#2F2648',
    text: '#FFF6EC',
    textMuted: '#B3A8C9',
    accent: '#FF7A4D',
    onAccent: '#1C1433',
    onPace: '#3ED9B8',
    behindPace: '#FFB25C',
    danger: '#FF6B81',
    track: '#2A2142',
  },
} as const;

export type ThemeColors = { [K in keyof typeof Palette.light]: string };

export const Medal = { 1: '#FFC94A', 2: '#C9CED6', 3: '#D99A6C' } as const;

export const Space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const Radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;

/** Rounded heavy numerals feel athletic and friendly; tabular so digits don't jitter as they count. */
export const Type: Record<'display' | 'heading' | 'body' | 'label', TextStyle> = {
  display: {
    fontFamily: Platform.select({ ios: 'ui-rounded', default: undefined }),
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  heading: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  body: { fontSize: 16, fontWeight: '500' },
  label: { fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
};
