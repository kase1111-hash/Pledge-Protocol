/**
 * Integrations deliver to the provider over HTTP. A local server stands in
 * for Slack, Discord, Telegram, Google and custom webhooks.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "http";
import { AddressInfo } from "net";
import { createIntegrationService, IntegrationService, integrationSignature } from "../src/integrations";

interface Captured {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

const OWNER = "0x00000000000000000000000000000000000000c1";

describe("IntegrationService delivery", () => {
  let server: http.Server;
  let base: string;
  let requests: Captured[];
  let reply: (req: Captured) => { status: number; body: unknown };
  let service: IntegrationService;

  beforeAll(async () => {
    process.env.ALLOW_PRIVATE_WEBHOOK_TARGETS = "true";
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const captured = { method: req.method!, path: req.url!, headers: req.headers, body: Buffer.concat(chunks).toString() };
        requests.push(captured);
        const { status, body } = reply(captured);
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    delete process.env.ALLOW_PRIVATE_WEBHOOK_TARGETS;
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    requests = [];
    reply = () => ({ status: 200, body: { ok: true } });
    service = createIntegrationService({
      baseUrl: "https://api.example.com",
      providers: {
        slack: `${base}/slack`,
        discord: `${base}/discord`,
        telegram: `${base}/telegram`,
        googleOAuth: `${base}/google-oauth`,
        googleCalendar: `${base}/calendar`,
      },
    });
  });

  const pledgeEvent = () =>
    service.formatPayload("pledge_created", {
      campaignId: "campaign_1",
      campaignName: "Marathon",
      backerAddress: "0x00000000000000000000000000000000000000a1",
      amount: "1500000000000000000",
    });

  it("posts Slack messages with the bot token and reports Slack errors", async () => {
    const slack = service.createIntegration({
      type: "slack",
      ownerAddress: OWNER,
      name: "Slack",
      config: { type: "slack", workspaceId: "W1", workspaceName: "W", channelId: "C1", channelName: "general", botToken: "xoxb-1" },
      events: ["pledge_created"],
    });

    const sent = await service.sendMessage(slack.id, pledgeEvent());
    expect(sent.status).toBe("sent");
    expect(requests[0]).toMatchObject({ method: "POST", path: "/slack/chat.postMessage" });
    expect(requests[0].headers.authorization).toBe("Bearer xoxb-1");
    const body = JSON.parse(requests[0].body);
    expect(body.channel).toBe("C1");
    expect(JSON.stringify(body.blocks)).toContain("1.5 ETH");

    reply = () => ({ status: 200, body: { ok: false, error: "channel_not_found" } });
    const failed = await service.sendMessage(slack.id, pledgeEvent());
    expect(failed).toMatchObject({ status: "failed", errorMessage: "Slack: channel_not_found" });
    expect(service.getIntegration(slack.id)!.metadata.errorCount).toBe(1);
  });

  it("posts to Discord and Zapier webhooks and fails on HTTP errors", async () => {
    const discord = service.createIntegration({
      type: "discord",
      ownerAddress: OWNER,
      name: "Discord",
      config: { type: "discord", guildId: "G", guildName: "G", channelId: "C", channelName: "c", webhookUrl: `${base}/hooks/discord` },
      events: ["pledge_created"],
    });
    expect((await service.sendMessage(discord.id, pledgeEvent())).status).toBe("sent");
    expect(JSON.parse(requests[0].body).embeds[0].title).toBe("New Pledge Received");

    reply = () => ({ status: 404, body: { message: "Unknown Webhook" } });
    const failed = await service.sendMessage(discord.id, pledgeEvent());
    expect(failed.status).toBe("failed");
    expect(failed.errorMessage).toMatch(/^HTTP 404/);
  });

  it("refuses to deliver to internal addresses", async () => {
    delete process.env.ALLOW_PRIVATE_WEBHOOK_TARGETS;
    try {
      const zapier = service.createIntegration({
        type: "zapier",
        ownerAddress: OWNER,
        name: "Zapier",
        config: { type: "zapier", webhookUrl: `${base}/hooks/zapier` },
        events: ["pledge_created"],
      });
      const message = await service.sendMessage(zapier.id, pledgeEvent());
      expect(message.status).toBe("failed");
      expect(requests).toEqual([]);
    } finally {
      process.env.ALLOW_PRIVATE_WEBHOOK_TARGETS = "true";
    }
  });

  it("sends Telegram messages as escaped HTML", async () => {
    const telegram = service.createIntegration({
      type: "telegram",
      ownerAddress: OWNER,
      name: "Telegram",
      config: { type: "telegram", chatId: "42", botToken: "123:abc" },
      events: ["pledge_created"],
    });
    const payload = service.formatPayload("pledge_created", { campaignName: "<Run>", backerAddress: "0xabc", amount: "1" });

    expect((await service.sendMessage(telegram.id, payload)).status).toBe("sent");
    expect(requests[0].path).toBe("/telegram/bot123%3Aabc/sendMessage");
    const body = JSON.parse(requests[0].body);
    expect(body).toMatchObject({ chat_id: "42", parse_mode: "HTML" });
    expect(body.text).toContain("<b>&lt;Run&gt;</b>");
  });

  it("signs custom webhook deliveries", async () => {
    const webhook = service.createIntegration({
      type: "webhook",
      ownerAddress: OWNER,
      name: "Hook",
      config: { type: "webhook", url: `${base}/hooks/custom`, secret: "s3cret", headers: { "X-Team": "ops", Host: "evil" } },
      events: ["pledge_created"],
    });

    expect((await service.sendMessage(webhook.id, pledgeEvent())).status).toBe("sent");
    const [delivery] = requests;
    expect(delivery.headers["x-team"]).toBe("ops");
    expect(delivery.headers.host).toBe(new URL(base).host);
    expect(delivery.headers["x-pledge-event"]).toBe("pledge_created");
    expect(delivery.headers["x-pledge-signature"]).toBe(
      integrationSignature("s3cret", String(delivery.headers["x-pledge-timestamp"]), delivery.body)
    );
  });

  it("broadcasts only to the owner's matching messaging integrations", async () => {
    const hook = (url: string, filters?: object) =>
      service.createIntegration({
        type: "webhook",
        ownerAddress: OWNER,
        name: url,
        config: { type: "webhook", url: `${base}${url}` },
        events: ["pledge_created"],
        filters,
      });
    hook("/all");
    hook("/big", { minAmount: "2000000000000000000" });
    hook("/small", { minAmount: "1000000000000000000" });

    const messages = await service.broadcastEvent(OWNER.toUpperCase().replace("0X", "0x"), "pledge_created", {
      campaignId: "campaign_1",
      amount: "1500000000000000000",
    });
    expect(messages.map((m) => m.status)).toEqual(["sent", "sent"]);
    expect(requests.map((r) => r.path).sort()).toEqual(["/all", "/small"]);
  });

  describe("OAuth", () => {
    beforeAll(() => {
      process.env.SLACK_CLIENT_ID = "slack-id";
      process.env.SLACK_CLIENT_SECRET = "slack-secret";
      process.env.GOOGLE_CLIENT_ID = "google-id";
      process.env.GOOGLE_CLIENT_SECRET = "google-secret";
    });

    afterAll(() => {
      for (const name of ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]) {
        delete process.env[name];
      }
    });

    const stateOf = (url: string) => new URL(url).searchParams.get("state")!;

    it("is refused when the provider is not configured", () => {
      expect(() => service.getOAuthUrl("discord", { ownerAddress: OWNER, returnUrl: "/" })).toThrow(
        /DISCORD_CLIENT_ID/
      );
    });

    it("exchanges a Slack code for the installed workspace and channel", async () => {
      const url = service.getOAuthUrl("slack", { ownerAddress: OWNER, returnUrl: "/" });
      expect(new URL(url).searchParams.get("redirect_uri")).toBe("https://api.example.com/v1/integrations/oauth/callback");

      reply = () => ({
        status: 200,
        body: {
          ok: true,
          access_token: "xoxb-real",
          team: { id: "T9", name: "Runners" },
          incoming_webhook: { channel: "#pledges", channel_id: "C9", url: `${base}/hooks/slack-incoming` },
        },
      });
      const integration = await service.handleOAuthCallback("slack", "the-code", stateOf(url));

      const exchange = new URLSearchParams(requests[0].body);
      expect(requests[0].path).toBe("/slack/oauth.v2.access");
      expect(Object.fromEntries(exchange)).toMatchObject({ client_id: "slack-id", client_secret: "slack-secret", code: "the-code" });
      expect(integration).toMatchObject({
        ownerAddress: OWNER,
        config: { workspaceName: "Runners", channelId: "C9", botToken: "xoxb-real" },
      });

      // Messages go to the incoming webhook granted at install time
      reply = () => ({ status: 200, body: "ok" });
      expect((await service.sendMessage(integration.id, pledgeEvent())).status).toBe("sent");
      expect(requests[1].path).toBe("/hooks/slack-incoming");

      // States are single use
      await expect(service.handleOAuthCallback("slack", "the-code", stateOf(url))).rejects.toThrow(/state/);
    });

    it("creates calendar events, refreshing an expired Google token", async () => {
      const url = service.getOAuthUrl("calendar", { ownerAddress: OWNER, returnUrl: "/" });
      reply = () => ({ status: 200, body: { access_token: "old", refresh_token: "refresh-1", expires_in: 0 } });
      const calendar = await service.handleOAuthCallback("calendar", "code", stateOf(url));

      reply = (req) =>
        req.path.startsWith("/google-oauth")
          ? { status: 200, body: { access_token: "fresh", expires_in: 3600 } }
          : { status: 200, body: { id: "evt_google_1" } };
      const event = await service.createCalendarEvent(calendar, {
        title: "Race day",
        start: { dateTime: "2026-11-01T09:00:00Z" },
        end: { dateTime: "2026-11-01T13:00:00Z" },
      });

      expect(event.id).toBe("evt_google_1");
      expect(new URLSearchParams(requests[1].body).get("refresh_token")).toBe("refresh-1");
      expect(requests[2].path).toBe("/calendar/calendars/primary/events");
      expect(requests[2].headers.authorization).toBe("Bearer fresh");
      expect(JSON.parse(requests[2].body).summary).toBe("Race day");
    });
  });
});
