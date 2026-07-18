export const C = {
  primary:     '#7B1416',  // deep maroon — headers, nav backgrounds
  primaryDark: '#5C0F11',  // darker maroon — pressed states
  accent:      '#A52020',  // medium red — buttons, active tab, links
  success:     '#21a366',
  warning:     '#e8910b',
  danger:      '#c0392b',
  purple:      '#8e5bd0',
  bg:          '#fdf5f5',  // warm off-white background
  card:        '#ffffff',
  border:      '#f0dede',  // warm-tinted border
  text:        '#1e293b',
  muted:       '#64748b',
  light:       '#94a3b8',
  white:       '#ffffff',
} as const;

export const sp = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32,
} as const;

export const r = {
  sm: 6, md: 10, lg: 16, xl: 24, full: 999,
} as const;

export const sh = {
  sm: {
    shadowColor: '#000' as const,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000' as const,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
} as const;
