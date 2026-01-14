/**
 * Built-in Campaign Templates
 * Phase 5: Ecosystem - Pre-built templates for common use cases
 */

import { CampaignTemplate } from "./types";

/**
 * Charity Race / Fitness Event Template
 */
export const charityRaceTemplate: CampaignTemplate = {
  id: "charity-race",
  name: "Charity Race / Fitness Event",
  description:
    "Perfect for marathon fundraising, charity runs, bike rides, or any fitness challenge. Backers pledge per mile, per lap, or for completion.",
  category: "fitness",
  version: "1.0.0",

  fields: [
    {
      name: "eventName",
      label: "Event Name",
      type: "text",
      required: true,
      placeholder: "Portland Marathon 2026",
      mapTo: "campaignName",
    },
    {
      name: "participantName",
      label: "Participant Name",
      type: "text",
      required: true,
      placeholder: "Sarah Chen",
      mapTo: "subjectName",
    },
    {
      name: "beneficiaryName",
      label: "Beneficiary / Charity",
      type: "text",
      required: true,
      placeholder: "Portland Habitat for Humanity",
      mapTo: "beneficiaryName",
    },
    {
      name: "beneficiaryAddress",
      label: "Beneficiary Wallet Address",
      type: "address",
      required: true,
      mapTo: "beneficiaryAddress",
    },
    {
      name: "eventDate",
      label: "Event Date",
      type: "date",
      required: true,
      mapTo: "resolutionDeadline",
    },
    {
      name: "eventDistance",
      label: "Event Distance (miles)",
      type: "number",
      required: true,
      placeholder: "26.2",
      validation: { min: 0.1, max: 1000 },
    },
    {
      name: "bibNumber",
      label: "Bib Number",
      type: "text",
      required: false,
      placeholder: "4471",
      helpText: "Official race bib number for result verification",
    },
    {
      name: "timingProvider",
      label: "Timing Provider",
      type: "select",
      required: true,
      options: [
        { value: "athlinks", label: "Athlinks" },
        { value: "runsignup", label: "RunSignUp" },
        { value: "chronotrack", label: "ChronoTrack" },
        { value: "strava", label: "Strava" },
        { value: "manual", label: "Manual Verification" },
      ],
    },
  ],

  milestones: [
    {
      name: "Race Completion",
      description: "Participant finishes the race",
      oracleType: "race_timing",
      defaultCondition: {
        type: "completion",
        field: "status",
        operator: "eq",
        defaultValue: "finished",
      },
      required: true,
      order: 0,
    },
    {
      name: "Time Verification",
      description: "Official finish time recorded",
      oracleType: "race_timing",
      defaultCondition: {
        type: "threshold",
        field: "timeSeconds",
        operator: "exists",
      },
      required: false,
      order: 1,
    },
  ],

  pledgeTypes: [
    {
      name: "Per Mile",
      description: "Pledge a fixed amount for each mile completed",
      calculationType: "per_unit",
      defaultConfig: {
        perUnitAmount: "2000000000000000000", // 2 in wei
        unitField: "distanceMiles",
        minimum: "0",
      },
      suggested: true,
    },
    {
      name: "Completion Bonus",
      description: "Fixed amount if participant finishes",
      calculationType: "conditional",
      defaultConfig: {
        condition: {
          field: "status",
          operator: "eq",
          value: 1, // finished
        },
        minimum: "10000000000000000000", // 10 in wei
      },
      suggested: true,
    },
    {
      name: "Time Bonus",
      description: "Extra bonus if finished under target time",
      calculationType: "conditional",
      defaultConfig: {
        condition: {
          field: "timeSeconds",
          operator: "lt",
          value: 14400, // 4 hours
        },
        minimum: "25000000000000000000", // 25 in wei
      },
      suggested: false,
    },
    {
      name: "Tiered Sponsor",
      description: "Increasing rate per mile at distance thresholds",
      calculationType: "tiered",
      defaultConfig: {
        unitField: "distanceMiles",
        tiers: [
          { threshold: 0, rate: "1000000000000000000" }, // $1/mile for first 10
          { threshold: 10, rate: "2000000000000000000" }, // $2/mile for 10-20
          { threshold: 20, rate: "3000000000000000000" }, // $3/mile for 20+
        ],
        minimum: "0",
      },
      suggested: false,
    },
  ],

  oracles: [
    {
      oracleType: "race_timing",
      providerType: "athlinks",
      name: "Athlinks Race Timing",
      description: "Official race timing via Athlinks",
      requiredParams: ["eventId", "bibNumber"],
      optionalParams: [],
    },
    {
      oracleType: "strava",
      name: "Strava Activity",
      description: "Activity verification via Strava",
      requiredParams: ["activityId"],
      optionalParams: ["athleteId"],
    },
  ],

  commemorative: {
    templateType: "race_finish",
    defaultFields: [
      "participantName",
      "eventName",
      "finishTime",
      "distanceMiles",
      "placementOverall",
    ],
    suggestedCustomData: {
      raceName: "eventName",
      finishTime: "formattedTime",
      bibNumber: "bibNumber",
      pace: "pacePerMile",
    },
  },

  estimatedDuration: "2-4 weeks",
  difficulty: "beginner",
  tags: ["running", "marathon", "charity", "fitness", "sports"],
  previewDescription:
    "Sponsor a runner in their race. Funds release when official results confirm completion.",
};

