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
      'frontend/src/index.css'
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
  { 
    files: ["frontend/src/**/*.{js,jsx}"], 
    ...pluginReact.configs.flat.recommended,
    languageOptions: { 
      globals: { ...globals.browser },
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
        ecmaFeatures: { jsx: true }
      }
    },
    settings: {
      react: {
        version: "detect"
      }
    },
    rules: {
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "no-unused-vars": "off"
    }
  },
  { files: ["**/*.json"], plugins: { json }, language: "json/json", extends: ["json/recommended"] },
  { files: ["**/*.css"], plugins: { css }, language: "css/css", extends: ["css/recommended"] },
]);
