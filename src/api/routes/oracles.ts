import { Router, Request, Response } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { oracleRouter, evaluateCondition, OracleConfig } from "../../oracle";
import {
  authMiddleware,
  asyncHandler,
  rawBodyOf,
  requireRole,
  sameAddress,
} from "../../security/middleware";
import { getStore, Attestation, Oracle } from "../../database";
import { webhookHandler } from "../resolution-services";
import { webhookUrlProblem } from "../../security/outbound";
import { milestoneEvent } from "../../events";

const router = Router();

const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address");

// Validation schemas
const submitAttestationSchema = z.object({
  campaignId: z.string(),
  milestoneId: z.string(),
  completed: z.boolean(),
  value: z.number().nullable().optional(),
  evidenceUri: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  /** Optional signature over the attestation, kept for audit; the session authenticates the attestor */
  signature: z.string().optional(),
});

const registerOracleSchema = z
  .object({
    name: z.string().min(1),
    description: z.string(),
    type: z.enum(["api", "attestation", "aggregator"]),
    endpoint: z.string().url().optional(),
    attestor: address.optional(),
    trustLevel: z.enum(["official", "verified", "community", "custom"]).optional(),
    config: z.record(z.any()).optional(),
  })
  .refine((o) => o.type !== "attestation" || o.attestor, {
    message: "Attestation oracles require an attestor address",
    path: ["attestor"],
  })
  .refine((o) => o.type !== "api" || o.endpoint, {
    message: "API oracles require an endpoint",
    path: ["endpoint"],
  })
  .superRefine((o, ctx) => {
    const problem = o.endpoint ? webhookUrlProblem(o.endpoint) : null;
    if (problem) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem, path: ["endpoint"] });
    }
  });

const queryOracleSchema = z.object({
  params: z.record(z.any()),
  campaignId: z.string().optional(),
  milestoneId: z.string().optional(),
});

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function invalidRequest(res: Response, error: z.ZodError) {
  return res.status(400).json({
    error: {
      code: "INVALID_REQUEST",
      message: "Invalid request body",
      details: error.errors,
    },
  });
}

function oracleNotFound(res: Response, id: string) {
  return res.status(404).json({
    error: {
      code: "ORACLE_NOT_FOUND",
      message: `Oracle with ID ${id} does not exist`,
    },
  });
}

/**
 * Make an API or aggregator oracle queryable through the oracle router, and
 * accept signed callbacks at /v1/oracles/:id/webhook when its config has a
 * webhookSecret (optionally webhookSignatureHeader, webhookEventMapping).
 */
function registerWithRouter(oracle: Oracle): void {
  if (oracle.type === "attestation" || !oracle.active) {
    return;
  }

  const settings = oracle.config ?? {};
  if (typeof settings.webhookSecret === "string" && settings.webhookSecret.length > 0) {
    webhookHandler.registerWebhook({
      oracleId: oracle.id,
      secret: settings.webhookSecret,
      signatureHeader: typeof settings.webhookSignatureHeader === "string"
        ? settings.webhookSignatureHeader
        : "x-signature",
      signatureAlgorithm: "sha256",
      eventMapping: (settings.webhookEventMapping as Record<string, string>) ?? {},
    });
  }

  const config: OracleConfig = {
    timeout: 15000,
    retries: 3,
    ...(oracle.config ?? {}),
    id: oracle.id,
    name: oracle.name,
    description: oracle.description,
    type: oracle.type,
    trustLevel: oracle.trustLevel,
    active: oracle.active,
    endpoint: oracle.endpoint ?? undefined,
  };
  try {
    oracleRouter.registerProvider(config);
  } catch (error) {
    console.warn(`Failed to register oracle ${oracle.id}:`, error);
  }
}

/**
 * Public view of an oracle. Its config can carry API credentials (headers,
 * keys), so it is never returned.
 */
function toResponse(oracle: Oracle) {
  return {
    id: oracle.id,
    name: oracle.name,
    description: oracle.description,
    type: oracle.type,
    attestor: oracle.attestor,
    endpoint: oracle.endpoint,
    trustLevel: oracle.trustLevel,
    active: oracle.active,
    createdAt: oracle.createdAt,
  };
}

// List oracles (active only unless ?active=false)
router.get("/", asyncHandler(async (req: Request, res: Response) => {
  const { type, active } = req.query;

  let result = await getStore().listOracles();

  if (active !== "false") {
    result = result.filter((o) => o.active);
  }

  if (type) {
    result = result.filter((o) => o.type === type);
  }

  res.json({ oracles: result.map(toResponse) });
}));

