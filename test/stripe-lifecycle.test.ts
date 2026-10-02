/**
 * Stripe subscriptions and saved cards call the Stripe API; a local server
 * stands in for it
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { AddressInfo } from "net";
import { StripeProvider } from "../src/payments";

const BACKER = "0x00000000000000000000000000000000000000A1";

describe("Stripe subscriptions and payment methods", () => {
  let server: http.Server;
  let provider: StripeProvider;
  const calls: string[] = [];
  const customers: { id: string; object: string; metadata: Record<string, string> }[] = [];
  const card = {
    id: "pm_card_1",
    object: "payment_method",
    type: "card",
    created: 1_700_000_000,
    card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 },
  };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const url = new URL(req.url!, "http://stripe.test");
        const form = new URLSearchParams(Buffer.concat(chunks).toString());
        calls.push(`${req.method} ${url.pathname}${req.method === "POST" && form.toString() ? ` ${decodeURIComponent(form.toString())}` : ""}`);
        const send = (body: unknown) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(body));
        };

        const path = url.pathname;
        if (path === "/v1/customers/search") {
          const address = /:'([^']+)'$/.exec(url.searchParams.get("query") ?? "")?.[1];
          return send({ object: "search_result", data: customers.filter((c) => c.metadata.backerAddress === address) });
        }
        if (path === "/v1/customers") {
          const customer = { id: `cus_${customers.length + 1}`, object: "customer", metadata: { backerAddress: form.get("metadata[backerAddress]")! } };
          customers.push(customer);
          return send(customer);
        }
        if (path === "/v1/payment_methods/pm_card_1/attach") return send(card);
        if (path === "/v1/payment_methods") return send({ object: "list", data: [card], has_more: false });
        if (path === "/v1/prices") return send({ id: "price_1", object: "price" });
        if (path === "/v1/subscriptions") {
          return send({ id: "sub_stripe_1", object: "subscription", cancel_at_period_end: false, items: { data: [{ current_period_start: 1, current_period_end: 2 }] } });
        }
        if (path === "/v1/subscriptions/sub_stripe_1") return send({ id: "sub_stripe_1", object: "subscription" });
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: `unexpected ${path}` } }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    provider = new StripeProvider({
      secretKey: "sk_test_local",
      publishableKey: "pk_test_local",
      webhookSecret: "whsec",
      apiHost: { host: "127.0.0.1", port: (server.address() as AddressInfo).port, protocol: "http" },
    });
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("saves cards to the backer's customer and lists them", async () => {
    expect(await provider.listPaymentMethods(BACKER)).toEqual([]); // no customer yet

    const saved = await provider.savePaymentMethod(BACKER, "pm_card_1");
    expect(saved).toMatchObject({ id: "pm_card_1", cardBrand: "visa", cardLast4: "4242" });
    expect(customers).toEqual([expect.objectContaining({ id: "cus_1", metadata: { backerAddress: BACKER.toLowerCase() } })]);
    expect(calls).toContain("POST /v1/payment_methods/pm_card_1/attach customer=cus_1");

    const listed = await provider.listPaymentMethods(BACKER);
    expect(listed.map((m) => m.id)).toEqual(["pm_card_1"]);
  });

  it("creates, pauses, resumes and cancels subscriptions in Stripe", async () => {
    const subscription = await provider.createSubscription({
      campaignId: "campaign_1",
      backerAddress: BACKER,
      amount: "2500",
      currency: "USD",
      interval: "monthly",
    });
    // The existing customer is reused
    expect(customers).toHaveLength(1);
    expect(subscription.providerSubscriptionId).toBe("sub_stripe_1");
    expect(provider.getSubscription(subscription.id)).toBe(subscription);

    expect((await provider.pauseSubscription(subscription.id)).status).toBe("paused");
    expect(calls).toContain("POST /v1/subscriptions/sub_stripe_1 pause_collection[behavior]=void");
    await expect(provider.pauseSubscription(subscription.id)).rejects.toThrow(/paused/);

    expect((await provider.resumeSubscription(subscription.id)).status).toBe("active");
    expect(calls).toContain("POST /v1/subscriptions/sub_stripe_1 pause_collection=");

    expect((await provider.cancelSubscription(subscription.id)).status).toBe("cancelled");
    expect(calls).toContain("DELETE /v1/subscriptions/sub_stripe_1");

    await expect(provider.cancelSubscription("sub_unknown")).rejects.toThrow(/not found/);
  });
});
