/**
 * Builds discovery index entries from stored campaigns and pledges.
 *
 * The search index is a read model: it is rebuilt from the store when it is
 * older than a few seconds or when the API has handled a write since the
 * last build, so every instance sees the same campaigns. Only public
 * campaigns are indexed; analytics for a creator's own campaigns are built
 * with indexEntriesFor() directly.
 */

import { allCampaigns, allPledges, Campaign, getStore, Oracle, Pledge } from "../database";
import {
  CampaignCategory,
  CampaignIndexEntry,
  SearchService,
  searchService,
} from "./search-service";

const DAY_MS = 24 * 3600 * 1000;
const MAX_AGE_MS = 5000;

const CATEGORY_HINTS: Array<[RegExp, CampaignCategory]> = [
  [/strava|garmin|race|marathon|run|fitness/i, "fitness"],
  [/github|gitlab|open.?source/i, "opensource"],
  [/school|course|education|academic|university/i, "education"],
  [/stream|twitch|youtube|art|music|creative/i, "creative"],
  [/research|study|paper/i, "research"],
];

function categoryOf(campaign: Campaign, oracleTypes: string[]): CampaignCategory {
  const text = [
    campaign.subject?.verificationSource,
    ...campaign.milestones.map((m) => m.oracleId),
    ...oracleTypes,
  ]
    .filter(Boolean)
    .join(" ");
  return CATEGORY_HINTS.find(([pattern]) => pattern.test(text))?.[1] ?? "other";
}

/**
 * Index entries for the given campaigns, with metrics from their pledges
 */
export function buildIndexEntries(
  campaigns: Campaign[],
  pledges: Pledge[],
  oracles: Oracle[],
  now = Date.now()
): CampaignIndexEntry[] {
  const oracleTypes = new Map(oracles.map((o) => [o.id, o.type]));
  const pledgesByCampaign = new Map<string, Pledge[]>();
  for (const pledge of pledges) {
    const list = pledgesByCampaign.get(pledge.campaignId) ?? [];
    list.push(pledge);
    pledgesByCampaign.set(pledge.campaignId, list);
  }

  return campaigns.map((campaign) => {
    const counted = (pledgesByCampaign.get(campaign.id) ?? []).filter((p) => p.status !== "cancelled");
    let totalPledged = 0n;
    let pledgedLastDay = 0n;
    for (const pledge of counted) {
      totalPledged += BigInt(pledge.escrowedAmount);
      if (pledge.createdAt * 1000 > now - DAY_MS) pledgedLastDay += BigInt(pledge.escrowedAmount);
    }

    const types = Array.from(
      new Set(campaign.milestones.map((m) => oracleTypes.get(m.oracleId)).filter((t): t is Oracle["type"] => !!t))
    );

    return {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      category: categoryOf(campaign, types),
      status: campaign.status,
      creatorAddress: campaign.creator,
      beneficiaryAddress: campaign.beneficiary,
      beneficiaryName: campaign.beneficiaryName,
      subjectName: campaign.subject?.name,
      totalPledged,
      pledgedLastDay,
      backerCount: new Set(counted.map((p) => p.backer.toLowerCase())).size,
      pledgeCount: counted.length,
      milestoneCount: campaign.milestones.length,
      completedMilestones: campaign.milestones.filter((m) => m.status === "verified").length,
      oracleTypes: types,
      createdAt: campaign.createdAt * 1000,
      deadline: campaign.pledgeWindowEnd * 1000,
      resolvedAt: campaign.resolvedAt === null ? undefined : campaign.resolvedAt * 1000,
      tags: [],
      keywords: [],
      viewCount: 0,
      shareCount: 0,
      trendingScore: 0,
    };
  });
}

/**
 * Index entries for specific campaigns (e.g. one creator's), whatever their
 * visibility
 */
export async function indexEntriesFor(campaigns: Campaign[]): Promise<CampaignIndexEntry[]> {
  const store = getStore();
  const [pledges, oracles] = await Promise.all([
    Promise.all(campaigns.map((c) => store.listPledges({ campaignId: c.id }))).then((pages) =>
      pages.flatMap((p) => p.items)
    ),
    store.listOracles(),
  ]);
  return buildIndexEntries(campaigns, pledges, oracles).sort((a, b) => b.createdAt - a.createdAt);
}

let builtAt = 0;
let stale = true;
let building: Promise<void> | null = null;

/**
 * Mark the index out of date, e.g. after a write
 */
export function invalidateSearchIndex(): void {
  stale = true;
}

/**
 * Rebuild the index from the store, keeping index-only engagement data
 * (views, shares, featured flags)
 */
export async function rebuildSearchIndex(service: SearchService = searchService): Promise<void> {
  stale = false;
  const [campaigns, pledges, oracles] = await Promise.all([
    allCampaigns(),
    allPledges(),
    getStore().listOracles(),
  ]);
  const entries = buildIndexEntries(
    campaigns.filter((c) => c.visibility === "public" && c.status !== "draft"),
    pledges,
    oracles
  );
  service.replaceAll(entries);
  builtAt = Date.now();
}

/**
 * Make sure the index reflects the store before reading it
 */
export async function ensureSearchIndexFresh(service: SearchService = searchService): Promise<void> {
  if (!stale && Date.now() - builtAt < MAX_AGE_MS) return;
  if (!building) {
    building = rebuildSearchIndex(service).finally(() => {
      building = null;
    });
  }
  await building;
}
