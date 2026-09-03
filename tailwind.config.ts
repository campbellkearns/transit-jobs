import type { Config } from "tailwindcss"
import { fontSizeScale, ink, lineColors } from "./lib/design-tokens"

/**
 * Tailwind theme extension. Tokens live in lib/design-tokens.ts (single
 * source of truth, shared with non-Tailwind consumers); this file only
 * wires them into Tailwind's scale. See art_cJdHuq28 (UI direction) for
 * the design rationale — line hues are data, ink is the only action color.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: ink.primary,
          primary: ink.primary,
        },
        line: {
          blue: lineColors.blue,
          gold: lineColors.gold,
          green: lineColors.green,
          red: lineColors.red,
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        xs: fontSizeScale.xs,
        sm: fontSizeScale.sm,
        base: fontSizeScale.base,
        xl: fontSizeScale.xl,
        "2xl": fontSizeScale["2xl"],
        "4xl": fontSizeScale["4xl"],
      },
      outlineWidth: {
        DEFAULT: "2px",
      },
    },
  },
  plugins: [],
}

export default config
