/**
 * Token Metadata Generator
 * Phase 3: Token Minting and Commemoratives
 *
 * Generates ERC-721 standard metadata for pledge tokens
 * and ERC-5192 metadata for commemorative soulbound tokens
 */

import {
  TokenMetadata,
  TokenAttribute,
  PledgeTokenData,
  CommemorativeData,
  TemplateType
} from "./types";

const PROTOCOL_NAME = "Pledge Protocol";
const PROTOCOL_URL = "https://pledge.protocol";

export class MetadataGenerator {
  private baseExternalUrl: string;

  constructor(baseExternalUrl: string = PROTOCOL_URL) {
    this.baseExternalUrl = baseExternalUrl;
  }

  /**
   * Generate ERC-721 metadata for a pledge token
   */
  generatePledgeTokenMetadata(
    data: PledgeTokenData,
    imageUri: string
  ): TokenMetadata {
    const attributes: TokenAttribute[] = [
      {
        trait_type: "Campaign ID",
        value: this.truncateId(data.campaignId)
      },
      {
        trait_type: "Campaign Name",
        value: data.campaignName
      },
      {
        trait_type: "Pledge Type",
        value: this.formatPledgeType(data.pledgeType)
      },
      {
        trait_type: "Pledge Amount",
        value: parseFloat(data.pledgeAmount),
        display_type: "number"
      },
      {
        trait_type: "Status",
        value: this.capitalizeFirst(data.status)
      },
      {
        trait_type: "Pledged Date",
        value: data.pledgedAt,
        display_type: "date"
      }
    ];

    // Add milestone count if available
    if (data.milestones && data.milestones.length > 0) {
      attributes.push({
        trait_type: "Milestones",
        value: data.milestones.length,
        display_type: "number"
      });
    }

    return {
      name: `${data.campaignName} - Pledge #${this.truncateId(data.pledgeId)}`,
      description: this.generatePledgeDescription(data),
      image: imageUri,
      external_url: `${this.baseExternalUrl}/pledges/${data.pledgeId}`,
      attributes,
      properties: {
        pledge_id: data.pledgeId,
        campaign_id: data.campaignId,
        backer_address: data.backerAddress,
        protocol: PROTOCOL_NAME,
        token_standard: "ERC-721"
      }
    };
  }

  /**
   * Generate ERC-5192 metadata for a commemorative soulbound token
   */
  generateCommemorativeMetadata(
    data: CommemorativeData,
    imageUri: string,
    tokenId?: number
  ): TokenMetadata {
    const attributes: TokenAttribute[] = [
      {
        trait_type: "Campaign",
        value: data.campaignName
      },
      {
        trait_type: "Subject",
        value: data.subjectName
      },
      {
        trait_type: "Beneficiary",
        value: data.beneficiaryName
      },
      {
        trait_type: "Contribution",
        value: parseFloat(data.contributionAmount),
        display_type: "number"
      },
      {
        trait_type: "Total Raised",
        value: parseFloat(data.totalCampaignRaised),
        display_type: "number"
      },
      {
        trait_type: "Pledged Date",
        value: data.pledgedAt,
        display_type: "date"
      },
      {
        trait_type: "Resolved Date",
        value: data.resolvedAt,
        display_type: "date"
      },
      {
        trait_type: "Template",
        value: this.formatTemplateName(data.templateType)
      },
      {
        trait_type: "Token Type",
        value: "Soulbound"
      }
    ];

    // Add template-specific attributes
    this.addTemplateSpecificAttributes(attributes, data);

    return {
      name: this.generateCommemorativeName(data, tokenId),
      description: this.generateCommemorativeDescription(data),
      image: imageUri,
      external_url: `${this.baseExternalUrl}/commemoratives/${data.pledgeId}`,
      attributes,
      properties: {
        pledge_id: data.pledgeId,
        campaign_id: data.campaignId,
        backer_address: data.backerAddress,
        backer_name: data.backerName,
        outcome_summary: data.outcomeSummary,
        protocol: PROTOCOL_NAME,
        token_standard: "ERC-5192",
        soulbound: true,
        permanent_storage: "Arweave"
      }
    };
  }

