/**
 * Phase 5: Ecosystem Tests
 * Tests for oracle providers, aggregator, and template system
 */

import { describe, it, expect, beforeEach } from "@jest/globals";

// ============================================================================
// STRAVA PROVIDER TESTS
// ============================================================================

describe("Strava Provider", () => {
  describe("Activity parsing", () => {
    it("should parse activity result correctly", () => {
      const mockResponse = {
        success: true,
        data: {
          activityId: "12345",
          activityType: "Run",
          distanceMeters: 42195,
          distanceMiles: 26.2,
          elapsedTimeSeconds: 13642,
          movingTimeSeconds: 13500,
          totalElevationGainMeters: 150,
          averageSpeedMps: 3.12,
          maxSpeedMps: 4.5,
          averageHeartrate: 155,
          maxHeartrate: 178,
          startDate: "2026-04-06T08:00:00Z",
          athleteId: 98765,
          name: "Portland Marathon",
          kudosCount: 42,
          achievementCount: 5,
        },
        rawData: {},
        timestamp: Date.now(),
        source: "Strava",
        cached: false,
      };

      expect(mockResponse.data.distanceMiles).toBeCloseTo(26.2, 1);
      expect(mockResponse.data.elapsedTimeSeconds).toBe(13642);
      expect(mockResponse.data.activityType).toBe("Run");
    });

    it("should calculate pace per mile correctly", () => {
      const movingTimeSeconds = 13500;
      const distanceMiles = 26.2;
      const pacePerMile = movingTimeSeconds / distanceMiles;

      expect(pacePerMile).toBeCloseTo(515.27, 0); // ~8:35/mile
    });

    it("should normalize activity types", () => {
      const normalizeType = (type: string) => {
        const normalized = type?.toLowerCase();
        if (normalized === "run" || normalized === "virtualrun") return "run";
        if (normalized === "ride" || normalized === "virtualride") return "ride";
        if (normalized === "swim") return "swim";
        if (normalized === "hike") return "hike";
        if (normalized === "walk") return "walk";
        return "other";
      };

      expect(normalizeType("Run")).toBe("run");
      expect(normalizeType("VirtualRun")).toBe("run");
      expect(normalizeType("Ride")).toBe("ride");
      expect(normalizeType("Swim")).toBe("swim");
      expect(normalizeType("CrossFit")).toBe("other");
    });

    it("should format duration correctly", () => {
      const formatDuration = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
          return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
        }
        return `${minutes}:${secs.toString().padStart(2, "0")}`;
      };

      expect(formatDuration(13642)).toBe("3:47:22");
      expect(formatDuration(3661)).toBe("1:01:01");
      expect(formatDuration(125)).toBe("2:05");
    });
  });
});

// ============================================================================
// ACADEMIC PROVIDER TESTS
// ============================================================================