/**
 * Creative Project Template (Album/Book/Film)
 */
export const creativeProjectTemplate: CampaignTemplate = {
  id: "creative-project",
  name: "Creative Project",
  description:
    "Fund an album, book, film, or other creative work. Milestones track progress from concept to release.",
  category: "creative",
  version: "1.0.0",

  fields: [
    {
      name: "projectTitle",
      label: "Project Title",
      type: "text",
      required: true,
      placeholder: "Midnight Sessions (Album)",
      mapTo: "campaignName",
    },
    {
      name: "creatorName",
      label: "Creator / Artist Name",
      type: "text",
      required: true,
      placeholder: "The Midnight Collective",
      mapTo: "subjectName",
    },
    {
      name: "creatorAddress",
      label: "Creator Wallet Address",
      type: "address",
      required: true,
      mapTo: "beneficiaryAddress",
    },
    {
      name: "projectType",
      label: "Project Type",
      type: "select",
      required: true,
      options: [
        { value: "album", label: "Music Album" },
        { value: "single", label: "Single / EP" },
        { value: "book", label: "Book" },
        { value: "film", label: "Film / Documentary" },
        { value: "podcast", label: "Podcast Series" },
        { value: "art", label: "Art Collection" },
        { value: "other", label: "Other Creative Work" },
      ],
    },
    {
      name: "releaseDate",
      label: "Target Release Date",
      type: "date",
      required: true,
      mapTo: "resolutionDeadline",
    },
    {
      name: "platform",
      label: "Primary Release Platform",
      type: "select",
      required: false,
      options: [
        { value: "spotify", label: "Spotify" },
        { value: "youtube", label: "YouTube" },
        { value: "soundcloud", label: "SoundCloud" },
        { value: "amazon", label: "Amazon" },
        { value: "other", label: "Other / Self-Published" },
      ],
    },
    {
      name: "fundingGoal",
      label: "Funding Goal",
      type: "number",
      required: true,
      placeholder: "10000",
      validation: { min: 100 },
    },
  ],

  milestones: [
    {
      name: "Demo / Proof of Concept",
      description: "Initial demo, chapter, or preview released",
      oracleType: "manual",
      defaultCondition: {
        type: "completion",
        field: "demoComplete",
        operator: "eq",
        defaultValue: true,
      },
      required: false,
      order: 0,
    },
    {
      name: "Production Complete",
      description: "Full production finished, ready for release",
      oracleType: "manual",
      defaultCondition: {
        type: "completion",
        field: "productionComplete",
        operator: "eq",
        defaultValue: true,
      },
      required: true,
      order: 1,
    },
    {
      name: "Public Release",
      description: "Project publicly released on platform",
      oracleType: "streaming",
      defaultCondition: {
        type: "completion",
        field: "isReleased",
        operator: "eq",
        defaultValue: true,
      },
      required: true,
      order: 2,
    },
  ],

  pledgeTypes: [
    {
      name: "Flat Pledge",
      description: "Fixed amount released on completion",
      calculationType: "flat",
      defaultConfig: {
        baseAmount: "50000000000000000000", // 50 in wei
        minimum: "10000000000000000000", // 10 minimum
      },
      suggested: true,
    },
    {
      name: "Milestone-Based",
      description: "Partial release at each milestone",
      calculationType: "tiered",
      defaultConfig: {
        unitField: "milestonesCompleted",
        tiers: [
          { threshold: 0, rate: "0" },
          { threshold: 1, rate: "33333333333333333333" }, // 33% at demo
          { threshold: 2, rate: "33333333333333333333" }, // 33% at production
          { threshold: 3, rate: "33333333333333333334" }, // 34% at release
        ],
        minimum: "30000000000000000000",
      },
      suggested: true,
    },
    {
      name: "Success Bonus",
      description: "Extra if project reaches engagement milestone",
      calculationType: "conditional",
      defaultConfig: {
        condition: {
          field: "totalStreams",
          operator: "gt",
          value: 10000,
        },
        minimum: "100000000000000000000",
      },
      suggested: false,
    },
  ],

  oracles: [
    {
      oracleType: "streaming",
      providerType: "spotify",
      name: "Spotify Release",
      description: "Verify release on Spotify",
      requiredParams: ["albumId"],
      optionalParams: [],
    },
    {
      oracleType: "streaming",
      providerType: "youtube",
      name: "YouTube Release",
      description: "Verify release on YouTube",
      requiredParams: ["videoId"],
      optionalParams: [],
    },
    {
      oracleType: "manual",
      name: "Manual Attestation",
      description: "Manual verification by trusted party",
      requiredParams: [],
      optionalParams: ["attestorAddress"],
    },
  ],

  commemorative: {
    templateType: "creative",
    defaultFields: ["projectTitle", "creatorName", "releaseDate", "contributionAmount"],
    suggestedCustomData: {
      projectType: "projectType",
      platform: "platform",
      backerTier: "pledgeTypeName",
    },
  },

  estimatedDuration: "3-12 months",
  difficulty: "intermediate",
  tags: ["music", "album", "film", "book", "art", "creative"],
  previewDescription:
    "Back a creative project from concept to release. Funds release as milestones are met.",
};

