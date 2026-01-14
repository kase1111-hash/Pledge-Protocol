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

### Payment API (Phase 9)

Fiat payment processing with automatic settlement to stablecoin escrow:

```bash
# Create checkout session
POST /v1/payments/checkout
{
  "campaignId": "campaign_123",
  "pledgeId": "pledge_456",
  "amount": "50.00",
  "currency": "usd",
  "method": "card",
  "backerAddress": "0x...",
  "successUrl": "https://myapp.com/success",
  "cancelUrl": "https://myapp.com/cancel",
  "metadata": { "referrer": "homepage" }
}

# Get checkout session
GET /v1/payments/checkout/:sessionId

# Settle to stablecoin
POST /v1/payments/:sessionId/settle
{
  "targetCurrency": "USDC",
  "destinationAddress": "0x..."
}

# Request refund
POST /v1/payments/refunds
{
  "sessionId": "session_123",
  "amount": "25.00",
  "reason": "Partial refund per dispute resolution"
}

# Create subscription
POST /v1/payments/subscriptions
{
  "campaignId": "campaign_123",
  "amount": "10.00",
  "currency": "usd",
  "interval": "monthly",
  "customerAddress": "0x..."
}

# Submit KYC
POST /v1/payments/kyc
{
  "address": "0x...",
  "tier": "standard",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "countryCode": "US"
}

# Webhooks (for Stripe/Circle callbacks)
POST /v1/payments/webhooks/stripe
POST /v1/payments/webhooks/circle
```

#### Payment Providers

| Provider | Methods | Currencies | Use Case |
|----------|---------|------------|----------|
| Stripe | `card` | USD, EUR, GBP | Credit/debit cards |
| Circle | `ach`, `wire` | USD | Bank transfers, USDC |
| Moonpay | `card`, `ach` | USD, EUR | Crypto on-ramp |

#### Settlement Flow

1. User pays with fiat (credit card, bank transfer)
2. Payment processor confirms receipt
3. Settlement service converts to USDC at market rate
4. USDC deposited to campaign escrow contract
5. Funds release to beneficiary on milestone verification

### Compliance API (Phase 9)

GDPR, CCPA, and data privacy compliance:

```bash
# Request data export (GDPR Article 20)
POST /v1/compliance/export
{
  "address": "0x...",
  "format": "json",
  "includeMetadata": true
}

# Request data deletion (GDPR Article 17)
POST /v1/compliance/delete
{
  "address": "0x...",
  "reason": "user_request",
  "retainLegalRequired": true
}

# Confirm deletion (requires token from email)
POST /v1/compliance/delete/confirm
{
  "requestId": "del_123",
  "confirmationToken": "abc123"
}

# Update consent preferences
PUT /v1/compliance/consent/:address
{
  "marketing": true,
  "analytics": false,
  "thirdPartySharing": false
}

# Exercise GDPR rights
POST /v1/compliance/gdpr
{
  "address": "0x...",
  "right": "access",
  "details": {}
}

# Exercise CCPA rights
POST /v1/compliance/ccpa
{
  "address": "0x...",
  "right": "know",
  "details": {}
}
```

#### GDPR Rights

| Right | Article | Description |
|-------|---------|-------------|
| `access` | 15 | Right to access personal data |
| `rectification` | 16 | Right to correct inaccurate data |
| `erasure` | 17 | Right to be forgotten |
| `restriction` | 18 | Right to restrict processing |
| `portability` | 20 | Right to data portability |
| `object` | 21 | Right to object to processing |

#### CCPA Rights

| Right | Description |
|-------|-------------|
| `know` | Right to know what data is collected |
| `delete` | Right to delete personal data |
| `opt_out` | Right to opt out of data sale |
| `non_discrimination` | Right to equal service |

### Enterprise API (Phase 9)

Organization management, teams, SSO, and bulk operations:

```bash
# Create organization
POST /v1/enterprise/orgs
{
  "name": "Acme Corp",
  "type": "company",
  "ownerAddress": "0x...",
  "settings": {
    "defaultPledgeVisibility": "private",
    "requireApproval": true
  }
}

# List organizations
GET /v1/enterprise/orgs

# Get organization
GET /v1/enterprise/orgs/:orgId

# Update organization
PUT /v1/enterprise/orgs/:orgId
{ "settings": { "requireApproval": false } }

# Add team member
POST /v1/enterprise/orgs/:orgId/members
{
  "address": "0x...",
  "role": "creator",
  "addedBy": "0x..."
}

# Update member role
PUT /v1/enterprise/orgs/:orgId/members/:address
{ "role": "admin" }

# Remove member
DELETE /v1/enterprise/orgs/:orgId/members/:address

# Create invite
POST /v1/enterprise/orgs/:orgId/invites
{
  "email": "jane@example.com",
  "role": "creator",
  "invitedBy": "0x..."
}

# Accept invite
POST /v1/enterprise/orgs/:orgId/invites/accept
{ "token": "invite_token_123" }

# Configure SSO
POST /v1/enterprise/orgs/:orgId/sso
{
  "type": "saml",
  "provider": "okta",
  "entityId": "https://myapp.com/sso",
  "ssoUrl": "https://idp.example.com/sso",
  "x509Certificate": "-----BEGIN CERTIFICATE-----..."
}

# Create bulk operation
POST /v1/enterprise/orgs/:orgId/bulk
{
  "type": "import_pledges",
  "data": [
    { "campaignId": "c1", "amount": "100", "backer": "0x..." },
    { "campaignId": "c1", "amount": "200", "backer": "0x..." }
  ],
  "createdBy": "0x..."
}

# Get bulk operation status
GET /v1/enterprise/orgs/:orgId/bulk/:operationId

# Create API key
POST /v1/enterprise/orgs/:orgId/api-keys
{
  "name": "Production API",
  "permissions": ["campaign:read", "pledge:write"],
  "createdBy": "0x..."
}

# List API keys
GET /v1/enterprise/orgs/:orgId/api-keys

# Revoke API key
DELETE /v1/enterprise/orgs/:orgId/api-keys/:keyId
```

#### Team Roles

| Role | Permissions |
|------|-------------|
| `owner` | Full control including deletion |
| `admin` | Manage team, settings, API keys |
| `creator` | Create and manage campaigns |
| `moderator` | Moderate comments and disputes |
| `viewer` | Read-only access |

#### Billing Plans

| Plan | Campaigns | Members | Features |
|------|-----------|---------|----------|
| `starter` | 5 | 3 | Basic features |
| `professional` | 50 | 10 | SSO, custom domains |
| `enterprise` | Unlimited | Unlimited | SLA, dedicated support |

### Risk API (Phase 9)

Creator verification, trust scoring, and fraud detection:

```bash
# Request verification
POST /v1/risk/verify
{
  "address": "0x...",
  "type": "identity",
  "level": "standard"
}

# Get verification status
GET /v1/risk/verify/:address

# Calculate trust score
POST /v1/risk/score/:address
{
  "stats": {
    "campaignsCreated": 5,
    "campaignsSuccessful": 4,
    "totalRaised": "50000",
    "avgCompletionRate": 0.92,
    "disputeCount": 1,
    "accountAgeDays": 365
  }
}

# Assess risk for entity
POST /v1/risk/assess
{
  "entityType": "campaign",
  "entityId": "campaign_123",
  "data": {
    "amount": "100000",
    "creatorAddress": "0x...",
    "category": "creative"
  }
}

# Get active alerts
GET /v1/risk/alerts?severity=high&status=open

# Add to blocklist
POST /v1/risk/blocklist
{
  "type": "address",
  "value": "0x...",
  "reason": "Confirmed fraud",
  "severity": "critical"
}

# Check blocklist
GET /v1/risk/blocklist/check?type=address&value=0x...
```

#### Verification Types

| Type | Description | Requirements |
|------|-------------|--------------|
| `identity` | KYC identity verification | Government ID |
| `social` | Social media verification | Connected accounts |
| `business` | Business verification | Registration docs |
| `track_record` | Historical performance | Platform history |

#### Trust Tiers

| Tier | Score Range | Benefits |
|------|-------------|----------|
| `new` | 0-25 | Standard limits |
| `established` | 26-50 | Increased limits |
| `trusted` | 51-75 | Reduced fees |
| `verified` | 76-100 | Premium features |

#### Risk Levels

| Level | Action |
|-------|--------|
| `low` | Auto-approve |
| `medium` | Enhanced monitoring |
| `high` | Manual review required |
| `critical` | Block pending review |

### Notifications API (Phase 10)

Multi-channel notification system with templates, preferences, and digests:

```bash
# Send notification
POST /v1/notifications
{
  "userId": "user_123",
  "type": "pledge_created",
  "channels": ["email", "in_app"],
  "data": {
    "campaignName": "Portland Marathon",
    "amount": "50.00"
  }
}

# Send bulk notifications
POST /v1/notifications/bulk
{
  "userIds": ["user_1", "user_2"],
  "type": "campaign_update",
  "data": { ... }
}

# Get notification preferences
GET /v1/notifications/preferences/:userId

# Update preferences
PUT /v1/notifications/preferences/:userId
{
  "channels": {
    "email": true,
    "push": true,
    "in_app": true,
    "sms": false
  },
  "types": {
    "campaign_created": ["email", "in_app"],
    "pledge_released": ["email", "push", "in_app"],
    "milestone_verified": ["push", "in_app"]
  },
  "quietHours": {
    "enabled": true,
    "start": "22:00",
    "end": "08:00",
    "timezone": "America/Los_Angeles"
  }
}

# Register device for push notifications
POST /v1/notifications/devices
{
  "userId": "user_123",
  "platform": "ios",
  "token": "device_token_here"
}

# Get in-app notifications
GET /v1/notifications/in-app/:userId?unreadOnly=true&limit=50

# Mark as read
PUT /v1/notifications/in-app/:notificationId/read

# Archive notification
PUT /v1/notifications/in-app/:notificationId/archive

# Generate digest
POST /v1/notifications/digest
{
  "userId": "user_123",
  "period": "daily"
}

# Get notification stats
GET /v1/notifications/stats
```

#### Notification Types

| Type | Description | Default Channels |
|------|-------------|------------------|
| `welcome` | New user welcome | email, in_app |
| `campaign_created` | Campaign created | email, in_app |
| `pledge_created` | New pledge | email, push, in_app |
| `pledge_released` | Funds released | email, push, in_app |
| `milestone_verified` | Milestone completed | push, in_app |
| `dispute_created` | New dispute | email, in_app |
| `dispute_resolved` | Dispute resolved | email, push, in_app |
| `commemorative_ready` | Token ready to mint | email, push, in_app |

#### Digest Periods

- `daily`: Once per day
- `weekly`: Once per week
- `monthly`: Monthly summary

### Internationalization API (Phase 10)

Multi-language support with 12 locales and currency conversion:

```bash
# Get supported locales
GET /v1/i18n/locales

# Translate text
POST /v1/i18n/translate
{
  "key": "campaign.pledge_count",
  "locale": "es",
  "params": { "count": 5 },
  "namespace": "campaigns"
}

# Translate multiple keys
POST /v1/i18n/translate/batch
{
  "keys": [
    { "key": "campaign.title", "namespace": "campaigns" },
    { "key": "common.submit", "namespace": "common" }
  ],
  "locale": "fr"
}

# Get translation bundle
GET /v1/i18n/bundles/:locale?namespace=campaigns

# Set translation (admin)
POST /v1/i18n/translations
{
  "locale": "de",
  "namespace": "campaigns",
  "key": "new_key",
  "value": "German translation"
}

# Format date
POST /v1/i18n/format/date
{
  "date": "2026-04-06T10:30:00Z",
  "locale": "ja",
  "format": "long"
}

# Format number
POST /v1/i18n/format/number
{
  "number": 1234567.89,
  "locale": "de",
  "style": "decimal"
}

# Format currency
POST /v1/i18n/format/currency
{
  "amount": 50.00,
  "currency": "USD",
  "locale": "fr"
}

# Get supported currencies
GET /v1/i18n/currencies

# Get exchange rates
GET /v1/i18n/currencies/rates?base=USD

# Convert currency
POST /v1/i18n/currencies/convert
{
  "amount": 100,
  "from": "USD",
  "to": "EUR"
}

# Get user locale preferences
GET /v1/i18n/preferences/:userId

# Update locale preferences
PUT /v1/i18n/preferences/:userId
{
  "locale": "es",
  "currency": "EUR",
  "timezone": "Europe/Madrid"
}
```

#### Supported Locales

| Code | Language | Direction |
|------|----------|-----------|
| `en` | English | LTR |
| `es` | Spanish | LTR |
| `fr` | French | LTR |
| `de` | German | LTR |
| `pt` | Portuguese | LTR |
| `ja` | Japanese | LTR |
| `zh` | Chinese (Simplified) | LTR |
| `zh-TW` | Chinese (Traditional) | LTR |
| `ko` | Korean | LTR |
| `ar` | Arabic | RTL |
| `ru` | Russian | LTR |
| `it` | Italian | LTR |

#### Supported Currencies

USD, EUR, GBP, JPY, CNY, KRW, BRL, MXN, INR, AUD, CAD, CHF, USDC, ETH

