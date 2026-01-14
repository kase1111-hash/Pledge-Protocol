import { Router, Request, Response } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

const router = Router();

// In-memory storage for Phase 1
const oracles: Map<string, Oracle> = new Map();
const attestations: Map<string, Attestation> = new Map();

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

const submitAttestationSchema = z.object({
  campaignId: z.string(),
  milestoneId: z.string(),
  completed: z.boolean(),
  value: z.number().nullable().optional(),
  evidenceUri: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  signature: z.string(),
});

// List oracles
router.get("/", (req: Request, res: Response) => {
  const { type } = req.query;

  let result = Array.from(oracles.values()).filter((o) => o.active);

  if (type) {
    result = result.filter((o) => o.type === type);
  }

  res.json({
    oracles: result.map((o) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      trustLevel: o.trustLevel,
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

// Manual oracle query
router.post("/:id/query", async (req: Request, res: Response) => {
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

  // In Phase 1, only attestation oracles are supported
  if (oracle.type !== "attestation") {
    return res.status(422).json({
      error: {
        code: "ORACLE_TYPE_NOT_SUPPORTED",
        message: "Only attestation oracles are supported in Phase 1",
      },
    });
  }

  // Return existing attestation if any
  const { campaignId, milestoneId } = req.body.params || {};
  const key = `${campaignId}:${milestoneId}`;
  const attestation = attestations.get(key);

  if (attestation) {
    res.json({
      success: true,
      data: {
        completed: attestation.completed,
        value: attestation.value,
        evidenceUri: attestation.evidenceUri,
      },
      timestamp: attestation.submittedAt,
      source: oracle.name,
    });
  } else {
    res.json({
      success: false,
      data: null,
      message: "No attestation found for this milestone",
    });
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

// Seed some default oracles for testing
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
      id: "oracle_race_timing",
      name: "Race Timing Oracle",
      description: "Official race timing integration (Phase 2)",
      type: "api",
      attestor: null,
      endpoint: "https://api.racetiming.example/results",
      trustLevel: "official",
      active: false, // Not active in Phase 1
      createdAt: Math.floor(Date.now() / 1000),
    },
  ];

  defaultOracles.forEach((o) => oracles.set(o.id, o));
}

seedOracles();

export default router;
