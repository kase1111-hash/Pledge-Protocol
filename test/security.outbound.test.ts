/**
 * Outbound requests to user-supplied URLs must not reach internal hosts
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import http from "http";
import dns from "dns";
import { AddressInfo } from "net";
import { isPublicAddress, postToUserUrl, webhookUrlProblem } from "../src/security/outbound";
import { NotificationService } from "../src/notifications/notification-service";
import { ApiOracleProvider, OracleConfig } from "../src/oracle";

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "64:ff9b::10.0.0.1",
    "not-an-ip",
  ])("rejects %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "accepts %s",
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    }
  );
});

describe("webhookUrlProblem", () => {
  it.each([
    ["ftp://example.com/hook", "http or https"],
    ["https://user:pass@example.com/hook", "credentials"],
    ["http://127.0.0.1:8080/admin", "private"],
    ["http://2130706433/", "private"], // decimal form of 127.0.0.1
    ["http://[::1]/", "private"],
    ["http://169.254.169.254/latest/meta-data/", "private"],
    ["http://localhost:5432/", "local host name"],
    ["http://db.internal/", "local host name"],
    ["not a url", "Invalid URL"],
  ])("rejects %s", (url, reason) => {
    expect(webhookUrlProblem(url)).toContain(reason);
  });

  it("accepts public http(s) URLs", () => {
    expect(webhookUrlProblem("https://hooks.example.com/pledge?x=1")).toBeNull();
    expect(webhookUrlProblem("http://93.184.216.34:8443/hook")).toBeNull();
  });
});

describe("postToUserUrl", () => {
  let server: http.Server;
  let port: number;
  const received: string[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      received.push(req.url ?? "");
      if (req.url === "/redirect") {
        res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" });
        res.end();
      } else if (req.url === "/big") {
        res.end("x".repeat(100_000));
      } else {
        res.end("ok");
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(() => {
    server.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ALLOW_PRIVATE_WEBHOOK_TARGETS;
    received.length = 0;
  });

  const post = (url: string, maxResponseBytes?: number) =>
    postToUserUrl(url, { headers: {}, body: "{}", timeoutMs: 2000, maxResponseBytes });

  it("refuses a public-looking host name that resolves to an internal address", async () => {
    // DNS rebinding: the name passes URL validation but resolves to loopback
    vi.spyOn(dns, "lookup").mockImplementation(((
      _host: string,
      _options: unknown,
      callback: (err: null, addresses: dns.LookupAddress[]) => void
    ) => callback(null, [{ address: "127.0.0.1", family: 4 }])) as unknown as typeof dns.lookup);

    await expect(post(`http://hooks.example.com:${port}/hook`)).rejects.toThrow("non-public address");
    expect(received).toEqual([]);
  });

  it("refuses literal internal addresses without connecting", async () => {
    await expect(post(`http://127.0.0.1:${port}/hook`)).rejects.toThrow("private");
    expect(received).toEqual([]);
  });

  it("does not follow redirects", async () => {
    process.env.ALLOW_PRIVATE_WEBHOOK_TARGETS = "true";

    const response = await post(`http://127.0.0.1:${port}/redirect`);

    expect(response.status).toBe(302);
    expect(received).toEqual(["/redirect"]);
  });

  it("caps the response body", async () => {
    process.env.ALLOW_PRIVATE_WEBHOOK_TARGETS = "true";

    const response = await post(`http://127.0.0.1:${port}/big`, 1000);

    expect(response.body.length).toBe(1000);
  });
});

describe("webhook subscriptions", () => {
  it("cannot be created or redirected to internal URLs", () => {
    const service = new NotificationService();
    const request = { name: "hook", events: ["pledge_created" as const] };

    expect(() =>
      service.createWebhook({ ...request, url: "http://169.254.169.254/latest/meta-data/" }, "0xabc")
    ).toThrow("Invalid webhook URL");

    const webhook = service.createWebhook({ ...request, url: "https://hooks.example.com/x" }, "0xabc");
    expect(() => service.updateWebhook(webhook.id, { url: "http://10.0.0.5/" })).toThrow("Invalid webhook URL");
  });
});

describe("API oracle endpoints", () => {
  let server: http.Server;
  let endpoint: string;

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ finished: true, time: 3600 }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/results`;
  });

  afterAll(() => {
    server.close();
  });

  afterEach(() => {
    delete process.env.ALLOW_PRIVATE_WEBHOOK_TARGETS;
  });

  const provider = () =>
    new ApiOracleProvider({
      id: "oracle_test",
      name: "Test",
      description: "",
      type: "api",
      endpoint,
      method: "GET",
      responseMapping: { completed: "finished", value: "time" },
      timeout: 2000,
      retries: 0,
      trustLevel: "custom",
      active: true,
    } as OracleConfig);

  it("cannot reach internal addresses, even when configured by an admin", async () => {
    const result = await provider().query({ bib: "42" });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/private or reserved/);
    expect(await provider().healthCheck()).toBe(false);
  });

  it("queries public endpoints", async () => {
    process.env.ALLOW_PRIVATE_WEBHOOK_TARGETS = "true"; // the test server is local
    const result = await provider().query({ bib: "42" });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ completed: true, value: 3600 });
  });
});
