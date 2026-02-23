/**
 * Environment variable validation
 * Fails fast at startup if required configuration is missing.
 */

import { z } from "zod";

const envSchema = z.object({
  // Server
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  // Database — require explicit opt-in to in-memory mode
  // Accepts "postgres" or "postgresql" (both mean PostgreSQL)
  DATABASE_TYPE: z
    .enum(["postgresql", "postgres", "memory"])
    .default("memory"),
  DATABASE_URL: z.string().url().optional(),

  // CORS — required in production (also enforced in server.ts)
  CORS_ORIGINS: z.string().optional(),

  // Blockchain (optional — only needed for on-chain operations)
  SEPOLIA_RPC_URL: z.string().url().optional(),
  PRIVATE_KEY: z.string().optional(),

  // Stripe (optional — only needed for fiat payments)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // Circle (optional — only needed for USDC payments)
  CIRCLE_API_KEY: z.string().optional(),
  CIRCLE_API_URL: z.string().url().optional(),

  // IPFS (optional — only needed for token storage)
  IPFS_API_URL: z.string().url().optional(),
  IPFS_API_KEY: z.string().optional(),
  IPFS_API_SECRET: z.string().optional(),
});

type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${formatted}\n\nCheck your .env file against .env.example.`
    );
  }

  const env = result.data;

  // Cross-field validation
  if ((env.DATABASE_TYPE === "postgres" || env.DATABASE_TYPE === "postgresql") && !env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required when DATABASE_TYPE=postgres. " +
        "Set DATABASE_TYPE=memory to use in-memory storage."
    );
  }

  if (env.NODE_ENV === "production" && !env.CORS_ORIGINS) {
    throw new Error(
      "CORS_ORIGINS is required in production. " +
        "Set it to a comma-separated list of allowed origins."
    );
  }

  if (env.NODE_ENV === "production" && env.DATABASE_TYPE === "memory") {
    console.warn(
      "WARNING: Running in production with DATABASE_TYPE=memory. " +
        "Data will be lost on restart. Set DATABASE_TYPE=postgres for persistence."
    );
  }

  return env;
}

export const env = validateEnv();