/**
 * Academic Achievement Template
 */
export const academicTemplate: CampaignTemplate = {
  id: "academic-achievement",
  name: "Academic Achievement",
  description:
    "Support a student's educational journey. Fund enrollment, semesters, or graduation.",
  category: "education",
  version: "1.0.0",

  fields: [
    {
      name: "studentName",
      label: "Student Name",
      type: "text",
      required: true,
      placeholder: "Alex Johnson",
      mapTo: "subjectName",
    },
    {
      name: "programName",
      label: "Program / Degree",
      type: "text",
      required: true,
      placeholder: "Computer Science B.S.",
      mapTo: "campaignName",
    },
    {
      name: "institutionName",
      label: "Institution",
      type: "text",
      required: true,
      placeholder: "State University",
    },
    {
      name: "studentAddress",
      label: "Student Wallet Address",
      type: "address",
      required: true,
      mapTo: "beneficiaryAddress",
    },
    {
      name: "expectedGraduation",
      label: "Expected Graduation Date",
      type: "date",
      required: true,
      mapTo: "resolutionDeadline",
    },
    {
      name: "totalCredits",
      label: "Total Credits Required",
      type: "number",
      required: true,
      placeholder: "120",
      validation: { min: 1, max: 300 },
    },
    {
      name: "verificationMethod",
      label: "Verification Method",
      type: "select",
      required: true,
      options: [
        { value: "nsc", label: "National Student Clearinghouse" },
        { value: "manual", label: "Manual / Transcript Upload" },
      ],
    },
  ],

  milestones: [
    {
      name: "Enrollment Verified",
      description: "Student enrolled in program",
      oracleType: "academic",
      defaultCondition: {
        type: "completion",
        field: "enrolled",
        operator: "eq",
        defaultValue: true,
      },
      required: true,
      order: 0,
    },
    {
      name: "Semester Completion",
      description: "Successfully completed semester",
      oracleType: "academic",
      defaultCondition: {
        type: "threshold",
        field: "creditsCompleted",
        operator: "gte",
        defaultValue: 15,
      },
      required: false,
      order: 1,
    },
    {
      name: "Degree Conferred",
      description: "Degree officially awarded",
      oracleType: "academic",
      defaultCondition: {
        type: "completion",
        field: "degreeConferred",
        operator: "exists",
      },
      required: true,
      order: 2,
    },
  ],

  pledgeTypes: [
    {
      name: "Per Credit Hour",
      description: "Pledge per credit hour completed",
      calculationType: "per_unit",
      defaultConfig: {
        perUnitAmount: "500000000000000000", // 0.5 per credit
        unitField: "creditsCompleted",
        cap: "60000000000000000000", // 60 cap
        minimum: "0",
      },
      suggested: true,
    },
    {
      name: "Graduation Bonus",
      description: "Fixed amount on graduation",
      calculationType: "conditional",
      defaultConfig: {
        condition: {
          field: "degreeConferred",
          operator: "exists",
        },
        minimum: "100000000000000000000",
      },
      suggested: true,
    },
    {
      name: "GPA Bonus",
      description: "Bonus for achieving target GPA",
      calculationType: "conditional",
      defaultConfig: {
        condition: {
          field: "gpa",
          operator: "gte",
          value: 3.5,
        },
        minimum: "50000000000000000000",
      },
      suggested: false,
    },
    {
      name: "Semester Stipend",
      description: "Flat amount per semester enrolled",
      calculationType: "flat",
      defaultConfig: {
        baseAmount: "25000000000000000000",
        minimum: "10000000000000000000",
      },
      suggested: false,
    },
  ],

  oracles: [
    {
      oracleType: "academic",
      providerType: "nsc",
      name: "National Student Clearinghouse",
      description: "Official academic verification",
      requiredParams: ["studentId", "institutionCode"],
      optionalParams: ["ssn_last_four", "dateOfBirth"],
    },
    {
      oracleType: "manual",
      name: "Manual Transcript Verification",
      description: "Manual verification via uploaded transcript",
      requiredParams: [],
      optionalParams: ["attestorAddress"],
    },
  ],

  commemorative: {
    templateType: "academic",
    defaultFields: ["studentName", "programName", "institutionName", "graduationDate"],
    suggestedCustomData: {
      degreeType: "degreeType",
      gpa: "gpa",
      honors: "honors",
    },
  },

  estimatedDuration: "1-4 years",
  difficulty: "intermediate",
  tags: ["education", "college", "university", "scholarship", "student"],
  previewDescription:
    "Fund a student's education with milestone-verified pledges.",
};

