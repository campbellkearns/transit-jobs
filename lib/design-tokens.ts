/**
 * Design tokens for the transit-jobs UI.
 *
 * Source of truth: UI direction blueprint (art_cJdHuq28). Marketplace
 * utility over brand identity — a neutral, ink-driven base where the only
 * chroma is MARTA line wayfinding. These values are Tailwind palette
 * stand-ins chosen for the product, not MARTA's brand hexes: the colors
 * describe data (which rail line), never a logo or brand mark.
 *
 * Populated once here so the four visual PRs (T4 employer forms, T6 search
 * list, T7 map, T8 detail) never need to touch tailwind.config.ts — they
 * consume these tokens as Tailwind classes (bg-line-blue, text-ink-primary,
 * etc.) instead.
 */

/** Primary action color. Buttons and links are near-black — chroma is
 * reserved for lines and status, so "blue" never means both "Blue Line"
 * and "click here." */
export const ink = {
  primary: "#111827", // gray-900
} as const

/** MARTA line hues. Always paired with the line name in the UI — color
 * never carries meaning alone (badges and chips render the label too). */
export const lineColors = {
  blue: "#2563eb", // blue-600
  gold: "#fbbf24", // amber-400
  green: "#16a34a", // green-600
  red: "#dc2626", // red-600
} as const

/** Error state shares its hue with the Red line by coincidence — meaning
 * never rides on color alone, so errors always carry a message. */
export const status = {
  error: lineColors.red,
} as const

/** Visible focus ring — ink, not blue, to stay clear of the line palette. */
export const focusRing = {
  width: "2px",
  color: ink.primary,
} as const

/** Type scale (px), per the UI direction. `tabular-nums` is applied at the
 * component level for salary and walk-distance figures. */
export const fontSizeScale = {
  xs: "12px",
  sm: "14px",
  base: "16px",
  xl: "20px",
  "2xl": "24px",
  "4xl": "32px",
} as const
