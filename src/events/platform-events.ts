/**
 * Platform events: campaign, pledge, milestone and dispute changes are
 * published to users' webhooks, in-app notifications and integrations
 * (Slack, Discord, ...).
 *
 * Publishing never blocks or fails the change that caused it: deliveries
 * run in the background and errors are logged. Events about campaigns that
 * are not public only reach the creator's webhooks and integrations.
 */

import { Campaign, getStore, Pledge } from "../database";
import { notificationService } from "../notifications";
import { NotificationEventType } from "../notifications/types";
import { integrationService, IntegrationEventType } from "../integrations";

/** Integration events matching platform events */
const INTEGRATION_EVENTS: Partial<Record<NotificationEventType, IntegrationEventType>> = {
  campaign_created: "campaign_created",
  campaign_activated: "campaign_launched",
  campaign_resolved: "campaign_resolved",
  pledge_created: "pledge_created",
  pledge_released: "pledge_released",
  milestone_verified: "milestone_verified",
  dispute_created: "dispute_created",
  dispute_resolved: "dispute_resolved",
};

export interface PlatformEvent {
  type: NotificationEventType;
  campaign: Campaign;
  summary: string;
  /** Who receives an in-app notification; may be looked up when delivering */
  recipients: string[] | (() => Promise<string[]>);
  actorAddress?: string;
  actorType?: "backer" | "creator" | "beneficiary" | "oracle" | "system";
  pledgeId?: string;
  milestoneId?: string;
  disputeId?: string;
  data?: Record<string, unknown>;
  priority?: "low" | "normal" | "high" | "urgent";
}

const pending = new Set<Promise<void>>();

async function deliver(event: PlatformEvent): Promise<void> {
  const { campaign } = event;
  const recipients = typeof event.recipients === "function" ? await event.recipients() : event.recipients;
  const audience = campaign.visibility === "public" ? undefined : [campaign.creator];
  const data = {
    campaignId: campaign.id,
    campaignName: campaign.name,
    creatorAddress: campaign.creator,
    beneficiaryAddress: campaign.beneficiary,
    ...event.data,
  };

  const deliveries: Promise<unknown>[] = [
    notificationService.emit({
      type: event.type,
      source: "api",
      campaignId: campaign.id,
      pledgeId: event.pledgeId,
      milestoneId: event.milestoneId,
      disputeId: event.disputeId,
      actorAddress: event.actorAddress,
      actorType: event.actorType,
      recipients: Array.from(new Set(recipients.map((r) => r.toLowerCase()))),
      audience,
      data,
      summary: event.summary,
      priority: event.priority ?? "normal",
    }),
  ];

  const integrationEvent = INTEGRATION_EVENTS[event.type];
  if (integrationEvent) {
    deliveries.push(integrationService.deliverEvent(integrationEvent, data, audience));
  }

  const results = await Promise.allSettled(deliveries);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error(`Delivering ${event.type} for ${campaign.id} failed:`, result.reason);
    }
  }
}

function inBackground(task: () => Promise<void>, description: string): void {
  const run = task()
    .catch((error) => console.error(`${description} failed:`, error))
    .finally(() => pending.delete(run));
  pending.add(run);
}

/**
 * Publish an event in the background
 */
export function publishEvent(event: PlatformEvent): void {
  inBackground(() => deliver(event), `Delivering ${event.type} for ${event.campaign.id}`);
}

/**
 * Wait for published events to be delivered (tests, shutdown)
 */
export async function flushEvents(): Promise<void> {
  while (pending.size > 0) {
    await Promise.allSettled(Array.from(pending));
  }
}

// ============================================================================
// EVENT BUILDERS
// ============================================================================

async function backersOf(campaignId: string): Promise<string[]> {
  const { items } = await getStore().listPledges({ campaignId });
  return items.map((p) => p.backer);
}

