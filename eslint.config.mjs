/**
 * Workspace root ESLint config.
 * Product lint lives in apps/web; this file only prevents IDE/CLI from
 * treating the monorepo root as an unconfigured ESLint project.
 */
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/dist/**",
    "data/**",
    "knowledge/**",
    "packages/**",
    "scripts/**",
    "tools/**",
    "specs/**",
    "snapshots/**",
    "samectx-notes/**",
    ".cursor/**",
    "apps/web/**",
  ]),
]);
