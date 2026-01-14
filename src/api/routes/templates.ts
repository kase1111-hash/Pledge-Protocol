/**
 * Template API Routes
 * Phase 5: Ecosystem - Campaign template endpoints
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { templateService } from "../../templates";
import { TemplateCategory } from "../../templates/types";

const router = Router();

/**
 * Search options schema
 */
const SearchOptionsSchema = z.object({
  category: z
    .enum([
      "fitness",
      "education",
      "creative",
      "opensource",
      "business",
      "research",
      "personal",
    ])
    .optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  tags: z.string().optional(), // Comma-separated
  q: z.string().optional(), // Search query
});

/**
 * Campaign generation schema
 */
const GenerateCampaignSchema = z.object({
  fieldValues: z.record(z.any()),
  customizations: z
    .object({
      additionalMilestones: z.array(z.any()).optional(),
      removedMilestones: z.array(z.string()).optional(),
      modifiedPledgeTypes: z.array(z.any()).optional(),
    })
    .optional(),
});

/**
 * GET /templates
 * List all available templates with optional filtering
 */
router.get("/", (req: Request, res: Response) => {
  try {
    const query = SearchOptionsSchema.parse(req.query);

    const templates = templateService.searchTemplates({
      category: query.category as TemplateCategory,
      difficulty: query.difficulty,
      tags: query.tags ? query.tags.split(",").map((t) => t.trim()) : undefined,
      searchQuery: query.q,
    });

    res.json({
      success: true,
      data: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        difficulty: t.difficulty,
        tags: t.tags,
        estimatedDuration: t.estimatedDuration,
        previewDescription: t.previewDescription,
        fieldCount: t.fields.length,
        milestoneCount: t.milestones.length,
        pledgeTypeCount: t.pledgeTypes.length,
      })),
      count: templates.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: "Invalid query parameters",
        details: error.errors,
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: "Failed to fetch templates",
    });
  }
});

/**
 * GET /templates/categories
 * List all template categories with counts
 */
router.get("/categories", (_req: Request, res: Response) => {
  try {
    const categories = templateService.getCategories();

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch categories",
    });
  }
});

/**
 * GET /templates/stats
 * Get template usage statistics
 */
router.get("/stats", (_req: Request, res: Response) => {
  try {
    const stats = templateService.getTemplateStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch template stats",
    });
  }
});

/**
 * GET /templates/:templateId
 * Get a specific template by ID
 */
router.get("/:templateId", (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const template = templateService.getTemplate(templateId);

    if (!template) {
      res.status(404).json({
        success: false,
        error: `Template "${templateId}" not found`,
      });
      return;
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch template",
    });
  }
});

/**
 * POST /templates/:templateId/validate
 * Validate field values against template requirements
 */
router.post("/:templateId/validate", (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const { fieldValues } = req.body;

    const template = templateService.getTemplate(templateId);
    if (!template) {
      res.status(404).json({
        success: false,
        error: `Template "${templateId}" not found`,
      });
      return;
    }

    const validation = templateService.validateFieldValues(template, fieldValues || {});

    res.json({
      success: true,
      data: validation,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to validate fields",
    });
  }
});

/**
 * POST /templates/:templateId/preview
 * Preview a campaign without creating it
 */
router.post("/:templateId/preview", (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const { fieldValues } = req.body;

    const template = templateService.getTemplate(templateId);
    if (!template) {
      res.status(404).json({
        success: false,
        error: `Template "${templateId}" not found`,
      });
      return;
    }

    const preview = templateService.previewCampaign(templateId, fieldValues || {});

    res.json({
      success: true,
      data: preview,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /templates/:templateId/generate
 * Generate a campaign from a template
 */
router.post("/:templateId/generate", (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const parsed = GenerateCampaignSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Invalid request body",
        details: parsed.error.errors,
      });
      return;
    }

    const template = templateService.getTemplate(templateId);
    if (!template) {
      res.status(404).json({
        success: false,
        error: `Template "${templateId}" not found`,
      });
      return;
    }

    const campaign = templateService.generateCampaign(
      templateId,
      parsed.data.fieldValues,
      parsed.data.customizations
    );

    res.json({
      success: true,
      data: campaign,
      message: "Campaign generated successfully. Use the campaigns API to create it on-chain.",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /templates/:templateId/instances
 * Get campaigns created from this template
 */
router.get("/:templateId/instances", (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;

    const template = templateService.getTemplate(templateId);
    if (!template) {
      res.status(404).json({
        success: false,
        error: `Template "${templateId}" not found`,
      });
      return;
    }

    const instances = templateService.getTemplateInstances(templateId);

    res.json({
      success: true,
      data: instances,
      count: instances.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch template instances",
    });
  }
});

/**
 * GET /templates/category/:category
 * Get templates by category
 */
router.get("/category/:category", (req: Request, res: Response) => {
  try {
    const { category } = req.params;

    const validCategories = [
      "fitness",
      "education",
      "creative",
      "opensource",
      "business",
      "research",
      "personal",
    ];

    if (!validCategories.includes(category)) {
      res.status(400).json({
        success: false,
        error: `Invalid category "${category}". Valid categories: ${validCategories.join(", ")}`,
      });
      return;
    }

    const templates = templateService.getByCategory(category as TemplateCategory);

    res.json({
      success: true,
      data: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        difficulty: t.difficulty,
        tags: t.tags,
        estimatedDuration: t.estimatedDuration,
      })),
      count: templates.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch templates by category",
    });
  }
});

export default router;
