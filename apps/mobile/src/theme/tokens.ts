/**
 * Brand tokens, taken from jpc-space's src/app/globals.css.
 *
 * The navy is the logo background and the teal the monogram — they are the
 * product's identity, not arbitrary choices. Both apps are live during the
 * transition, so these must match or the two look unrelated.
 */
const brand = {
  navy: {
    50: "#ECEFF7",
    100: "#D4DAEA",
    200: "#ABB7D4",
    300: "#8294BF",
    400: "#5A72A9",
    500: "#3F558E",
    600: "#344676",
    700: "#2A3A63",
    800: "#243559",
    900: "#1F3260",
    950: "#142048",
  },
  teal: {
    50: "#F2FAFA",
    100: "#E2F4F5",
    200: "#C7EAEC",
    300: "#ABDFE2",
    400: "#94D5D8",
    500: "#7DCED1",
    600: "#5DB9BC",
    700: "#429A9D",
    800: "#2E7679",
    900: "#1E5254",
    950: "#103436",
  },
} as const;

const neutral = {
  50: "#FAFAFB",
  100: "#F4F4F6",
  200: "#E5E7EB",
  300: "#D1D5DB",
  400: "#9CA3AF",
  500: "#6B7280",
  600: "#4B5563",
  700: "#374151",
  800: "#1F2937",
  900: "#111827",
  950: "#0B0F19",
} as const;

// v1's semantic ramp names, kept verbatim: success, warning, error, info,
// purple. Note it is `error`, not `danger`.
const success = {
  50: "#ECFDF5",
  100: "#D1FAE5",
  200: "#A7F3D0",
  300: "#6EE7B7",
  400: "#34D399",
  500: "#10B981",
  600: "#059669",
  700: "#047857",
  800: "#065F46",
  900: "#064E3B",
  950: "#022C22",
} as const;

const warning = {
  50: "#FFFBEB",
  100: "#FEF3C7",
  200: "#FDE68A",
  300: "#FCD34D",
  400: "#FBBF24",
  500: "#F59E0B",
  600: "#D97706",
  700: "#B45309",
  800: "#92400E",
  900: "#78350F",
  950: "#451A03",
} as const;

const error = {
  50: "#FEF2F2",
  100: "#FEE2E2",
  200: "#FECACA",
  300: "#FCA5A5",
  400: "#F87171",
  500: "#EF4444",
  600: "#DC2626",
  700: "#B91C1C",
  800: "#991B1B",
  900: "#7F1D1D",
  950: "#450A0A",
} as const;

const info = {
  50: "#EFF6FF",
  100: "#DBEAFE",
  200: "#BFDBFE",
  300: "#93C5FD",
  400: "#60A5FA",
  500: "#3B82F6",
  600: "#2563EB",
  700: "#1D4ED8",
  800: "#1E40AF",
  900: "#1E3A8A",
  950: "#172554",
} as const;

// Accent: purple (LEADER role only)
const purple = {
  50: "#F5F3FF",
  100: "#EDE9FE",
  200: "#DDD6FE",
  300: "#C4B5FD",
  400: "#A78BFA",
  500: "#8B5CF6",
  600: "#7C3AED",
  700: "#6D28D9",
  800: "#5B21B6",
  900: "#4C1D95",
  950: "#2E1065",
} as const;

/**
 * Role badge colours, from globals.css's --color-role-* block. v1 aliases
 * each to a ramp with var() rather than hardcoding a hex — do the same by
 * referencing the ramp constants here, so editing a ramp cannot desync the
 * badge.
 */
const role = {
  SUPER: { background: brand.navy[900], foreground: "#FFFFFF" },
  // ADMIN's foreground is navy 900, not white — teal 500 is too light for
  // white text. Copy the pairing from globals.css; do not assume white.
  ADMIN: { background: brand.teal[500], foreground: brand.navy[900] },
  LEADER: { background: purple[500], foreground: "#FFFFFF" },
  STUDENT: { background: warning[500], foreground: "#FFFFFF" },
  MENTOR: { background: success[500], foreground: "#FFFFFF" },
} as const;

export const colors = {
  brand,
  neutral,
  success,
  warning,
  error,
  info,
  purple,
  role,
  white: "#FFFFFF",
  black: "#000000",
  transparent: "transparent",
} as const;

/** 4pt scale. Every margin and padding in the app comes from here. */
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radii = { sm: 6, md: 10, lg: 16, full: 9999 } as const;

/** Border stroke widths. Inputs and outlined buttons share this scale rather than hardcoding `1`. */
export const borderWidths = { none: 0, thin: 1 } as const;

/** Opacity levels for interactive states, e.g. a disabled or busy control. */
export const opacity = { disabled: 0.6, full: 1 } as const;

export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: "700" },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "700" },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "400" },
  label: { fontSize: 14, lineHeight: 18, fontWeight: "500" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
} as const;
