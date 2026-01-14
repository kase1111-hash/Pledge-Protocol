# Pledge Protocol

Milestone-verified crowdfunding with commemorative proof of backing. A NatLangChain application.

## What This Does

You pledge money toward someone's goal. The money locks in escrow. When verified milestones are hit, funds release to the beneficiary. You get permanent proof you backed them.

No more "I'll pay you when you finish" followed by silence. No more crowdfunding campaigns that take money and disappear. Pledge Protocol makes commitments binding and outcomes verifiable.

## How It Works

```
1. Campaign created (marathon, album, degree, product launch)
2. Milestones defined with verification sources
3. Backers purchase pledge tokens (funds go to escrow)
4. Event happens
5. Oracle confirms milestone completion
6. Funds release to beneficiary
7. Backers receive commemorative tokens proving their support
```

Money moves when reality moves. Not before.

## The Pledge Token

When you back a campaign, you receive a pledge token representing your commitment:

```
PLEDGE #0047
Campaign: Sarah's Portland Marathon 2026
Backer: Mike
Beneficiary: Portland Habitat for Humanity

Commitment: $2.00 per mile, max $60.00
Escrowed: $60.00
Status: Active

Resolution: Pending official race results
```

This token is yours. It represents your stake in the outcome.

## The Commemorative Token

After resolution, your pledge token transforms into permanent proof:

```
COMMEMORATIVE #0047
Campaign: Sarah's Portland Marathon 2026
Backer: Mike
Beneficiary: Portland Habitat for Humanity

Runner Result: 26.2 miles, 3:47:22
Your Contribution: $52.40
Total Campaign Raised: $2,847.00

Backed: March 15, 2026
Resolved: April 7, 2026
```

This is your receipt, your bragging rights, your proof of being early.

## Use Cases

### Charity Runs

Sponsor a runner. Pledge per mile, per lap, or flat amount for completion. Funds release automatically when official race results post. No chasing sponsors for payment. No honor system.

### Education

Back a student's degree. Funds release on enrollment verification, semester completion, graduation. Hold proof that you funded someone's future.

### Creative Work

Fund an album, film, or book. Escrow releases at milestones: demo complete, rough cut delivered, final master, public release. Backers know funds move only as work progresses.

### Open Source Development

Fund a feature or bug fix. Release tied to PR merged, tests passing, deployment complete. Token shows you funded commit #a7f2b4c.

### Research

Back a study. Milestones: IRB approval, data collection, peer review, publication. Proof you supported science before the results were known.

### Small Business Launch

Fund a food cart, workshop, studio. Releases on permits secured, equipment purchased, doors open. Founding supporter status, verifiable forever.

### Personal Goals

Sponsor recovery, fitness, skill acquisition. Milestones verified by agreed-upon methods. Dignified backing with real accountability.

## Why This Matters

Current crowdfunding is broken:

**Kickstarter model**: Money collected upfront, delivered maybe never. Backers have no recourse. Creators have no accountability mechanism.

**GoFundMe model**: Give money on faith. No verification of use. Commemorated only in your bank statement.

**Charity pledge model**: Promise to pay later. 40% of pledges never collected. Friction everywhere.

Pledge Protocol fixes the incentives:

- Backers pay upfront, but funds are escrowed, not transferred
- Releases happen only when verified milestones complete
- Unmet milestones return funds to backers
- Everyone gets permanent proof of participation

Trust is replaced with verification.

## Protocol Components

### Campaign Contract

Defines the goal, beneficiary, milestones, and verification sources.

```
Campaign: Portland Marathon 2026 - Sarah Chen
Beneficiary: Portland Habitat for Humanity
Runner: Sarah Chen (Bib #4471)

Milestones:
  - Race completion: Official results API
  - Time verification: Official results API
  
Pledge Types:
  - Per mile: $X per mile completed
  - Completion bonus: $X if finishes
  - Time bonus: $X if under target time
  
Campaign Window: March 1 - April 6, 2026
Resolution Deadline: April 14, 2026
```

### Pledge Token

Individual backer's commitment, held in their wallet.

### Oracle Registry

Verified data sources that trigger milestone completion:

