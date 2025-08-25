import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      // Exclude admin interface from ESLint during builds
      // Will be refactored in Phase 1 of metadata system overhaul
      "src/app/admin/**/*",
      "src/app/api/admin/**/*",
      // Standard ignores
      ".next/**/*",
      "out/**/*", 
      "node_modules/**/*",
      ".vercel/**/*",
      "dist/**/*",
      "build/**/*"
    ]
  }
];

export default eslintConfig;
