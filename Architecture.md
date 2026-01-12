# Pledge Protocol - Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      NatLangChain                               │
│                   (Base Protocol Layer)                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Pledge Protocol                             │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │  Campaign   │  │   Pledge    │  │   Oracle    │            │
│  │  Registry   │  │   Manager   │  │   Router    │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
│         │                │                │                    │
│         ▼                ▼                ▼                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │   Escrow    │  │   Token     │  │Commemorative│            │
│  │   Vault     │  │   Minter    │  │   Minter    │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External Oracles                             │
│  Race APIs │ Academic DBs │ GitHub │ Custom Attestations        │
└─────────────────────────────────────────────────────────────────┘
```

## Core Contracts

### Campaign Contract

The root entity. Defines what's being funded and how success is measured.

```
Campaign {
  id: CampaignID
  
  // Identity
  name: string
  description: string                // Human-readable purpose
  creator: Address                   // Who set this up
  created_at: Timestamp
  
  // Beneficiary
  beneficiary: Address               // Where funds go on success
  beneficiary_name: string           // Human-readable name
  
  // Subject (optional - the person doing the thing)
  subject: Subject | null
  
  // Timeline
  pledge_window_start: Timestamp
  pledge_window_end: Timestamp
  event_date: Timestamp | null       // When the thing happens
  resolution_deadline: Timestamp     // Must resolve by this time
  
  // Milestones
  milestones: Milestone[]
  
  // Pledge configuration
  pledge_types: PledgeType[]
  minimum_pledge: Amount
  maximum_pledge: Amount | null
  
  // State
  status: "draft" | "active" | "event_complete" | "resolved" | "expired" | "cancelled"
  total_escrowed: Amount
  total_released: Amount
  total_returned: Amount
}
```

### Subject

The person or entity performing the action being pledged against.

```
Subject {
  id: SubjectID
  name: string
  identifier: string                 // Bib number, student ID, GitHub handle, etc.
  verification_source: OracleID      // How we verify their results
}
```

### Milestone

A verifiable condition that triggers fund release.

```
Milestone {
  id: MilestoneID
  campaign_id: CampaignID
  
  // Definition
  name: string
  description: string                // Human-readable condition
  
  // Verification
  oracle_id: OracleID
  condition: MilestoneCondition      // What the oracle must return
  
  // Fund allocation
  release_percentage: number         // % of escrow released on completion
  
  // State
  status: "pending" | "verified" | "failed" | "expired"
  verified_at: Timestamp | null
  oracle_response: OracleData | null
}
```

### MilestoneCondition

Machine-readable condition for oracle verification.

```
MilestoneCondition {
  type: "completion" | "threshold" | "range" | "custom"
  
  // For completion: just needs to happen
  // For threshold: value must exceed minimum
  // For range: value must fall within bounds
  // For custom: arbitrary condition logic
  
  field: string                      // What field from oracle response
  operator: "exists" | "eq" | "gt" | "gte" | "lt" | "lte" | "between"
  value: any                         // Comparison value(s)
}
```

### PledgeType

Configuration for how backers can pledge.

```
PledgeType {
  id: PledgeTypeID
  campaign_id: CampaignID
  
  name: string                       // "Per Mile", "Completion Bonus", etc.
  description: string
  
  calculation: PledgeCalculation
  
  minimum: Amount
  maximum: Amount | null
  
  enabled: boolean
}

