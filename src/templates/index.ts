/**
 * Campaign Template System Exports
 * Phase 5: Ecosystem - Template System
 */

// Types
export * from "./types";

// Built-in templates
export {
  builtinTemplates,
  charityRaceTemplate,
  creativeProjectTemplate,
  academicTemplate,
  openSourceTemplate,
  businessLaunchTemplate,
  researchTemplate,
  getTemplateById,
  getTemplatesByCategory,
  searchTemplates,
} from "./builtin-templates";

// Template service
export {
  TemplateService,
  templateService,
  GeneratedCampaign,
} from "./template-service";
