/**
 * Commemorative Image Generator
 * Phase 3: Token Minting and Commemoratives
 *
 * Generates visual representations of commemorative tokens
 * using SVG templates for different campaign types
 */

import {
  CommemorativeData,
  RaceFinishData,
  AcademicData,
  CreativeData,
  GeneratedImage,
  TemplateType
} from "./types";

export class ImageGenerator {
  private readonly width = 800;
  private readonly height = 1000;
  private readonly brandColor = "#6366f1"; // Indigo
  private readonly secondaryColor = "#818cf8";
  private readonly backgroundColor = "#0f172a"; // Slate-900
  private readonly textColor = "#f8fafc"; // Slate-50
  private readonly accentColor = "#fbbf24"; // Amber-400

  /**
   * Generates a commemorative image based on template type
   */
  async generate(data: CommemorativeData): Promise<GeneratedImage> {
    let svg: string;

    switch (data.templateType) {
      case "race_finish":
        svg = this.generateRaceFinishTemplate(data as RaceFinishData);
        break;
      case "academic":
        svg = this.generateAcademicTemplate(data as AcademicData);
        break;
      case "creative":
        svg = this.generateCreativeTemplate(data as CreativeData);
        break;
      case "generic":
      default:
        svg = this.generateGenericTemplate(data);
        break;
    }

    return {
      svg,
      width: this.width,
      height: this.height
    };
  }

