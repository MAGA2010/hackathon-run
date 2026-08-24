// ESLint v9 flat config for the hackathon-run CLI.
//
// Strategy: TypeScript handles all type-aware checks via `npm run lint`
// (= `tsc --noEmit`). ESLint here covers the .mjs / .cjs helpers in
// `scripts/` and `examples/*/scripts/` where tsc does not apply.
//
// We use ONLY the rules bundled with eslint itself so we add zero npm
// dependencies. The CI step is `npm run lint:eslint`.

import js from "@eslint/js";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "site/**",
      "tests/**",
      "skills/**",
      ".hackathon/**",
      "src/**",
      "ai-time-run/**",
      "docs/research/**",
    ],
  },
  js.configs.recommended,
  {
    files: [
      "scripts/**/*.{mjs,cjs}",
      "examples/**/scripts/**/*.mjs",
      "examples/**/src/**/*.mjs",
      "eslint.config.js",
    ],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        crypto: "readonly",
        require: "readonly",
        module: "readonly",
        exports: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "warn",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-constant-condition": ["error", { checkLoops: false }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": "off",
      "prefer-const": "warn",
      "no-var": "error",
    },
  },
  // Chrome extension files use the chrome.* browser API and DOM globals.
  {
    files: ["examples/chrome-extension/src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        console: "readonly",
        chrome: "readonly",
        document: "readonly",
        window: "readonly",
        NodeFilter: "readonly",
      },
    },
  },
];