### Reports API (Phase 10)

Financial reports, tax documents, and data exports:

```bash
# Generate report
POST /v1/reports
{
  "type": "financial_summary",
  "userId": "user_123",
  "dateRange": {
    "start": "2025-01-01",
    "end": "2025-12-31"
  },
  "format": "pdf"
}

# Get report status
GET /v1/reports/:reportId

# List user reports
GET /v1/reports?userId=user_123&type=tax_summary

# Download report
GET /v1/reports/:reportId/download

# Get financial summary
GET /v1/reports/financial/:userId?year=2025

# Get transaction history
GET /v1/reports/transactions/:userId?limit=100&offset=0

# Get tax summary
GET /v1/reports/tax/:userId?year=2025

# Generate tax form
POST /v1/reports/tax/:userId/form
{
  "formType": "1099-MISC",
  "year": 2025
}

# Get campaign performance report
GET /v1/reports/campaign/:campaignId

# Get backer activity report
GET /v1/reports/backer/:userId

# Get audit trail
GET /v1/reports/audit/:entityType/:entityId?limit=100

# Export data
POST /v1/reports/export
{
  "type": "campaigns",
  "userId": "user_123",
  "format": "csv",
  "filters": {
    "status": "resolved",
    "dateRange": { "start": "2025-01-01", "end": "2025-12-31" }
  }
}

# Schedule recurring report
POST /v1/reports/scheduled
{
  "userId": "user_123",
  "type": "financial_summary",
  "frequency": "monthly",
  "format": "pdf",
  "deliveryMethod": "email"
}

# List scheduled reports
GET /v1/reports/scheduled?userId=user_123

# Cancel scheduled report
DELETE /v1/reports/scheduled/:scheduleId
```

#### Report Types

| Type | Description |
|------|-------------|
| `financial_summary` | Income, expenses, balances |
| `transaction_history` | All transactions |
| `payout_report` | Creator payouts |
| `tax_summary` | Tax year summary |
| `campaign_performance` | Campaign metrics |
| `backer_activity` | Backer history |
| `audit_trail` | Activity audit |
| `dispute_summary` | Dispute history |

#### Tax Forms

| Form | Use Case |
|------|----------|
| `1099-MISC` | US creator earnings |
| `1099-K` | High-volume creators |
| `W-9` | US tax ID collection |
| `W-8BEN` | International creators |

### Integrations API (Phase 10)

Third-party integrations with Slack, Discord, Zapier, and more:

```bash
# List integrations
GET /v1/integrations?userId=user_123

# Get integration details
GET /v1/integrations/:integrationId

# Create integration
POST /v1/integrations
{
  "userId": "user_123",
  "type": "slack",
  "name": "Team Notifications",
  "config": {
    "workspaceId": "T12345678",
    "channelId": "C12345678"
  },
  "events": ["campaign_created", "milestone_verified"]
}

# Update integration
PUT /v1/integrations/:integrationId
{
  "events": ["pledge_released", "campaign_resolved"],
  "active": true
}

# Delete integration
DELETE /v1/integrations/:integrationId

# Start OAuth flow
POST /v1/integrations/oauth/start
{
  "type": "slack",
  "userId": "user_123",
  "redirectUri": "https://myapp.com/callback"
}

# Handle OAuth callback
POST /v1/integrations/oauth/callback
{
  "state": "oauth_state_token",
  "code": "authorization_code"
}

# Send message via integration
POST /v1/integrations/:integrationId/message
{
  "eventType": "campaign_created",
  "data": {
    "campaignId": "campaign_123",
    "campaignName": "Portland Marathon",
    "creatorName": "Sarah Chen"
  }
}

# Test integration
POST /v1/integrations/:integrationId/test

# Broadcast event to all integrations
POST /v1/integrations/broadcast
{
  "userId": "user_123",
  "eventType": "milestone_verified",
  "data": { ... }
}

# Get integration stats
GET /v1/integrations/stats?userId=user_123
```

#### Integration Types

| Type | Description | OAuth Required |
|------|-------------|----------------|
| `slack` | Slack workspace | Yes |
| `discord` | Discord server | Yes |
| `zapier` | Zapier webhooks | No |
| `telegram` | Telegram bot | No |
| `calendar` | Google Calendar | Yes |
| `webhook` | Custom webhooks | No |

#### Integration Events

- `campaign_created`, `campaign_resolved`, `campaign_cancelled`
- `pledge_created`, `pledge_released`, `pledge_refunded`
- `milestone_verified`, `milestone_failed`
- `dispute_created`, `dispute_resolved`
- `commemorative_ready`