  /**
   * Race Finish Template - Bib-style with results
   */
  private generateRaceFinishTemplate(data: RaceFinishData): string {
    const { customData } = data;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e3a5f"/>
      <stop offset="100%" style="stop-color:#0f172a"/>
    </linearGradient>
    <linearGradient id="bibGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#fef3c7"/>
      <stop offset="100%" style="stop-color:#fde68a"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-opacity="0.3"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="100%" height="100%" fill="url(#bgGradient)"/>

  <!-- Decorative pattern -->
  <g opacity="0.1">
    ${this.generateRunningPattern()}
  </g>

  <!-- Header Banner -->
  <rect x="0" y="0" width="100%" height="120" fill="${this.brandColor}"/>
  <text x="400" y="50" font-family="Arial, sans-serif" font-size="18" fill="${this.textColor}" text-anchor="middle" font-weight="bold">
    PLEDGE PROTOCOL
  </text>
  <text x="400" y="85" font-family="Arial, sans-serif" font-size="24" fill="${this.accentColor}" text-anchor="middle" font-weight="bold">
    🏃 RACE FINISHER CERTIFICATE
  </text>

  <!-- Bib Number Section -->
  <rect x="200" y="160" width="400" height="180" rx="10" fill="url(#bibGradient)" filter="url(#shadow)"/>
  <text x="400" y="210" font-family="Arial Black, sans-serif" font-size="16" fill="#374151" text-anchor="middle">
    BIB NUMBER
  </text>
  <text x="400" y="290" font-family="Arial Black, sans-serif" font-size="72" fill="#1f2937" text-anchor="middle" font-weight="bold">
    ${this.escapeXml(customData.bibNumber)}
  </text>

  <!-- Race Info -->
  <text x="400" y="400" font-family="Georgia, serif" font-size="28" fill="${this.textColor}" text-anchor="middle" font-weight="bold">
    ${this.escapeXml(customData.raceName)}
  </text>
  <text x="400" y="435" font-family="Arial, sans-serif" font-size="18" fill="${this.secondaryColor}" text-anchor="middle">
    ${this.escapeXml(customData.raceDate)} • ${this.escapeXml(customData.distance)}
  </text>

  <!-- Runner Name -->
  <text x="400" y="500" font-family="Georgia, serif" font-size="32" fill="${this.accentColor}" text-anchor="middle" font-weight="bold">
    ${this.escapeXml(customData.runnerName)}
  </text>

  <!-- Results Box -->
  <rect x="100" y="540" width="600" height="200" rx="15" fill="#1e293b" stroke="${this.brandColor}" stroke-width="2"/>

  <!-- Finish Time -->
  <text x="250" y="600" font-family="Arial, sans-serif" font-size="14" fill="${this.secondaryColor}" text-anchor="middle">
    FINISH TIME
  </text>
  <text x="250" y="650" font-family="Arial Black, sans-serif" font-size="36" fill="${this.textColor}" text-anchor="middle">
    ${this.escapeXml(customData.finishTime)}
  </text>

  <!-- Pace -->
  <text x="550" y="600" font-family="Arial, sans-serif" font-size="14" fill="${this.secondaryColor}" text-anchor="middle">
    AVERAGE PACE
  </text>
  <text x="550" y="650" font-family="Arial Black, sans-serif" font-size="36" fill="${this.textColor}" text-anchor="middle">
    ${this.escapeXml(customData.pace)}/mi
  </text>

  ${customData.placement ? `
  <!-- Placement -->
  <text x="400" y="700" font-family="Arial, sans-serif" font-size="14" fill="${this.secondaryColor}" text-anchor="middle">
    OVERALL PLACEMENT
  </text>
  <text x="400" y="730" font-family="Arial Black, sans-serif" font-size="24" fill="${this.accentColor}" text-anchor="middle">
    ${this.escapeXml(customData.placement)}
  </text>
  ` : ""}

  <!-- Backer Credit -->
  <rect x="100" y="780" width="600" height="100" rx="10" fill="#0f172a" stroke="${this.accentColor}" stroke-width="1"/>
  <text x="400" y="820" font-family="Arial, sans-serif" font-size="14" fill="${this.secondaryColor}" text-anchor="middle">
    PROUDLY BACKED BY
  </text>
  <text x="400" y="855" font-family="Georgia, serif" font-size="24" fill="${this.textColor}" text-anchor="middle">
    ${this.escapeXml(data.backerName)} • ${this.formatAmount(data.contributionAmount)} ETH
  </text>

  <!-- Footer -->
  <text x="400" y="930" font-family="Arial, sans-serif" font-size="12" fill="#64748b" text-anchor="middle">
    Campaign: ${this.escapeXml(data.campaignName)}
  </text>
  <text x="400" y="955" font-family="Arial, sans-serif" font-size="11" fill="#475569" text-anchor="middle">
    Pledge ID: ${this.truncateId(data.pledgeId)} • Resolved: ${this.formatDate(data.resolvedAt)}
  </text>
  <text x="400" y="980" font-family="Arial, sans-serif" font-size="10" fill="#334155" text-anchor="middle">
    Verified on Ethereum • Soulbound NFT
  </text>
</svg>`;
  }

  /**
   * Academic Template - Diploma-style certificate
   */
  private generateAcademicTemplate(data: AcademicData): string {
    const { customData } = data;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="parchment" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#fef7ed"/>
      <stop offset="100%" style="stop-color:#fde6c4"/>
    </linearGradient>
    <filter id="paperTexture">
      <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="5"/>
      <feDisplacementMap in="SourceGraphic" scale="2"/>
    </filter>
    <pattern id="borderPattern" patternUnits="userSpaceOnUse" width="20" height="20">
      <rect width="20" height="20" fill="none" stroke="#8b7355" stroke-width="0.5"/>
    </pattern>
  </defs>

  <!-- Background -->
  <rect width="100%" height="100%" fill="${this.backgroundColor}"/>

  <!-- Certificate Paper -->
  <rect x="40" y="40" width="720" height="920" rx="5" fill="url(#parchment)" stroke="#8b7355" stroke-width="3"/>

  <!-- Inner Border -->
  <rect x="60" y="60" width="680" height="880" rx="3" fill="none" stroke="#8b7355" stroke-width="1"/>
  <rect x="70" y="70" width="660" height="860" rx="3" fill="none" stroke="#d4a574" stroke-width="0.5"/>

  <!-- Header Decoration -->
  <path d="M 200 120 Q 400 80 600 120" fill="none" stroke="#8b7355" stroke-width="2"/>
  <path d="M 200 130 Q 400 90 600 130" fill="none" stroke="#d4a574" stroke-width="1"/>

  <!-- Institution Name -->
  <text x="400" y="180" font-family="Georgia, serif" font-size="28" fill="#4a3728" text-anchor="middle" font-style="italic">
    ${this.escapeXml(customData.institutionName)}
  </text>

  <!-- Certificate Title -->
  <text x="400" y="260" font-family="Times New Roman, serif" font-size="20" fill="#6b5344" text-anchor="middle" letter-spacing="4">
    CERTIFICATE OF COMPLETION
  </text>

  <!-- Decorative Line -->
  <line x1="200" y1="290" x2="600" y2="290" stroke="#8b7355" stroke-width="1"/>

  <!-- "This certifies that" -->
  <text x="400" y="350" font-family="Georgia, serif" font-size="18" fill="#5c4a3d" text-anchor="middle" font-style="italic">
    This is to certify that
  </text>

  <!-- Student Name -->
  <text x="400" y="420" font-family="Brush Script MT, cursive" font-size="48" fill="#2d1f14" text-anchor="middle">
    ${this.escapeXml(customData.studentName)}
  </text>
  <line x1="200" y1="440" x2="600" y2="440" stroke="#8b7355" stroke-width="1"/>

  <!-- Degree Info -->
  <text x="400" y="500" font-family="Georgia, serif" font-size="18" fill="#5c4a3d" text-anchor="middle" font-style="italic">
    has successfully completed requirements for
  </text>
  <text x="400" y="560" font-family="Times New Roman, serif" font-size="28" fill="#2d1f14" text-anchor="middle" font-weight="bold">
    ${this.escapeXml(customData.degreeName)}
  </text>

  ${customData.honors ? `
  <text x="400" y="610" font-family="Georgia, serif" font-size="20" fill="#8b7355" text-anchor="middle" font-style="italic">
    ${this.escapeXml(customData.honors)}
  </text>
  ` : ""}

  <!-- Date -->
  <text x="400" y="680" font-family="Georgia, serif" font-size="16" fill="#5c4a3d" text-anchor="middle">
    Conferred on ${this.escapeXml(customData.graduationDate)}
  </text>

  <!-- Decorative Separator -->
  <path d="M 250 720 Q 400 700 550 720" fill="none" stroke="#8b7355" stroke-width="1"/>

  <!-- Backer Credit Box -->
  <rect x="150" y="760" width="500" height="100" rx="5" fill="#fef3c7" stroke="#d4a574" stroke-width="1"/>
  <text x="400" y="800" font-family="Georgia, serif" font-size="14" fill="#6b5344" text-anchor="middle">
    This achievement was supported by
  </text>
  <text x="400" y="835" font-family="Times New Roman, serif" font-size="22" fill="#2d1f14" text-anchor="middle" font-weight="bold">
    ${this.escapeXml(data.backerName)}
  </text>

  <!-- Pledge Protocol Seal -->
  <circle cx="650" cy="810" r="40" fill="#1e293b" stroke="#d4a574" stroke-width="2"/>
  <text x="650" y="805" font-family="Arial, sans-serif" font-size="10" fill="${this.textColor}" text-anchor="middle">PLEDGE</text>
  <text x="650" y="820" font-family="Arial, sans-serif" font-size="10" fill="${this.textColor}" text-anchor="middle">PROTOCOL</text>

  <!-- Footer -->
  <text x="400" y="900" font-family="Arial, sans-serif" font-size="11" fill="#8b7355" text-anchor="middle">
    Campaign: ${this.escapeXml(data.campaignName)} • Contribution: ${this.formatAmount(data.contributionAmount)} ETH
  </text>
  <text x="400" y="920" font-family="Arial, sans-serif" font-size="10" fill="#a1907f" text-anchor="middle">
    Pledge ID: ${this.truncateId(data.pledgeId)} • Verified on Ethereum
  </text>
</svg>`;
  }

