import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2020,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-namespace": "off",
      "no-console": "off",
      "no-case-declarations": "off",
    },
  },
  {
    // Chai's assertions are property getters (`expect(x).to.be.true`), which
    // read as unused expressions to ESLint. Mocha/vitest globals also need
    // declaring for the suites that rely on them rather than importing.
    files: ["test/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.mocha,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
  {
    ignores: [
      "node_modules/",
      "dist/",
      "build/",
      "artifacts/",
      "cache/",
      "typechain-types/",
      "coverage/",
      "contracts/",
    ],
  }
);
