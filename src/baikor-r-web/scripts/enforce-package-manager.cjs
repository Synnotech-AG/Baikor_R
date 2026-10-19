const userAgent = process.env.npm_config_user_agent ?? "";

if (!userAgent.startsWith("pnpm/")) {
  console.error(
    "\nUnsupported package manager. Use pnpm 10: `corepack enable` followed by `pnpm install`.\n",
  );
  process.exit(1);
}
