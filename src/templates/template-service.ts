/**
 * Campaign Template Service
 * Phase 5: Ecosystem - Template management and campaign generation
 */

import {
  CampaignTemplate,
  TemplateInstance,
  TemplateSearchOptions,
  TemplateCategory,
} from "./types";
import {
  builtinTemplates,
  getTemplateById,
  getTemplatesByCategory,
  searchTemplates,
} from "./builtin-templates";

/**
 * Campaign structure for generation
 */
export interface GeneratedCampaign {
  name: string;
  description: string;
  beneficiary: string;
  subject: string;
  milestones: Array<{
    name: string;
    description: string;
    oracleId: string;
    condition: any;
    order: number;
  }>;
  pledgeTypes: Array<{
    name: string;
    description: string;
    calculationType: string;
    config: any;
  }>;
  metadata: {
    templateId: string;
    templateVersion: string;
    generatedAt: number;
    fieldValues: Record<string, any>;
  };
}

/**
 * Template Service
 * Manages campaign templates and generates campaigns from templates
 */
export class TemplateService {
  private customTemplates: Map<string, CampaignTemplate> = new Map();
  private templateInstances: Map<string, TemplateInstance> = new Map();

  /**
   * Get all available templates (builtin + custom)
   */
  getAllTemplates(): CampaignTemplate[] {
    return [...builtinTemplates, ...Array.from(this.customTemplates.values())];
  }

  /**
   * Get template by ID
   */
  getTemplate(id: string): CampaignTemplate | undefined {
    return getTemplateById(id) || this.customTemplates.get(id);
  }

  /**
   * Search templates with filters
   */
  searchTemplates(options: TemplateSearchOptions): CampaignTemplate[] {
    let templates = this.getAllTemplates();

    if (options.category) {
      templates = templates.filter((t) => t.category === options.category);
    }

    if (options.difficulty) {
      templates = templates.filter((t) => t.difficulty === options.difficulty);
    }

    if (options.tags && options.tags.length > 0) {
      templates = templates.filter((t) =>
        options.tags!.some((tag) =>
          t.tags.map((tt) => tt.toLowerCase()).includes(tag.toLowerCase())
        )
      );
    }

    if (options.searchQuery) {
      const query = options.searchQuery.toLowerCase();
      templates = templates.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query) ||
          t.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    return templates;
  }

  /**
   * Get templates by category
   */
  getByCategory(category: TemplateCategory): CampaignTemplate[] {
    const builtin = getTemplatesByCategory(category);
    const custom = Array.from(this.customTemplates.values()).filter(
      (t) => t.category === category
    );
    return [...builtin, ...custom];
  }

  /**
   * Get all available categories
   */
  getCategories(): Array<{ category: TemplateCategory; count: number }> {
    const counts = new Map<TemplateCategory, number>();
    const templates = this.getAllTemplates();

    for (const template of templates) {
      const count = counts.get(template.category) || 0;
      counts.set(template.category, count + 1);
    }

    return Array.from(counts.entries()).map(([category, count]) => ({
      category,
      count,
    }));
  }

  /**
   * Register a custom template
   */
  registerCustomTemplate(template: CampaignTemplate): void {
    if (getTemplateById(template.id)) {
      throw new Error(`Template ID "${template.id}" conflicts with builtin template`);
    }

    this.customTemplates.set(template.id, template);
  }

  /**
   * Remove a custom template
   */
  removeCustomTemplate(id: string): boolean {
    return this.customTemplates.delete(id);
  }

