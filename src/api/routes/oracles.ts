import { Router, Request, Response } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import {
  OracleRouter,
  oracleRouter,
  RaceTimingProvider,
  GitHubProvider,
  WebhookHandler,
  ResolutionEngine,
  OracleConfig,
} from "../../oracle";

const router = Router();

// In-memory storage
const oracles: Map<string, Oracle> = new Map();
const attestations: Map<string, Attestation> = new Map();

// Initialize oracle router with providers
let webhookHandler: WebhookHandler | null = null;
let resolutionEngine: ResolutionEngine | null = null;

interface Oracle {
  id: string;
  name: string;
  description: string;
  type: "api" | "attestation" | "aggregator";
  attestor: string | null;
  endpoint: string | null;
  trustLevel: "official" | "verified" | "community" | "custom";
  active: boolean;
  createdAt: number;
  config?: OracleConfig;
}

interface Attestation {
  id: string;
  oracleId: string;
  campaignId: string;
  milestoneId: string;
  completed: boolean;
  value: number | null;
  evidenceUri: string | null;
  notes: string | null;
  attestor: string;
  signature: string;
  submittedAt: number;
}

// Validation schemas
const submitAttestationSchema = z.object({
  campaignId: z.string(),
  milestoneId: z.string(),
  completed: z.boolean(),
  value: z.number().nullable().optional(),
  evidenceUri: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  signature: z.string(),
});

const registerOracleSchema = z.object({
  name: z.string(),
  description: z.string(),
  type: z.enum(["api", "attestation", "aggregator"]),
  endpoint: z.string().optional(),
  attestor: z.string().optional(),
  trustLevel: z.enum(["official", "verified", "community", "custom"]).optional(),
  config: z.record(z.any()).optional(),
});

const queryOracleSchema = z.object({
  params: z.record(z.any()),
  campaignId: z.string().optional(),
  milestoneId: z.string().optional(),
});

// List oracles
router.get("/", (req: Request, res: Response) => {
  const { type, active } = req.query;

  let result = Array.from(oracles.values());

  if (active !== "false") {
    result = result.filter((o) => o.active);
  }

  if (type) {
    result = result.filter((o) => o.type === type);
  }

  res.json({
    oracles: result.map((o) => ({
      id: o.id,
      name: o.name,
      description: o.description,
      type: o.type,
      trustLevel: o.trustLevel,
      active: o.active,
      endpoint: o.type === "api" ? o.endpoint : undefined,
    })),
  });
});

// Get oracle details
router.get("/:id", (req: Request, res: Response) => {
  const oracle = oracles.get(req.params.id);

  if (!oracle) {
    return res.status(404).json({
      error: {
        code: "ORACLE_NOT_FOUND",
        message: `Oracle with ID ${req.params.id} does not exist`,
      },
    });
  }

  res.json(oracle);
});

// Register a new oracle (Phase 2)
router.post("/", async (req: Request, res: Response) => {
  try {
    const body = registerOracleSchema.parse(req.body);

    const id = `oracle_${uuidv4().slice(0, 8)}`;
    const now = Math.floor(Date.now() / 1000);

    const oracle: Oracle = {
      id,
      name: body.name,
      description: body.description,
      type: body.type,
      attestor: body.attestor || null,
      endpoint: body.endpoint || null,
      trustLevel: body.trustLevel || "custom",
      active: true,
      createdAt: now,
    };

    oracles.set(id, oracle);

    // Register with oracle router if it's an API oracle
    if (body.type === "api" && body.endpoint) {
      const config: OracleConfig = {
        id,
        name: body.name,
        description: body.description,
        type: "api",
        trustLevel: oracle.trustLevel as any,
        active: true,
        endpoint: body.endpoint,
        ...body.config,
      };

      oracleRouter.registerProvider(config);
    }

    res.status(201).json(oracle);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid request body",
          details: error.errors,
        },
      });
    }
    throw error;
  }
});