PledgeCalculation {
  type: "flat" | "per_unit" | "tiered" | "conditional"
  
  // Flat: fixed amount
  // Per unit: amount × units completed
  // Tiered: different rates at different thresholds
  // Conditional: amount if condition met, else zero
  
  base_amount: Amount | null
  per_unit_amount: Amount | null
  unit_field: string | null          // Oracle field for unit count
  cap: Amount | null                 // Maximum regardless of calculation
  
  condition: MilestoneCondition | null  // For conditional pledges
}
```

## Pledge Management

### Pledge

Individual backer's commitment.

```
Pledge {
  id: PledgeID
  campaign_id: CampaignID
  pledge_type_id: PledgeTypeID
  
  // Backer
  backer: Address
  backer_name: string | null         // Optional, for commemorative
  
  // Commitment
  calculation_params: Record<string, any>  // Per-unit rate, conditions, etc.
  escrowed_amount: Amount            // Funds locked
  
  // State
  status: "active" | "resolved" | "refunded" | "cancelled"
  created_at: Timestamp
  resolved_at: Timestamp | null
  
  // Resolution
  final_amount: Amount | null        // Actual amount released
  commemorative_id: CommemorativeID | null
}
```

### PledgeToken

On-chain representation of an active pledge. Held in backer's wallet.

```
PledgeToken (NFT) {
  token_id: TokenID
  pledge_id: PledgeID
  campaign_id: CampaignID
  
  // Display metadata
  campaign_name: string
  subject_name: string
  beneficiary_name: string
  pledge_type: string
  escrowed_amount: Amount
  max_potential: Amount
  status: string
  
  // Visual
  image_uri: URI                     // Generated pledge card image
  
  // Transferable during active period (optional per campaign)
  transferable: boolean
}
```

## Escrow System

### EscrowVault

Holds funds for a campaign until resolution.

```
EscrowVault {
  campaign_id: CampaignID
  
  total_balance: Amount
  
  // Tracking by pledge
  pledge_balances: Map<PledgeID, Amount>
  
  // State
  locked: boolean                    // True during event, prevents withdrawals
  
  // Release rules
  release_address: Address           // Beneficiary
  refund_enabled: boolean            // Can backers cancel before event?
}
```

### Escrow Operations

```
deposit(pledge_id, amount)
  - Transfers funds from backer to vault
  - Updates pledge_balances
  - Emits DepositEvent

release(pledge_id, amount)
  - Transfers funds from vault to beneficiary
  - Updates pledge_balances
  - Requires oracle verification
  - Emits ReleaseEvent

refund(pledge_id, amount)
  - Returns funds from vault to backer
  - Updates pledge_balances
  - Only if milestone failed or campaign expired
  - Emits RefundEvent

partial_release(pledge_id, release_amount, refund_amount)
  - For per-unit pledges where partial completion
  - Release calculated portion, refund remainder
```

## Oracle System

### Oracle Registry

```
Oracle {
  id: OracleID
  
  name: string
  description: string
  
  // Type
  type: "api" | "attestation" | "aggregator"
  
  // Connection
  endpoint: URI | null               // For API oracles
  attestor: Address | null           // For attestation oracles
  sources: OracleID[] | null         // For aggregator oracles
  
  // Trust
  trust_level: "official" | "verified" | "community" | "custom"
  verification_method: string        // How this oracle is validated
  
  // Schema
  response_schema: JSONSchema        // Expected response format
  
  // Status
  active: boolean
  last_response: Timestamp | null
}
```

### Built-in Oracle Types

**Race Timing APIs**
```
RaceTimingOracle {
  type: "api"
  endpoint: "https://api.racetiming.com/results"
  
  query_params: {
    event_id: string
    bib_number: string
  }
  
  response_schema: {
    status: "finished" | "dnf" | "dns"
    time_seconds: number
    distance_miles: number
    pace_per_mile: number
    placement_overall: number
    placement_division: number
  }
}
```

**Academic Verification**
```
AcademicOracle {
  type: "api"
  endpoint: "https://clearinghouse.edu/verify"
  
  query_params: {
    student_id: string
    institution: string
  }
  
  response_schema: {
    enrolled: boolean
    credits_completed: number
    gpa: number | null
    graduation_date: date | null
    degree_conferred: string | null
  }
}
```

**GitHub Activity**
```
GitHubOracle {
  type: "api"
  endpoint: "https://api.github.com"
  
  query_params: {
    repo: string
    pr_number: number | null
    commit_sha: string | null
  }
  
  response_schema: {
    pr_merged: boolean
    commit_in_main: boolean
    tests_passing: boolean
    merged_at: timestamp | null
  }
}
```

**Manual Attestation**
```
AttestationOracle {
  type: "attestation"
  attestor: Address                  // Trusted party's address
  
  // Attestor signs a statement confirming milestone
  attestation_schema: {
    campaign_id: CampaignID
    milestone_id: MilestoneID
    completed: boolean
    evidence_uri: URI | null
    notes: string | null
    signed_at: Timestamp
  }
}
```

### Oracle Router

Manages oracle queries and response validation.

```
OracleRouter {
  
  query(oracle_id, params) → OracleResponse
    - Fetches data from oracle
    - Validates against schema
    - Caches response
    - Returns structured data
  
  verify_milestone(milestone_id) → VerificationResult
    - Queries appropriate oracle
    - Evaluates milestone condition
    - Returns pass/fail with evidence
  
  subscribe(campaign_id, callback)
    - Listens for oracle updates
    - Triggers resolution when data available
}
```

## Resolution Engine

### Resolution Flow

```
1. Event completes (race ends, semester ends, PR merges)

