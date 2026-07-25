/**
 * API Route Tests
 *
 * These exercise the real Express routers and their Zod validation via
 * supertest, as opposed to api.integration.test.ts which drives a hand-written
 * mock of the API contract.
 */

import { describe, it, beforeAll, expect } from "vitest";
import express, { Express } from "express";
import request from "supertest";

const TEST_ADDRESS = "0x1234567890123456789012345678901234567890";

let app: Express;

beforeAll(async () => {
  const [authRoutes, paymentRoutes] = await Promise.all([
    import("../src/api/routes/auth"),
    import("../src/api/routes/payments"),
  ]);

  app = express();
  app.use(express.json());
  app.use("/v1/auth", authRoutes.default);
  app.use("/v1/payments", paymentRoutes.default);
});

describe("POST /v1/auth/challenge", () => {
  it("returns a challenge for a valid address", async () => {
    const response = await request(app)
      .post("/v1/auth/challenge")
      .send({ address: TEST_ADDRESS });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty("message");
    expect(response.body.data).toHaveProperty("nonce");
    expect(response.body.data).toHaveProperty("expiresAt");
  });

  it("rejects a malformed address", async () => {
    const response = await request(app)
      .post("/v1/auth/challenge")
      .send({ address: "invalid-address" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("rejects a missing address", async () => {
    const response = await request(app).post("/v1/auth/challenge").send({});

    expect(response.status).toBe(400);
  });
});

describe("POST /v1/payments/checkout", () => {
  it("rejects a malformed backer address", async () => {
    const response = await request(app).post("/v1/payments/checkout").send({
      campaignId: "campaign_123",
      backerAddress: "not-an-address",
      amount: 10000,
      returnUrl: "https://example.com/return",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_REQUEST");
  });

  it("rejects a non-integer amount", async () => {
    const response = await request(app).post("/v1/payments/checkout").send({
      campaignId: "campaign_123",
      backerAddress: TEST_ADDRESS,
      // Amounts are minor units (cents); fractional values are not valid.
      amount: 100.5,
      returnUrl: "https://example.com/return",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_REQUEST");
  });

  it("returns a structured error for an empty body", async () => {
    const response = await request(app).post("/v1/payments/checkout").send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toHaveProperty("code");
    expect(response.body.error).toHaveProperty("message");
  });
});
