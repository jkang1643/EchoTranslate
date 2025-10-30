import js from "@eslint/js";
import globals from "globals";
import pluginReact from "eslint-plugin-react";
import json from "@eslint/json";
import css from "@eslint/css";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    ignores: [
      '.claude/**',
      'node_modules/**',
      'dist/**',
      '**/node_modules/**',
      '**/package-lock.json',
      'frontend/**'
    ]
  },
  { 
    files: ["backend/**/*.{js,mjs,cjs}"], 
    ...js.configs.recommended,
    languageOptions: { globals: globals.node },
    rules: {
      "no-unused-vars": "off",
      "no-undef": "off"
    }
  },
  { files: ["**/*.json"], plugins: { json }, language: "json/json", extends: ["json/recommended"] },
  { files: ["**/*.css"], plugins: { css }, language: "css/css", extends: ["css/recommended"] },
]);