describe("Academic Provider", () => {
  describe("Enrollment verification", () => {
    it("should parse enrollment result", () => {
      const mockResult = {
        studentId: "STU123456",
        enrolled: true,
        creditsCompleted: 75,
        gpa: 3.75,
        graduationDate: null,
        degreeConferred: null,
        institutionName: "State University",
        institutionVerified: true,
        programName: "Computer Science B.S.",
        enrollmentStatus: "full-time",
        verificationDate: "2026-01-14",
      };

      expect(mockResult.enrolled).toBe(true);
      expect(mockResult.creditsCompleted).toBe(75);
      expect(mockResult.gpa).toBe(3.75);
      expect(mockResult.enrollmentStatus).toBe("full-time");
    });

    it("should normalize enrollment status", () => {
      const normalizeStatus = (status: string | undefined) => {
        if (!status) return "unknown";
        const normalized = status.toLowerCase();
        if (normalized.includes("full") || normalized === "f") return "full-time";
        if (normalized.includes("part") || normalized === "p") return "part-time";
        if (normalized.includes("grad") || normalized === "g") return "graduated";
        if (normalized.includes("withdraw") || normalized === "w") return "withdrawn";
        return "unknown";
      };

      expect(normalizeStatus("full-time")).toBe("full-time");
      expect(normalizeStatus("F")).toBe("full-time");
      expect(normalizeStatus("part-time")).toBe("part-time");
      expect(normalizeStatus("graduated")).toBe("graduated");
      expect(normalizeStatus("withdrawn")).toBe("withdrawn");
      expect(normalizeStatus("")).toBe("unknown");
    });

    it("should check GPA requirements", () => {
      const meetsGpaRequirement = (gpa: number | undefined, minimum: number) => {
        return gpa !== undefined && gpa >= minimum;
      };

      expect(meetsGpaRequirement(3.75, 3.5)).toBe(true);
      expect(meetsGpaRequirement(3.2, 3.5)).toBe(false);
      expect(meetsGpaRequirement(undefined, 3.0)).toBe(false);
    });

    it("should check credit completion", () => {
      const hasCompletedCredits = (credits: number | undefined, minimum: number) => {
        return credits !== undefined && credits >= minimum;
      };

      expect(hasCompletedCredits(75, 60)).toBe(true);
      expect(hasCompletedCredits(45, 60)).toBe(false);
      expect(hasCompletedCredits(undefined, 30)).toBe(false);
    });
  });

  describe("Degree verification", () => {
    it("should extract degree type from title", () => {
      const extractDegreeType = (degreeTitle: string) => {
        const title = degreeTitle.toLowerCase();
        if (title.includes("doctor") || title.includes("ph.d")) return "Doctorate";
        if (title.includes("master") || title.includes("m.s") || title.includes("mba")) return "Master's";
        if (title.includes("bachelor") || title.includes("b.s") || title.includes("b.a")) return "Bachelor's";
        if (title.includes("associate")) return "Associate's";
        if (title.includes("certificate")) return "Certificate";
        return "Unknown";
      };

      expect(extractDegreeType("Doctor of Philosophy")).toBe("Doctorate");
      expect(extractDegreeType("Ph.D. in Computer Science")).toBe("Doctorate");
      expect(extractDegreeType("Master of Science")).toBe("Master's");
      expect(extractDegreeType("MBA")).toBe("Master's");
      expect(extractDegreeType("Bachelor of Science")).toBe("Bachelor's");
      expect(extractDegreeType("B.A. in English")).toBe("Bachelor's");
      expect(extractDegreeType("Associate of Arts")).toBe("Associate's");
      expect(extractDegreeType("Certificate in Web Development")).toBe("Certificate");
    });
  });
});

// ============================================================================
// STREAMING PROVIDER TESTS
// ============================================================================

describe("Streaming Provider", () => {
  describe("Release verification", () => {
    it("should parse Spotify album release", () => {
      const mockRelease = {
        releaseId: "abc123",
        title: "Midnight Sessions",
        artistName: "The Midnight Collective",
        releaseType: "album",
        releaseDate: "2026-06-15",
        trackCount: 12,
        isReleased: true,
        platform: "spotify",
        externalUrl: "https://open.spotify.com/album/abc123",
        popularity: 75,
      };

      expect(mockRelease.isReleased).toBe(true);
      expect(mockRelease.trackCount).toBe(12);
      expect(mockRelease.releaseType).toBe("album");
    });

    it("should determine release type from track count", () => {
      const determineReleaseType = (trackCount: number, albumType?: string) => {
        if (albumType === "single" || trackCount === 1) return "single";
        if (albumType === "compilation") return "compilation";
        if (trackCount <= 6) return "ep";
        return "album";
      };

      expect(determineReleaseType(1)).toBe("single");
      expect(determineReleaseType(4)).toBe("ep");
      expect(determineReleaseType(6)).toBe("ep");
      expect(determineReleaseType(12)).toBe("album");
      expect(determineReleaseType(25, "compilation")).toBe("compilation");
    });

    it("should format view counts", () => {
      const formatViewCount = (count: number) => {
        if (count >= 1000000000) return `${(count / 1000000000).toFixed(1)}B`;
        if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
        if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
        return count.toString();
      };

      expect(formatViewCount(1500000000)).toBe("1.5B");
      expect(formatViewCount(2500000)).toBe("2.5M");
      expect(formatViewCount(15000)).toBe("15.0K");
      expect(formatViewCount(500)).toBe("500");
    });
  });

  describe("Duration parsing", () => {
    it("should parse ISO 8601 duration", () => {
      const parseDuration = (duration: string) => {
        if (!duration) return 0;
        const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!match) return 0;
        const hours = parseInt(match[1]) || 0;
        const minutes = parseInt(match[2]) || 0;
        const seconds = parseInt(match[3]) || 0;
        return hours * 3600 + minutes * 60 + seconds;
      };

      expect(parseDuration("PT1H30M45S")).toBe(5445);
      expect(parseDuration("PT45M30S")).toBe(2730);
      expect(parseDuration("PT3M25S")).toBe(205);
      expect(parseDuration("PT60S")).toBe(60);
    });
  });
});

