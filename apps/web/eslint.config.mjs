import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // 客户端挂载拉数 / persist 水合是常见模式；该规则对 void load() 过严
      "react-hooks/set-state-in-effect": "off",
      // Google Fonts link 在 App Router layout 中可用；避免误报干扰
      "@next/next/no-page-custom-font": "off",
    },
  },
]);

export default eslintConfig;
