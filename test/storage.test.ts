/**
 * Uploads reach Pinata and Irys/Bundlr for real (a local server stands in
 * for them); locally stored assets are served by the API
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { AddressInfo } from "net";
import { generateKeyPairSync } from "crypto";
import request from "supertest";
import { StorageService, storageConfigFromEnv, storageService, verifyDataItem } from "../src/tokens";
import app from "../src/api/app";

describe("storage uploads", () => {
  let server: http.Server;
  let base: string;
  const requests: { path: string; headers: http.IncomingHttpHeaders; body: Buffer }[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        requests.push({ path: req.url!, headers: req.headers, body: Buffer.concat(chunks) });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(req.url!.startsWith("/pinata") ? { IpfsHash: "bafyreal" } : { id: "irys-tx-1" }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("pins to IPFS through Pinata", async () => {
    const storage = new StorageService({
      ipfs: { gateway: "https://gw.test/ipfs", apiEndpoint: `${base}/pinata`, jwt: "pinata-jwt" },
      preferredProvider: "ipfs",
    });
    const result = await storage.upload("<svg/>", "image/svg+xml");

    expect(result).toMatchObject({ provider: "ipfs", uri: "ipfs://bafyreal" });
    const sent = requests.at(-1)!;
    expect(sent.path).toBe("/pinata/pinning/pinFileToIPFS");
    expect(sent.headers.authorization).toBe("Bearer pinata-jwt");
    expect(sent.headers["content-type"]).toMatch(/^multipart\/form-data/);
    expect(sent.body.toString()).toContain("<svg/>");
  });

  it("posts signed ANS-104 data items to the bundler", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 4096 });
    const storage = new StorageService({
      arweave: { gateway: "https://arweave.net", bundlrEndpoint: `${base}/irys`, wallet: privateKey.export({ format: "jwk" }) },
      preferredProvider: "arweave",
    });
    const result = await storage.upload('{"name":"Token"}', "application/json");

    expect(result).toMatchObject({ provider: "arweave", uri: "ar://irys-tx-1" });
    const sent = requests.at(-1)!;
    expect(sent.path).toBe("/irys/tx/arweave");
    expect(verifyDataItem(sent.body)).toBe(true);
    expect(sent.body.subarray(sent.body.length - 16).toString()).toBe('{"name":"Token"}');
    expect(sent.body.includes(Buffer.from("application/json"))).toBe(true); // Content-Type tag
  });

  it("chooses the configured provider from the environment", () => {
    expect(storageConfigFromEnv({}).preferredProvider).toBe("local");
    expect(storageConfigFromEnv({ PINATA_JWT: "x" }).preferredProvider).toBe("ipfs");
    expect(storageConfigFromEnv({ IPFS_API_KEY: "k", IPFS_API_SECRET: "s", STORAGE_PROVIDER: "local" }).preferredProvider).toBe("local");
    expect(() => storageConfigFromEnv({ ARWEAVE_WALLET: "not json" })).toThrow(/JWK/);
  });

  it("serves locally stored assets from the API, sandboxed", async () => {
    const stored = await storageService.upload("<svg><script>alert(1)</script></svg>", "image/svg+xml", "local");

    const response = await request(app).get(`/v1/commemoratives/assets/${stored.hash}`);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("image/svg+xml");
    expect(response.headers["content-security-policy"]).toContain("sandbox");
    expect(response.body.toString()).toContain("<svg>");

    expect((await request(app).get(`/v1/commemoratives/assets/${"0".repeat(64)}`)).status).toBe(404);
    expect((await request(app).get("/v1/commemoratives/templates")).body.templates.length).toBeGreaterThan(0);
  });
});
