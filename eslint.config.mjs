import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  ...compat.extends("eslint:recommended"),

  ...compat.extends("plugin:n/recommended"),

  ...compat.extends([
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
  ]),

  {
    files: ["**/*.js", "**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-console": "warn",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },

  {
    files: ["prisma/**/*.ts"],
    rules: {},
  },

  {
    plugins: {
      prisma: require("eslint-plugin-prisma"),
    },
    rules: {
      "prisma/naming-convention-models": "warn",
      "prisma/naming-convention-enums": "warn",
      "prisma/naming-convention-fields": "warn",
    },
  },
];