  /**
   * Add template-specific attributes to metadata
   */
  private addTemplateSpecificAttributes(
    attributes: TokenAttribute[],
    data: CommemorativeData
  ): void {
    if (!data.customData) return;

    switch (data.templateType) {
      case "race_finish":
        const raceData = data.customData as any;
        if (raceData.raceName) {
          attributes.push({ trait_type: "Race Name", value: raceData.raceName });
        }
        if (raceData.finishTime) {
          attributes.push({ trait_type: "Finish Time", value: raceData.finishTime });
        }
        if (raceData.distance) {
          attributes.push({ trait_type: "Distance", value: raceData.distance });
        }
        if (raceData.pace) {
          attributes.push({ trait_type: "Pace", value: `${raceData.pace}/mi` });
        }
        if (raceData.placement) {
          attributes.push({ trait_type: "Placement", value: raceData.placement });
        }
        if (raceData.bibNumber) {
          attributes.push({ trait_type: "Bib Number", value: raceData.bibNumber });
        }
        break;

      case "academic":
        const academicData = data.customData as any;
        if (academicData.institutionName) {
          attributes.push({ trait_type: "Institution", value: academicData.institutionName });
        }
        if (academicData.degreeName) {
          attributes.push({ trait_type: "Degree", value: academicData.degreeName });
        }
        if (academicData.graduationDate) {
          attributes.push({ trait_type: "Graduation Date", value: academicData.graduationDate });
        }
        if (academicData.honors) {
          attributes.push({ trait_type: "Honors", value: academicData.honors });
        }
        break;

      case "creative":
        const creativeData = data.customData as any;
        if (creativeData.projectTitle) {
          attributes.push({ trait_type: "Project Title", value: creativeData.projectTitle });
        }
        if (creativeData.creatorName) {
          attributes.push({ trait_type: "Creator", value: creativeData.creatorName });
        }
        if (creativeData.genre) {
          attributes.push({ trait_type: "Genre", value: creativeData.genre });
        }
        if (creativeData.releaseDate) {
          attributes.push({ trait_type: "Release Date", value: creativeData.releaseDate });
        }
        break;
    }
  }

  /**
   * Generate a pledge token description
   */
  private generatePledgeDescription(data: PledgeTokenData): string {
    const statusText = this.getStatusDescription(data.status);
    const pledgeTypeText = this.formatPledgeType(data.pledgeType);

    return `This NFT represents a ${pledgeTypeText.toLowerCase()} pledge of ${data.pledgeAmount} ETH ` +
      `to the "${data.campaignName}" campaign on ${PROTOCOL_NAME}. ` +
      `${statusText} ` +
      `This token is transferable and serves as proof of backing. ` +
      `Pledge ID: ${this.truncateId(data.pledgeId)}`;
  }

  /**
   * Generate commemorative token name
   */
  private generateCommemorativeName(data: CommemorativeData, tokenId?: number): string {
    const prefix = this.getTemplateNamePrefix(data.templateType);
    const tokenSuffix = tokenId ? ` #${tokenId}` : "";
    return `${prefix}: ${data.campaignName}${tokenSuffix}`;
  }

  /**
   * Generate a commemorative token description
   */
  private generateCommemorativeDescription(data: CommemorativeData): string {
    const baseDescription =
      `This soulbound NFT commemorates ${data.backerName}'s contribution of ${data.contributionAmount} ETH ` +
      `to support "${data.subjectName}" through the "${data.campaignName}" campaign. `;

    const outcomeText = data.outcomeSummary
      ? `Outcome: ${data.outcomeSummary}. `
      : "";

    const templateText = this.getTemplateDescription(data);

    const permanenceText =
      `This token is permanently stored on Arweave and is non-transferable (soulbound), ` +
      `serving as an eternal record of support on ${PROTOCOL_NAME}.`;

    return baseDescription + outcomeText + templateText + permanenceText;
  }

  /**
   * Get template-specific description text
   */
  private getTemplateDescription(data: CommemorativeData): string {
    if (!data.customData) return "";

    switch (data.templateType) {
      case "race_finish":
        const race = data.customData as any;
        return race.finishTime
          ? `The supported runner completed ${race.raceName || "the race"} in ${race.finishTime}. `
          : "";

      case "academic":
        const academic = data.customData as any;
        return academic.degreeName
          ? `The supported student earned their ${academic.degreeName} from ${academic.institutionName || "their institution"}. `
          : "";

      case "creative":
        const creative = data.customData as any;
        return creative.projectTitle
          ? `The supported project "${creative.projectTitle}" by ${creative.creatorName || "the creator"} was successfully completed. `
          : "";

      default:
        return "";
    }
  }

  /**
   * Get status description text
   */
  private getStatusDescription(status: string): string {
    switch (status) {
      case "active":
        return "The pledge is currently active and awaiting campaign resolution.";
      case "resolved":
        return "The campaign has been successfully resolved and funds have been released.";
      case "refunded":
        return "The campaign did not meet its goals and funds have been refunded.";
      default:
        return "";
    }
  }

  /**
   * Get name prefix based on template type
   */
  private getTemplateNamePrefix(templateType: TemplateType): string {
    switch (templateType) {
      case "race_finish":
        return "Race Finisher Certificate";
      case "academic":
        return "Academic Achievement";
      case "creative":
        return "Creative Project Backer";
      case "generic":
      default:
        return "Commemorative Token";
    }
  }

  /**
   * Format pledge type for display
   */
  private formatPledgeType(type: string): string {
    switch (type) {
      case "flat":
        return "Fixed Amount";
      case "per_unit":
        return "Per-Unit";
      case "tiered":
        return "Tiered";
      case "conditional":
        return "Conditional";
      default:
        return this.capitalizeFirst(type);
    }
  }

