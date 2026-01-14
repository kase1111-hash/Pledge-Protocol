import { ApiOracleProvider } from "./api-provider";
import { OracleConfig, OracleResponse, GitHubPRResult } from "../types";

/**
 * GitHub Oracle Provider
 * Verifies GitHub activity (PRs, commits, releases)
 */
export class GitHubProvider extends ApiOracleProvider {
  private readonly baseUrl = "https://api.github.com";

  constructor(config: OracleConfig) {
    const githubConfig: OracleConfig = {
      ...config,
      type: "api",
      endpoint: config.endpoint || "https://api.github.com",
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "PledgeProtocol",
        ...config.headers,
      },
    };

    super(githubConfig);
  }

  /**
   * Check if a PR has been merged
   */
  async checkPRMerged(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<OracleResponse> {
    const endpoint = `${this.baseUrl}/repos/${owner}/${repo}/pulls/${prNumber}`;

    try {
      const response = await fetch(endpoint, {
        headers: this.config.headers as Record<string, string>,
      });

      if (!response.ok) {
        return {
          success: false,
          data: null,
          timestamp: Date.now(),
          source: this.config.name,
          cached: false,
          error: `GitHub API error: ${response.status}`,
        };
      }

      const data = await response.json();

      const result: GitHubPRResult = {
        prMerged: data.merged === true,
        commitInMain: data.merged === true, // If merged, it's in the base branch
        testsPassing: data.mergeable_state === "clean",
        mergedAt: data.merged_at ? new Date(data.merged_at).getTime() : undefined,
        prNumber: data.number,
        repo: `${owner}/${repo}`,
      };

      return {
        success: true,
        data: result,
        rawData: data,
        timestamp: Date.now(),
        source: this.config.name,
        cached: false,
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        timestamp: Date.now(),
        source: this.config.name,
        cached: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Check if a commit exists in a branch
   */
  async checkCommitInBranch(
    owner: string,
    repo: string,
    commitSha: string,
    branch: string = "main"
  ): Promise<OracleResponse> {
    const endpoint = `${this.baseUrl}/repos/${owner}/${repo}/compare/${branch}...${commitSha}`;

    try {
      const response = await fetch(endpoint, {
        headers: this.config.headers as Record<string, string>,
      });

      if (!response.ok) {
        return {
          success: false,
          data: null,
          timestamp: Date.now(),
          source: this.config.name,
          cached: false,
          error: `GitHub API error: ${response.status}`,
        };
      }

      const data = await response.json();

      // If status is "behind" or "identical", commit is in the branch
      const inBranch = data.status === "behind" || data.status === "identical";

      return {
        success: true,
        data: {
          commitInBranch: inBranch,
          status: data.status,
          aheadBy: data.ahead_by,
          behindBy: data.behind_by,
        },
        rawData: data,
        timestamp: Date.now(),
        source: this.config.name,
        cached: false,
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        timestamp: Date.now(),
        source: this.config.name,
        cached: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Check workflow run status
   */
  async checkWorkflowRun(
    owner: string,
    repo: string,
    runId: number
  ): Promise<OracleResponse> {
    const endpoint = `${this.baseUrl}/repos/${owner}/${repo}/actions/runs/${runId}`;

    try {
      const response = await fetch(endpoint, {
        headers: this.config.headers as Record<string, string>,
      });

      if (!response.ok) {
        return {
          success: false,
          data: null,
          timestamp: Date.now(),
          source: this.config.name,
          cached: false,
          error: `GitHub API error: ${response.status}`,
        };
      }

      const data = await response.json();

      return {
        success: true,
        data: {
          status: data.status,
          conclusion: data.conclusion,
          testsPassing: data.conclusion === "success",
          runId: data.id,
          workflowName: data.name,
          headSha: data.head_sha,
        },
        rawData: data,
        timestamp: Date.now(),
        source: this.config.name,
        cached: false,
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        timestamp: Date.now(),
        source: this.config.name,
        cached: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get latest release
   */
  async getLatestRelease(
    owner: string,
    repo: string
  ): Promise<OracleResponse> {
    const endpoint = `${this.baseUrl}/repos/${owner}/${repo}/releases/latest`;

    try {
      const response = await fetch(endpoint, {
        headers: this.config.headers as Record<string, string>,
      });

      if (!response.ok) {
        return {
          success: false,
          data: null,
          timestamp: Date.now(),
          source: this.config.name,
          cached: false,
          error: `GitHub API error: ${response.status}`,
        };
      }

      const data = await response.json();

      return {
        success: true,
        data: {
          tagName: data.tag_name,
          name: data.name,
          publishedAt: new Date(data.published_at).getTime(),
          prerelease: data.prerelease,
          draft: data.draft,
          htmlUrl: data.html_url,
        },
        rawData: data,
        timestamp: Date.now(),
        source: this.config.name,
        cached: false,
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        timestamp: Date.now(),
        source: this.config.name,
        cached: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Generic query implementation
   */
  async query(params: Record<string, any>): Promise<OracleResponse> {
    const { owner, repo, prNumber, commitSha, branch, runId, action } = params;

    switch (action) {
      case "check_pr":
        return this.checkPRMerged(owner, repo, prNumber);

      case "check_commit":
        return this.checkCommitInBranch(owner, repo, commitSha, branch);

      case "check_workflow":
        return this.checkWorkflowRun(owner, repo, runId);

      case "latest_release":
        return this.getLatestRelease(owner, repo);

      default:
        return {
          success: false,
          data: null,
          timestamp: Date.now(),
          source: this.config.name,
          cached: false,
          error: `Unknown action: ${action}`,
        };
    }
  }

  /**
   * Create a GitHub provider with authentication
   */
  static create(token?: string): GitHubProvider {
    const config: OracleConfig = {
      id: "github-oracle",
      name: "GitHub Oracle",
      description: "GitHub activity verification",
      type: "api",
      trustLevel: "official",
      active: true,
      timeout: 10000,
      retries: 2,
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : {},
    };

    return new GitHubProvider(config);
  }
}