2. Oracle data becomes available
   - API polled or webhook received
   - Attestation submitted
   
3. Resolution triggered
   - Automatic: Oracle router detects new data
   - Manual: Campaign creator initiates
   
4. For each milestone:
   - Query oracle
   - Evaluate condition
   - Update milestone status
   
5. For each pledge:
   - Calculate final amount based on oracle data
   - Execute escrow operations (release/refund)
   - Update pledge status
   
6. Mint commemoratives
   - Generate final token for each resolved pledge
   - Transfer to backer's wallet
   
7. Campaign marked resolved
```

### PledgeResolver

```
PledgeResolver {
  
  resolve_campaign(campaign_id)
    - Verify all milestones
    - Calculate all pledge amounts
    - Execute all escrow operations
    - Mint all commemoratives
    - Update campaign status
  
  calculate_pledge_amount(pledge, oracle_data) → Amount
    - Apply pledge calculation rules
    - Handle per-unit multiplication
    - Apply caps
    - Return final amount
  
  handle_failure(campaign_id)
    - Milestone failed or deadline passed
    - Refund all escrowed funds
    - Mint failure commemoratives (optional)
    - Update statuses
}
```

## Commemorative System

### Commemorative Token

Final, non-transferable proof of backing.

```
Commemorative (Soulbound NFT) {
  token_id: TokenID
  
  // Origin
  pledge_id: PledgeID
  campaign_id: CampaignID
  
  // Backer
  holder: Address
  backer_name: string | null
  
  // Campaign details
  campaign_name: string
  subject_name: string
  beneficiary_name: string
  
  // Results
  outcome_summary: string            // "Completed 26.2 miles in 3:47:22"
  contribution_amount: Amount
  total_campaign_raised: Amount
  
  // Timestamps
  pledged_at: Timestamp
  resolved_at: Timestamp
  
  // Visual
  image_uri: URI                     // Generated commemorative image
  metadata_uri: URI                  // Full metadata JSON
  
  // Soulbound
  transferable: false
}
```

### Commemorative Generator

Creates visual representation of the commemorative.

```
CommemorativeGenerator {
  
  generate(pledge, campaign, oracle_data) → CommemorativeAsset
    - Pulls campaign branding/template
    - Fills in result data
    - Renders image (SVG or PNG)
    - Stores to IPFS/Arweave
    - Returns URIs
  
  Templates:
    - Race finish (bib-style with results)
    - Academic (diploma-style)
    - Creative (album art with backer credit)
    - Generic (clean card with details)
}
```

## NatLangChain Integration

### Pledge as NatLangChain Contract

Every pledge is a valid NatLangChain document:

```
CONTRACT: Pledge Agreement
ID: pledge_7f3a2b1c
Created: 2026-03-15T14:22:00Z

PARTIES:
  Backer: Mike Thompson (0x7a3f...)
  Beneficiary: Portland Habitat for Humanity (0x9c2e...)
  Subject: Sarah Chen

INTENT:
  Mike Thompson pledges financial support for Sarah Chen's
  participation in the Portland Marathon 2026, with proceeds
  benefiting Portland Habitat for Humanity.

COMMITMENT:
  Amount: $2.00 USD per mile completed
  Maximum: $60.00 USD
  Escrowed: $60.00 USD (locked)