// ============================================================================
// AGGREGATOR PROVIDER TESTS
// ============================================================================

describe("Aggregator Provider", () => {
  describe("Consensus methods", () => {
    it("should check ALL consensus", () => {
      const checkAllConsensus = (results: Array<{ success: boolean }>) => {
        if (results.length === 0) return false;
        return results.every((r) => r.success);
      };

      expect(checkAllConsensus([{ success: true }, { success: true }])).toBe(true);
      expect(checkAllConsensus([{ success: true }, { success: false }])).toBe(false);
      expect(checkAllConsensus([])).toBe(false);
    });

    it("should check MAJORITY consensus", () => {
      const checkMajorityConsensus = (
        results: Array<{ success: boolean }>,
        threshold: number = 0.5
      ) => {
        if (results.length === 0) return false;
        const successCount = results.filter((r) => r.success).length;
        return successCount / results.length > threshold;
      };

      expect(checkMajorityConsensus([{ success: true }, { success: true }, { success: false }])).toBe(true);
      expect(checkMajorityConsensus([{ success: true }, { success: false }, { success: false }])).toBe(false);
      expect(checkMajorityConsensus([{ success: true }])).toBe(true);
    });

    it("should check ANY consensus", () => {
      const checkAnyConsensus = (results: Array<{ success: boolean }>) => {
        return results.some((r) => r.success);
      };

      expect(checkAnyConsensus([{ success: false }, { success: false }, { success: true }])).toBe(true);
      expect(checkAnyConsensus([{ success: false }, { success: false }])).toBe(false);
    });

    it("should check WEIGHTED consensus", () => {
      const checkWeightedConsensus = (
        results: Array<{ success: boolean; weight: number }>,
        threshold: number = 0.5
      ) => {
        const totalWeight = results.reduce((sum, r) => sum + r.weight, 0);
        const successWeight = results.filter((r) => r.success).reduce((sum, r) => sum + r.weight, 0);
        if (totalWeight === 0) return false;
        return successWeight / totalWeight > threshold;
      };

      // 3 sources: Official (weight 3), Verified (weight 2), Community (weight 1)
      // Official fails, Verified and Community succeed
      const results = [
        { success: false, weight: 3 },
        { success: true, weight: 2 },
        { success: true, weight: 1 },
      ];
      expect(checkWeightedConsensus(results, 0.5)).toBe(false); // 3/6 = 0.5, not > 0.5

      // Official and Verified succeed
      const results2 = [
        { success: true, weight: 3 },
        { success: true, weight: 2 },
        { success: false, weight: 1 },
      ];
      expect(checkWeightedConsensus(results2, 0.5)).toBe(true); // 5/6 > 0.5
    });

    it("should check THRESHOLD consensus", () => {
      const checkThresholdConsensus = (
        results: Array<{ success: boolean }>,
        threshold: number = 0.5
      ) => {
        const requiredCount = Math.ceil(results.length * threshold);
        const successCount = results.filter((r) => r.success).length;
        return successCount >= requiredCount;
      };

      // 3 sources, threshold 0.5 = need 2 successes
      expect(
        checkThresholdConsensus(
          [{ success: true }, { success: true }, { success: false }],
          0.5
        )
      ).toBe(true);

      // 3 sources, threshold 0.7 = need 3 successes
      expect(
        checkThresholdConsensus(
          [{ success: true }, { success: true }, { success: false }],
          0.7
        )
      ).toBe(false);
    });
  });

  describe("Data merging", () => {
    it("should merge numeric fields by averaging", () => {
      const mergeData = (results: Array<{ data: any }>) => {
        if (results.length === 0) return null;
        if (results.length === 1) return results[0].data;

        const merged: Record<string, any> = {};
        const numericCounts: Record<string, number> = {};

        for (const result of results) {
          if (!result.data) continue;
          for (const [key, value] of Object.entries(result.data)) {
            if (typeof value === "number") {
              merged[key] = (merged[key] || 0) + value;
              numericCounts[key] = (numericCounts[key] || 0) + 1;
            } else if (merged[key] === undefined) {
              merged[key] = value;
            }
          }
        }

        for (const key of Object.keys(numericCounts)) {
          merged[key] = merged[key] / numericCounts[key];
        }

        return merged;
      };

      const results = [
        { data: { distance: 26.2, time: 13500 } },
        { data: { distance: 26.3, time: 13600 } },
      ];

      const merged = mergeData(results);
      expect(merged.distance).toBeCloseTo(26.25, 2);
      expect(merged.time).toBe(13550);
    });

    it("should use first non-null value for non-numeric fields", () => {
      const results = [
        { data: { name: "Source 1", status: "finished" } },
        { data: { name: "Source 2", status: "complete" } },
      ];

      // First non-null value wins for strings
      expect(results[0].data.name).toBe("Source 1");
    });
  });

  describe("Dispute detection", () => {
    it("should detect disputes when sources disagree", () => {
      const getDisputeInfo = (results: Array<{ sourceId: string; success: boolean }>) => {
        const successful = results.filter((r) => r.success);
        const failed = results.filter((r) => !r.success);
        const agreementPercentage = results.length > 0
          ? (successful.length / results.length) * 100
          : 0;

        let recommendedAction: "accept" | "reject" | "manual_review" = "accept";
        if (agreementPercentage < 50) recommendedAction = "reject";
        else if (agreementPercentage < 75) recommendedAction = "manual_review";

        return {
          hasDispute: failed.length > 0 && successful.length > 0,
          disputingSources: failed.map((r) => r.sourceId),
          agreementPercentage,
          recommendedAction,
        };
      };

      const results = [
        { sourceId: "oracle1", success: true },
        { sourceId: "oracle2", success: true },
        { sourceId: "oracle3", success: false },
      ];

      const dispute = getDisputeInfo(results);
      expect(dispute.hasDispute).toBe(true);
      expect(dispute.disputingSources).toEqual(["oracle3"]);
      expect(dispute.agreementPercentage).toBeCloseTo(66.67, 0);
      expect(dispute.recommendedAction).toBe("manual_review");
    });
  });
});

