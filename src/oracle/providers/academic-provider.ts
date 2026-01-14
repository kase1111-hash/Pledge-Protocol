import { ApiOracleProvider } from "./api-provider";
import { OracleConfig, OracleResponse, AcademicResult } from "../types";

/**
 * Academic Verification Result Extended Interface
 */
export interface AcademicVerificationResult extends AcademicResult {
  studentId: string;
  institutionName: string;
  institutionVerified: boolean;
  programName?: string;
  enrollmentStatus: "full-time" | "part-time" | "graduated" | "withdrawn" | "unknown";
  enrollmentStartDate?: string;
  expectedGraduationDate?: string;
  verificationDate: string;
  verificationSource: string;
}

/**
 * Degree Verification Interface
 */
export interface DegreeVerification {
  degreeType: string;
  major: string;
  minor?: string;
  honors?: string;
  conferralDate: string;
  verified: boolean;
}

/**
 * Academic Verification Oracle Provider
 * Integrates with academic verification services (National Student Clearinghouse, etc.)
 * Verifies enrollment, graduation, GPA, and degree conferral
 */
export class AcademicProvider extends ApiOracleProvider {
  // Known academic verification services
  private static readonly KNOWN_PROVIDERS: Record<string, Partial<OracleConfig>> = {
    nsc: {
      // National Student Clearinghouse
      endpoint: "https://api.studentclearinghouse.org/v1/verify",
      queryMapping: {
        studentId: "student_id",
        firstName: "first_name",
        lastName: "last_name",
        dateOfBirth: "dob",
        ssn: "ssn_last_four",
        institutionCode: "school_code",
      },
      responseMapping: {
        enrolled: "enrollment_status.is_enrolled",
        creditsCompleted: "academic_record.credits_earned",
        gpa: "academic_record.cumulative_gpa",
        graduationDate: "degree_record.graduation_date",
        degreeConferred: "degree_record.degree_title",
        institutionName: "institution.name",
        enrollmentStatus: "enrollment_status.status_code",
        programName: "academic_record.program_name",
      },
    },
    degreeverify: {
      // Generic degree verification service
      endpoint: "https://api.degreeverify.edu/verify",
      queryMapping: {
        studentId: "student_identifier",
        institutionId: "institution_id",
      },
      responseMapping: {
        enrolled: "is_enrolled",
        creditsCompleted: "credits_completed",
        gpa: "gpa",
        graduationDate: "graduation_date",
        degreeConferred: "degree_awarded",
        institutionName: "institution_name",
      },
    },
  };

  private providerType: string;

  constructor(config: OracleConfig, providerType: string = "nsc") {
    // Merge with known provider config if specified
    if (AcademicProvider.KNOWN_PROVIDERS[providerType]) {
      config = {
        ...config,
        ...AcademicProvider.KNOWN_PROVIDERS[providerType],
      };
    }

    super(config);
    this.providerType = providerType;
  }

  /**
   * Verify student enrollment status
   */
  async verifyEnrollment(
    studentId: string,
    institutionCode?: string,
    additionalParams?: Record<string, any>
  ): Promise<OracleResponse> {
    return this.query({
      studentId,
      institutionCode,
      verificationType: "enrollment",
      ...additionalParams,
    });
  }

  /**
   * Verify degree conferral
   */
  async verifyDegree(
    studentId: string,
    institutionCode?: string,
    additionalParams?: Record<string, any>
  ): Promise<OracleResponse> {
    return this.query({
      studentId,
      institutionCode,
      verificationType: "degree",
      ...additionalParams,
    });
  }

  /**
   * Get academic transcript summary
   */
  async getAcademicSummary(
    studentId: string,
    institutionCode?: string
  ): Promise<OracleResponse> {
    return this.query({
      studentId,
      institutionCode,
      verificationType: "transcript_summary",
    });
  }

  /**
   * Parse response into AcademicVerificationResult
   */
  parseVerificationResult(response: OracleResponse): AcademicVerificationResult | null {
    if (!response.success || !response.data) {
      return null;
    }

    const data = response.data;

    return {
      studentId: data.studentId || "",
      enrolled: Boolean(data.enrolled),
      creditsCompleted: data.creditsCompleted,
      gpa: data.gpa,
      graduationDate: data.graduationDate,
      degreeConferred: data.degreeConferred,
      institutionName: data.institutionName || "",
      institutionVerified: Boolean(data.institutionVerified ?? true),
      programName: data.programName,
      enrollmentStatus: this.normalizeEnrollmentStatus(data.enrollmentStatus),
      enrollmentStartDate: data.enrollmentStartDate,
      expectedGraduationDate: data.expectedGraduationDate,
      verificationDate: new Date().toISOString(),
      verificationSource: this.config.name,
    };
  }