- Race timing APIs
- Academic registrar verification
- GitHub commit history
- Streaming platform release dates
- Business license databases
- Custom attestation from trusted parties

### Escrow Contract

Holds funds until resolution. Releases to beneficiary on milestone completion, returns to backer on milestone failure or campaign expiration.

### Commemorative Mint

Transforms resolved pledges into permanent collectible tokens.

## NatLangChain Integration

Pledge Protocol is built on NatLangChain, inheriting:

- **Human-readable contracts**: Pledges are written in plain language, executable by machines
- **Intent verification**: The commitment you made is auditable and immutable
- **Provenance tracking**: Full history of campaign creation, pledge, resolution
- **Authenticity proofs**: Your commemorative token is verifiably tied to the real event

A pledge is a NatLangChain contract. The prose is the program.

## For Campaign Organizers

Setting up a Pledge Protocol campaign requires:

1. **Define the campaign**: Goal, beneficiary wallet, timeline
2. **Specify milestones**: What gets verified, by what source
3. **Configure pledge types**: Per-unit, flat, bonus conditions
4. **Register oracles**: Connect verification data sources
5. **Deploy contracts**: Launch on NatLangChain
6. **Distribute pledge access**: Runners/creators share their campaign links
7. **Resolution**: Oracle data triggers automatic fund distribution

Technical integration required. This is protocol infrastructure, not a consumer app. Organizers partner with developers or use hosted implementations.

## For Backers

1. Find a campaign (shared by runner, creator, student)
2. Choose pledge type and amount
3. Purchase pledge token (funds go to escrow)
4. Watch progress (optional: live updates)
5. Resolution happens automatically
6. Receive commemorative token

Your money moves when the milestone is verified. Not before.

## For Beneficiaries

Funds arrive automatically when milestones complete. No invoicing sponsors. No chasing payments. No awkward conversations about who forgot to pay.

Focus on the goal. The protocol handles the money.

## Privacy Considerations

- Campaigns can be public or private
- Backer identity can be wallet-only (pseudonymous) or linked to real identity
- Pledge amounts can be hidden until resolution
- Commemorative tokens can be non-transferable (soulbound) to prevent resale

Configuration per campaign. Different use cases need different privacy levels.

## What This Isn't

