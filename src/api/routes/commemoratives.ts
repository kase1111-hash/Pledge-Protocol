/**
 * Commemorative Routes
 * Phase 3: Token Minting and Commemoratives
 *
 * API endpoints for commemorative token management
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  commemorativeService,
  pledgeTokenService,
  GenerationRequest,
  CampaignGenerationRequest,
  TemplateType,
  imageGenerator,
  storageService
} from "../../tokens";

const router = Router();

// Validation schemas
const generateSingleSchema = z.object({
  pledgeId: z.string(),
  campaignId: z.string(),
  campaignName: z.string(),
  subjectName: z.string(),
  beneficiaryName: z.string(),
  backerName: z.string(),
  backerAddress: z.string(),
  contributionAmount: z.string(),
  totalCampaignRaised: z.string(),
  pledgedAt: z.number(),
  resolvedAt: z.number(),
  outcomeSummary: z.string(),
  templateType: z.enum(["race_finish", "academic", "creative", "generic"]).optional(),
  customData: z.record(z.any()).optional(),
  storageProvider: z.enum(["ipfs", "arweave"]).optional()
});

const generateCampaignSchema = z.object({
  campaignId: z.string(),
  campaignName: z.string(),
  subjectName: z.string(),
  beneficiaryName: z.string(),
  totalRaised: z.string(),
  resolvedAt: z.number(),
  outcomeSummary: z.string(),
  templateType: z.enum(["race_finish", "academic", "creative", "generic"]).optional(),
  customTemplateData: z.record(z.any()).optional(),
  pledges: z.array(z.object({
    pledgeId: z.string(),
    backerName: z.string(),
    backerAddress: z.string(),
    contributionAmount: z.string(),
    pledgedAt: z.number()
  })),
  storageProvider: z.enum(["ipfs", "arweave"]).optional()
});

const mintSchema = z.object({
  tokenId: z.number(),
  txHash: z.string()
});

/**
 * POST /commemoratives/generate
 * Generate a single commemorative token
 */
router.post("/generate", async (req: Request, res: Response) => {
  try {
    const body = generateSingleSchema.parse(req.body);

    const request: GenerationRequest = {
      pledgeId: body.pledgeId,
      campaignId: body.campaignId,
      campaignName: body.campaignName,
      subjectName: body.subjectName,
      beneficiaryName: body.beneficiaryName,
      backerName: body.backerName,
      backerAddress: body.backerAddress,
      contributionAmount: body.contributionAmount,
      totalCampaignRaised: body.totalCampaignRaised,
      pledgedAt: body.pledgedAt,
      resolvedAt: body.resolvedAt,
      outcomeSummary: body.outcomeSummary,
      templateType: body.templateType as TemplateType,
      customData: body.customData
    };

    const result = await commemorativeService.generateCommemorative(
      request,
      body.storageProvider
    );

    if (!result.success) {
      return res.status(400).json({
        error: {
          code: "GENERATION_FAILED",
          message: result.error
        }
      });
    }

    res.status(201).json({
      id: result.record!.id,
      pledgeId: result.record!.pledgeId,
      imageUri: result.record!.imageUri,
      metadataUri: result.record!.metadataUri,
      imageUrl: storageService.toHttpUrl(result.record!.imageUri),
      metadataUrl: storageService.toHttpUrl(result.record!.metadataUri),
      storageProvider: result.record!.storageProvider
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid request body",
          details: error.errors
        }
      });
    }
    throw error;
  }
});

/**
 * POST /commemoratives/generate/campaign
 * Generate commemoratives for all pledges in a campaign
 */
router.post("/generate/campaign", async (req: Request, res: Response) => {
  try {
    const body = generateCampaignSchema.parse(req.body);

    const request: CampaignGenerationRequest = {
      campaignId: body.campaignId,
      campaignName: body.campaignName,
      subjectName: body.subjectName,
      beneficiaryName: body.beneficiaryName,
      totalRaised: body.totalRaised,
      resolvedAt: body.resolvedAt,
      outcomeSummary: body.outcomeSummary,
      templateType: body.templateType as TemplateType,
      customTemplateData: body.customTemplateData,
      pledges: body.pledges
    };

    const results = await commemorativeService.generateForCampaign(
      request,
      body.storageProvider
    );

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    res.status(201).json({
      campaignId: body.campaignId,
      total: results.length,
      successful: successful.length,
      failed: failed.length,
      records: successful.map(r => ({
        id: r.record!.id,
        pledgeId: r.record!.pledgeId,
        imageUri: r.record!.imageUri,
        metadataUri: r.record!.metadataUri
      })),
      errors: failed.map(r => ({
        pledgeId: r.pledgeId,
        error: r.error
      }))
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid request body",
          details: error.errors
        }
      });
    }
    throw error;
  }
});

/**
 * GET /commemoratives/:id
 * Get commemorative details by record ID
 */
router.get("/:id", (req: Request, res: Response) => {
  const record = commemorativeService.getRecord(req.params.id);

  if (!record) {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: `Commemorative with ID ${req.params.id} not found`
      }
    });
  }

  res.json({
    id: record.id,
    pledgeId: record.pledgeId,
    campaignId: record.campaignId,
    backerAddress: record.backerAddress,
    imageUri: record.imageUri,
    metadataUri: record.metadataUri,
    imageUrl: storageService.toHttpUrl(record.imageUri),
    metadataUrl: storageService.toHttpUrl(record.metadataUri),
    storageProvider: record.storageProvider,
    minted: record.minted,
    tokenId: record.tokenId,
    txHash: record.txHash,
    mintedAt: record.mintedAt,
    createdAt: record.createdAt,
    metadata: record.metadata
  });
});