CONDITIONS:
  Verification Source: Portland Marathon Official Results API
  Subject Identifier: Bib #4471
  Resolution Deadline: 2026-04-14T23:59:59Z
  
RESOLUTION:
  On verification of race completion:
    - Miles completed × $2.00 released to Beneficiary
    - Remainder returned to Backer
    - Commemorative token issued to Backer
    
  On deadline without verification:
    - Full escrow returned to Backer
    - Expired commemorative token issued (optional)

SIGNATURES:
  Backer: [cryptographic signature]
  Protocol: [protocol attestation]
```

This document is:
- Human readable
- Machine executable
- Legally meaningful (intent is explicit)
- Permanently stored on NatLangChain

### IntentLog Integration

All pledge activity recorded in IntentLog:

```
IntentLog Entries:
  - Campaign created: intent to raise funds for X
  - Pledge created: intent to support subject
  - Escrow deposited: commitment made binding
  - Milestone verified: condition satisfied
  - Funds released: commitment fulfilled
  - Commemorative minted: proof of participation
```

Full audit trail of the entire pledge lifecycle.

## API Surface

### Campaign Management

```
POST   /campaigns                    Create new campaign
GET    /campaigns/:id                Get campaign details
PATCH  /campaigns/:id                Update campaign (draft only)
POST   /campaigns/:id/activate       Activate campaign
POST   /campaigns/:id/resolve        Trigger resolution

GET    /campaigns/:id/pledges        List pledges for campaign
GET    /campaigns/:id/milestones     List milestones
GET    /campaigns/:id/stats          Aggregated statistics
```

### Pledge Operations

```
POST   /pledges                      Create pledge (escrow funds)
GET    /pledges/:id                  Get pledge details
DELETE /pledges/:id                  Cancel pledge (if allowed)

GET    /pledges/:id/token            Get pledge token metadata
GET    /pledges/:id/commemorative    Get commemorative (after resolution)
```

### Oracle Operations

```
GET    /oracles                      List available oracles
GET    /oracles/:id                  Get oracle details
POST   /oracles/:id/query            Manual oracle query

POST   /attestations                 Submit attestation (for attestor)
```

### Backer Queries

```
GET    /backers/:address/pledges     All pledges for address
GET    /backers/:address/commemoratives  All commemoratives
```

## Privacy Layers

### Public Campaigns

Default. All data visible:
- Campaign details
- Pledge amounts
- Backer addresses
- Results

### Semi-Private Campaigns

- Campaign visible
- Pledge amounts hidden until resolution
- Backer addresses pseudonymous
- Aggregates visible (total raised, backer count)

### Private Campaigns

- Campaign visible only via direct link
- Pledges visible only to backer and creator
- Results shared only with participants

### Soulbound Commemoratives

Non-transferable by default. Options:
- Fully soulbound (cannot transfer ever)
- Time-locked (transferable after N days)
- Transferable (can sell/gift)

Campaign creator chooses appropriate level.

## Deployment Architecture

### On-Chain Components

- Campaign Registry (contract)
- Pledge Manager (contract)
- Escrow Vault (contract)
- Token contracts (Pledge NFT, Commemorative NFT)

### Off-Chain Components

- Oracle Router (service)
- Commemorative Generator (service)
- API Gateway (service)
- Indexer (service)

### Storage

- Campaign metadata: IPFS/Arweave
- Commemorative assets: IPFS/Arweave
- Oracle responses: cached in DB, anchored on-chain
- NatLangChain contracts: NatLangChain network

## Development Phases

### Phase 1: Core Protocol
- Campaign and Pledge contracts
- Basic escrow operations
- Manual attestation oracle
- Simple flat pledges

### Phase 2: Oracle Integration
- API oracle framework
- Race timing integration
- Automated resolution

### Phase 3: Token System
- Pledge token minting
- Commemorative generation
- Wallet integration

### Phase 4: Advanced Pledges
- Per-unit calculations
- Conditional pledges
- Tiered structures

### Phase 5: Ecosystem
- Additional oracle types
- Campaign templates
- Hosted implementation for non-technical organizers
- Mobile companion app for backers