### Advanced Campaigns API (Phase 10)

Recurring campaigns, stretch goals, scheduling, and series:

```bash
# Create recurring campaign
POST /v1/campaigns/advanced/recurring
{
  "baseCampaignId": "campaign_123",
  "frequency": "monthly",
  "schedule": {
    "dayOfMonth": 1,
    "hour": 9,
    "minute": 0
  },
  "settings": {
    "autoRenewPledges": true,
    "carryOverMilestones": false,
    "maxInstances": 12
  }
}

# List recurring campaigns
GET /v1/campaigns/advanced/recurring?creatorId=user_123

# Get recurring campaign
GET /v1/campaigns/advanced/recurring/:recurringId

# Update recurring campaign
PUT /v1/campaigns/advanced/recurring/:recurringId
{
  "settings": { "maxInstances": 24 }
}

# Pause recurring campaign
POST /v1/campaigns/advanced/recurring/:recurringId/pause

# Resume recurring campaign
POST /v1/campaigns/advanced/recurring/:recurringId/resume

# Cancel recurring campaign
POST /v1/campaigns/advanced/recurring/:recurringId/cancel

# Get recurring instances
GET /v1/campaigns/advanced/recurring/:recurringId/instances

# Create instance manually
POST /v1/campaigns/advanced/recurring/:recurringId/instances

# Create stretch goal
POST /v1/campaigns/advanced/stretch-goals
{
  "campaignId": "campaign_123",
  "title": "Bonus Mile Challenge",
  "description": "Extra reward for reaching stretch goal",
  "type": "amount",
  "target": "10000",
  "rewards": [
    {
      "type": "bonus_payout",
      "description": "10% bonus to charity",
      "value": { "percentage": 10 }
    }
  ]
}

# Get campaign stretch goals
GET /v1/campaigns/advanced/stretch-goals?campaignId=campaign_123

# Update stretch goal progress
PUT /v1/campaigns/advanced/stretch-goals/:goalId/progress
{ "currentValue": "7500" }

# Complete stretch goal
POST /v1/campaigns/advanced/stretch-goals/:goalId/complete

# Schedule campaign launch
POST /v1/campaigns/advanced/schedule
{
  "campaignId": "campaign_123",
  "launchAt": "2026-03-01T09:00:00Z",
  "timezone": "America/Los_Angeles",
  "announcements": [
    {
      "type": "email",
      "timing": "1_day_before",
      "template": "launch_reminder"
    }
  ]
}

# Get scheduled launches
GET /v1/campaigns/advanced/schedule?status=pending

# Cancel scheduled launch
DELETE /v1/campaigns/advanced/schedule/:scheduleId

# Schedule action
POST /v1/campaigns/advanced/actions
{
  "campaignId": "campaign_123",
  "actionType": "send_reminder",
  "scheduledFor": "2026-03-15T09:00:00Z",
  "data": { "message": "Don't forget to pledge!" }
}

# Create campaign series
POST /v1/campaigns/advanced/series
{
  "name": "Annual Marathon Series",
  "description": "Yearly Portland Marathon campaigns",
  "creatorId": "user_123",
  "campaigns": ["campaign_2024", "campaign_2025", "campaign_2026"]
}

# Get campaign series
GET /v1/campaigns/advanced/series/:seriesId

# Add campaign to series
POST /v1/campaigns/advanced/series/:seriesId/campaigns
{ "campaignId": "campaign_2027" }

# Get series statistics
GET /v1/campaigns/advanced/series/:seriesId/stats

# Schedule milestone
POST /v1/campaigns/advanced/milestones/schedule
{
  "campaignId": "campaign_123",
  "milestoneId": "milestone_1",
  "expectedDate": "2026-04-06",
  "reminders": [
    { "daysBefore": 7, "channels": ["email"] },
    { "daysBefore": 1, "channels": ["push", "email"] }
  ],
  "autoVerify": false
}

# Get funding prediction
GET /v1/campaigns/advanced/predictions/:campaignId

# Get funding velocity
GET /v1/campaigns/advanced/velocity/:campaignId
```

#### Recurrence Frequencies

| Frequency | Description |
|-----------|-------------|
| `daily` | Every day |
| `weekly` | Every week |
| `monthly` | Every month |
| `quarterly` | Every 3 months |
| `yearly` | Every year |

#### Stretch Goal Types