// Query an oracle (Phase 2 - supports API oracles)
router.post("/:id/query", async (req: Request, res: Response) => {
  try {
    const oracle = oracles.get(req.params.id);

    if (!oracle) {
      return res.status(404).json({
        error: {
          code: "ORACLE_NOT_FOUND",
          message: `Oracle with ID ${req.params.id} does not exist`,
        },
      });
    }

    if (!oracle.active) {
      return res.status(422).json({
        error: {
          code: "ORACLE_INACTIVE",
          message: "Oracle is not active",
        },
      });
    }

    const body = queryOracleSchema.parse(req.body);

    // Handle attestation oracles (Phase 1 style)
    if (oracle.type === "attestation") {
      const { campaignId, milestoneId } = body.params || {};
      const key = `${campaignId}:${milestoneId}`;
      const attestation = attestations.get(key);

      if (attestation) {
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

    // Handle API oracles (Phase 2)
    if (oracle.type === "api") {
      const response = await oracleRouter.query({
        oracleId: oracle.id,
        campaignId: body.campaignId || "",
        milestoneId: body.milestoneId || "",
        params: body.params,
      });

      return res.json(response);
    }

    // Handle aggregator oracles
    if (oracle.type === "aggregator") {
      const response = await oracleRouter.query({
        oracleId: oracle.id,
        campaignId: body.campaignId || "",
        milestoneId: body.milestoneId || "",
        params: body.params,
      });

      return res.json(response);
    }

    res.status(422).json({
      error: {
        code: "ORACLE_TYPE_NOT_SUPPORTED",
        message: `Oracle type ${oracle.type} not supported`,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid request body",
          details: error.errors,
        },
      });
    }
    throw error;
  }
});

// Submit attestation
router.post("/attestations", async (req: Request, res: Response) => {
  try {
    const body = submitAttestationSchema.parse(req.body);
    const attestor = req.headers["x-wallet-address"] as string;

    if (!attestor) {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Wallet address required",
        },
      });
    }

    // Find oracle for this attestor
    const oracle = Array.from(oracles.values()).find(
      (o) => o.attestor === attestor && o.active
    );

    if (!oracle) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "Not a registered attestor",
        },
      });
    }

    const key = `${body.campaignId}:${body.milestoneId}`;

    if (attestations.has(key)) {
      return res.status(409).json({
        error: {
          code: "CONFLICT",
          message: "Attestation already exists for this milestone",
        },
      });
    }

    const id = `att_${uuidv4().slice(0, 8)}`;
    const now = Math.floor(Date.now() / 1000);

    const attestation: Attestation = {
      id,
      oracleId: oracle.id,
      campaignId: body.campaignId,
      milestoneId: body.milestoneId,
      completed: body.completed,
      value: body.value || null,
      evidenceUri: body.evidenceUri || null,
      notes: body.notes || null,
      attestor,
      signature: body.signature,
      submittedAt: now,
    };

    attestations.set(key, attestation);

    res.status(201).json({
      attestationId: attestation.id,
      verified: true,
      submittedAt: now,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid request body",
          details: error.errors,
        },
      });
    }
    throw error;
  }
});

// Webhook endpoint for oracle callbacks (Phase 2)
router.post("/:id/webhook", async (req: Request, res: Response) => {
  const oracleId = req.params.id;

  if (!webhookHandler) {
    return res.status(503).json({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Webhook handler not initialized",
      },
    });
  }

  try {
    const result = await webhookHandler.handleWebhook(
      oracleId,
      req.body,
      req.headers as Record<string, string>
    );

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: (error as Error).message,
    });
  }
});

// Health check for all oracles
router.get("/health/all", async (req: Request, res: Response) => {
  const results = await oracleRouter.healthCheckAll();

  res.json({
    healthy: Object.values(results).every((v) => v),
    oracles: results,
    timestamp: Date.now(),
  });
});

// Verify a milestone condition (Phase 2)
router.post("/:id/verify", async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    res.status(500).json({
      error: {
        code: "VERIFICATION_FAILED",
        message: (error as Error).message,
      },
    });
  }
});

// Seed default oracles
function seedOracles() {
  const defaultOracles: Oracle[] = [
    {
      id: "oracle_manual_1",
      name: "Manual Attestation",
      description: "General purpose manual attestation oracle",
      type: "attestation",
      attestor: null,
      endpoint: null,
      trustLevel: "community",
      active: true,
      createdAt: Math.floor(Date.now() / 1000),
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
      createdAt: Math.floor(Date.now() / 1000),
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
      createdAt: Math.floor(Date.now() / 1000),
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
      createdAt: Math.floor(Date.now() / 1000),
    },
  ];

  defaultOracles.forEach((o) => {
    oracles.set(o.id, o);

    // Register API oracles with the router
    if (o.type === "api" && o.endpoint) {
      try {
        const config: OracleConfig = {
          id: o.id,
          name: o.name,
          description: o.description,
          type: "api",
          trustLevel: o.trustLevel as any,
          active: o.active,
          endpoint: o.endpoint,
          timeout: 15000,
          retries: 3,
        };

        oracleRouter.registerProvider(config);
      } catch (error) {
        console.warn(`Failed to register oracle ${o.id}:`, error);
      }
    }
  });
}

seedOracles();

export default router;

// Export for initialization
export function initializeOracleServices(
  wh: WebhookHandler,
  re: ResolutionEngine
) {
  webhookHandler = wh;
  resolutionEngine = re;
}
