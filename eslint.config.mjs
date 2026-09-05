import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

// Next.js 16's eslint-config-next ships native flat-config arrays (no more
// "next/core-web-vitals" string-extends shim) — compose them directly.
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: ["e2e/**", "playwright-report/**", "test-results/**"],
  },
]

export default eslintConfig
