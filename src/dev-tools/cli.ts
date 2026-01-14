/**
 * Phase 9: Developer CLI
 *
 * Command-line interface for Pledge Protocol development.
 */

import {
  CliConfig,
  CliCommand,
  CliOption,
  TestFixtures,
  TestAccount,
  TestCampaign,
  SimulationConfig,
  SimulationResult,
  SimulationStep,
} from "./types";
import { randomUUID } from "crypto";

// ============================================================================
// CLI IMPLEMENTATION
// ============================================================================

export class PledgeCli {
  private config: CliConfig;
  private commands: Map<string, CliCommand> = new Map();

  constructor(config: Partial<CliConfig> = {}) {
    this.config = {
      apiUrl: config.apiUrl || "http://localhost:3000",
      chainId: config.chainId || 31337,
      apiKey: config.apiKey,
      sessionId: config.sessionId,
      verbose: config.verbose || false,
      outputFormat: config.outputFormat || "json",
    };

    this.registerCommands();
  }

  private registerCommands(): void {
    // Campaign commands
    this.commands.set("create-campaign", {
      name: "create-campaign",
      description: "Create a new campaign",
      aliases: ["cc"],
      options: [
        {
          name: "name",
          alias: "n",
          description: "Campaign name",
          type: "string",
          required: true,
        },
        {
          name: "beneficiary",
          alias: "b",
          description: "Beneficiary address",
          type: "string",
          required: true,
        },
        {
          name: "goal",
          alias: "g",
          description: "Funding goal in wei",
          type: "string",
          required: true,
        },
        {
          name: "deadline",
          alias: "d",
          description: "Deadline timestamp",
          type: "number",
          required: true,
        },
        {
          name: "template",
          alias: "t",
          description: "Template to use",
          type: "string",
          default: "basic",
        },
        {
          name: "chain",
          description: "Chain ID to deploy to",
          type: "number",
          default: 31337,
        },
      ],
      action: this.createCampaign.bind(this),
    });

    this.commands.set("list-campaigns", {
      name: "list-campaigns",
      description: "List all campaigns",
      aliases: ["lc"],
      options: [
        {
          name: "status",
          alias: "s",
          description: "Filter by status",
          type: "string",
        },
        {
          name: "creator",
          alias: "c",
          description: "Filter by creator",
          type: "string",
        },
        {
          name: "limit",
          alias: "l",
          description: "Limit results",
          type: "number",
          default: 10,
        },
      ],
      action: this.listCampaigns.bind(this),
    });

    this.commands.set("get-campaign", {
      name: "get-campaign",
      description: "Get campaign details",
      aliases: ["gc"],
      options: [
        {
          name: "id",
          description: "Campaign ID",
          type: "string",
          required: true,
        },
      ],
      action: this.getCampaign.bind(this),
    });

    // Pledge commands
    this.commands.set("create-pledge", {
      name: "create-pledge",
      description: "Create a new pledge",
      aliases: ["cp"],
      options: [
        {
          name: "campaign",
          alias: "c",
          description: "Campaign ID",
          type: "string",
          required: true,
        },
        {
          name: "amount",
          alias: "a",
          description: "Pledge amount in wei",
          type: "string",
          required: true,
        },
        {
          name: "type",
          alias: "t",
          description: "Pledge type (flat, per_unit, tiered, conditional)",
          type: "string",
          default: "flat",
        },
      ],
      action: this.createPledge.bind(this),
    });

    // Sandbox commands
    this.commands.set("sandbox", {
      name: "sandbox",
      description: "Manage local sandbox environment",
      aliases: ["sb"],
      options: [
        {
          name: "action",
          alias: "a",
          description: "Action (start, stop, status, reset)",
          type: "string",
          required: true,
        },
        {
          name: "port",
          alias: "p",
          description: "Port for sandbox",
          type: "number",
          default: 8545,
        },
        {
          name: "seed",
          description: "Seed with test data",
          type: "boolean",
          default: true,
        },
      ],
      action: this.sandboxAction.bind(this),
    });

    // Simulation commands
    this.commands.set("simulate", {
      name: "simulate",
      description: "Simulate campaign lifecycle",
      aliases: ["sim"],
      options: [
        {
          name: "campaign",
          alias: "c",
          description: "Campaign ID or config file",
          type: "string",
          required: true,
        },
        {
          name: "scenario",
          alias: "s",
          description: "Scenario (success, partial, failure)",
          type: "string",
          default: "success",
        },
      ],
      action: this.simulate.bind(this),
    });

    // Test data commands
    this.commands.set("generate-fixtures", {
      name: "generate-fixtures",
      description: "Generate test fixtures",
      aliases: ["gf"],
      options: [
        {
          name: "output",
          alias: "o",
          description: "Output file",
          type: "string",
          default: "./test-fixtures.json",
        },
        {
          name: "count",
          alias: "c",
          description: "Number of each entity",
          type: "number",
          default: 5,
        },
      ],
      action: this.generateFixtures.bind(this),
    });

    // Config commands
    this.commands.set("config", {
      name: "config",
      description: "Manage CLI configuration",
      options: [
        {
          name: "action",
          alias: "a",
          description: "Action (show, set, reset)",
          type: "string",
          required: true,
        },
        {
          name: "key",
          alias: "k",
          description: "Config key",
          type: "string",
        },
        {
          name: "value",
          alias: "v",
          description: "Config value",
          type: "string",
        },
      ],
      action: this.configAction.bind(this),
    });
  }