/**
 * Open Source Development Template
 */
export const openSourceTemplate: CampaignTemplate = {
  id: "open-source-dev",
  name: "Open Source Development",
  description:
    "Fund open source features, bug fixes, or projects. Releases verified via GitHub.",
  category: "opensource",
  version: "1.0.0",

  fields: [
    {
      name: "projectName",
      label: "Project / Feature Name",
      type: "text",
      required: true,
      placeholder: "Add OAuth Support to MyLib",
      mapTo: "campaignName",
    },
    {
      name: "developerName",
      label: "Developer / Team Name",
      type: "text",
      required: true,
      placeholder: "Jane Developer",
      mapTo: "subjectName",
    },
    {
      name: "developerAddress",
      label: "Developer Wallet Address",
      type: "address",
      required: true,
      mapTo: "beneficiaryAddress",
    },
    {
      name: "repoUrl",
      label: "GitHub Repository URL",
      type: "url",
      required: true,
      placeholder: "https://github.com/owner/repo",
      validation: {
        pattern: "^https://github\\.com/[\\w-]+/[\\w-]+$",
        message: "Must be a valid GitHub repository URL",
      },
    },
    {
      name: "targetPR",
      label: "Target PR Number (if known)",
      type: "number",
      required: false,
      placeholder: "123",
    },
    {
      name: "deadline",
      label: "Target Completion Date",
      type: "date",
      required: true,
      mapTo: "resolutionDeadline",
    },
    {
      name: "issueUrl",
      label: "Related Issue URL",
      type: "url",
      required: false,
      placeholder: "https://github.com/owner/repo/issues/456",
    },
  ],

  milestones: [
    {
      name: "PR Created",
      description: "Pull request opened on GitHub",
      oracleType: "github",
      defaultCondition: {
        type: "completion",
        field: "prNumber",
        operator: "exists",
      },
      required: false,
      order: 0,
    },
    {
      name: "PR Merged",
      description: "Pull request merged to main branch",
      oracleType: "github",
      defaultCondition: {
        type: "completion",
        field: "prMerged",
        operator: "eq",
        defaultValue: true,
      },
      required: true,
      order: 1,
    },
    {
      name: "Tests Passing",
      description: "All CI tests pass",
      oracleType: "github",
      defaultCondition: {
        type: "completion",
        field: "testsPassing",
        operator: "eq",
        defaultValue: true,
      },
      required: false,
      order: 2,
    },
    {
      name: "Released",
      description: "Feature included in a release",
      oracleType: "github",
      defaultCondition: {
        type: "completion",
        field: "releaseTagged",
        operator: "eq",
        defaultValue: true,
      },
      required: false,
      order: 3,
    },
  ],

  pledgeTypes: [
    {
      name: "Merge Bounty",
      description: "Fixed amount when PR is merged",
      calculationType: "conditional",
      defaultConfig: {
        condition: {
          field: "prMerged",
          operator: "eq",
          value: 1,
        },
        minimum: "50000000000000000000",
      },
      suggested: true,
    },
    {
      name: "Per Commit",
      description: "Amount per commit in the PR",
      calculationType: "per_unit",
      defaultConfig: {
        perUnitAmount: "5000000000000000000", // 5 per commit
        unitField: "commitCount",
        cap: "100000000000000000000", // 100 cap
        minimum: "0",
      },
      suggested: false,
    },
    {
      name: "Lines of Code",
      description: "Amount per line of code added",
      calculationType: "per_unit",
      defaultConfig: {
        perUnitAmount: "100000000000000000", // 0.1 per line
        unitField: "linesAdded",
        cap: "50000000000000000000", // 50 cap
        minimum: "0",
      },
      suggested: false,
    },
    {
      name: "Milestone-Based",
      description: "Release at each development milestone",
      calculationType: "tiered",
      defaultConfig: {
        unitField: "milestonesCompleted",
        tiers: [
          { threshold: 1, rate: "25000000000000000000" }, // 25 at PR created
          { threshold: 2, rate: "50000000000000000000" }, // 50 at merged
          { threshold: 3, rate: "25000000000000000000" }, // 25 at released
        ],
        minimum: "25000000000000000000",
      },
      suggested: true,
    },
  ],

  oracles: [
    {
      oracleType: "github",
      name: "GitHub PR Verification",
      description: "Verify PR status via GitHub API",
      requiredParams: ["owner", "repo", "prNumber"],
      optionalParams: [],
    },
  ],

  commemorative: {
    templateType: "generic",
    defaultFields: ["projectName", "developerName", "mergeDate", "prNumber"],
    suggestedCustomData: {
      commitHash: "mergeCommit",
      linesAdded: "linesAdded",
      filesChanged: "filesChanged",
    },
  },

  estimatedDuration: "1 week - 3 months",
  difficulty: "intermediate",
  tags: ["opensource", "github", "development", "coding", "bounty"],
  previewDescription:
    "Fund open source development with GitHub-verified milestones.",
};

