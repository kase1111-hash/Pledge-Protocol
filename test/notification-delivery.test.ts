/**
 * Email, push and SMS go through the providers' HTTP APIs; a local server
 * stands in for SendGrid, Mailgun, Google/Firebase, OneSignal and Twilio.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "http";
import { AddressInfo } from "net";
import { generateKeyPairSync, createVerify } from "crypto";
import { parseEther } from "ethers";
import { createNotificationService, NotificationService } from "../src/notifications-v2";
import { getStore, MemoryStore, setStore } from "../src/database";
import { socialService } from "../src/social";
import { campaign, DAY, milestone, nowSeconds, pledge } from "./helpers/fixtures";

interface Captured {
  path: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

const USER = "0x00000000000000000000000000000000000000c1";

describe("notification delivery", () => {
  let server: http.Server;
  let base: string;
  let requests: Captured[];
  let reply: (req: Captured) => { status: number; body: unknown; headers?: Record<string, string> };

  beforeAll(async () => {
    process.env.ALLOW_PRIVATE_WEBHOOK_TARGETS = "true";
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const captured = { path: req.url!, headers: req.headers, body: Buffer.concat(chunks).toString() };
        requests.push(captured);
        const { status, body, headers } = reply(captured);
        res.writeHead(status, { "Content-Type": "application/json", ...headers });
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
    reply = () => ({ status: 200, body: {} });
  });

  const endpoints = () => ({
    sendgrid: `${base}/sendgrid`,
    mailgun: `${base}/mailgun`,
    googleOAuth: `${base}/google`,
    fcm: `${base}/fcm`,
    onesignal: `${base}/onesignal`,
    twilio: `${base}/twilio`,
  });

  const welcome = (service: NotificationService, channels: ("email" | "push" | "sms" | "in_app")[]) =>
    service.send({ recipientAddress: USER, type: "welcome", channels, variables: { userName: "Ada" } });

  it("sends email through SendGrid", async () => {
    const service = createNotificationService({
      emailConfig: { provider: "sendgrid", apiKey: "SG.key", fromEmail: "hi@pledge.test", fromName: "Pledge" },
      baseUrl: "https://app.test",
      endpoints: endpoints(),
    });
    service.updatePreferences(USER, { email: "ada@example.com" });
    reply = () => ({ status: 202, body: {}, headers: { "X-Message-Id": "sg-1" } });

    const sent = await welcome(service, ["email"]);
    expect(sent.status).toBe("delivered");
    expect(requests[0].path).toBe("/sendgrid/mail/send");
    expect(requests[0].headers.authorization).toBe("Bearer SG.key");
    const body = JSON.parse(requests[0].body);
    expect(body.personalizations[0].to[0].email).toBe("ada@example.com");
    expect(body.from).toEqual({ email: "hi@pledge.test", name: "Pledge" });
    expect(body.content[0].value).toContain("Hi Ada");
  });

  it("sends email through Mailgun and records provider errors", async () => {
    const service = createNotificationService({
      emailConfig: { provider: "mailgun", apiKey: "mg-key", fromEmail: "hi@mail.pledge.test", fromName: "Pledge" },
      baseUrl: "https://app.test",
      endpoints: endpoints(),
    });
    service.updatePreferences(USER, { email: "ada@example.com" });

    reply = () => ({ status: 200, body: { id: "<mg-1>" } });
    expect((await welcome(service, ["email"])).status).toBe("delivered");
    expect(requests[0].path).toBe("/mailgun/mail.pledge.test/messages");
    expect(requests[0].headers.authorization).toBe(`Basic ${Buffer.from("api:mg-key").toString("base64")}`);
    expect(new URLSearchParams(requests[0].body).get("to")).toBe("ada@example.com");

    reply = () => ({ status: 401, body: { message: "Forbidden" } });
    const failed = await welcome(service, ["email"]);
    expect(failed.status).toBe("failed");
    expect(failed.delivery.errorMessage).toMatch(/^HTTP 401/);
  });

  it("fails channels that are not configured instead of pretending", async () => {
    const service = createNotificationService({ baseUrl: "https://app.test", endpoints: endpoints() });
    service.updatePreferences(USER, {
      email: "ada@example.com",
      phone: "+15550001111",
      channels: { email: true, push: true, in_app: true, sms: true },
    });
    service.registerDevice(USER, { deviceId: "d1", token: "tok", platform: "ios" });

    const email = await welcome(service, ["email"]);
    expect(email.status).toBe("failed");
    expect(email.delivery.errorMessage).toMatch(/Email is not configured/);
    expect((await welcome(service, ["sms"])).delivery.errorMessage).toMatch(/SMS is not configured/);
    expect((await welcome(service, ["push"])).delivery.errorMessage).toMatch(/Push is not configured/);
    expect(requests).toEqual([]);
  });

  it("sends SMS through Twilio", async () => {
    const service = createNotificationService({
      smsConfig: { provider: "twilio", accountSid: "AC1", authToken: "secret", fromNumber: "+15550009999" },
      baseUrl: "https://app.test",
      endpoints: endpoints(),
    });
    service.updatePreferences(USER, {
      phone: "+15550001111",
      channels: { email: true, push: true, in_app: true, sms: true },
    });
    reply = () => ({ status: 201, body: { sid: "SM1" } });

    expect((await welcome(service, ["sms"])).status).toBe("delivered");
    expect(requests[0].path).toBe("/twilio/Accounts/AC1/Messages.json");
    const fields = new URLSearchParams(requests[0].body);
    expect(fields.get("To")).toBe("+15550001111");
    expect(fields.get("From")).toBe("+15550009999");
    expect(fields.get("Body")).toContain("Ada");
  });

  it("sends push through Firebase with a signed service-account token", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const service = createNotificationService({
      pushConfig: {
        provider: "firebase",
        firebaseConfig: {
          projectId: "pledge-app",
          clientEmail: "push@pledge-app.iam.gserviceaccount.com",
          privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString().replace(/\n/g, "\\n"),
        },
      },
      baseUrl: "https://app.test",
      endpoints: endpoints(),
    });
    service.registerDevice(USER, { deviceId: "d1", token: "good", platform: "ios" });
    service.registerDevice(USER, { deviceId: "d2", token: "stale", platform: "android" });

    reply = (req) =>
      req.path === "/google/token"
        ? { status: 200, body: { access_token: "ya29.token", expires_in: 3600 } }
        : req.body.includes('"stale"')
          ? { status: 404, body: { error: "UNREGISTERED" } }
          : { status: 200, body: { name: "projects/pledge-app/messages/1" } };

    const sent = await service.send({
      recipientAddress: USER,
      type: "pledge_created",
      channels: ["push"],
      variables: { backerName: "Bo", amount: "1 ETH", campaignName: "Run" },
    });
    expect(sent.status).toBe("delivered");

    // The JWT assertion is signed with the service account's key
    const assertion = new URLSearchParams(requests[0].body).get("assertion")!;
    const [header, claims, signature] = assertion.split(".");
    expect(createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(publicKey, signature, "base64url")).toBe(true);
    expect(JSON.parse(Buffer.from(claims, "base64url").toString()).iss).toBe("push@pledge-app.iam.gserviceaccount.com");

    const sends = requests.filter((r) => r.path === "/fcm/projects/pledge-app/messages:send");
    expect(sends).toHaveLength(2);
    expect(sends[0].headers.authorization).toBe("Bearer ya29.token");
    expect(JSON.parse(sends[0].body).message.notification.title).toBe("New Pledge!");
  });

  it("sends push through OneSignal", async () => {
    const service = createNotificationService({
      pushConfig: { provider: "onesignal", oneSignalConfig: { appId: "app-1", apiKey: "os-key" } },
      baseUrl: "https://app.test",
      endpoints: endpoints(),
    });
    service.registerDevice(USER, { deviceId: "d1", token: "player-1", platform: "web" });
    reply = () => ({ status: 200, body: { id: "n1" } });

    expect((await welcome(service, ["push"])).status).toBe("delivered");
    const body = JSON.parse(requests[0].body);
    expect(body).toMatchObject({ app_id: "app-1", include_player_ids: ["player-1"] });
    expect(requests[0].headers.authorization).toBe("Basic os-key");
  });

  it("keeps each user's devices and settings separate", () => {
    const service = createNotificationService({ baseUrl: "https://app.test" });
    service.registerDevice(USER, { deviceId: "d1", token: "mine", platform: "ios" });
    const other = service.getPreferences("0x00000000000000000000000000000000000000d2");
    expect(other.deviceTokens).toEqual([]);
    expect(createNotificationService({ baseUrl: "https://app.test" }).getPreferences(USER).deviceTokens).toEqual([]);
  });

  it("delivers queued notifications when they come due", async () => {
    const service = createNotificationService({ baseUrl: "https://app.test" });
    const at = Date.now() + 60_000;
    const queued = await service.send({
      recipientAddress: USER,
      type: "dispute_created",
      channels: ["in_app"],
      variables: { campaignName: "Run", disputeTitle: "Wrong time" },
      scheduledFor: at,
    });
    expect(queued.status).toBe("queued");
    expect(service.getInAppNotifications({ address: USER })).toEqual([]);

    expect(await service.processDueNotifications(at - 1)).toEqual([]);
    await service.processDueNotifications(at);
    expect(queued.status).toBe("delivered");
    expect(service.getInAppNotifications({ address: USER })[0].body).toContain("Wrong time");
  });

  describe("with stored campaigns", () => {
    const BACKER = "0x00000000000000000000000000000000000000a1";
    const FAN = "0x00000000000000000000000000000000000000f1";

    beforeEach(async () => {
      setStore(new MemoryStore());
      const now = nowSeconds();
      await getStore().saveCampaign(
        campaign({
          id: "campaign_1",
          creator: USER,
          pledgeWindowEnd: now + 3 * DAY,
          milestones: [milestone({ status: "verified", verifiedAt: now - DAY })],
        })
      );
      await getStore().savePledge(pledge({ id: "p1", backer: BACKER, escrowedAmount: parseEther("2").toString(), createdAt: now - 2 * DAY }));
      await getStore().savePledge(pledge({ id: "p2", backer: BACKER, escrowedAmount: parseEther("1").toString(), createdAt: now - 20 * DAY }));
      try {
        socialService.follow(FAN, USER);
      } catch {
        // already following from an earlier test
      }
    });

    it("builds digests from real activity", async () => {
      const service = createNotificationService({ baseUrl: "https://app.test" });
      const digest = await service.generateDigest(USER, "weekly");

      expect(digest.summary).toMatchObject({
        pledgesReceived: 1,
        amountRaised: "2.0",
        milestonesVerified: 1,
        newFollowers: 1,
      });
      expect(digest.upcomingDeadlines).toEqual([
        expect.objectContaining({ campaignId: "campaign_1", type: "campaign_end" }),
      ]);
      expect(digest.highlights.map((h) => h.type).sort()).toEqual(["milestone_verified", "trending"]);
    });

    it("sends scheduled digests once on the chosen day", async () => {
      const service = createNotificationService({
        emailConfig: { provider: "sendgrid", apiKey: "SG.key", fromEmail: "hi@pledge.test", fromName: "Pledge" },
        baseUrl: "https://app.test",
        endpoints: endpoints(),
      });
      const monday9 = Date.UTC(2026, 9, 5, 9, 30); // a Monday
      service.updatePreferences(USER, { email: "ada@example.com" }); // weekly, Monday 09:00 by default
      reply = () => ({ status: 202, body: {} });

      expect(await service.processDueDigests(monday9 - 3600_000)).toEqual([]); // 08:30
      expect(await service.processDueDigests(monday9)).toEqual([USER]);
      expect(await service.processDueDigests(monday9 + 600_000)).toEqual([]); // already sent today
      expect(JSON.parse(requests[0].body).subject).toContain("Your Pledge Protocol summary");
    });

    it("resolves topics to real recipients", async () => {
      const service = createNotificationService({ baseUrl: "https://app.test" });
      expect(await service.getTopicSubscribers("campaign:campaign_1")).toEqual([USER, BACKER]);
      expect(await service.getTopicSubscribers("backers:campaign_1")).toEqual([BACKER]);
      expect(await service.getTopicSubscribers(`followers:${USER}`)).toEqual([FAN]);
      await expect(service.getTopicSubscribers("everyone")).rejects.toThrow(/Unknown topic/);

      const sent = await service.sendToTopic("backers:campaign_1", {
        recipientAddress: "",
        type: "dispute_created",
        channels: ["in_app"],
        variables: { campaignName: "Run", disputeTitle: "Late start" },
      });
      expect(sent).toBe(1);
      expect(service.getInAppNotifications({ address: BACKER })).toHaveLength(1);
    });
  });
});