  // ==========================================================================
  // COMMAND IMPLEMENTATIONS
  // ==========================================================================

  private async createCampaign(
    args: Record<string, any>,
    config: CliConfig
  ): Promise<void> {
    const campaign = {
      id: `campaign_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      name: args.name,
      beneficiary: args.beneficiary,
      goal: args.goal,
      deadline: args.deadline,
      template: args.template,
      chainId: args.chain || config.chainId,
      status: "draft",
      createdAt: Date.now(),
    };

    this.output(campaign, config);
    this.log(`Campaign created: ${campaign.id}`, config);
  }

  private async listCampaigns(
    args: Record<string, any>,
    config: CliConfig
  ): Promise<void> {
    // In production: call API
    const campaigns = [
      {
        id: "campaign_001",
        name: "Test Campaign 1",
        status: "active",
        pledged: "1000000000000000000",
      },
      {
        id: "campaign_002",
        name: "Test Campaign 2",
        status: "draft",
        pledged: "0",
      },
    ];

    this.output(campaigns.slice(0, args.limit), config);
  }

  private async getCampaign(
    args: Record<string, any>,
    config: CliConfig
  ): Promise<void> {
    const campaign = {
      id: args.id,
      name: "Sample Campaign",
      beneficiary: "0x1234567890123456789012345678901234567890",
      goal: "10000000000000000000",
      pledged: "5000000000000000000",
      status: "active",
      milestones: [
        { name: "Milestone 1", verified: true, releasePercent: 50 },
        { name: "Milestone 2", verified: false, releasePercent: 50 },
      ],
    };

    this.output(campaign, config);
  }

  private async createPledge(
    args: Record<string, any>,
    config: CliConfig
  ): Promise<void> {
    const pledge = {
      id: `pledge_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      campaignId: args.campaign,
      amount: args.amount,
      type: args.type,
      status: "active",
      createdAt: Date.now(),
    };

    this.output(pledge, config);
    this.log(`Pledge created: ${pledge.id}`, config);
  }