// Get oracle
router.get("/:id", asyncHandler(async (req: Request, res: Response) => {
  const oracle = await getStore().getOracle(req.params.id);

  if (!oracle) {
    return oracleNotFound(res, req.params.id);
  }

  res.json(toResponse(oracle));
}));

// Register a new oracle. Oracles decide where escrowed funds go, so only
// administrators may add them.
router.post("/", authMiddleware(), requireRole("admin"), asyncHandler(async (req: Request, res: Response) => {
  const parsed = registerOracleSchema.safeParse(req.body);
  if (!parsed.success) {
    return invalidRequest(res, parsed.error);
  }
  const body = parsed.data;

  const oracle: Oracle = {
    id: `oracle_${uuidv4().slice(0, 8)}`,
    name: body.name,
    description: body.description,
    type: body.type,
    attestor: body.attestor || null,
    endpoint: body.endpoint || null,
    trustLevel: body.trustLevel || "custom",
    active: true,
    config: body.config || null,
    createdAt: now(),
  };

  await getStore().saveOracle(oracle);
  registerWithRouter(oracle);

  res.status(201).json(toResponse(oracle));
}));

// Query an oracle
router.post("/:id/query", authMiddleware(), asyncHandler(async (req: Request, res: Response) => {
  const oracle = await getStore().getOracle(req.params.id);

  if (!oracle) {
    return oracleNotFound(res, req.params.id);
  }

  if (!oracle.active) {
    return res.status(422).json({
      error: {
        code: "ORACLE_INACTIVE",
        message: "Oracle is not active",
      },
    });
  }

  const parsed = queryOracleSchema.safeParse(req.body);
  if (!parsed.success) {
    return invalidRequest(res, parsed.error);
  }
  const body = parsed.data;

  // Attestation oracles answer from recorded attestations
  if (oracle.type === "attestation") {
    const { campaignId, milestoneId } = body.params;
    const attestation =
      typeof campaignId === "string" && typeof milestoneId === "string"
        ? await getStore().getAttestation(campaignId, milestoneId)
        : null;

    if (attestation && attestation.oracleId === oracle.id) {
      return res.json({
        success: true,
        data: {
          completed: attestation.completed,
          value: attestation.value,
          evidenceUri: attestation.evidenceUri,
        },
        timestamp: attestation.submittedAt,
        source: oracle.name,
        cached: false,
      });
    }

    return res.json({
      success: false,
      data: null,
      message: "No attestation found for this milestone",
      cached: false,
    });
  }

  const response = await oracleRouter.query({
    oracleId: oracle.id,
    campaignId: body.campaignId || "",
    milestoneId: body.milestoneId || "",
    params: body.params,
  });

  res.json(response);
}));

// Submit an attestation. The caller must be signed in as the attestor of the
// oracle assigned to the milestone; the attestation decides the milestone.
router.post("/attestations", authMiddleware(), asyncHandler(async (req: Request, res: Response) => {
  const parsed = submitAttestationSchema.safeParse(req.body);
  if (!parsed.success) {
    return invalidRequest(res, parsed.error);
  }
  const body = parsed.data;
  const attestor = req.auth!.address;

  const result = await getStore().transaction(async (tx) => {
    const campaign = await tx.getCampaign(body.campaignId, { forUpdate: true });
    if (!campaign) {
      return () => res.status(404).json({
        error: { code: "CAMPAIGN_NOT_FOUND", message: `Campaign with ID ${body.campaignId} does not exist` },
      });
    }

    const milestone = campaign.milestones.find((m) => m.id === body.milestoneId);
    if (!milestone) {
      return () => res.status(404).json({
        error: { code: "MILESTONE_NOT_FOUND", message: `Milestone ${body.milestoneId} does not exist` },
      });
    }

    const oracle = await tx.getOracle(milestone.oracleId);
    if (!oracle || oracle.type !== "attestation" || !oracle.active || !sameAddress(oracle.attestor, attestor)) {
      return () => res.status(403).json({
        error: { code: "FORBIDDEN", message: "Not the attestor for this milestone's oracle" },
      });
    }

    if (campaign.status !== "active" && campaign.status !== "pledging_closed") {
      return () => res.status(409).json({
        error: { code: "CONFLICT", message: `Campaign is ${campaign.status}` },
      });
    }

    const timestamp = now();
    const attestation: Attestation = {
      id: `att_${uuidv4().slice(0, 8)}`,
      oracleId: oracle.id,
      campaignId: campaign.id,
      milestoneId: milestone.id,
      completed: body.completed,
      value: body.value ?? null,
      evidenceUri: body.evidenceUri || null,
      notes: body.notes || null,
      attestor,
      signature: body.signature ?? "",
      submittedAt: timestamp,
    };

    if (milestone.status !== "pending" || !(await tx.insertAttestation(attestation))) {
      return () => res.status(409).json({
        error: { code: "CONFLICT", message: "Attestation already exists for this milestone" },
      });
    }

    const oracleData = { completed: attestation.completed, value: attestation.value };
    const verified = evaluateCondition(oracleData, milestone.condition);
    milestone.status = verified ? "verified" : "failed";
    milestone.verifiedAt = verified ? timestamp : null;
    milestone.oracleData = oracleData;
    campaign.updatedAt = timestamp;
    await tx.saveCampaign(campaign);

    return () => {
      milestoneEvent(verified ? "milestone_verified" : "milestone_failed", campaign, milestone.id);
      res.status(201).json({
        attestationId: attestation.id,
        milestoneId: milestone.id,
        milestoneStatus: milestone.status,
        submittedAt: timestamp,
      });
    };
  });

  result();
}));

