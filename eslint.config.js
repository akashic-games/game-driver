const eslintConfig = require("@akashic/eslint-config");

module.exports = [
    ...eslintConfig,
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            sourceType: "module",
            parserOptions: {
                project: "./tsconfig.json",
            },
        },
        ignores: ["**/*.js", "**/__tests__/**/*"],
    }
];
