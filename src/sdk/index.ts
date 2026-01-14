/**
 * Pledge Protocol SDK
 * Phase 8: Ecosystem Expansion - TypeScript SDK for developers
 *
 * @example
 * ```typescript
 * import { createClient } from '@pledgeprotocol/sdk';
 *
 * const client = createClient({
 *   apiUrl: 'https://api.pledgeprotocol.io',
 *   chainId: 137, // Polygon
 * });
 *
 * // List campaigns
 * const campaigns = await client.campaigns.list({ status: 'active' });
 *
 * // Create a pledge
 * const pledge = await client.pledges.create({
 *   campaignId: 'camp-123',
 *   calculation: { type: 'flat', baseAmount: '1000000000000000000' },
 * });
 * ```
 */

// Types
export * from "./types";

// Client
export {
  PledgeProtocolClient,
  CampaignClient,
  PledgeClient,
  OracleClient,
  DisputeClient,
  CommemorativeClient,
  UserClient,
  AuthClient,
  createClient,
} from "./client";

// Re-export chain config for convenience
export { ChainId, getChainConfig, isChainSupported } from "../multichain/config";