/**
 * Small Business Launch Template
 */
export const businessLaunchTemplate: CampaignTemplate = {
  id: "business-launch",
  name: "Small Business Launch",
  description:
    "Support a new business from permits to grand opening. Milestones track official progress.",
  category: "business",
  version: "1.0.0",

  fields: [
    {
      name: "businessName",
      label: "Business Name",
      type: "text",
      required: true,
      placeholder: "Main Street Coffee",
      mapTo: "campaignName",
    },
    {
      name: "ownerName",
      label: "Owner / Founder Name",
      type: "text",
      required: true,
      placeholder: "Maria Santos",
      mapTo: "subjectName",
    },
    {
      name: "ownerAddress",
      label: "Owner Wallet Address",
      type: "address",
      required: true,
      mapTo: "beneficiaryAddress",
    },
    {
      name: "businessType",
      label: "Business Type",
      type: "select",
      required: true,
      options: [
        { value: "restaurant", label: "Restaurant / Cafe" },
        { value: "retail", label: "Retail Store" },
        { value: "service", label: "Service Business" },
        { value: "manufacturing", label: "Manufacturing" },
        { value: "tech", label: "Tech Startup" },
        { value: "other", label: "Other" },
      ],
    },
    {
      name: "location",
      label: "Business Location (City, State)",
      type: "text",
      required: true,
      placeholder: "Portland, OR",
    },
    {
      name: "targetOpenDate",
      label: "Target Opening Date",
      type: "date",
      required: true,
      mapTo: "resolutionDeadline",
    },
    {
      name: "fundingGoal",
      label: "Funding Goal",
      type: "number",
      required: true,
      placeholder: "50000",
      validation: { min: 1000 },
    },
  ],

  milestones: [
    {
      name: "Business Registered",
      description: "Business entity officially registered",
      oracleType: "manual",
      defaultCondition: {
        type: "completion",
        field: "businessRegistered",
        operator: "eq",
        defaultValue: true,
      },
      required: true,
      order: 0,
    },
    {
      name: "Permits Approved",
      description: "Required permits and licenses obtained",
      oracleType: "manual",
      defaultCondition: {
        type: "completion",
        field: "permitsApproved",
        operator: "eq",
        defaultValue: true,
      },
      required: true,
      order: 1,
    },
    {
      name: "Location Secured",
      description: "Lease signed or property purchased",
      oracleType: "manual",
      defaultCondition: {
        type: "completion",
        field: "locationSecured",
        operator: "eq",
        defaultValue: true,
      },
      required: false,
      order: 2,
    },
    {
      name: "Grand Opening",
      description: "Business officially opens to the public",
      oracleType: "manual",
      defaultCondition: {
        type: "completion",
        field: "isOpen",
        operator: "eq",
        defaultValue: true,
      },
      required: true,
      order: 3,
    },
  ],

  pledgeTypes: [
    {
      name: "Founding Member",
      description: "Fixed pledge released on grand opening",
      calculationType: "conditional",
      defaultConfig: {
        condition: {
          field: "isOpen",
          operator: "eq",
          value: 1,
        },
        minimum: "100000000000000000000",
      },
      suggested: true,
    },
    {
      name: "Milestone Investor",
      description: "Partial release at each milestone",
      calculationType: "tiered",
      defaultConfig: {
        unitField: "milestonesCompleted",
        tiers: [
          { threshold: 1, rate: "25000000000000000000" }, // 25% at registration
          { threshold: 2, rate: "25000000000000000000" }, // 25% at permits
          { threshold: 3, rate: "25000000000000000000" }, // 25% at location
          { threshold: 4, rate: "25000000000000000000" }, // 25% at opening
        ],
        minimum: "50000000000000000000",
      },
      suggested: true,
    },
    {
      name: "Flat Pledge",
      description: "Fixed amount on final milestone",
      calculationType: "flat",
      defaultConfig: {
        baseAmount: "50000000000000000000",
        minimum: "25000000000000000000",
      },
      suggested: false,
    },
  ],

  oracles: [
    {
      oracleType: "manual",
      name: "Business Document Verification",
      description: "Manual verification of business documents",
      requiredParams: [],
      optionalParams: ["attestorAddress"],
    },
  ],

  commemorative: {
    templateType: "generic",
    defaultFields: ["businessName", "ownerName", "location", "openingDate"],
    suggestedCustomData: {
      businessType: "businessType",
      founderTitle: "Founding Supporter",
      memberNumber: "pledgeNumber",
    },
  },

  estimatedDuration: "3-12 months",
  difficulty: "intermediate",
  tags: ["business", "startup", "entrepreneur", "local", "founding"],
  previewDescription:
    "Support a local business launch with milestone-based funding.",
};