  /**
   * Creative Template - Album art style with backer credit
   */
  private generateCreativeTemplate(data: CreativeData): string {
    const { customData } = data;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="creativeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#7c3aed"/>
      <stop offset="50%" style="stop-color:#db2777"/>
      <stop offset="100%" style="stop-color:#f97316"/>
    </linearGradient>
    <linearGradient id="overlayGradient" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" style="stop-color:#000000" stop-opacity="0.8"/>
      <stop offset="50%" style="stop-color:#000000" stop-opacity="0.3"/>
      <stop offset="100%" style="stop-color:#000000" stop-opacity="0"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="100%" height="100%" fill="url(#creativeGradient)"/>

  <!-- Geometric Pattern -->
  <g opacity="0.15">
    ${this.generateCreativePattern()}
  </g>

  <!-- Gradient Overlay -->
  <rect width="100%" height="100%" fill="url(#overlayGradient)"/>

  <!-- Album Art Frame -->
  <rect x="100" y="100" width="600" height="600" rx="20" fill="#000000" opacity="0.5"/>
  <rect x="110" y="110" width="580" height="580" rx="15" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.3"/>

  <!-- Project Title -->
  <text x="400" y="300" font-family="Helvetica Neue, sans-serif" font-size="48" fill="#ffffff" text-anchor="middle" font-weight="bold" filter="url(#glow)">
    ${this.escapeXml(customData.projectTitle)}
  </text>

  <!-- Creator Name -->
  <text x="400" y="360" font-family="Helvetica Neue, sans-serif" font-size="28" fill="#e879f9" text-anchor="middle">
    by ${this.escapeXml(customData.creatorName)}
  </text>

  ${customData.genre ? `
  <text x="400" y="410" font-family="Helvetica Neue, sans-serif" font-size="16" fill="#c4b5fd" text-anchor="middle" letter-spacing="3">
    ${this.escapeXml(customData.genre.toUpperCase())}
  </text>
  ` : ""}

  <!-- Description -->
  <foreignObject x="150" y="450" width="500" height="150">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Georgia, serif; font-size: 16px; color: #e2e8f0; text-align: center; font-style: italic; line-height: 1.6;">
      "${this.escapeXml(customData.description)}"
    </div>
  </foreignObject>

  ${customData.releaseDate ? `
  <!-- Release Date -->
  <text x="400" y="640" font-family="Helvetica Neue, sans-serif" font-size="14" fill="#94a3b8" text-anchor="middle">
    Released: ${this.escapeXml(customData.releaseDate)}
  </text>
  ` : ""}

  <!-- Backer Section -->
  <rect x="50" y="750" width="700" height="130" rx="15" fill="#000000" opacity="0.6"/>
  <rect x="50" y="750" width="700" height="130" rx="15" fill="none" stroke="url(#creativeGradient)" stroke-width="2"/>

  <text x="400" y="790" font-family="Helvetica Neue, sans-serif" font-size="12" fill="#94a3b8" text-anchor="middle" letter-spacing="2">
    SUPPORTED BY
  </text>
  <text x="400" y="830" font-family="Helvetica Neue, sans-serif" font-size="28" fill="#ffffff" text-anchor="middle" font-weight="bold">
    ${this.escapeXml(data.backerName)}
  </text>
  <text x="400" y="865" font-family="Helvetica Neue, sans-serif" font-size="16" fill="#e879f9" text-anchor="middle">
    ${this.formatAmount(data.contributionAmount)} ETH Contribution
  </text>

  <!-- Footer -->
  <text x="400" y="920" font-family="Helvetica Neue, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">
    Campaign: ${this.escapeXml(data.campaignName)}
  </text>
  <text x="400" y="945" font-family="Helvetica Neue, sans-serif" font-size="10" fill="#475569" text-anchor="middle">
    Pledge ID: ${this.truncateId(data.pledgeId)} • Pledge Protocol • Soulbound NFT
  </text>

  <!-- Protocol Badge -->
  <g transform="translate(700, 50)">
    <circle cx="0" cy="0" r="35" fill="#000000" opacity="0.8"/>
    <text x="0" y="-5" font-family="Arial, sans-serif" font-size="8" fill="#ffffff" text-anchor="middle">PLEDGE</text>
    <text x="0" y="8" font-family="Arial, sans-serif" font-size="8" fill="#ffffff" text-anchor="middle">PROTOCOL</text>
    <text x="0" y="20" font-family="Arial, sans-serif" font-size="7" fill="#e879f9" text-anchor="middle">VERIFIED</text>
  </g>
</svg>`;
  }

  /**
   * Generic Template - Clean card with key details
   */
  private generateGenericTemplate(data: CommemorativeData): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#4f46e5"/>
      <stop offset="100%" style="stop-color:#7c3aed"/>
    </linearGradient>
    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#1e293b"/>
      <stop offset="100%" style="stop-color:#0f172a"/>
    </linearGradient>
    <filter id="cardShadow">
      <feDropShadow dx="0" dy="10" stdDeviation="20" flood-color="#000000" flood-opacity="0.5"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="100%" height="100%" fill="#020617"/>

  <!-- Subtle Grid Pattern -->
  <g opacity="0.05">
    ${this.generateGridPattern()}
  </g>

  <!-- Main Card -->
  <rect x="50" y="50" width="700" height="900" rx="20" fill="url(#cardGrad)" filter="url(#cardShadow)"/>
  <rect x="50" y="50" width="700" height="900" rx="20" fill="none" stroke="#334155" stroke-width="1"/>

  <!-- Header -->
  <rect x="50" y="50" width="700" height="150" rx="20" fill="url(#headerGrad)"/>
  <rect x="50" y="150" width="700" height="50" fill="url(#headerGrad)"/>

  <!-- Protocol Logo/Title -->
  <text x="400" y="110" font-family="Inter, sans-serif" font-size="16" fill="#c7d2fe" text-anchor="middle" letter-spacing="4">
    PLEDGE PROTOCOL
  </text>
  <text x="400" y="160" font-family="Inter, sans-serif" font-size="28" fill="#ffffff" text-anchor="middle" font-weight="bold">
    COMMEMORATIVE TOKEN
  </text>

  <!-- Campaign Name -->
  <text x="400" y="270" font-family="Inter, sans-serif" font-size="24" fill="${this.textColor}" text-anchor="middle" font-weight="600">
    ${this.escapeXml(data.campaignName)}
  </text>
  <line x1="200" y1="295" x2="600" y2="295" stroke="${this.brandColor}" stroke-width="2"/>

  <!-- Subject -->
  <text x="400" y="350" font-family="Inter, sans-serif" font-size="14" fill="#64748b" text-anchor="middle">
    SUBJECT
  </text>
  <text x="400" y="385" font-family="Inter, sans-serif" font-size="22" fill="${this.accentColor}" text-anchor="middle" font-weight="600">
    ${this.escapeXml(data.subjectName)}
  </text>

  <!-- Outcome Summary -->
  <rect x="100" y="420" width="600" height="120" rx="10" fill="#0f172a"/>
  <text x="400" y="455" font-family="Inter, sans-serif" font-size="12" fill="#64748b" text-anchor="middle" letter-spacing="2">
    OUTCOME
  </text>
  <foreignObject x="120" y="470" width="560" height="60">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Inter, sans-serif; font-size: 16px; color: #e2e8f0; text-align: center; line-height: 1.5;">
      ${this.escapeXml(data.outcomeSummary)}
    </div>
  </foreignObject>

  <!-- Stats Row -->
  <g transform="translate(0, 560)">
    <!-- Contribution -->
    <rect x="100" y="0" width="180" height="100" rx="10" fill="#1e293b"/>
    <text x="190" y="35" font-family="Inter, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">CONTRIBUTION</text>
    <text x="190" y="70" font-family="Inter, sans-serif" font-size="24" fill="${this.textColor}" text-anchor="middle" font-weight="bold">
      ${this.formatAmount(data.contributionAmount)}
    </text>
    <text x="190" y="90" font-family="Inter, sans-serif" font-size="12" fill="#64748b" text-anchor="middle">ETH</text>

    <!-- Total Raised -->
    <rect x="310" y="0" width="180" height="100" rx="10" fill="#1e293b"/>
    <text x="400" y="35" font-family="Inter, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">TOTAL RAISED</text>
    <text x="400" y="70" font-family="Inter, sans-serif" font-size="24" fill="${this.textColor}" text-anchor="middle" font-weight="bold">
      ${this.formatAmount(data.totalCampaignRaised)}
    </text>
    <text x="400" y="90" font-family="Inter, sans-serif" font-size="12" fill="#64748b" text-anchor="middle">ETH</text>

    <!-- Resolved Date -->
    <rect x="520" y="0" width="180" height="100" rx="10" fill="#1e293b"/>
    <text x="610" y="35" font-family="Inter, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">RESOLVED</text>
    <text x="610" y="70" font-family="Inter, sans-serif" font-size="18" fill="${this.textColor}" text-anchor="middle" font-weight="bold">
      ${this.formatDate(data.resolvedAt)}
    </text>
  </g>

  <!-- Backer Section -->
  <rect x="100" y="700" width="600" height="120" rx="15" fill="#0f172a" stroke="${this.brandColor}" stroke-width="1"/>
  <text x="400" y="740" font-family="Inter, sans-serif" font-size="12" fill="#64748b" text-anchor="middle" letter-spacing="2">
    BACKED BY
  </text>
  <text x="400" y="780" font-family="Inter, sans-serif" font-size="28" fill="${this.textColor}" text-anchor="middle" font-weight="bold">
    ${this.escapeXml(data.backerName)}
  </text>
  <text x="400" y="810" font-family="monospace" font-size="11" fill="#64748b" text-anchor="middle">
    ${this.truncateAddress(data.backerAddress)}
  </text>

  <!-- Footer -->
  <text x="400" y="870" font-family="Inter, sans-serif" font-size="11" fill="#475569" text-anchor="middle">
    Beneficiary: ${this.escapeXml(data.beneficiaryName)}
  </text>
  <text x="400" y="900" font-family="monospace" font-size="10" fill="#334155" text-anchor="middle">
    Pledge ID: ${this.truncateId(data.pledgeId)}
  </text>
  <text x="400" y="930" font-family="Inter, sans-serif" font-size="10" fill="#334155" text-anchor="middle">
    Verified on Ethereum • Soulbound NFT • Permanent on Arweave
  </text>
</svg>`;
  }

