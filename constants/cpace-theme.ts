export const C = {
  primary:     '#7B1416',  // deep maroon — headers, nav backgrounds
  primaryDark: '#5C0F11',  // darker maroon — pressed states
  accent:      '#A52020',  // medium red — buttons, active tab, links
  success:     '#21a366',
  warning:     '#e8910b',
  danger:      '#c0392b',
  purple:      '#8e5bd0',
  bg:          '#F8F9FA',  // soft neutral off-white background
  card:        '#ffffff',
  border:      '#E8ECF0',  // neutral soft border
  text:        '#1e293b',
  muted:       '#64748b',
  light:       '#94a3b8',
  white:       '#ffffff',
} as const;

// ── Gradients ────────────────────────────────────────────────────────────────
// `brand` is the exact ramp used by the Sign In button; every primary button,
// active tab and gradient outline reuses it so the whole app reads as one theme.
export const grad = {
  brand:    ['#4A0A0C', C.primary, '#B52525'] as const,
  brandSoft:['#8E1520', '#A52020', '#C13030'] as const,  // lighter ramp for small chips
  outline:  ['#4A0A0C', '#A52020', '#C13030'] as const,  // gradient card borders
  glass:    ['rgba(123,20,22,0.12)', 'rgba(165,32,32,0.05)', 'rgba(181,37,37,0.14)'] as const,
  danger:   ['#8E1B12', C.danger, '#E0563F'] as const,
  success:  ['#136B41', C.success, '#3FD08C'] as const,
} as const;

// Shared gradient direction. Buttons run left→right, surfaces run diagonally.
export const gradDir = {
  horizontal: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
  diagonal:   { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
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
  blur3d: {
    shadowColor: '#2a1215' as const,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 12,
  },
} as const;

// ── Typography — Poppins everywhere for a consistent look ────────────────────
export const font = {
  regular:   'Poppins_400Regular',
  medium:    'Poppins_500Medium',
  semiBold:  'Poppins_600SemiBold',
  bold:      'Poppins_700Bold',
  extraBold: 'Poppins_800ExtraBold',
  black:     'Poppins_900Black',
} as const;

// Reusable text presets. Spread into a Text style, then override color if needed.
export const type = {
  headerTitle:    { fontSize: 18, fontFamily: font.semiBold, color: C.text },
  headerSubtitle: { fontSize: 12.5, fontFamily: font.regular, color: C.muted },
  screenTitle:    { fontSize: 22, fontFamily: font.bold,      color: C.text },
  sectionTitle:   { fontSize: 15, fontFamily: font.bold,      color: C.text },
  cardTitle:      { fontSize: 15, fontFamily: font.semiBold,  color: C.text },
  body:           { fontSize: 14, fontFamily: font.regular,   color: C.text },
  label:          { fontSize: 13, fontFamily: font.semiBold,  color: C.text },
  caption:        { fontSize: 12, fontFamily: font.regular,   color: C.muted },
  statValue:      { fontSize: 24, fontFamily: font.extraBold, color: C.text },
  statLabel:      { fontSize: 12, fontFamily: font.medium,    color: C.muted },
  button:         { fontSize: 16, fontFamily: font.bold,      color: C.white },
} as const;

// Reusable surface tokens.
export const comp = {
  screen:       { flex: 1, backgroundColor: C.bg },
  card:         { backgroundColor: C.card, borderRadius: r.lg, padding: sp.md },
  cardGap:      { marginHorizontal: sp.md, marginBottom: sp.md },
  headerColors: ['#5C0F11', C.primary, '#8E1520'] as const,
} as const;
