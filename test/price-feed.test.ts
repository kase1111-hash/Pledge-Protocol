/**
 * Prices come from the CoinGecko API (a local server stands in for it)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { AddressInfo } from "net";
import { PriceFeed } from "../src/payments/price-feed";

describe("PriceFeed", () => {
  let server: http.Server;
  let calls: string[];
  let status = 200;

  beforeAll(async () => {
    calls = [];
    server = http.createServer((req, res) => {
      calls.push(req.url!);
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          bitcoin: { usd: 60000, eur: 50000, gbp: 48000, jpy: 9000000 },
          "usd-coin": { usd: 0.9999 },
          tether: { usd: 1.0002 },
          ethereum: { usd: 3000 },
        })
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    process.env.ALLOW_PRIVATE_WEBHOOK_TARGETS = "true";
    process.env.PRICE_FEED_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v3`;
  });

  afterAll(async () => {
    delete process.env.ALLOW_PRIVATE_WEBHOOK_TARGETS;
    delete process.env.PRICE_FEED_URL;
    await new Promise((resolve) => server.close(resolve));
  });

  it("derives fiat and crypto rates from CoinGecko prices, with caching", async () => {
    const feed = new PriceFeed();

    expect((await feed.rate("EUR", "USD")).rate).toBeCloseTo(1.2); // 60000 / 50000
    expect((await feed.rate("ETH", "EUR")).rate).toBeCloseTo(2500);
    expect((await feed.rate("USD", "USDC")).rate).toBeCloseTo(1 / 0.9999);
    expect(calls).toHaveLength(1); // cached
    expect(calls[0]).toMatch(/^\/api\/v3\/simple\/price\?ids=bitcoin,usd-coin,tether,ethereum&vs_currencies=usd,eur/);

    await expect(feed.rate("USD", "XYZ")).rejects.toThrow(/No price for XYZ/);
  });

  it("fails rather than inventing a rate when the API is down", async () => {
    status = 503;
    try {
      await expect(new PriceFeed().rate("EUR", "USD")).rejects.toThrow(/Exchange rates are unavailable: price API returned HTTP 503/);
    } finally {
      status = 200;
    }
  });
});