/**
 * GET /commemoratives/pledge/:pledgeId
 * Get commemorative by pledge ID
 */
router.get("/pledge/:pledgeId", (req: Request, res: Response) => {
  const record = commemorativeService.getByPledgeId(req.params.pledgeId);

  if (!record) {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: `Commemorative for pledge ${req.params.pledgeId} not found`
      }
    });
  }

  res.json({
    id: record.id,
    pledgeId: record.pledgeId,
    campaignId: record.campaignId,
    imageUri: record.imageUri,
    metadataUri: record.metadataUri,
    imageUrl: storageService.toHttpUrl(record.imageUri),
    metadataUrl: storageService.toHttpUrl(record.metadataUri),
    minted: record.minted,
    tokenId: record.tokenId,
    metadata: record.metadata
  });
});

/**
 * GET /commemoratives/campaign/:campaignId
 * Get all commemoratives for a campaign
 */
router.get("/campaign/:campaignId", (req: Request, res: Response) => {
  const records = commemorativeService.getByCampaignId(req.params.campaignId);

  res.json({
    campaignId: req.params.campaignId,
    count: records.length,
    commemoratives: records.map(r => ({
      id: r.id,
      pledgeId: r.pledgeId,
      backerAddress: r.backerAddress,
      imageUrl: storageService.toHttpUrl(r.imageUri),
      metadataUrl: storageService.toHttpUrl(r.metadataUri),
      minted: r.minted,
      tokenId: r.tokenId
    }))
  });
});

/**
 * GET /commemoratives/backer/:address
 * Get all commemoratives for a backer
 */
router.get("/backer/:address", (req: Request, res: Response) => {
  const records = commemorativeService.getByBackerAddress(req.params.address);

  res.json({
    backerAddress: req.params.address,
    count: records.length,
    commemoratives: records.map(r => ({
      id: r.id,
      pledgeId: r.pledgeId,
      campaignId: r.campaignId,
      imageUrl: storageService.toHttpUrl(r.imageUri),
      metadataUrl: storageService.toHttpUrl(r.metadataUri),
      minted: r.minted,
      tokenId: r.tokenId,
      metadata: r.metadata
    }))
  });
});

/**
 * POST /commemoratives/:id/mint
 * Mark a commemorative as minted
 */
router.post("/:id/mint", (req: Request, res: Response) => {
  const record = commemorativeService.getRecord(req.params.id);

  if (!record) {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: `Commemorative with ID ${req.params.id} not found`
      }
    });
  }

  try {
    const body = mintSchema.parse(req.body);

    const success = commemorativeService.markAsMinted(
      record.pledgeId,
      body.tokenId,
      body.txHash
    );

    if (!success) {
      return res.status(400).json({
        error: {
          code: "MINT_FAILED",
          message: "Failed to mark commemorative as minted"
        }
      });
    }

    const updated = commemorativeService.getRecord(req.params.id);

    res.json({
      id: updated!.id,
      pledgeId: updated!.pledgeId,
      tokenId: updated!.tokenId,
      txHash: updated!.txHash,
      minted: updated!.minted,
      mintedAt: updated!.mintedAt
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid request body",
          details: error.errors
        }
      });
    }
    throw error;
  }
});

/**
 * GET /commemoratives/:id/verify
 * Verify commemorative assets exist in storage
 */
router.get("/:id/verify", async (req: Request, res: Response) => {
  const record = commemorativeService.getRecord(req.params.id);

  if (!record) {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: `Commemorative with ID ${req.params.id} not found`
      }
    });
  }

  const verification = await commemorativeService.verifyAssets(record.pledgeId);

  res.json({
    id: record.id,
    pledgeId: record.pledgeId,
    imageUri: record.imageUri,
    metadataUri: record.metadataUri,
    imageExists: verification.imageExists,
    metadataExists: verification.metadataExists,
    valid: verification.imageExists && verification.metadataExists
  });
});

/**
 * GET /commemoratives/:id/metadata
 * Get ERC-5192 standard metadata
 */
router.get("/:id/metadata", (req: Request, res: Response) => {
  const record = commemorativeService.getRecord(req.params.id);

  if (!record) {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: `Commemorative with ID ${req.params.id} not found`
      }
    });
  }

  // Return ERC-5192 standard metadata
  res.json(record.metadata);
});

/**
 * GET /commemoratives/templates
 * List available templates
 */
router.get("/templates", (_req: Request, res: Response) => {
  const templates = imageGenerator.getTemplateTypes();

  res.json({
    templates: templates.map(t => ({
      type: t,
      name: formatTemplateName(t),
      description: getTemplateDescription(t)
    }))
  });
});

/**
 * GET /commemoratives/stats
 * Get commemorative statistics
 */
router.get("/stats", (_req: Request, res: Response) => {
  const stats = commemorativeService.getStats();

  res.json({
    totalRecords: stats.totalRecords,
    minted: stats.minted,
    unminted: stats.unminted,
    byCampaign: Object.fromEntries(stats.byCampaign)
  });
});

// Helper functions
function formatTemplateName(type: string): string {
  const names: Record<string, string> = {
    race_finish: "Race Finish Certificate",
    academic: "Academic Achievement",
    creative: "Creative Project",
    generic: "Generic Commemorative"
  };
  return names[type] || type;
}

function getTemplateDescription(type: string): string {
  const descriptions: Record<string, string> = {
    race_finish: "Bib-style certificate with race results, timing, and placement",
    academic: "Diploma-style certificate for educational achievements",
    creative: "Album art style design for creative projects and collaborations",
    generic: "Clean card design with campaign details and backer information"
  };
  return descriptions[type] || "";
}

export default router;