  private async sandboxAction(
    args: Record<string, any>,
    config: CliConfig
  ): Promise<void> {
    const action = args.action;

    switch (action) {
      case "start":
        this.log(`Starting sandbox on port ${args.port}...`, config);
        this.output(
          {
            status: "running",
            port: args.port,
            chainId: config.chainId,
            rpcUrl: `http://localhost:${args.port}`,
            accounts: this.generateTestAccounts(10),
          },
          config
        );
        break;

      case "stop":
        this.log("Stopping sandbox...", config);
        this.output({ status: "stopped" }, config);
        break;

      case "status":
        this.output(
          {
            status: "running",
            port: args.port,
            blockNumber: 100,
            accounts: 10,
          },
          config
        );
        break;

      case "reset":
        this.log("Resetting sandbox...", config);
        this.output({ status: "reset", blockNumber: 0 }, config);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  private async simulate(
    args: Record<string, any>,
    config: CliConfig
  ): Promise<void> {
    const scenario = args.scenario;
    const startTime = Date.now();
    const steps: SimulationStep[] = [];

    // Simulate campaign creation
    steps.push({
      step: 1,
      action: "create_campaign",
      description: "Creating campaign",
      success: true,
      result: { campaignId: args.campaign },
      timestamp: Date.now(),
    });

    // Simulate pledges
    steps.push({
      step: 2,
      action: "create_pledges",
      description: "Creating pledges",
      success: true,
      result: { count: 5, total: "5000000000000000000" },
      timestamp: Date.now(),
    });

    // Simulate oracle verification
    const oracleSuccess = scenario !== "failure";
    steps.push({
      step: 3,
      action: "oracle_verification",
      description: "Verifying milestones via oracle",
      success: oracleSuccess,
      result: oracleSuccess
        ? { verified: true, data: { completed: true } }
        : undefined,
      error: !oracleSuccess ? "Oracle verification failed" : undefined,
      timestamp: Date.now(),
    });

    // Simulate resolution
    const resolutionSuccess = scenario === "success";
    steps.push({
      step: 4,
      action: "resolution",
      description: "Resolving campaign",
      success: resolutionSuccess,
      result: resolutionSuccess
        ? { status: "resolved", released: "5000000000000000000" }
        : { status: "partial", released: "2500000000000000000" },
      timestamp: Date.now(),
    });

    const result: SimulationResult = {
      success: resolutionSuccess,
      steps,
      finalState: {
        campaignStatus: resolutionSuccess ? "resolved" : "partial",
        totalPledged: "5000000000000000000",
        totalReleased: resolutionSuccess
          ? "5000000000000000000"
          : "2500000000000000000",
        pledgeStatuses: {
          pledge_001: resolutionSuccess ? "released" : "partial",
          pledge_002: resolutionSuccess ? "released" : "partial",
        },
      },
      errors: resolutionSuccess ? [] : ["Oracle verification failed"],
      gasUsed: "500000",
      executionTimeMs: Date.now() - startTime,
    };

    this.output(result, config);
  }

  private async generateFixtures(
    args: Record<string, any>,
    config: CliConfig
  ): Promise<void> {
    const count = args.count;
    const fixtures: TestFixtures = {
      accounts: this.generateTestAccounts(count * 2),
      campaigns: this.generateTestCampaigns(count),
      pledges: this.generateTestPledges(count * 3),
      oracles: this.generateTestOracles(count),
    };

    this.output(fixtures, config);
    this.log(`Generated fixtures: ${args.output}`, config);
  }

  private async configAction(
    args: Record<string, any>,
    config: CliConfig
  ): Promise<void> {
    const action = args.action;

    switch (action) {
      case "show":
        this.output(this.config, config);
        break;

      case "set":
        if (args.key && args.value !== undefined) {
          (this.config as any)[args.key] = args.value;
          this.output({ [args.key]: args.value }, config);
        }
        break;

      case "reset":
        this.config = {
          apiUrl: "http://localhost:3000",
          chainId: 31337,
          verbose: false,
          outputFormat: "json",
        };
        this.output(this.config, config);
        break;
    }
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private generateTestAccounts(count: number): TestAccount[] {
    const accounts: TestAccount[] = [];
    const roles: TestAccount["role"][] = [
      "creator",
      "backer",
      "beneficiary",
      "oracle",
    ];

    for (let i = 0; i < count; i++) {
      const privateKey = `0x${i.toString(16).padStart(64, "0")}`;
      accounts.push({
        name: `Account ${i + 1}`,
        address: `0x${(i + 1).toString(16).padStart(40, "0")}`,
        privateKey,
        role: roles[i % roles.length],
      });
    }

    return accounts;
  }

  private generateTestCampaigns(count: number): TestCampaign[] {
    const campaigns: TestCampaign[] = [];
    const templates = [
      "charity-race",
      "creative-project",
      "academic-achievement",
    ];

    for (let i = 0; i < count; i++) {
      campaigns.push({
        id: `campaign_${(i + 1).toString().padStart(3, "0")}`,
        template: templates[i % templates.length],
        name: `Test Campaign ${i + 1}`,
        description: `Description for test campaign ${i + 1}`,
        creator: `0x${(i + 1).toString(16).padStart(40, "0")}`,
        beneficiary: `0x${(i + 2).toString(16).padStart(40, "0")}`,
        goal: `${(i + 1) * 10}000000000000000000`,
        deadline: Date.now() + (i + 1) * 7 * 24 * 60 * 60 * 1000,
        milestones: [
          {
            name: "Milestone 1",
            oracleType: "api",
            oracleQuery: { url: "https://api.example.com" },
            releasePercent: 50,
          },
          {
            name: "Milestone 2",
            oracleType: "api",
            oracleQuery: { url: "https://api.example.com" },
            releasePercent: 50,
          },
        ],
      });
    }

    return campaigns;
  }

  private generateTestPledges(count: number): any[] {
    const pledges = [];
    const types = ["flat", "per_unit", "tiered", "conditional"];

    for (let i = 0; i < count; i++) {
      pledges.push({
        campaignId: `campaign_${((i % 5) + 1).toString().padStart(3, "0")}`,
        backer: `0x${(i + 10).toString(16).padStart(40, "0")}`,
        amount: `${(i + 1)}000000000000000000`,
        calculationType: types[i % types.length],
      });
    }

    return pledges;
  }

  private generateTestOracles(count: number): any[] {
    const oracles = [];
    const types = ["race_timing", "github", "strava", "academic"];

    for (let i = 0; i < count; i++) {
      oracles.push({
        id: `oracle_${(i + 1).toString().padStart(3, "0")}`,
        type: types[i % types.length],
        mockResponse: {
          success: true,
          data: {
            verified: true,
            value: (i + 1) * 100,
          },
        },
      });
    }

    return oracles;
  }

  // ==========================================================================
  // OUTPUT METHODS
  // ==========================================================================

  private output(data: any, config: CliConfig): void {
    switch (config.outputFormat) {
      case "json":
        console.log(JSON.stringify(data, null, 2));
        break;
      case "yaml":
        console.log(this.toYaml(data));
        break;
      case "table":
        console.table(Array.isArray(data) ? data : [data]);
        break;
    }
  }

  private toYaml(data: any, indent: number = 0): string {
    const spaces = "  ".repeat(indent);
    let result = "";

    if (Array.isArray(data)) {
      for (const item of data) {
        result += `${spaces}- ${this.toYaml(item, indent + 1).trim()}\n`;
      }
    } else if (typeof data === "object" && data !== null) {
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === "object" && value !== null) {
          result += `${spaces}${key}:\n${this.toYaml(value, indent + 1)}`;
        } else {
          result += `${spaces}${key}: ${value}\n`;
        }
      }
    } else {
      result = String(data);
    }

    return result;
  }

  private log(message: string, config: CliConfig): void {
    if (config.verbose) {
      console.log(`[pledge-cli] ${message}`);
    }
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  async run(argv: string[]): Promise<void> {
    const [commandName, ...args] = argv;

    // Find command (including aliases)
    let command = this.commands.get(commandName);
    if (!command) {
      for (const cmd of this.commands.values()) {
        if (cmd.aliases?.includes(commandName)) {
          command = cmd;
          break;
        }
      }
    }

    if (!command) {
      console.log("Usage: pledge-cli <command> [options]\n");
      console.log("Commands:");
      for (const cmd of this.commands.values()) {
        const aliases = cmd.aliases ? ` (${cmd.aliases.join(", ")})` : "";
        console.log(`  ${cmd.name}${aliases} - ${cmd.description}`);
      }
      return;
    }

    // Parse arguments
    const parsedArgs = this.parseArgs(args, command.options);

    // Check required options
    for (const opt of command.options) {
      if (opt.required && parsedArgs[opt.name] === undefined) {
        throw new Error(`Missing required option: --${opt.name}`);
      }
    }

    // Run command
    await command.action(parsedArgs, this.config);
  }

  private parseArgs(
    args: string[],
    options: CliOption[]
  ): Record<string, any> {
    const result: Record<string, any> = {};

    // Set defaults
    for (const opt of options) {
      if (opt.default !== undefined) {
        result[opt.name] = opt.default;
      }
    }

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg.startsWith("--")) {
        const name = arg.slice(2);
        const opt = options.find((o) => o.name === name);
        if (opt) {
          if (opt.type === "boolean") {
            result[name] = true;
          } else {
            result[name] = this.parseValue(args[++i], opt.type);
          }
        }
      } else if (arg.startsWith("-")) {
        const alias = arg.slice(1);
        const opt = options.find((o) => o.alias === alias);
        if (opt) {
          if (opt.type === "boolean") {
            result[opt.name] = true;
          } else {
            result[opt.name] = this.parseValue(args[++i], opt.type);
          }
        }
      }
    }

    return result;
  }

  private parseValue(value: string, type: string): any {
    switch (type) {
      case "number":
        return parseInt(value, 10);
      case "boolean":
        return value === "true";
      case "array":
        return value.split(",");
      default:
        return value;
    }
  }

  getCommands(): CliCommand[] {
    return Array.from(this.commands.values());
  }

  getConfig(): CliConfig {
    return { ...this.config };
  }

  setConfig(updates: Partial<CliConfig>): void {
    Object.assign(this.config, updates);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function createCli(config?: Partial<CliConfig>): PledgeCli {
  return new PledgeCli(config);
}