// Webhook endpoint for oracle callbacks. Authenticated by the HMAC signature
// the webhook handler verifies, not by a session.
router.post("/:id/webhook", asyncHandler(async (req: Request, res: Response) => {
  const result = await webhookHandler.handleWebhook(
    req.params.id,
    req.body,
    req.headers as Record<string, string>,
    rawBodyOf(req)
  );

  res.status(result.success ? 200 : 400).json(result);
}));

// Health check for all oracles
router.get("/health/all", asyncHandler(async (req: Request, res: Response) => {
  const results = await oracleRouter.healthCheckAll();

  res.json({
    healthy: Object.values(results).every((v) => v),
    oracles: results,
    timestamp: Date.now(),
  });
}));

// Check a condition against an oracle without recording anything (dry run)
router.post("/:id/verify", authMiddleware(), asyncHandler(async (req: Request, res: Response) => {
  const { campaignId, milestoneId, condition, params } = req.body;

  if (!campaignId || !milestoneId || !condition) {
    return res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: "campaignId, milestoneId, and condition are required",
      },
    });
  }

  const result = await oracleRouter.verifyMilestone(
    req.params.id,
    campaignId,
    milestoneId,
    condition,
    params || {}
  );

  res.json(result);
}));

const DEFAULT_ORACLES: Omit<Oracle, "createdAt">[] = [
  {
    id: "oracle_manual_1",
    name: "Manual Attestation",
    description: "General purpose manual attestation oracle",
    type: "attestation",
    // Set ORACLE_MANUAL_ATTESTOR to the address allowed to attest
    attestor: null,
    endpoint: null,
    trustLevel: "community",
    active: true,
    config: null,
  },
  {
    id: "oracle_race_athlinks",
    name: "Athlinks Race Timing",
    description: "Official race timing via Athlinks API",
    type: "api",
    attestor: null,
    endpoint: "https://api.athlinks.com/v1/results",
    trustLevel: "official",
    active: true,
    config: null,
  },
  {
    id: "oracle_race_runsignup",
    name: "RunSignUp Race Timing",
    description: "Official race timing via RunSignUp API",
    type: "api",
    attestor: null,
    endpoint: "https://runsignup.com/Rest/race/results",
    trustLevel: "official",
    active: true,
    config: null,
  },
  {
    id: "oracle_github",
    name: "GitHub Activity",
    description: "GitHub PR and commit verification",
    type: "api",
    attestor: null,
    endpoint: "https://api.github.com",
    trustLevel: "official",
    active: true,
    config: null,
  },
];

/**
 * Seed the default oracles (once) and register every stored API/aggregator
 * oracle with the oracle router. Call after the database is initialized.
 */
export async function initializeOracles(): Promise<void> {
  const store = getStore();

  for (const defaults of DEFAULT_ORACLES) {
    if (!(await store.getOracle(defaults.id))) {
      await store.saveOracle({ ...defaults, createdAt: now() });
    }
  }

  // The manual attestation oracle's attestor is configuration, not data
  const manualAttestor = process.env.ORACLE_MANUAL_ATTESTOR;
  if (manualAttestor) {
    const manual = await store.getOracle("oracle_manual_1");
    if (manual && !sameAddress(manual.attestor, manualAttestor)) {
      manual.attestor = manualAttestor;
      await store.saveOracle(manual);
    }
  }

  for (const oracle of await store.listOracles()) {
    registerWithRouter(oracle);
  }
}

export default router;