  /**
   * Helper: Generate running figure pattern for race template
   */
  private generateRunningPattern(): string {
    let pattern = "";
    for (let i = 0; i < 10; i++) {
      const x = (i * 100) % this.width;
      const y = Math.floor(i / 8) * 150 + 200;
      pattern += `<text x="${x}" y="${y}" font-size="60" fill="#ffffff">🏃</text>`;
    }
    return pattern;
  }

  /**
   * Helper: Generate creative geometric pattern
   */
  private generateCreativePattern(): string {
    let pattern = "";
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * this.width;
      const y = Math.random() * this.height;
      const size = 20 + Math.random() * 80;
      const shapes = ["circle", "rect", "polygon"];
      const shape = shapes[i % 3];

      if (shape === "circle") {
        pattern += `<circle cx="${x}" cy="${y}" r="${size / 2}" fill="none" stroke="#ffffff" stroke-width="1"/>`;
      } else if (shape === "rect") {
        pattern += `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="none" stroke="#ffffff" stroke-width="1" transform="rotate(45 ${x + size / 2} ${y + size / 2})"/>`;
      } else {
        pattern += `<polygon points="${x},${y - size / 2} ${x + size / 2},${y + size / 2} ${x - size / 2},${y + size / 2}" fill="none" stroke="#ffffff" stroke-width="1"/>`;
      }
    }
    return pattern;
  }

  /**
   * Helper: Generate grid pattern for generic template
   */
  private generateGridPattern(): string {
    let pattern = "";
    for (let x = 0; x < this.width; x += 40) {
      pattern += `<line x1="${x}" y1="0" x2="${x}" y2="${this.height}" stroke="#ffffff" stroke-width="1"/>`;
    }
    for (let y = 0; y < this.height; y += 40) {
      pattern += `<line x1="0" y1="${y}" x2="${this.width}" y2="${y}" stroke="#ffffff" stroke-width="1"/>`;
    }
    return pattern;
  }

  /**
   * Helper: Escape XML special characters
   */
  private escapeXml(text: string): string {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /**
   * Helper: Format ETH amount
   */
  private formatAmount(amount: string): string {
    const num = parseFloat(amount);
    if (isNaN(num)) return "0.00";
    return num.toFixed(4);
  }

  /**
   * Helper: Format timestamp to date string
   */
  private formatDate(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  /**
   * Helper: Truncate pledge ID for display
   */
  private truncateId(id: string): string {
    if (!id || id.length <= 16) return id;
    return `${id.substring(0, 8)}...${id.substring(id.length - 6)}`;
  }

  /**
   * Helper: Truncate Ethereum address for display
   */
  private truncateAddress(address: string): string {
    if (!address || address.length <= 12) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  }

  /**
   * Get available template types
   */
  getTemplateTypes(): TemplateType[] {
    return ["race_finish", "academic", "creative", "generic"];
  }

  /**
   * Validate template data
   */
  validateTemplateData(data: CommemorativeData): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.pledgeId) errors.push("pledgeId is required");
    if (!data.campaignId) errors.push("campaignId is required");
    if (!data.campaignName) errors.push("campaignName is required");
    if (!data.backerAddress) errors.push("backerAddress is required");
    if (!data.contributionAmount) errors.push("contributionAmount is required");

    if (data.templateType === "race_finish") {
      const raceData = data as RaceFinishData;
      if (!raceData.customData?.raceName) errors.push("raceName is required for race_finish template");
      if (!raceData.customData?.finishTime) errors.push("finishTime is required for race_finish template");
      if (!raceData.customData?.bibNumber) errors.push("bibNumber is required for race_finish template");
    }

    if (data.templateType === "academic") {
      const academicData = data as AcademicData;
      if (!academicData.customData?.institutionName) errors.push("institutionName is required for academic template");
      if (!academicData.customData?.degreeName) errors.push("degreeName is required for academic template");
      if (!academicData.customData?.studentName) errors.push("studentName is required for academic template");
    }

    if (data.templateType === "creative") {
      const creativeData = data as CreativeData;
      if (!creativeData.customData?.projectTitle) errors.push("projectTitle is required for creative template");
      if (!creativeData.customData?.creatorName) errors.push("creatorName is required for creative template");
    }

    return { valid: errors.length === 0, errors };
  }
}

export const imageGenerator = new ImageGenerator();