- Not a donation platform (funds are escrowed, not given)
- Not a betting market (backers don't profit from outcomes)
- Not equity crowdfunding (no ownership stake in ventures)
- Not a payment processor (settlement happens on-chain)

This is commitment infrastructure. Making pledges real.

## Built On

- **NatLangChain**: Prose-first smart contracts
- **IPFS/Arweave**: Permanent storage of campaign data and commemoratives
- **Oracle networks**: Verified external data sources

## API Reference

### Advanced Pledge Types (Phase 4)

Phase 4 introduces flexible pledge calculation types that automatically compute release amounts based on oracle-verified outcomes.

#### Flat Pledges

Fixed amount released on milestone completion:

```json
{
  "calculationType": "flat",
  "baseAmount": "50000000000000000000",
  "minimum": "10000000000000000000"
}
```

#### Per-Unit Pledges

Amount calculated based on a verified metric (e.g., miles run, commits merged):

```json
{
  "calculationType": "per_unit",
  "perUnitAmount": "2000000000000000000",
  "unitField": "miles_completed",
  "cap": "60000000000000000000",
  "minimum": "0"
}
```

Example: $2 per mile, capped at $60. If runner completes 26.2 miles, $52 releases.

#### Tiered Pledges

Stepped rates that increase at thresholds:

```json
{
  "calculationType": "tiered",
  "unitField": "miles_completed",
  "tiers": [
    { "threshold": 0, "rate": "1000000000000000000" },
    { "threshold": 10, "rate": "2000000000000000000" },
    { "threshold": 20, "rate": "3000000000000000000" }
  ],
  "cap": "100000000000000000000",
  "minimum": "0"
}
```

Example: $1/mile for first 10 miles, $2/mile for miles 10-20, $3/mile after 20.

#### Conditional Pledges

All-or-nothing based on a condition:

```json
{
  "calculationType": "conditional",
  "condition": {
    "field": "finish_time_seconds",
    "operator": "lt",
    "value": 14400
  },
  "minimum": "50000000000000000000"
}
```

Supported operators:
- `exists`: Field is present in oracle data
- `eq`: Equal to value
- `gt` / `gte`: Greater than (or equal)
- `lt` / `lte`: Less than (or equal)
- `between`: Within range (requires `value` and `valueEnd`)

Example: Release $50 if finish time is under 4 hours (14400 seconds).

### Extended Oracle Providers (Phase 5)

Phase 5 adds additional oracle integrations for broader use cases.

#### Strava Integration

Fitness activity verification via Strava:

```typescript
import { StravaProvider } from "./oracle";

const strava = StravaProvider.create(clientId, clientSecret);
strava.setTokens(accessToken, refreshToken, expiresAt);

// Query specific activity
const result = await strava.queryActivity("12345");

// Query athlete's activities
const activities = await strava.queryActivities(afterTimestamp, beforeTimestamp);
```

Response fields: `activityId`, `activityType`, `distanceMeters`, `distanceMiles`, `elapsedTimeSeconds`, `movingTimeSeconds`, `totalElevationGainMeters`, `averageSpeedMps`

#### Academic Verification

Education milestone verification (enrollment, graduation, GPA):

```typescript
import { AcademicProvider } from "./oracle";

const academic = AcademicProvider.createForProvider("nsc", apiKey);

// Verify enrollment
const enrollment = await academic.verifyEnrollment(studentId, institutionCode);

// Verify degree
const degree = await academic.verifyDegree(studentId, institutionCode);
```

Response fields: `enrolled`, `creditsCompleted`, `gpa`, `graduationDate`, `degreeConferred`, `enrollmentStatus`

#### Streaming Platforms

Content release verification (Spotify, YouTube, Twitch):

```typescript
import { StreamingProvider } from "./oracle";

const spotify = StreamingProvider.createForPlatform("spotify", apiKey);
const result = await spotify.verifySpotifyRelease(albumId);

const youtube = StreamingProvider.createForPlatform("youtube", apiKey);
const video = await youtube.verifyYouTubeVideo(videoId);
```

#### Aggregator Oracle

Multi-source consensus for high-value campaigns:

```typescript
import { AggregatorProvider, RaceTimingProvider, StravaProvider } from "./oracle";

// Create sources
const athlinks = RaceTimingProvider.createForProvider("athlinks", apiKey);
const strava = StravaProvider.create(clientId, clientSecret);

// Create aggregator requiring majority consensus
const aggregator = AggregatorProvider.createMajority(
  "marathon-verification",
  "Marathon Multi-Source",
  [athlinks, strava],
  0.5 // 50% threshold
);

const result = await aggregator.query({ eventId, bibNumber });
```

Aggregation methods:
- `all`: All sources must agree
- `majority`: More than threshold percentage must agree
- `any`: At least one source must succeed
- `weighted`: Weighted voting by source trust level
- `threshold`: At least N sources must agree

### Dispute Resolution API (Phase 6)

Handle disagreements with a multi-tier resolution system:

```bash
# Create a dispute
POST /v1/disputes
{
  "campaignId": "campaign_123",
  "pledgeId": "pledge_456",
  "milestoneId": "milestone_789",
  "category": "oracle_disagreement",
  "title": "Oracle data mismatch",
  "description": "The oracle reported incorrect race results"
}

# List disputes
GET /v1/disputes?campaignId=campaign_123&status=pending

# Get dispute details
GET /v1/disputes/:disputeId

# Submit evidence
POST /v1/disputes/:disputeId/evidence
{
  "type": "document",
  "description": "Screenshot of official results",
  "content": "https://evidence.example.com/screenshot.png"
}

# Open voting
POST /v1/disputes/:disputeId/voting/open
{
  "eligibleVoters": ["0x...", "0x..."],
  "votingPowers": { "0x...": "100", "0x...": "200" }
}

# Cast vote
POST /v1/disputes/:disputeId/voting/cast
{
  "voter": "0x...",
  "vote": "release",
  "rationale": "Evidence clearly shows milestone was met"
}

# Close voting
POST /v1/disputes/:disputeId/voting/close

# Escalate dispute
POST /v1/disputes/:disputeId/escalate
{ "reason": "Community vote was inconclusive" }

# Resolve dispute
POST /v1/disputes/:disputeId/resolve
{
  "outcome": "release",
  "rationale": "Creator fulfilled obligations"
}

# Appeal resolution
POST /v1/disputes/:disputeId/appeal
{ "reason": "New evidence discovered" }
```

#### Dispute Categories

- `oracle_disagreement`: Oracle data conflicts with reality
- `oracle_failure`: Oracle did not respond or returned errors
- `milestone_dispute`: Disagreement about milestone completion
- `calculation_error`: Pledge amount calculated incorrectly
- `fraud_claim`: Suspected fraudulent activity
- `technical_issue`: Smart contract or platform bug
- `other`: Other issues

#### Resolution Tiers

| Tier | Description |
|------|-------------|
| `automated` | Technical issues resolved by system |
| `community` | Community voting for standard disputes |
| `creator` | Creator mediation for complex cases |
| `council` | Expert panel for fraud and high-value disputes |

### Webhooks API (Phase 6)

Receive real-time notifications about campaign events:

```bash
# Create webhook
POST /v1/webhooks
{
  "name": "Campaign Updates",
  "url": "https://myapp.com/webhook",
  "events": ["campaign_created", "pledge_released", "milestone_verified"],
  "secret": "my-webhook-secret-key"
}

# List webhooks
GET /v1/webhooks

# Get available events
GET /v1/webhooks/events

# Update webhook
PUT /v1/webhooks/:webhookId
{
  "events": ["campaign_created", "pledge_released"],
  "active": true
}

# Test webhook
POST /v1/webhooks/:webhookId/test

# Get delivery logs
GET /v1/webhooks/:webhookId/logs

# Delete webhook
DELETE /v1/webhooks/:webhookId
```

#### Event Types

| Category | Events |
|----------|--------|
| Campaign | `campaign_created`, `campaign_activated`, `campaign_deadline_approaching`, `campaign_resolved`, `campaign_cancelled` |
| Pledge | `pledge_created`, `pledge_escrowed`, `pledge_released`, `pledge_refunded`, `pledge_cancelled` |
| Milestone | `milestone_verified`, `milestone_failed`, `milestone_pending` |
| Oracle | `oracle_data_received`, `oracle_timeout`, `oracle_disagreement` |
| Dispute | `dispute_created`, `dispute_evidence_added`, `dispute_voting_opened`, `dispute_resolved` |
| Commemorative | `commemorative_generated`, `commemorative_minted` |

### Search & Discovery API (Phase 6)

Find and explore campaigns:

```bash
# Search campaigns
GET /v1/analytics/search?q=marathon&category=fitness&status=active&sort=trendingScore

# Get trending campaigns
GET /v1/analytics/platform/trending

# Get similar campaigns
GET /v1/analytics/campaigns/:campaignId/similar

# Platform overview
GET /v1/analytics/platform/overview
```

#### Search Filters

- `q`: Text search in name, description, tags
- `category`: Filter by category (fitness, education, creative, etc.)
- `status`: Filter by status (active, resolved, cancelled)
- `oracleType`: Filter by oracle type
- `tags`: Filter by tags (comma-separated)
- `minPledged`, `maxPledged`: Filter by pledged amount
- `minBackers`: Filter by minimum backer count
- `sort`: Sort field (trendingScore, totalPledged, backerCount, createdAt)
- `order`: Sort order (asc, desc)

### Analytics Dashboard API (Phase 6)

Analytics for creators and backers:

```bash
# Creator dashboard
GET /v1/analytics/creators/:address/dashboard

# Creator campaign analytics
GET /v1/analytics/creators/:address/campaigns

# Creator performance over time
GET /v1/analytics/creators/:address/performance

# Backer dashboard
GET /v1/analytics/backers/:address/dashboard

# Backer portfolio
GET /v1/analytics/backers/:address/portfolio
```

### Authentication API (Phase 7)

Wallet-based authentication with session management:

```bash
# Request authentication challenge
POST /v1/auth/challenge
{ "address": "0x..." }

# Verify signature and create session
POST /v1/auth/verify
{
  "address": "0x...",
  "message": "...",
  "signature": "0x...",
  "chainId": 1
}

# Get current session
GET /v1/auth/session
Headers: Authorization: Bearer <sessionId>

# Logout current session
POST /v1/auth/logout

# Logout all sessions
POST /v1/auth/logout/all
```

#### API Keys

```bash
# Create API key (admin only)
POST /v1/auth/api-keys
{
  "name": "My Integration",
  "permissions": ["campaign:read", "pledge:read"]
}

# List API keys
GET /v1/auth/api-keys

# Revoke API key
DELETE /v1/auth/api-keys/:keyId
```

#### Role Management (Admin)

```bash
# Assign role
POST /v1/auth/roles/:address
{ "role": "creator" }

# Remove role
DELETE /v1/auth/roles/:address/:role

# Get user roles
GET /v1/auth/roles/:address
```

#### User Roles

| Role | Description |
|------|-------------|
| `backer` | Default role, can create pledges and disputes |
| `creator` | Can create and manage campaigns |
| `arbitrator` | Can vote on and resolve disputes |
| `admin` | Full system access |

### Monitoring API (Phase 7)

Health checks and system monitoring:

```bash
# Full health check
GET /v1/monitoring/health

# Kubernetes liveness probe
GET /v1/monitoring/health/live

# Kubernetes readiness probe
GET /v1/monitoring/health/ready

# Prometheus metrics
GET /v1/monitoring/metrics

# JSON metrics
GET /v1/monitoring/metrics/json
```

#### Admin Endpoints (Authenticated)

```bash
# System statistics
GET /v1/monitoring/stats

# List background jobs
GET /v1/monitoring/jobs?type=webhook:deliver&status=pending

# Retry failed job
POST /v1/monitoring/jobs/:jobId/retry

# Cancel pending job
POST /v1/monitoring/jobs/:jobId/cancel

# Query audit logs
GET /v1/monitoring/audit?action=campaign_created&since=1704067200000

# Export audit logs
GET /v1/monitoring/audit/export?format=csv

# Security events
GET /v1/monitoring/security?severity=high

# Run cleanup
POST /v1/monitoring/cleanup
```

### Multi-Chain API (Phase 8)

Deploy and manage campaigns across multiple blockchain networks:

```bash
# List supported chains
GET /v1/chains

# Get chain details
GET /v1/chains/:chainId

# Get chain contracts
GET /v1/chains/:chainId/contracts

# Get campaigns on chain
GET /v1/chains/:chainId/campaigns

# Estimate deployment gas
POST /v1/chains/:chainId/estimate
{
  "name": "Portland Marathon 2026",
  "beneficiary": "0x...",
  "deadline": 1712448000
}

# Deploy to single chain
POST /v1/chains/:chainId/deploy
{
  "campaignId": "campaign_123",
  "creator": "0x...",
  "name": "Portland Marathon 2026",
  "beneficiary": "0x...",
  "deadline": 1712448000
}

# Deploy to multiple chains
POST /v1/chains/deploy-multi
{
  "campaignId": "campaign_123",
  "creator": "0x...",
  "chainIds": [137, 42161, 10],
  "campaignData": { ... }
}

# Get recommended chains
POST /v1/chains/recommended
{ "preferLowCost": true, "requireMainnet": false }
```

#### Supported Chains

| Chain | ID | Type | Features |
|-------|-----|------|----------|
| Ethereum | 1 | Mainnet | Production, EIP-1559 |
| Polygon | 137 | Mainnet | Low cost, fast blocks |
| Arbitrum One | 42161 | Mainnet | L2 rollup, low fees |
| Optimism | 10 | Mainnet | L2 rollup, OP Stack |
| Base | 8453 | Mainnet | Coinbase L2 |
| Sepolia | 11155111 | Testnet | Ethereum testnet |
| Polygon Amoy | 80002 | Testnet | Polygon testnet |
| Arbitrum Sepolia | 421614 | Testnet | Arbitrum testnet |
| Optimism Sepolia | 11155420 | Testnet | Optimism testnet |
| Base Sepolia | 84532 | Testnet | Base testnet |
| Local | 31337 | Local | Hardhat/Anvil |

### Social API (Phase 8)

User profiles, follows, comments, and activity feeds:

```bash
# Get user profile
GET /v1/social/users/:address

# Update own profile
PUT /v1/social/users/me
{
  "displayName": "Sarah Chen",
  "bio": "Marathon runner for charity",
  "avatar": "https://...",
  "preferences": {
    "publicProfile": true,
    "showPledgeAmounts": true,
    "emailNotifications": true
  }
}

# Search users
GET /v1/social/users/search?q=sarah

# Follow user
POST /v1/social/users/:address/follow

# Unfollow user
DELETE /v1/social/users/:address/follow

# Check if following
GET /v1/social/users/:address/is-following

# Get followers
GET /v1/social/users/:address/followers

# Get following
GET /v1/social/users/:address/following
```

#### Comments

```bash
# Create comment
POST /v1/social/campaigns/:campaignId/comments
{
  "content": "Good luck on the marathon!",
  "parentId": null
}

# Get campaign comments
GET /v1/social/campaigns/:campaignId/comments?sortBy=newest&limit=50

# Update comment
PUT /v1/social/comments/:commentId
{ "content": "Updated comment text" }

# Delete comment
DELETE /v1/social/comments/:commentId

# Like comment
POST /v1/social/comments/:commentId/like

# Unlike comment
DELETE /v1/social/comments/:commentId/like

# Report comment
POST /v1/social/comments/:commentId/report
{ "reason": "spam" }

# Pin comment (admin)
POST /v1/social/comments/:commentId/pin
{ "pinned": true }
```

#### Activity Feed

```bash
# Personal feed (from followed users)
GET /v1/social/feed?limit=50

# Global feed
GET /v1/social/feed/global

# User activity
GET /v1/social/users/:address/activity?types=campaign_created,pledge_created
```

#### Leaderboards

```bash
# Creator leaderboard
GET /v1/social/leaderboard/creators?metric=raised&period=monthly&limit=50

# Backer leaderboard
GET /v1/social/leaderboard/backers?metric=pledged&limit=50
```

Metrics: `raised`, `campaigns`, `successRate`, `backers` (creators) or `pledged`, `campaigns`, `commemoratives` (backers)

Periods: `weekly`, `monthly`, `yearly`, `all_time`

#### Statistics

```bash
# Social system stats
GET /v1/social/stats
```

### TypeScript SDK (Phase 8)

Developer-friendly client library for integrating with Pledge Protocol:

```typescript
import { createClient, ChainId } from "@pledge-protocol/sdk";

// Initialize client
const client = createClient({
  baseUrl: "https://api.pledgeprotocol.io",
  chainId: ChainId.Polygon,
  apiKey: "your-api-key", // Optional
});

// Switch chains
const arbitrumClient = client.forChain(ChainId.Arbitrum);

// Campaigns
const campaigns = await client.campaigns.list({ status: "active", limit: 10 });
const campaign = await client.campaigns.get("campaign_123");
const newCampaign = await client.campaigns.create({
  name: "Portland Marathon 2026",
  beneficiary: "0x...",
  milestones: [...],
});

// Pledges
const pledges = await client.pledges.list({ campaignId: "campaign_123" });
const pledge = await client.pledges.create({
  campaignId: "campaign_123",
  amount: "50000000000000000000",
  calculationType: "per_unit",
  perUnitAmount: "2000000000000000000",
});

// Oracles
const oracleResult = await client.oracles.query("oracle_id", { eventId: "123" });

// Disputes
const dispute = await client.disputes.create({
  campaignId: "campaign_123",
  category: "oracle_disagreement",
  title: "Data mismatch",
  description: "...",
});

// Commemoratives
const commemoratives = await client.commemoratives.listByBacker("0x...");

// Users (social)
const profile = await client.users.getProfile("0x...");
await client.users.follow("0x...");
const feed = await client.users.getFeed();

// Authentication
const challenge = await client.auth.getChallenge("0x...");
const session = await client.auth.verify({
  address: "0x...",
  message: challenge.message,
  signature: "0x...",
});
client.setSessionId(session.sessionId);
```

#### SDK Features

- **Type-safe**: Full TypeScript types for all API responses
- **Multi-chain**: Easy chain switching with `forChain()`
- **Authentication**: Session and API key support
- **Retry logic**: Automatic retries with exponential backoff
- **Error handling**: Structured error responses

### Rate Limiting (Phase 7)

All API requests are rate limited based on authentication status:

| Tier | Requests/Minute | Description |
|------|-----------------|-------------|
| `anonymous` | 30 | Unauthenticated requests |
| `authenticated` | 100 | Logged-in users |
| `premium` | 500 | Premium users |
| `api` | 1000 | API key access |

Rate limit headers are included in all responses:
- `X-RateLimit-Limit`: Current tier
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Unix timestamp when limit resets

### Caching (Phase 7)

The system uses in-memory caching with LRU eviction:

- **Oracle responses**: 1 minute TTL
- **Campaign data**: 5 minutes TTL
- **Search results**: 30 seconds TTL
- **Trending campaigns**: 1 minute TTL

Cache invalidation occurs automatically on data updates.

### Background Jobs (Phase 7)

Async operations are processed via a background job queue:

| Job Type | Description |
|----------|-------------|
| `oracle:query` | Oracle data fetching |
| `oracle:aggregate` | Multi-source aggregation |
| `pledge:release` | Fund release processing |
| `commemorative:generate` | Image generation |
| `webhook:deliver` | Webhook delivery with retry |
| `campaign:resolve` | Campaign resolution |

Jobs support priorities (low, normal, high, critical) and automatic retry with exponential backoff.

### Campaign Templates API (Phase 5)

Pre-built templates for common campaign types accelerate setup.

```bash
# List all templates
GET /v1/templates

# Get templates by category
GET /v1/templates?category=fitness

# Get template details
GET /v1/templates/charity-race

# Validate field values
POST /v1/templates/:templateId/validate
{ "fieldValues": { "eventName": "Portland Marathon", ... } }

# Preview campaign without creating
POST /v1/templates/:templateId/preview
{ "fieldValues": { ... } }

# Generate campaign from template
POST /v1/templates/:templateId/generate
{
  "fieldValues": {
    "eventName": "Portland Marathon 2026",
    "participantName": "Sarah Chen",
    "beneficiaryAddress": "0x...",
    "eventDate": "2026-04-06",
    "eventDistance": 26.2,
    "timingProvider": "athlinks"
  }
}
```

#### Available Templates

| Template | Category | Description |
|----------|----------|-------------|
| `charity-race` | fitness | Marathon/race fundraising with per-mile pledges |
| `creative-project` | creative | Album/book/film with milestone releases |
| `academic-achievement` | education | Student funding with enrollment verification |
| `open-source-dev` | opensource | GitHub-verified development bounties |
| `business-launch` | business | Small business from permits to opening |
| `research-study` | research | Scientific research to publication |

### Commemoratives API (Phase 3)

Generate and manage commemorative tokens:

```bash
# Generate single commemorative
POST /v1/commemoratives/generate
{
  "pledgeId": "pledge_123",
  "campaignId": "campaign_abc",
  "campaignName": "Portland Marathon 2026",
  "subjectName": "Sarah Chen",
  "beneficiaryName": "Portland Habitat",
  "backerName": "Mike",
  "backerAddress": "0x...",
  "contributionAmount": "52.40",
  "totalCampaignRaised": "2847.00",
  "pledgedAt": 1710460800,
  "resolvedAt": 1712448000,
  "outcomeSummary": "26.2 miles in 3:47:22",
  "templateType": "race_finish",
  "customData": {
    "raceName": "Portland Marathon",
    "finishTime": "3:47:22",
    "bibNumber": "4471"
  }
}

# Generate for entire campaign
POST /v1/commemoratives/generate/campaign

# Get commemorative by ID
GET /v1/commemoratives/:id

# Get by pledge ID
GET /v1/commemoratives/pledge/:pledgeId

# Get all for campaign
GET /v1/commemoratives/campaign/:campaignId

# Get backer's commemoratives
GET /v1/backers/me/commemoratives
```

### Template Types

- **race_finish**: Bib-style certificate with timing results
- **academic**: Diploma-style for educational achievements
- **creative**: Album art style for creative projects
- **generic**: Clean card design for general use

### Storage

Images and metadata are stored permanently:
- **IPFS**: For pledge token metadata (content-addressed)
- **Arweave**: For commemorative images (permanent)

## Development

### Phase Status

- **Phase 1** ✅: Core protocol (campaigns, pledges, escrow, manual attestation)
- **Phase 2** ✅: Oracle framework (API oracles, race timing, GitHub, resolution engine)
- **Phase 3** ✅: Token system (commemoratives, image generation, IPFS/Arweave)
- **Phase 4** ✅: Advanced pledges (per-unit, tiered, conditional calculation types)
- **Phase 5** ✅: Ecosystem (Strava/Academic/Streaming oracles, aggregator, templates)
- **Phase 6** ✅: Governance (dispute resolution, webhooks, search/discovery, analytics)
- **Phase 7** ✅: Production (authentication, rate limiting, caching, job queue, monitoring)
- **Phase 8** ✅: Ecosystem expansion (multi-chain, TypeScript SDK, social features)

### Running Locally

```bash
# Install dependencies
npm install

# Run tests
npm test

# Start API server
npm run dev
```

### Project Structure

```
contracts/           # Solidity smart contracts
├── CampaignRegistry.sol
├── EscrowVault.sol
├── PledgeManager.sol
├── OracleRegistry.sol
└── tokens/
    ├── PledgeToken.sol
    └── CommemorativeToken.sol

src/
├── api/             # Express API server
│   └── routes/
│       ├── campaigns.ts
│       ├── pledges.ts
│       ├── oracles.ts
│       ├── commemoratives.ts
│       ├── templates.ts        # Phase 5
│       ├── disputes.ts         # Phase 6
│       ├── webhooks.ts         # Phase 6
│       ├── analytics.ts        # Phase 6
│       ├── auth.ts             # Phase 7
│       ├── monitoring.ts       # Phase 7
│       ├── social.ts           # Phase 8
│       └── chains.ts           # Phase 8
├── oracle/          # Oracle system (Phase 2 + 5)
│   ├── providers/
│   │   ├── api-provider.ts
│   │   ├── race-timing-provider.ts
│   │   ├── github-provider.ts
│   │   ├── strava-provider.ts      # Phase 5
│   │   ├── academic-provider.ts    # Phase 5
│   │   ├── streaming-provider.ts   # Phase 5
│   │   └── aggregator-provider.ts  # Phase 5
│   └── resolution-engine.ts
├── tokens/          # Token system (Phase 3)
│   ├── image-generator.ts
│   ├── metadata-generator.ts
│   ├── storage.ts
│   └── commemorative-service.ts
├── templates/       # Template system (Phase 5)
│   ├── types.ts
│   ├── builtin-templates.ts
│   └── template-service.ts
├── governance/      # Dispute resolution (Phase 6)
│   ├── types.ts
│   └── dispute-service.ts
├── notifications/   # Webhooks & notifications (Phase 6)
│   ├── types.ts
│   └── notification-service.ts
├── discovery/       # Search & discovery (Phase 6)
│   └── search-service.ts
├── security/        # Auth & security (Phase 7)
│   ├── types.ts
│   ├── auth-service.ts
│   ├── rate-limiter.ts
│   ├── audit-logger.ts
│   └── middleware.ts
├── infrastructure/  # Caching & jobs (Phase 7)
│   ├── cache.ts
│   ├── job-queue.ts
│   └── health.ts
├── multichain/      # Multi-chain support (Phase 8)
│   ├── config.ts
│   ├── registry.ts
│   └── deployment-service.ts
├── sdk/             # TypeScript SDK (Phase 8)
│   ├── types.ts
│   └── client.ts
├── social/          # Social features (Phase 8)
│   ├── types.ts
│   └── social-service.ts
└── database/        # PostgreSQL schema

test/                # Test suites
```

## License

[TBD]

## Contributing

[TBD]