  /**
   * Normalize enrollment status from different providers
   */
  private normalizeEnrollmentStatus(
    status: string | undefined
  ): "full-time" | "part-time" | "graduated" | "withdrawn" | "unknown" {
    if (!status) return "unknown";

    const normalized = status.toLowerCase();

    if (normalized.includes("full") || normalized === "f") return "full-time";
    if (normalized.includes("part") || normalized === "p" || normalized === "h") return "part-time";
    if (normalized.includes("grad") || normalized === "g") return "graduated";
    if (normalized.includes("withdraw") || normalized === "w") return "withdrawn";

    return "unknown";
  }

  /**
   * Check if student is currently enrolled
   */
  isEnrolled(result: AcademicVerificationResult): boolean {
    return (
      result.enrolled &&
      (result.enrollmentStatus === "full-time" || result.enrollmentStatus === "part-time")
    );
  }

  /**
   * Check if student has graduated
   */
  hasGraduated(result: AcademicVerificationResult): boolean {
    return (
      result.enrollmentStatus === "graduated" ||
      (result.degreeConferred !== undefined && result.degreeConferred !== null)
    );
  }

  /**
   * Check if student meets GPA requirement
   */
  meetsGpaRequirement(result: AcademicVerificationResult, minimumGpa: number): boolean {
    return result.gpa !== undefined && result.gpa >= minimumGpa;
  }

  /**
   * Check if student has completed minimum credits
   */
  hasCompletedCredits(result: AcademicVerificationResult, minimumCredits: number): boolean {
    return result.creditsCompleted !== undefined && result.creditsCompleted >= minimumCredits;
  }

  /**
   * Parse degree information from response
   */
  parseDegreeVerification(response: OracleResponse): DegreeVerification | null {
    if (!response.success || !response.data) {
      return null;
    }

    const data = response.data;

    if (!data.degreeConferred) {
      return null;
    }

    return {
      degreeType: data.degreeType || this.extractDegreeType(data.degreeConferred),
      major: data.major || data.programName || "Unknown",
      minor: data.minor,
      honors: data.honors,
      conferralDate: data.graduationDate || "",
      verified: true,
    };
  }

  /**
   * Extract degree type from degree title
   */
  private extractDegreeType(degreeTitle: string): string {
    const title = degreeTitle.toLowerCase();

    if (title.includes("doctor") || title.includes("ph.d") || title.includes("phd")) {
      return "Doctorate";
    }
    if (title.includes("master") || title.includes("m.s") || title.includes("m.a") || title.includes("mba")) {
      return "Master's";
    }
    if (title.includes("bachelor") || title.includes("b.s") || title.includes("b.a")) {
      return "Bachelor's";
    }
    if (title.includes("associate") || title.includes("a.s") || title.includes("a.a")) {
      return "Associate's";
    }
    if (title.includes("certificate") || title.includes("cert")) {
      return "Certificate";
    }

    return "Unknown";
  }

  /**
   * Format GPA for display
   */
  static formatGpa(gpa: number): string {
    return gpa.toFixed(2);
  }

  /**
   * Create a pre-configured provider for a known academic verification service
   */
  static createForProvider(
    providerType: keyof typeof AcademicProvider.KNOWN_PROVIDERS,
    apiKey?: string
  ): AcademicProvider {
    const baseConfig = AcademicProvider.KNOWN_PROVIDERS[providerType];

    if (!baseConfig) {
      throw new Error(`Unknown academic verification provider: ${providerType}`);
    }

    const config: OracleConfig = {
      id: `academic-${providerType}`,
      name: `${providerType.toUpperCase()} Academic Verification`,
      description: `Academic verification via ${providerType}`,
      type: "api",
      trustLevel: "official",
      active: true,
      timeout: 30000, // Academic APIs can be slow
      retries: 3,
      ...baseConfig,
      headers: apiKey
        ? { Authorization: `Bearer ${apiKey}`, ...baseConfig.headers }
        : baseConfig.headers,
    };

    return new AcademicProvider(config, providerType);
  }

  /**
   * Create a manual attestation academic provider
   * For institutions without API integration
   */
  static createManualProvider(): AcademicProvider {
    const config: OracleConfig = {
      id: "academic-manual",
      name: "Manual Academic Verification",
      description: "Manual academic verification via attestation",
      type: "attestation",
      trustLevel: "verified",
      active: true,
      endpoint: "", // No endpoint for manual
    };

    return new AcademicProvider(config, "manual");
  }
}
