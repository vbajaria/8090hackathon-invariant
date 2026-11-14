import type { NextConfig } from "next";
const config: NextConfig = { serverExternalPackages: ["better-sqlite3"], outputFileTracingExcludes: { "*": ["./.env*", "./.runtime/**", "./.git/**", "./.venv/**"] } };
export default config;
