/**
 * Campaign Template Types
 * Phase 5: Ecosystem - Template System
 */

/**
 * Template categories
 */
export type TemplateCategory =
  | "fitness"
  | "education"
  | "creative"
  | "opensource"
  | "business"
  | "research"
  | "personal";

/**
 * Milestone template definition
 */
export interface MilestoneTemplate {
  name: string;
  description: string;
  oracleType: string;
  defaultCondition: {
    type: "completion" | "threshold" | "range" | "custom";
    field: string;
    operator: "exists" | "eq" | "gt" | "gte" | "lt" | "lte" | "between";
    defaultValue?: any;
    defaultValueEnd?: any;
  };
  required: boolean;
  order: number;
}

/**
 * Pledge type template definition
 */
export interface PledgeTypeTemplate {
  name: string;
  description: string;
  calculationType: "flat" | "per_unit" | "tiered" | "conditional";
  defaultConfig: {
    baseAmount?: string;
    perUnitAmount?: string;
    unitField?: string;
    cap?: string;
    minimum?: string;
    tiers?: Array<{ threshold: number; rate: string }>;
    condition?: {
      field: string;
      operator: string;
      value?: number;
      valueEnd?: number;
    };
  };
  suggested: boolean;
}

/**
 * Oracle configuration template
 */
export interface OracleTemplate {
  oracleType: string;
  providerType?: string;
  name: string;
  description: string;
  requiredParams: string[];
  optionalParams: string[];
}

/**
 * Commemorative template configuration
 */
export interface CommemorativeTemplate {
  templateType: "race_finish" | "academic" | "creative" | "generic";
  defaultFields: string[];
  suggestedCustomData: Record<string, string>;
}

/**
 * Campaign form field definition
 */
export interface TemplateField {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "multiselect" | "address" | "url";
  required: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  helpText?: string;
  mapTo?: string; // Maps to campaign/milestone field
}

/**
 * Complete campaign template
 */
export interface CampaignTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  version: string;

  // Template content
  fields: TemplateField[];
  milestones: MilestoneTemplate[];
  pledgeTypes: PledgeTypeTemplate[];
  oracles: OracleTemplate[];
  commemorative: CommemorativeTemplate;

  // Metadata
  estimatedDuration?: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  tags: string[];
  exampleCampaigns?: string[];

  // Preview
  previewImage?: string;
  previewDescription?: string;
}

/**
 * Template instance - a campaign created from a template
 */
export interface TemplateInstance {
  templateId: string;
  templateVersion: string;
  campaignId: string;
  fieldValues: Record<string, any>;
  customizations: {
    milestonesAdded: number;
    milestonesRemoved: number;
    pledgeTypesModified: number;
  };
  createdAt: number;
}

/**
 * Template search/filter options
 */
export interface TemplateSearchOptions {
  category?: TemplateCategory;
  difficulty?: CampaignTemplate["difficulty"];
  tags?: string[];
  searchQuery?: string;
}