  /**
   * Format template name for display
   */
  private formatTemplateName(templateType: TemplateType): string {
    switch (templateType) {
      case "race_finish":
        return "Race Finish";
      case "academic":
        return "Academic";
      case "creative":
        return "Creative Project";
      case "generic":
      default:
        return "Generic";
    }
  }

  /**
   * Capitalize first letter
   */
  private capitalizeFirst(str: string): string {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Truncate ID for display
   */
  private truncateId(id: string): string {
    if (!id || id.length <= 12) return id;
    return `${id.substring(0, 6)}...${id.substring(id.length - 4)}`;
  }

  /**
   * Generate a simple placeholder image for pledge tokens
   */
  generatePledgeTokenImage(data: PledgeTokenData): string {
    const statusColor = this.getStatusColor(data.status);
    const typeIcon = this.getPledgeTypeIcon(data.pledgeType);

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e293b"/>
      <stop offset="100%" style="stop-color:#0f172a"/>
    </linearGradient>
  </defs>

  <rect width="100%" height="100%" fill="url(#bgGrad)"/>

  <!-- Border -->
  <rect x="10" y="10" width="380" height="380" rx="20" fill="none" stroke="${statusColor}" stroke-width="3"/>

  <!-- Protocol Header -->
  <text x="200" y="50" font-family="Arial, sans-serif" font-size="12" fill="#64748b" text-anchor="middle" letter-spacing="2">
    PLEDGE PROTOCOL
  </text>

  <!-- Icon -->
  <text x="200" y="180" font-size="80" text-anchor="middle">
    ${typeIcon}
  </text>

  <!-- Amount -->
  <text x="200" y="250" font-family="Arial, sans-serif" font-size="32" fill="#f8fafc" text-anchor="middle" font-weight="bold">
    ${parseFloat(data.pledgeAmount).toFixed(4)} ETH
  </text>

  <!-- Campaign Name -->
  <text x="200" y="290" font-family="Arial, sans-serif" font-size="14" fill="#94a3b8" text-anchor="middle">
    ${this.truncateText(data.campaignName, 35)}
  </text>

  <!-- Status Badge -->
  <rect x="140" y="320" width="120" height="30" rx="15" fill="${statusColor}"/>
  <text x="200" y="340" font-family="Arial, sans-serif" font-size="12" fill="#ffffff" text-anchor="middle" font-weight="bold">
    ${data.status.toUpperCase()}
  </text>

  <!-- Pledge ID -->
  <text x="200" y="380" font-family="monospace" font-size="10" fill="#475569" text-anchor="middle">
    ${this.truncateId(data.pledgeId)}
  </text>
</svg>`;
  }

  /**
   * Get status color
   */
  private getStatusColor(status: string): string {
    switch (status) {
      case "active":
        return "#3b82f6"; // Blue
      case "resolved":
        return "#10b981"; // Green
      case "refunded":
        return "#f59e0b"; // Amber
      default:
        return "#6366f1"; // Indigo
    }
  }

  /**
   * Get pledge type icon
   */
  private getPledgeTypeIcon(type: string): string {
    switch (type) {
      case "flat":
        return "💎";
      case "per_unit":
        return "📊";
      case "tiered":
        return "📈";
      case "conditional":
        return "🎯";
      default:
        return "🤝";
    }
  }

  /**
   * Truncate text with ellipsis
   */
  private truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + "...";
  }

  /**
   * Validate token metadata against ERC-721 standard
   */
  validateMetadata(metadata: TokenMetadata): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!metadata.name) errors.push("name is required");
    if (!metadata.description) errors.push("description is required");
    if (!metadata.image) errors.push("image URI is required");

    if (metadata.image && !this.isValidUri(metadata.image)) {
      errors.push("image must be a valid URI");
    }

    if (metadata.external_url && !this.isValidUri(metadata.external_url)) {
      errors.push("external_url must be a valid URI");
    }

    if (metadata.attributes) {
      metadata.attributes.forEach((attr, index) => {
        if (!attr.trait_type) {
          errors.push(`attribute[${index}].trait_type is required`);
        }
        if (attr.value === undefined || attr.value === null) {
          errors.push(`attribute[${index}].value is required`);
        }
      });
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Check if string is a valid URI
   */
  private isValidUri(uri: string): boolean {
    try {
      new URL(uri);
      return true;
    } catch {
      // Check for IPFS/Arweave URIs
      return uri.startsWith("ipfs://") || uri.startsWith("ar://");
    }
  }

  /**
   * Convert metadata to JSON string
   */
  toJson(metadata: TokenMetadata): string {
    return JSON.stringify(metadata, null, 2);
  }
}

export const metadataGenerator = new MetadataGenerator();