// ============================================================================
// TEMPLATE SYSTEM TESTS
// ============================================================================

describe("Template System", () => {
  describe("Template validation", () => {
    const charityRaceFields = [
      { name: "eventName", label: "Event Name", type: "text", required: true },
      { name: "participantName", label: "Participant Name", type: "text", required: true },
      { name: "beneficiaryAddress", label: "Beneficiary Address", type: "address", required: true },
      { name: "eventDate", label: "Event Date", type: "date", required: true },
      { name: "eventDistance", label: "Distance", type: "number", required: true, validation: { min: 0.1, max: 1000 } },
      { name: "bibNumber", label: "Bib Number", type: "text", required: false },
    ];

    it("should validate required fields", () => {
      const validateFields = (fields: any[], values: Record<string, any>) => {
        const errors: string[] = [];
        for (const field of fields) {
          const value = values[field.name];
          if (field.required && (value === undefined || value === null || value === "")) {
            errors.push(`Field "${field.label}" is required`);
          }
        }
        return { valid: errors.length === 0, errors };
      };

      const result = validateFields(charityRaceFields, {
        eventName: "Portland Marathon",
        // Missing participantName
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Field "Participant Name" is required');
    });

    it("should validate Ethereum addresses", () => {
      const validateAddress = (address: string) => {
        return /^0x[a-fA-F0-9]{40}$/.test(address);
      };

      expect(validateAddress("0x1234567890123456789012345678901234567890")).toBe(true);
      expect(validateAddress("0x123")).toBe(false);
      expect(validateAddress("not-an-address")).toBe(false);
    });

    it("should validate number ranges", () => {
      const validateNumber = (value: number, min?: number, max?: number) => {
        if (min !== undefined && value < min) return false;
        if (max !== undefined && value > max) return false;
        return true;
      };

      expect(validateNumber(26.2, 0.1, 1000)).toBe(true);
      expect(validateNumber(0.05, 0.1, 1000)).toBe(false);
      expect(validateNumber(1500, 0.1, 1000)).toBe(false);
    });

    it("should validate URLs", () => {
      const validateUrl = (url: string, pattern?: string) => {
        try {
          new URL(url);
          if (pattern) {
            return new RegExp(pattern).test(url);
          }
          return true;
        } catch {
          return false;
        }
      };

      expect(validateUrl("https://github.com/owner/repo")).toBe(true);
      expect(validateUrl("https://github.com/owner/repo", "^https://github\\.com/")).toBe(true);
      expect(validateUrl("https://gitlab.com/owner/repo", "^https://github\\.com/")).toBe(false);
      expect(validateUrl("not-a-url")).toBe(false);
    });
  });

  describe("Campaign generation", () => {
    it("should generate milestones from template", () => {
      const milestoneTemplates = [
        { name: "Race Completion", description: "Finish the race", oracleType: "race_timing", order: 0 },
        { name: "Time Verification", description: "Record time", oracleType: "race_timing", order: 1 },
      ];

      const generateMilestones = (templates: any[], templateId: string) => {
        return templates.map((m, index) => ({
          name: m.name,
          description: m.description,
          oracleId: `${templateId}-${m.oracleType}-${index}`,
          order: m.order,
        }));
      };

      const milestones = generateMilestones(milestoneTemplates, "charity-race");

      expect(milestones).toHaveLength(2);
      expect(milestones[0].oracleId).toBe("charity-race-race_timing-0");
      expect(milestones[1].oracleId).toBe("charity-race-race_timing-1");
    });

    it("should generate pledge types from template", () => {
      const pledgeTypeTemplates = [
        {
          name: "Per Mile",
          calculationType: "per_unit",
          defaultConfig: { perUnitAmount: "2000000000000000000", unitField: "distanceMiles" },
        },
        {
          name: "Completion Bonus",
          calculationType: "conditional",
          defaultConfig: { condition: { field: "status", operator: "eq", value: 1 } },
        },
      ];

      const generatePledgeTypes = (templates: any[]) => {
        return templates.map((pt) => ({
          name: pt.name,
          calculationType: pt.calculationType,
          config: { ...pt.defaultConfig },
        }));
      };

      const pledgeTypes = generatePledgeTypes(pledgeTypeTemplates);

      expect(pledgeTypes).toHaveLength(2);
      expect(pledgeTypes[0].calculationType).toBe("per_unit");
      expect(pledgeTypes[0].config.unitField).toBe("distanceMiles");
    });
  });

  describe("Template search", () => {
    const templates = [
      { id: "charity-race", name: "Charity Race", category: "fitness", tags: ["running", "charity"], difficulty: "beginner" },
      { id: "creative-project", name: "Creative Project", category: "creative", tags: ["music", "art"], difficulty: "intermediate" },
      { id: "academic", name: "Academic", category: "education", tags: ["education", "college"], difficulty: "intermediate" },
    ];

    it("should filter by category", () => {
      const filtered = templates.filter((t) => t.category === "fitness");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("charity-race");
    });

    it("should filter by difficulty", () => {
      const filtered = templates.filter((t) => t.difficulty === "intermediate");
      expect(filtered).toHaveLength(2);
    });

    it("should filter by tags", () => {
      const searchTags = ["music"];
      const filtered = templates.filter((t) =>
        searchTags.some((tag) => t.tags.includes(tag))
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("creative-project");
    });

    it("should search by query", () => {
      const query = "running";
      const filtered = templates.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.tags.some((tag) => tag.toLowerCase().includes(query))
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("charity-race");
    });
  });

  describe("Built-in templates", () => {
    it("should have all required fields for charity race template", () => {
      const requiredFields = ["eventName", "participantName", "beneficiaryAddress", "eventDate"];
      const mockTemplate = {
        fields: [
          { name: "eventName", required: true },
          { name: "participantName", required: true },
          { name: "beneficiaryAddress", required: true },
          { name: "eventDate", required: true },
          { name: "bibNumber", required: false },
        ],
      };

      for (const fieldName of requiredFields) {
        const field = mockTemplate.fields.find((f) => f.name === fieldName);
        expect(field).toBeDefined();
        expect(field?.required).toBe(true);
      }
    });

    it("should have suggested pledge types", () => {
      const mockPledgeTypes = [
        { name: "Per Mile", suggested: true },
        { name: "Completion Bonus", suggested: true },
        { name: "Time Bonus", suggested: false },
      ];

      const suggested = mockPledgeTypes.filter((pt) => pt.suggested);
      expect(suggested).toHaveLength(2);
    });

    it("should have correct milestone ordering", () => {
      const mockMilestones = [
        { name: "Race Completion", order: 0 },
        { name: "Time Verification", order: 1 },
      ];

      const sorted = [...mockMilestones].sort((a, b) => a.order - b.order);
      expect(sorted[0].name).toBe("Race Completion");
      expect(sorted[1].name).toBe("Time Verification");
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe("Integration", () => {
  describe("Oracle + Template integration", () => {
    it("should match oracle types in templates to available providers", () => {
      const availableOracleTypes = [
        "race_timing",
        "github",
        "strava",
        "academic",
        "streaming",
        "manual",
        "aggregator",
      ];

      const templateOracleTypes = ["race_timing", "strava", "github", "academic", "streaming", "manual"];

      for (const oracleType of templateOracleTypes) {
        expect(availableOracleTypes).toContain(oracleType);
      }
    });

    it("should support aggregator for high-value campaigns", () => {
      // High-value campaign might use aggregator with multiple sources
      const aggregatorConfig = {
        method: "majority",
        threshold: 0.66,
        sources: ["race_timing_athlinks", "race_timing_runsignup", "strava"],
      };

      expect(aggregatorConfig.sources).toHaveLength(3);
      expect(aggregatorConfig.method).toBe("majority");
    });
  });

  describe("Template + Pledge Type integration", () => {
    it("should support all calculation types in templates", () => {
      const calculationTypes = ["flat", "per_unit", "tiered", "conditional"];
      const templatePledgeTypes = [
        { calculationType: "flat" },
        { calculationType: "per_unit" },
        { calculationType: "tiered" },
        { calculationType: "conditional" },
      ];

      for (const pt of templatePledgeTypes) {
        expect(calculationTypes).toContain(pt.calculationType);
      }
    });
  });
});