  /**
   * Validate field values against template requirements
   */
  validateFieldValues(
    template: CampaignTemplate,
    values: Record<string, any>
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const field of template.fields) {
      const value = values[field.name];

      // Check required fields
      if (field.required && (value === undefined || value === null || value === "")) {
        errors.push(`Field "${field.label}" is required`);
        continue;
      }

      if (value === undefined || value === null) {
        continue;
      }

      // Type validation
      switch (field.type) {
        case "number":
          if (typeof value !== "number" && isNaN(Number(value))) {
            errors.push(`Field "${field.label}" must be a number`);
          } else if (field.validation) {
            const numValue = Number(value);
            if (field.validation.min !== undefined && numValue < field.validation.min) {
              errors.push(`Field "${field.label}" must be at least ${field.validation.min}`);
            }
            if (field.validation.max !== undefined && numValue > field.validation.max) {
              errors.push(`Field "${field.label}" must be at most ${field.validation.max}`);
            }
          }
          break;

        case "date":
          const dateValue = new Date(value);
          if (isNaN(dateValue.getTime())) {
            errors.push(`Field "${field.label}" must be a valid date`);
          }
          break;

        case "address":
          if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
            errors.push(`Field "${field.label}" must be a valid Ethereum address`);
          }
          break;

        case "url":
          try {
            new URL(value);
            if (field.validation?.pattern) {
              const regex = new RegExp(field.validation.pattern);
              if (!regex.test(value)) {
                errors.push(field.validation.message || `Field "${field.label}" has invalid format`);
              }
            }
          } catch {
            errors.push(`Field "${field.label}" must be a valid URL`);
          }
          break;

        case "select":
          if (field.options && !field.options.some((opt) => opt.value === value)) {
            errors.push(`Field "${field.label}" has an invalid selection`);
          }
          break;
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Generate a campaign from a template
   */
  generateCampaign(
    templateId: string,
    fieldValues: Record<string, any>,
    customizations?: {
      additionalMilestones?: Array<any>;
      removedMilestones?: string[];
      modifiedPledgeTypes?: Array<any>;
    }
  ): GeneratedCampaign {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template "${templateId}" not found`);
    }

    // Validate fields
    const validation = this.validateFieldValues(template, fieldValues);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
    }

    // Map field values to campaign structure
    const campaignName = this.mapFieldValue(template, fieldValues, "campaignName") || fieldValues.projectTitle || fieldValues.eventName;
    const subjectName = this.mapFieldValue(template, fieldValues, "subjectName") || "";
    const beneficiaryAddress = this.mapFieldValue(template, fieldValues, "beneficiaryAddress") || "";

    // Generate milestones
    let milestones = template.milestones
      .filter((m) => !customizations?.removedMilestones?.includes(m.name))
      .map((m, index) => ({
        name: m.name,
        description: m.description,
        oracleId: `${templateId}-${m.oracleType}-${index}`,
        condition: {
          ...m.defaultCondition,
          value: m.defaultCondition.defaultValue,
        },
        order: m.order,
      }));

    // Add custom milestones
    if (customizations?.additionalMilestones) {
      milestones = [
        ...milestones,
        ...customizations.additionalMilestones.map((m, index) => ({
          ...m,
          order: milestones.length + index,
        })),
      ];
    }

    // Generate pledge types
    let pledgeTypes = template.pledgeTypes.map((pt) => ({
      name: pt.name,
      description: pt.description,
      calculationType: pt.calculationType,
      config: { ...pt.defaultConfig },
    }));

    // Apply pledge type modifications
    if (customizations?.modifiedPledgeTypes) {
      for (const mod of customizations.modifiedPledgeTypes) {
        const existing = pledgeTypes.find((pt) => pt.name === mod.name);
        if (existing) {
          existing.config = { ...existing.config, ...mod.config };
        } else {
          pledgeTypes.push(mod);
        }
      }
    }

    const campaign: GeneratedCampaign = {
      name: campaignName,
      description: template.description,
      beneficiary: beneficiaryAddress,
      subject: subjectName,
      milestones,
      pledgeTypes,
      metadata: {
        templateId,
        templateVersion: template.version,
        generatedAt: Date.now(),
        fieldValues,
      },
    };

    // Track instance
    const instanceId = `${templateId}-${Date.now()}`;
    this.templateInstances.set(instanceId, {
      templateId,
      templateVersion: template.version,
      campaignId: instanceId, // Will be replaced with actual campaign ID
      fieldValues,
      customizations: {
        milestonesAdded: customizations?.additionalMilestones?.length || 0,
        milestonesRemoved: customizations?.removedMilestones?.length || 0,
        pledgeTypesModified: customizations?.modifiedPledgeTypes?.length || 0,
      },
      createdAt: Date.now(),
    });

    return campaign;
  }

  /**
   * Map field value based on template mapping
   */
  private mapFieldValue(
    template: CampaignTemplate,
    values: Record<string, any>,
    targetField: string
  ): any {
    const field = template.fields.find((f) => f.mapTo === targetField);
    return field ? values[field.name] : undefined;
  }

  /**
   * Get template usage statistics
   */
  getTemplateStats(): Array<{
    templateId: string;
    templateName: string;
    usageCount: number;
  }> {
    const stats = new Map<string, number>();

    for (const instance of this.templateInstances.values()) {
      const count = stats.get(instance.templateId) || 0;
      stats.set(instance.templateId, count + 1);
    }

    return Array.from(stats.entries()).map(([templateId, usageCount]) => {
      const template = this.getTemplate(templateId);
      return {
        templateId,
        templateName: template?.name || "Unknown",
        usageCount,
      };
    });
  }

  /**
   * Get instances created from a template
   */
  getTemplateInstances(templateId: string): TemplateInstance[] {
    return Array.from(this.templateInstances.values()).filter(
      (i) => i.templateId === templateId
    );
  }

  /**
   * Preview a campaign without saving
   */
  previewCampaign(
    templateId: string,
    fieldValues: Record<string, any>
  ): { campaign: GeneratedCampaign; warnings: string[] } {
    const warnings: string[] = [];
    const template = this.getTemplate(templateId);

    if (!template) {
      throw new Error(`Template "${templateId}" not found`);
    }

    // Check for missing optional fields
    for (const field of template.fields) {
      if (!field.required && !fieldValues[field.name]) {
        warnings.push(`Optional field "${field.label}" is not provided`);
      }
    }

    // Check pledge type suggestions
    const suggestedTypes = template.pledgeTypes.filter((pt) => pt.suggested);
    if (suggestedTypes.length > 0) {
      warnings.push(
        `Suggested pledge types: ${suggestedTypes.map((pt) => pt.name).join(", ")}`
      );
    }

    const campaign = this.generateCampaign(templateId, fieldValues);

    return { campaign, warnings };
  }
}

// Export singleton instance
export const templateService = new TemplateService();