| Type | Target Based On |
|------|-----------------|
| `amount` | Total pledged amount |
| `backers` | Number of backers |
| `milestone` | Specific milestone achieved |

#### Scheduled Actions

| Action | Description |
|--------|-------------|
| `send_reminder` | Send reminder to backers |
| `post_update` | Post campaign update |
| `activate_stretch_goal` | Activate a stretch goal |
| `close_pledging` | Stop accepting pledges |
| `extend_deadline` | Extend campaign deadline |

### Developer Tools (Phase 9)

CLI and local sandbox for development:

```bash
# Install CLI
npm install -g @pledge-protocol/cli

# CLI Commands
pledge create-campaign --name "Test Campaign" --beneficiary 0x...
pledge list-campaigns --status active
pledge create-pledge --campaign campaign_123 --amount 50
pledge sandbox start --port 8545
pledge simulate resolve --campaign campaign_123
pledge generate-fixtures --output ./test/fixtures
pledge config set apiKey YOUR_API_KEY
```

#### Local Sandbox

```typescript
import { createSandbox } from "@pledge-protocol/dev-tools";

// Start local environment
const sandbox = createSandbox({
  chainId: 31337,
  blockTime: 1000,
  initialBalance: "1000000000000000000000",
});

await sandbox.start();

// Create test campaign
const campaign = sandbox.createCampaign({
  name: "Test Marathon",
  beneficiary: "0x...",
  deadline: Date.now() + 86400000,
  milestones: [{ name: "Finish", required: true }],
});

// Create pledge
const pledge = sandbox.createPledge({
  campaignId: campaign.id,
  backer: "0x...",
  amount: "50000000000000000000",
});

// Simulate oracle response
const result = await sandbox.queryOracle("SELECT * FROM race_results");

// Verify milestone
await sandbox.verifyMilestone(campaign.id, "milestone_1");

// Resolve campaign
await sandbox.resolveCampaign(campaign.id);

// Stop sandbox
await sandbox.stop();
```

#### Test Fixtures

```typescript
import { createSandbox } from "@pledge-protocol/dev-tools";

const sandbox = createSandbox();
await sandbox.start();

// Generate comprehensive test data
const fixtures = sandbox.generateFixtures({
  campaigns: 10,
  pledgesPerCampaign: 5,
  resolvedPercentage: 0.5,
});

// Export for external testing
await sandbox.exportFixtures("./test/fixtures.json");
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
- **Phase 9** ✅: Enterprise (payments, compliance, organizations, risk, developer tools)
- **Phase 10** ✅: Platform maturity (notifications, i18n, reporting, integrations, advanced campaigns)

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
│       ├── chains.ts           # Phase 8
│       ├── payments.ts         # Phase 9
│       ├── compliance.ts       # Phase 9
│       ├── enterprise.ts       # Phase 9
│       ├── risk.ts             # Phase 9
│       ├── notifications.ts    # Phase 10
│       ├── reports.ts          # Phase 10
│       ├── integrations.ts     # Phase 10
│       ├── i18n.ts             # Phase 10
│       └── campaigns-advanced.ts # Phase 10
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
├── payments/        # Fiat payments (Phase 9)
│   ├── types.ts
│   ├── stripe-provider.ts
│   ├── circle-provider.ts
│   ├── settlement-service.ts
│   └── payment-processor.ts
├── compliance/      # GDPR/CCPA compliance (Phase 9)
│   ├── types.ts
│   └── gdpr-service.ts
├── enterprise/      # Organization management (Phase 9)
│   ├── types.ts
│   └── organization-service.ts
├── risk/            # Fraud detection (Phase 9)
│   ├── types.ts
│   └── fraud-detector.ts
├── dev-tools/       # Developer tools (Phase 9)
│   ├── types.ts
│   ├── cli.ts
│   └── sandbox.ts
├── notifications-v2/ # Notifications (Phase 10)
│   ├── types.ts
│   └── notification-service.ts
├── i18n/            # Internationalization (Phase 10)
│   ├── types.ts
│   └── translation-service.ts
├── reporting/       # Reports & exports (Phase 10)
│   ├── types.ts
│   └── report-service.ts
├── integrations/    # Third-party integrations (Phase 10)
│   ├── types.ts
│   └── integration-service.ts
├── campaigns-advanced/ # Advanced campaigns (Phase 10)
│   ├── types.ts
│   └── advanced-campaign-service.ts
└── database/        # PostgreSQL schema

test/                # Test suites
```

## License

[TBD]

## Contributing

[TBD]
