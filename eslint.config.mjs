const eslintConfig = [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/out/**"
    ]
  },
  {
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "off"
    }
  }
];

export default eslintConfig;