/**
 * Research Study Template
 */
export const researchTemplate: CampaignTemplate = {
  id: "research-study",
  name: "Research Study",
  description:
    "Fund scientific research from IRB approval through publication. Support discoveries before they happen.",
  category: "research",
  version: "1.0.0",

  fields: [
    {
      name: "studyTitle",
      label: "Study Title",
      type: "text",
      required: true,
      placeholder: "Effects of X on Y: A Randomized Controlled Trial",
      mapTo: "campaignName",
    },
    {
      name: "principalInvestigator",
      label: "Principal Investigator",
      type: "text",
      required: true,
      placeholder: "Dr. Jane Smith",
      mapTo: "subjectName",
    },
    {
      name: "institution",
      label: "Research Institution",
      type: "text",
      required: true,
      placeholder: "University Medical Center",
    },
    {
      name: "researcherAddress",
      label: "Researcher Wallet Address",
      type: "address",
      required: true,
      mapTo: "beneficiaryAddress",
    },
    {
      name: "researchField",
      label: "Research Field",
      type: "select",
      required: true,
      options: [
        { value: "medical", label: "Medical / Clinical" },
        { value: "biology", label: "Biology" },
        { value: "chemistry", label: "Chemistry" },
        { value: "physics", label: "Physics" },
        { value: "social", label: "Social Sciences" },
        { value: "computer", label: "Computer Science" },
        { value: "other", label: "Other" },
      ],
    },
    {
      name: "estimatedCompletion",
      label: "Estimated Completion Date",
      type: "date",
      required: true,
      mapTo: "resolutionDeadline",
    },
    {
      name: "fundingGoal",
      label: "Funding Goal",
      type: "number",
      required: true,
      placeholder: "25000",
      validation: { min: 1000 },
    },
  ],

  milestones: [
    {
      name: "IRB / Ethics Approval",
      description: "Institutional Review Board approval obtained",
      oracleType: "manual",
      defaultCondition: {
        type: "completion",
        field: "irbApproved",
        operator: "eq",
        defaultValue: true,
      },
      required: true,
      order: 0,
    },
    {
      name: "Data Collection Complete",
      description: "Primary data collection finished",
      oracleType: "manual",
      defaultCondition: {
        type: "completion",
        field: "dataCollected",
        operator: "eq",
        defaultValue: true,
      },
      required: true,
      order: 1,
    },
    {
      name: "Peer Review Submitted",
      description: "Manuscript submitted for peer review",
      oracleType: "manual",
      defaultCondition: {
        type: "completion",
        field: "peerReviewSubmitted",
        operator: "eq",
        defaultValue: true,
      },
      required: false,
      order: 2,
    },
    {
      name: "Publication",
      description: "Research published in peer-reviewed journal",
      oracleType: "manual",
      defaultCondition: {
        type: "completion",
        field: "isPublished",
        operator: "eq",
        defaultValue: true,
      },
      required: true,
      order: 3,
    },
  ],

  pledgeTypes: [
    {
      name: "Research Sponsor",
      description: "Fixed amount released on publication",
      calculationType: "conditional",
      defaultConfig: {
        condition: {
          field: "isPublished",
          operator: "eq",
          value: 1,
        },
        minimum: "100000000000000000000",
      },
      suggested: true,
    },
    {
      name: "Milestone Funder",
      description: "Partial release at research milestones",
      calculationType: "tiered",
      defaultConfig: {
        unitField: "milestonesCompleted",
        tiers: [
          { threshold: 1, rate: "20000000000000000000" }, // 20% at IRB
          { threshold: 2, rate: "30000000000000000000" }, // 30% at data
          { threshold: 3, rate: "20000000000000000000" }, // 20% at submission
          { threshold: 4, rate: "30000000000000000000" }, // 30% at publication
        ],
        minimum: "50000000000000000000",
      },
      suggested: true,
    },
    {
      name: "Early Supporter",
      description: "Flat pledge for research initiation",
      calculationType: "flat",
      defaultConfig: {
        baseAmount: "25000000000000000000",
        minimum: "10000000000000000000",
      },
      suggested: false,
    },
  ],

  oracles: [
    {
      oracleType: "manual",
      name: "Research Milestone Verification",
      description: "Manual verification of research milestones",
      requiredParams: [],
      optionalParams: ["attestorAddress"],
    },
  ],

  commemorative: {
    templateType: "generic",
    defaultFields: ["studyTitle", "principalInvestigator", "institution", "publicationDate"],
    suggestedCustomData: {
      researchField: "researchField",
      doi: "publicationDoi",
      journalName: "journalName",
    },
  },

  estimatedDuration: "1-3 years",
  difficulty: "advanced",
  tags: ["research", "science", "academic", "study", "publication"],
  previewDescription:
    "Support scientific research from approval to publication.",
};

/**
 * All built-in templates
 */
export const builtinTemplates: CampaignTemplate[] = [
  charityRaceTemplate,
  creativeProjectTemplate,
  academicTemplate,
  openSourceTemplate,
  businessLaunchTemplate,
  researchTemplate,
];

/**
 * Get template by ID
 */
export function getTemplateById(id: string): CampaignTemplate | undefined {
  return builtinTemplates.find((t) => t.id === id);
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: string): CampaignTemplate[] {
  return builtinTemplates.filter((t) => t.category === category);
}

/**
 * Search templates
 */
export function searchTemplates(query: string): CampaignTemplate[] {
  const lowerQuery = query.toLowerCase();
  return builtinTemplates.filter(
    (t) =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}