export function campaignEvent(
  type: "campaign_created" | "campaign_activated" | "campaign_cancelled" | "campaign_deadline_reached",
  campaign: Campaign
): void {
  const summaries = {
    campaign_created: `${campaign.name} was created`,
    campaign_activated: `${campaign.name} is open for pledges`,
    campaign_cancelled: `${campaign.name} was cancelled and its pledges refunded`,
    campaign_deadline_reached: `Pledging for ${campaign.name} has closed`,
  };
  publishEvent({
    type,
    campaign,
    summary: summaries[type],
    recipients: async () => [campaign.creator, ...(await backersOf(campaign.id))],
    actorAddress: campaign.creator,
    actorType: "creator",
    data: { deadline: campaign.pledgeWindowEnd * 1000 },
  });
}

export function pledgeEvent(
  type: "pledge_created" | "pledge_cancelled" | "pledge_released" | "pledge_refunded",
  campaign: Campaign,
  pledge: Pledge
): void {
  const amount =
    type === "pledge_released"
      ? pledge.finalAmount ?? "0"
      : type === "pledge_refunded" || type === "pledge_cancelled"
        ? pledge.refundedAmount ?? pledge.escrowedAmount
        : pledge.escrowedAmount;
  const summaries = {
    pledge_created: `New pledge to ${campaign.name}`,
    pledge_cancelled: `A pledge to ${campaign.name} was cancelled`,
    pledge_released: `Your pledge to ${campaign.name} was released to the beneficiary`,
    pledge_refunded: `Your pledge to ${campaign.name} was refunded`,
  };
  const recipients =
    type === "pledge_released" || type === "pledge_refunded" ? [pledge.backer] : [campaign.creator, pledge.backer];

  publishEvent({
    type,
    campaign,
    summary: summaries[type],
    recipients,
    actorAddress: pledge.backer,
    actorType: "backer",
    pledgeId: pledge.id,
    data: { pledgeId: pledge.id, backerAddress: pledge.backer, amount, pledgeType: pledge.pledgeTypeId },
  });
}

export function milestoneEvent(
  type: "milestone_verified" | "milestone_failed",
  campaign: Campaign,
  milestoneId: string
): void {
  const milestone = campaign.milestones.find((m) => m.id === milestoneId);
  const name = milestone?.name ?? milestoneId;
  publishEvent({
    type,
    campaign,
    summary:
      type === "milestone_verified"
        ? `${name} was verified for ${campaign.name}`
        : `${name} was not met for ${campaign.name}`,
    recipients: async () => [campaign.creator, ...(await backersOf(campaign.id))],
    actorType: "oracle",
    milestoneId,
    data: { milestoneId, milestoneName: name, result: type === "milestone_verified" ? "verified" : "failed" },
  });
}

/**
 * The campaign's resolution and what happened to each pledge
 */
export function resolutionEvents(campaignId: string): void {
  inBackground(async () => {
    const campaign = await getStore().getCampaign(campaignId);
    if (!campaign) return;
    const { items: pledges } = await getStore().listPledges({ campaignId });

    publishEvent({
      type: "campaign_resolved",
      campaign,
      summary: `${campaign.name} was resolved`,
      recipients: [campaign.creator],
      actorType: "system",
      data: { releasedAmount: campaign.totalReleased, refundedAmount: campaign.totalRefunded },
    });

    for (const pledge of pledges.filter((p) => p.status !== "cancelled")) {
      if (BigInt(pledge.finalAmount ?? "0") > 0n) pledgeEvent("pledge_released", campaign, pledge);
      if (BigInt(pledge.refundedAmount ?? "0") > 0n) pledgeEvent("pledge_refunded", campaign, pledge);
    }
  }, `Publishing the resolution of ${campaignId}`);
}

export function disputeEvent(
  type: "dispute_created" | "dispute_resolved",
  campaign: Campaign,
  dispute: { id: string; raisedBy: string; category: string; title: string }
): void {
  publishEvent({
    type,
    campaign,
    summary:
      type === "dispute_created"
        ? `A dispute was raised for ${campaign.name}: ${dispute.title}`
        : `The dispute "${dispute.title}" for ${campaign.name} was resolved`,
    recipients: [campaign.creator, dispute.raisedBy],
    actorAddress: dispute.raisedBy,
    disputeId: dispute.id,
    data: { disputeId: dispute.id, category: dispute.category, filedBy: dispute.raisedBy },
  });
}
