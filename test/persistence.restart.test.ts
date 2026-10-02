/**
 * Restart test: runs the real server process against PostgreSQL, makes
 * changes over HTTP, stops it, starts a new process on the same database and
 * checks the changes are still there. Needs TEST_DATABASE_URL (see
 * helpers/stores).
 */

import { describe, it, expect, afterEach } from "vitest";
import { spawn, ChildProcess } from "child_process";
import { createServer } from "net";
import path from "path";
import { Wallet } from "ethers";
import { TEST_DATABASE_URL, resetPostgres } from "./helpers/stores";

const SCHEMA = "restart_test";
const ROOT = path.resolve(__dirname, "..");

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

interface RunningServer {
  url: string;
  process: ChildProcess;
  output: string[];
  stop(): Promise<void>;
}

async function startServer(env: Record<string, string>): Promise<RunningServer> {
  const port = await freePort();
  const databaseUrl = new URL(TEST_DATABASE_URL!);
  databaseUrl.searchParams.set("options", `-c search_path=${SCHEMA}`);

  const child = spawn(process.execPath, ["-r", "ts-node/register/transpile-only", "src/api/server.ts"], {
    cwd: ROOT,
    env: {
      ...process.env,
      ...env,
      NODE_ENV: "test",
      PORT: String(port),
      DATABASE_TYPE: "postgresql",
      DATABASE_URL: databaseUrl.toString(),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output: string[] = [];
  child.stdout!.on("data", (d) => output.push(String(d)));
  child.stderr!.on("data", (d) => output.push(String(d)));

  const url = `http://127.0.0.1:${port}`;
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited during startup:\n${output.join("")}`);
    }
    try {
      if ((await fetch(`${url}/health`)).ok) break;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  return {
    url,
    process: child,
    output,
    stop: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
      }),
  };
}

describe.skipIf(!TEST_DATABASE_URL)("state survives a server restart", () => {
  const servers: RunningServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.map((s) => s.stop()));
  });

  it("keeps sessions, roles, disputes, webhooks, social, preferences and schedules", async () => {
    await resetPostgres(SCHEMA);

    const admin = Wallet.createRandom();
    const user = Wallet.createRandom();
    const friend = Wallet.createRandom();
    const env = { ADMIN_ADDRESSES: admin.address };

    let server = await startServer(env);
    servers.push(server);

    const call = async (method: string, route: string, session?: string, body?: unknown) => {
      const response = await fetch(`${server.url}${route}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(session ? { authorization: `Bearer ${session}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { status: response.status, body: (await response.json()) as any };
    };

    const login = async (wallet: typeof admin) => {
      const challenge = await call("POST", "/v1/auth/challenge", undefined, { address: wallet.address });
      const message = challenge.body.data.message;
      const verified = await call("POST", "/v1/auth/verify", undefined, {
        address: wallet.address,
        message,
        signature: await wallet.signMessage(message),
      });
      return verified.body.data.sessionId as string;
    };

    const adminSession = await login(admin);
    const userSession = await login(user);

    // Changes across the persisted services
    expect((await call("POST", `/v1/auth/roles/${user.address}`, adminSession, { role: "arbitrator" })).status).toBe(200);

    const now = Math.floor(Date.now() / 1000);
    const campaign = await call("POST", "/v1/campaigns", userSession, {
      name: "Persisted",
      description: "Survives restart",
      beneficiary: user.address,
      beneficiaryName: "Charity",
      pledgeWindowStart: now - 10,
      pledgeWindowEnd: now + 3600,
      resolutionDeadline: now + 90 * 24 * 3600,
      milestones: [{
        name: "Finish", description: "Finish", oracleId: "oracle_manual_1",
        condition: { type: "completion", field: "completed", operator: "eq", value: true },
        releasePercentage: 100,
      }],
      pledgeTypes: [{ name: "Flat", description: "Flat", calculationType: "flat", minimum: "100" }],
      minimumPledge: "100",
    });
    expect(campaign.status).toBe(201);
    const campaignId = campaign.body.id;

    // 90 days out: longer than a single setTimeout can wait
    const deadline = now + 90 * 24 * 3600;
    expect((await call("POST", "/v1/resolution/schedule", userSession, { campaignId, deadline })).status).toBe(200);

    const dispute = await call("POST", "/v1/disputes", userSession, {
      campaignId,
      category: "other",
      title: "Persisted dispute",
      description: "This dispute must survive a restart.",
    });
    expect(dispute.status).toBe(201);

    const webhook = await call("POST", "/v1/webhooks", userSession, {
      name: "Hook",
      url: "https://example.com/hook",
      events: ["pledge_created"],
    });
    expect(webhook.status).toBe(201);

    expect((await call("PUT", "/v1/social/users/me", userSession, { displayName: "Runner" })).status).toBe(200);
    expect((await call("POST", `/v1/social/users/${friend.address}/follow`, userSession)).status).toBeLessThan(300);
    expect((await call("PUT", `/v1/i18n/preferences/${user.address}`, userSession, { locale: "fr" })).status).toBe(200);

    // Restart on the same database
    await server.stop();
    expect(server.process.exitCode).toBe(0);
    server = await startServer(env);
    servers.push(server);

    // The old session still works, with the role granted before the restart
    const session = await call("GET", "/v1/auth/session", userSession);
    expect(session.status).toBe(200);
    expect(session.body.data.roles).toContain("arbitrator");

    expect((await call("GET", `/v1/campaigns/${campaignId}`)).body.name).toBe("Persisted");
    expect((await call("GET", `/v1/resolution/schedule/${campaignId}`)).body.scheduledFor).toBe(deadline);
    expect((await call("GET", `/v1/disputes/${dispute.body.data.id}`)).body.data.title).toBe("Persisted dispute");
    expect((await call("GET", `/v1/webhooks/${webhook.body.data.id}`, userSession)).status).toBe(200);

    const profile = await call("GET", `/v1/social/users/${user.address}`, userSession);
    expect(profile.body.data.displayName).toBe("Runner");
    const following = await call("GET", `/v1/social/users/${user.address}/following`);
    expect(JSON.stringify(following.body).toLowerCase()).toContain(friend.address.toLowerCase());

    expect((await call("GET", `/v1/i18n/preferences/${user.address}`)).body.locale).toBe("fr");
  }, 120_000);
});
