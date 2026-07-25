import { defineConfig } from "vitest/config";

/**
 * Vitest runs the pure-TypeScript suites (services, oracles, API layer).
 *
 * The Solidity contract suites stay on Hardhat/Mocha because they need the
 * Hardhat runtime environment and generated TypeChain bindings — those run
 * via `npm run test:contracts`.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "test/CampaignRegistry.test.ts",
      "test/PledgeProtocol.integration.test.ts",
    ],
  },
});
