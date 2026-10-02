/**
 * Read helpers over the store for reporting, exports and analytics: every
 * matching record, not a page.
 */

import { getStore } from "./database-service";
import { Campaign, Pledge } from "./types";

export async function campaignsCreatedBy(address: string): Promise<Campaign[]> {
  return (await getStore().listCampaigns({ creator: address })).items;
}

export async function campaignsPayingTo(address: string): Promise<Campaign[]> {
  return (await getStore().listCampaigns({ beneficiary: address })).items;
}

export async function allCampaigns(): Promise<Campaign[]> {
  return (await getStore().listCampaigns()).items;
}

export async function pledgesByBacker(address: string): Promise<Pledge[]> {
  return (await getStore().listPledges({ backer: address })).items;
}

export async function pledgesForCampaign(campaignId: string): Promise<Pledge[]> {
  return (await getStore().listPledges({ campaignId })).items;
}

/**
 * Campaigns by ID, for labelling pledges
 */
export async function campaignsById(ids: Iterable<string>): Promise<Map<string, Campaign>> {
  const unique = Array.from(new Set(ids));
  const found = await Promise.all(unique.map((id) => getStore().getCampaign(id)));
  const byId = new Map<string, Campaign>();
  found.forEach((campaign) => campaign && byId.set(campaign.id, campaign));
  return byId;
}

export async function allPledges(): Promise<Pledge[]> {
  return (await getStore().listPledges()).items;
}
