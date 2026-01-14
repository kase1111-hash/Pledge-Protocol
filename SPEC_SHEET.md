# Pledge Protocol - Technical Specification Sheet

> Milestone-verified crowdfunding with commemorative proof of backing on NatLangChain

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tech Stack](#2-tech-stack)
3. [Data Models](#3-data-models)
4. [Smart Contracts](#4-smart-contracts)
5. [API Specification](#5-api-specification)
6. [Oracle System](#6-oracle-system)
7. [Token Standards](#7-token-standards)
8. [Resolution Engine](#8-resolution-engine)
9. [Storage Architecture](#9-storage-architecture)
10. [Security Requirements](#10-security-requirements)
11. [Development Phases](#11-development-phases)
12. [Testing Requirements](#12-testing-requirements)

---

## 1. Overview

### 1.1 Purpose
Build a milestone-verified crowdfunding protocol where:
- Backers escrow funds via pledge tokens
- Funds release only when verified milestones are completed
- Backers receive soulbound commemorative NFTs as proof of backing

### 1.2 Core Flow
```
Campaign Created → Pledges Escrowed → Event Occurs → Oracle Verifies →
Funds Released/Refunded → Commemorative Minted
```

### 1.3 Key Invariants
- Funds NEVER leave escrow without oracle verification
- All pledge amounts are deterministic based on oracle data
- Commemoratives are non-transferable by default
- Campaign resolution must occur before deadline or funds auto-refund

---

## 2. Tech Stack

### 2.1 On-Chain (Smart Contracts)
| Component | Technology |
|-----------|------------|
| Base Layer | NatLangChain |
| Contract Language | Solidity / NatLangChain DSL |
| Token Standard (Pledges) | ERC-721 (transferable NFT) |
| Token Standard (Commemoratives) | ERC-5192 (Soulbound) |

### 2.2 Off-Chain (Services)
| Component | Technology |
|-----------|------------|
| API Gateway | Node.js / Express or Fastify |
| Oracle Router | Node.js with cron/webhook handlers |
| Commemorative Generator | Node.js + Canvas/SVG renderer |
| Indexer | TheGraph or custom indexer |
| Database | PostgreSQL |
| Queue | Redis / Bull |

### 2.3 Storage
| Data Type | Storage |
|-----------|---------|
| Metadata/Assets | IPFS + Arweave (pinned) |
| Oracle Responses | PostgreSQL (cache) + On-chain anchor |
| NatLangChain Contracts | NatLangChain network |

---

## 3. Data Models

### 3.1 Campaign
```typescript
interface Campaign {
  id: string;                           // UUID

  // Identity
  name: string;                         // max 100 chars
  description: string;                  // max 2000 chars, markdown allowed
  creator: Address;                     // 0x... wallet address
  createdAt: Timestamp;                 // Unix timestamp

  // Beneficiary
  beneficiary: Address;                 // Where funds go on success
  beneficiaryName: string;              // Human-readable, max 100 chars

  // Subject (optional)
  subject: Subject | null;              // The person/entity performing

  // Timeline
  pledgeWindowStart: Timestamp;         // When pledging opens
  pledgeWindowEnd: Timestamp;           // When pledging closes
  eventDate: Timestamp | null;          // When the event happens
  resolutionDeadline: Timestamp;        // Must resolve by this time

  // Milestones
  milestones: Milestone[];              // At least 1 required

  // Pledge Configuration
  pledgeTypes: PledgeType[];            // At least 1 required
  minimumPledge: Amount;                // In base currency units (wei)
  maximumPledge: Amount | null;         // null = no max

  // State
  status: CampaignStatus;
  totalEscrowed: Amount;                // Current escrow balance
  totalReleased: Amount;                // Cumulative released
  totalRefunded: Amount;                // Cumulative refunded
  pledgeCount: number;                  // Total pledges

  // Privacy
  visibility: "public" | "semi-private" | "private";

  // Metadata
  imageUri: string;                     // Campaign banner image
  metadataUri: string;                  // Full metadata JSON on IPFS
}

type CampaignStatus =
  | "draft"           // Not yet activated
  | "active"          // Accepting pledges
  | "pledging_closed" // Event period
  | "resolved"        // Funds distributed
  | "expired"         // Deadline passed without resolution
  | "cancelled";      // Manually cancelled

type Amount = bigint;  // Wei or smallest currency unit
type Address = string; // 0x prefixed, checksummed
type Timestamp = number; // Unix seconds
```

### 3.2 Subject
```typescript
interface Subject {
  id: string;
  name: string;                         // max 100 chars
  identifier: string;                   // Bib #, student ID, GitHub handle
  verificationSource: string;           // OracleID reference
}
```

### 3.3 Milestone
```typescript
interface Milestone {
  id: string;
  campaignId: string;

  // Definition
  name: string;                         // max 50 chars
  description: string;                  // max 500 chars

  // Verification
  oracleId: string;
  condition: MilestoneCondition;

  // Fund Allocation
  releasePercentage: number;            // 0-100, all milestones must sum to 100

  // State
  status: MilestoneStatus;
  verifiedAt: Timestamp | null;
  oracleResponse: OracleData | null;
}

type MilestoneStatus = "pending" | "verified" | "failed" | "expired";

interface MilestoneCondition {
  type: "completion" | "threshold" | "range" | "custom";
  field: string;                        // Field path in oracle response
  operator: ConditionOperator;
  value: any;                           // Comparison value(s)
  valueEnd?: any;                       // For "between" operator
}

type ConditionOperator =
  | "exists"    // Field exists and is truthy
  | "eq"        // Equal to value
  | "gt"        // Greater than
  | "gte"       // Greater than or equal
  | "lt"        // Less than
  | "lte"       // Less than or equal
  | "between";  // Between value and valueEnd
```

### 3.4 PledgeType
```typescript
interface PledgeType {
  id: string;
  campaignId: string;

  name: string;                         // "Per Mile", "Completion Bonus"
  description: string;

  calculation: PledgeCalculation;

  minimum: Amount;
  maximum: Amount | null;

  enabled: boolean;
}

interface PledgeCalculation {
  type: "flat" | "per_unit" | "tiered" | "conditional";

  // Flat: fixed amount
  baseAmount: Amount | null;

  // Per-unit: amount × units
  perUnitAmount: Amount | null;
  unitField: string | null;             // Oracle field for unit count

  // Cap
  cap: Amount | null;                   // Maximum regardless of calc

  // Conditional
  condition: MilestoneCondition | null;

  // Tiered (array of thresholds)
  tiers?: PledgeTier[];
}

interface PledgeTier {
  threshold: number;                    // Unit threshold
  rate: Amount;                         // Rate at this tier
}
```

### 3.5 Pledge
```typescript
interface Pledge {
  id: string;
  campaignId: string;
  pledgeTypeId: string;

  // Backer
  backer: Address;
  backerName: string | null;            // Optional for commemorative

  // Commitment
  calculationParams: Record<string, any>; // Stored pledge params
  escrowedAmount: Amount;               // Funds locked

  // State
  status: PledgeStatus;
  createdAt: Timestamp;
  resolvedAt: Timestamp | null;

  // Resolution
  finalAmount: Amount | null;           // Actual released amount
  commemorativeId: string | null;       // Token ID after mint

  // Token
  tokenId: string;                      // Pledge NFT token ID
}

type PledgeStatus =
  | "active"    // Funds escrowed, awaiting resolution
  | "resolved"  // Successfully resolved
  | "refunded"  // Funds returned to backer
  | "cancelled"; // Cancelled by backer (if allowed)
```

### 3.6 Oracle
```typescript
interface Oracle {
  id: string;

  name: string;
  description: string;

  type: "api" | "attestation" | "aggregator";

  // API Oracle
  endpoint: string | null;
  authConfig: OracleAuthConfig | null;

  // Attestation Oracle
  attestor: Address | null;
  requiredSignatures: number;           // For multi-sig attestations

  // Aggregator Oracle
  sources: string[] | null;             // OracleIDs to aggregate
  aggregationMethod: "all" | "majority" | "any" | null;

  // Trust
  trustLevel: "official" | "verified" | "community" | "custom";

  // Schema
  responseSchema: JSONSchema;

  // Status
  active: boolean;
  lastResponse: Timestamp | null;
}

interface OracleAuthConfig {
  type: "api_key" | "oauth" | "none";
  headerName?: string;
  // Sensitive values stored in secrets manager
}
```

### 3.7 Commemorative
```typescript
interface Commemorative {
  tokenId: string;

  // Origin
  pledgeId: string;
  campaignId: string;

  // Holder
  holder: Address;                      // Permanent owner (soulbound)
  backerName: string | null;

  // Campaign Details
  campaignName: string;
  subjectName: string;
  beneficiaryName: string;

  // Results
  outcomeSummary: string;               // "26.2 miles in 3:47:22"
  contributionAmount: Amount;
  totalCampaignRaised: Amount;

  // Timestamps
  pledgedAt: Timestamp;
  resolvedAt: Timestamp;

  // Assets
  imageUri: string;                     // IPFS/Arweave URI
  metadataUri: string;

  // Soulbound config
  transferable: boolean;                // Usually false
  transferableAfter: Timestamp | null;  // For time-locked
}
```

---

## 4. Smart Contracts

### 4.1 Contract Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    CampaignRegistry                         │
│  - createCampaign()                                        │
│  - getCampaign()                                           │
│  - updateCampaignStatus()                                  │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ EscrowVault   │   │  PledgeManager  │   │  OracleRegistry │
│               │   │                 │   │                 │
│ - deposit()   │   │ - createPledge()│   │ - registerOracle│
│ - release()   │   │ - resolvePledge │   │ - submitData()  │
│ - refund()    │   │ - cancelPledge()│   │ - verifyData()  │
└───────────────┘   └─────────────────┘   └─────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        ▼                                           ▼
┌─────────────────────┐               ┌─────────────────────┐
│   PledgeToken       │               │ CommemorativeToken  │
│   (ERC-721)         │               │ (ERC-5192 Soulbound)│
│                     │               │                     │
│ - mint()            │               │ - mint()            │
│ - burn()            │               │ - locked()          │
│ - tokenURI()        │               │ - tokenURI()        │
└─────────────────────┘               └─────────────────────┘
```

### 4.2 CampaignRegistry Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ICampaignRegistry {

    struct CampaignData {
        address creator;
        address beneficiary;
        uint256 pledgeWindowStart;
        uint256 pledgeWindowEnd;
        uint256 resolutionDeadline;
        uint8 status;
        uint256 totalEscrowed;
        string metadataUri;
    }

    event CampaignCreated(bytes32 indexed campaignId, address indexed creator);
    event CampaignActivated(bytes32 indexed campaignId);
    event CampaignResolved(bytes32 indexed campaignId, uint256 released, uint256 refunded);
    event CampaignCancelled(bytes32 indexed campaignId);

    function createCampaign(
        address beneficiary,
        uint256 pledgeWindowStart,
        uint256 pledgeWindowEnd,
        uint256 resolutionDeadline,
        string calldata metadataUri
    ) external returns (bytes32 campaignId);

    function activateCampaign(bytes32 campaignId) external;

    function resolveCampaign(bytes32 campaignId) external;

    function cancelCampaign(bytes32 campaignId) external;

    function getCampaign(bytes32 campaignId) external view returns (CampaignData memory);
}
```

### 4.3 EscrowVault Contract

```solidity
interface IEscrowVault {

    event Deposited(bytes32 indexed campaignId, bytes32 indexed pledgeId, uint256 amount);
    event Released(bytes32 indexed campaignId, bytes32 indexed pledgeId, uint256 amount);
    event Refunded(bytes32 indexed campaignId, bytes32 indexed pledgeId, uint256 amount);

    function deposit(bytes32 campaignId, bytes32 pledgeId) external payable;

    function release(
        bytes32 campaignId,
        bytes32 pledgeId,
        uint256 amount
    ) external; // Only callable by PledgeManager

    function refund(
        bytes32 campaignId,
        bytes32 pledgeId
    ) external; // Only callable by PledgeManager

    function partialRelease(
        bytes32 campaignId,
        bytes32 pledgeId,
        uint256 releaseAmount,
        uint256 refundAmount
    ) external; // For per-unit pledges

    function getBalance(bytes32 campaignId) external view returns (uint256);

    function getPledgeBalance(bytes32 pledgeId) external view returns (uint256);
}
```

### 4.4 PledgeManager Contract

```solidity
interface IPledgeManager {

    struct PledgeData {
        bytes32 campaignId;
        address backer;
        uint256 escrowedAmount;
        uint8 pledgeType;
        uint8 status;
        bytes calculationParams;
    }

    event PledgeCreated(
        bytes32 indexed pledgeId,
        bytes32 indexed campaignId,
        address indexed backer,
        uint256 amount
    );
    event PledgeResolved(bytes32 indexed pledgeId, uint256 finalAmount);
    event PledgeRefunded(bytes32 indexed pledgeId, uint256 amount);
    event PledgeCancelled(bytes32 indexed pledgeId);

    function createPledge(
        bytes32 campaignId,
        uint8 pledgeType,
        bytes calldata calculationParams,
        string calldata backerName
    ) external payable returns (bytes32 pledgeId);

    function resolvePledge(
        bytes32 pledgeId,
        bytes calldata oracleData
    ) external; // Only callable during resolution

    function cancelPledge(bytes32 pledgeId) external;

    function getPledge(bytes32 pledgeId) external view returns (PledgeData memory);

    function calculateFinalAmount(
        bytes32 pledgeId,
        bytes calldata oracleData
    ) external view returns (uint256 releaseAmount, uint256 refundAmount);
}
```

### 4.5 OracleRegistry Contract

```solidity
interface IOracleRegistry {

    event OracleRegistered(bytes32 indexed oracleId, address indexed attestor);
    event DataSubmitted(bytes32 indexed oracleId, bytes32 indexed campaignId, bytes32 dataHash);

    function registerOracle(
        address attestor,
        string calldata name,
        string calldata endpoint
    ) external returns (bytes32 oracleId);

    function submitAttestation(
        bytes32 campaignId,
        bytes32 milestoneId,
        bytes calldata data,
        bytes calldata signature
    ) external;

    function getOracleData(
        bytes32 campaignId,
        bytes32 milestoneId
    ) external view returns (bytes memory data, uint256 timestamp);

    function verifyMilestone(
        bytes32 milestoneId,
        bytes calldata oracleData
    ) external view returns (bool verified);
}
```

### 4.6 Token Contracts

```solidity
// PledgeToken - Standard ERC-721
interface IPledgeToken {
    function mint(address to, bytes32 pledgeId) external returns (uint256 tokenId);
    function burn(uint256 tokenId) external;
    function pledgeOf(uint256 tokenId) external view returns (bytes32 pledgeId);
}

// CommemorativeToken - ERC-5192 Soulbound
interface ICommemorativeToken {
    event Locked(uint256 indexed tokenId);

    function mint(
        address to,
        bytes32 pledgeId,
        string calldata metadataUri
    ) external returns (uint256 tokenId);

    function locked(uint256 tokenId) external view returns (bool);
    // Returns true for soulbound tokens
}
```

### 4.7 Access Control

| Function | Caller |
|----------|--------|
| createCampaign | Anyone |
| activateCampaign | Campaign creator |
| cancelCampaign | Campaign creator (draft only) |
| createPledge | Anyone (during pledge window) |
| cancelPledge | Backer (if refund enabled, before event) |
| resolveCampaign | Campaign creator OR automated resolver |
| submitAttestation | Registered attestor |
| release/refund | PledgeManager only (internal) |

---

## 5. API Specification

### 5.1 Base URL
```
Production: https://api.pledgeprotocol.xyz/v1
Staging:    https://api.staging.pledgeprotocol.xyz/v1
```

### 5.2 Authentication
```
Authorization: Bearer <jwt_token>
```
- JWT contains wallet address and signature verification
- Some endpoints are public (no auth required)

### 5.3 Campaign Endpoints

#### Create Campaign
```http
POST /campaigns
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Portland Marathon 2026 - Sarah Chen",
  "description": "Sponsor Sarah's marathon run for charity",
  "beneficiary": "0x9c2e...",
  "beneficiaryName": "Portland Habitat for Humanity",
  "subject": {
    "name": "Sarah Chen",
    "identifier": "Bib #4471",
    "verificationSource": "race-timing-portland-2026"
  },
  "pledgeWindowStart": 1709251200,
  "pledgeWindowEnd": 1712188800,
  "eventDate": 1712275200,
  "resolutionDeadline": 1713052800,
  "milestones": [...],
  "pledgeTypes": [...],
  "minimumPledge": "1000000000000000000",
  "visibility": "public"
}

Response: 201 Created
{
  "id": "campaign_7f3a2b1c",
  "status": "draft",
  ...
}
```

#### Get Campaign
```http
GET /campaigns/:id

Response: 200 OK
{
  "id": "campaign_7f3a2b1c",
  "name": "Portland Marathon 2026 - Sarah Chen",
  "status": "active",
  "totalEscrowed": "15000000000000000000",
  "pledgeCount": 47,
  ...
}
```

#### List Campaigns
```http
GET /campaigns?status=active&limit=20&offset=0

Response: 200 OK
{
  "campaigns": [...],
  "total": 156,
  "limit": 20,
  "offset": 0
}
```

#### Activate Campaign
```http
POST /campaigns/:id/activate
Authorization: Bearer <token>

Response: 200 OK
{
  "id": "campaign_7f3a2b1c",
  "status": "active",
  "activatedAt": 1709251200
}
```

#### Resolve Campaign
```http
POST /campaigns/:id/resolve
Authorization: Bearer <token>

Response: 200 OK
{
  "id": "campaign_7f3a2b1c",
  "status": "resolved",
  "resolution": {
    "totalReleased": "12500000000000000000",
    "totalRefunded": "2500000000000000000",
    "pledgesResolved": 47,
    "milestonesVerified": 2
  }
}
```

### 5.4 Pledge Endpoints

#### Create Pledge
```http
POST /pledges
Authorization: Bearer <token>
Content-Type: application/json

{
  "campaignId": "campaign_7f3a2b1c",
  "pledgeTypeId": "pt_per_mile",
  "calculationParams": {
    "perUnitAmount": "2000000000000000000",
    "cap": "60000000000000000000"
  },
  "backerName": "Mike Thompson",
  "transactionHash": "0xabc..."
}

Response: 201 Created
{
  "id": "pledge_4d5e6f7g",
  "status": "active",
  "escrowedAmount": "60000000000000000000",
  "tokenId": "1047"
}
```

#### Get Pledge
```http
GET /pledges/:id

Response: 200 OK
{
  "id": "pledge_4d5e6f7g",
  "campaignId": "campaign_7f3a2b1c",
  "backer": "0x7a3f...",
  "status": "active",
  "escrowedAmount": "60000000000000000000",
  "token": {
    "tokenId": "1047",
    "imageUri": "ipfs://Qm..."
  }
}
```

#### Cancel Pledge
```http
DELETE /pledges/:id
Authorization: Bearer <token>

Response: 200 OK
{
  "id": "pledge_4d5e6f7g",
  "status": "cancelled",
  "refundedAmount": "60000000000000000000",
  "refundTxHash": "0xdef..."
}
```

#### Get Pledge Token Metadata
```http
GET /pledges/:id/token

Response: 200 OK (ERC-721 Metadata Standard)
{
  "name": "Pledge #1047",
  "description": "Active pledge for Portland Marathon 2026",
  "image": "ipfs://Qm...",
  "attributes": [
    {"trait_type": "Campaign", "value": "Portland Marathon 2026"},
    {"trait_type": "Status", "value": "Active"},
    {"trait_type": "Escrowed", "value": "60 USD"}
  ]
}
```

### 5.5 Oracle Endpoints

#### List Oracles
```http
GET /oracles?type=api

Response: 200 OK
{
  "oracles": [
    {
      "id": "race-timing-portland-2026",
      "name": "Portland Marathon Official Results",
      "type": "api",
      "trustLevel": "official"
    }
  ]
}
```

#### Query Oracle (Manual)
```http
POST /oracles/:id/query
Authorization: Bearer <token>
Content-Type: application/json

{
  "params": {
    "eventId": "portland-marathon-2026",
    "bibNumber": "4471"
  }
}

Response: 200 OK
{
  "status": "finished",
  "timeSeconds": 13642,
  "distanceMiles": 26.2,
  "queriedAt": 1712300000
}
```

#### Submit Attestation
```http
POST /attestations
Authorization: Bearer <token>
Content-Type: application/json

{
  "campaignId": "campaign_7f3a2b1c",
  "milestoneId": "milestone_1",
  "completed": true,
  "evidenceUri": "ipfs://Qm...",
  "notes": "Race completed successfully",
  "signature": "0x..."
}

Response: 201 Created
{
  "attestationId": "att_8h9i0j",
  "verified": true,
  "submittedAt": 1712300000
}
```

### 5.6 Backer Endpoints

#### Get My Pledges
```http
GET /backers/me/pledges?status=active

Response: 200 OK
{
  "pledges": [...],
  "total": 5
}
```

#### Get My Commemoratives
```http
GET /backers/me/commemoratives

Response: 200 OK
{
  "commemoratives": [
    {
      "tokenId": "1047",
      "campaignName": "Portland Marathon 2026",
      "outcomeSummary": "26.2 miles in 3:47:22",
      "contributionAmount": "52400000000000000000",
      "imageUri": "ipfs://Qm..."
    }
  ]
}
```

### 5.7 Error Responses
```json
{
  "error": {
    "code": "CAMPAIGN_NOT_FOUND",
    "message": "Campaign with ID campaign_xyz does not exist",
    "details": {}
  }
}
```

| HTTP Code | Error Code | Description |
|-----------|-----------|-------------|
| 400 | INVALID_REQUEST | Malformed request body |
| 401 | UNAUTHORIZED | Missing or invalid token |
| 403 | FORBIDDEN | Not allowed to perform action |
| 404 | NOT_FOUND | Resource doesn't exist |
| 409 | CONFLICT | State conflict (e.g., already resolved) |
| 422 | VALIDATION_ERROR | Business rule violation |
| 500 | INTERNAL_ERROR | Server error |

---

## 6. Oracle System

### 6.1 Oracle Types

#### API Oracle
- Fetches data from external REST APIs
- Requires endpoint URL and auth config
- Schema validation on response
- Automatic retry with exponential backoff

```typescript
interface ApiOracleConfig {
  endpoint: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  queryMapping: Record<string, string>;  // Map params to query/body
  responseMapping: Record<string, string>; // Map response to standard schema
  timeout: number;                        // ms
  retries: number;
}
```

#### Attestation Oracle
- Trusted party signs attestation
- Multi-sig support for high-value campaigns
- On-chain signature verification

```typescript
interface AttestationOracleConfig {
  attestors: Address[];                   // Allowed attestor addresses
  requiredSignatures: number;             // How many must sign
  schema: {
    campaignId: string;
    milestoneId: string;
    completed: boolean;
    value?: any;                          // Optional metric value
    evidenceUri?: string;
    notes?: string;
  };
}
```

#### Aggregator Oracle
- Combines multiple oracle sources
- Consensus mechanisms: ALL, MAJORITY, ANY
- Dispute resolution via timeout

### 6.2 Pre-built Oracle Integrations

| Oracle | Type | Use Case |
|--------|------|----------|
| RaceTiming | API | Marathon, triathlon, running events |
| Strava | API | Fitness activities with GPS verification |
| GitHub | API | PR merged, commits, releases |
| NSC (National Student Clearinghouse) | API | Academic enrollment/graduation |
| Manual Attestation | Attestation | Any custom verification |

### 6.3 Oracle Router Service

```typescript
class OracleRouter {
  async query(oracleId: string, params: Record<string, any>): Promise<OracleResponse>;

  async verifyMilestone(milestoneId: string): Promise<VerificationResult>;

  async subscribeToUpdates(
    campaignId: string,
    callback: (data: OracleData) => void
  ): Subscription;

  async pollForResolution(campaignId: string): Promise<void>;
}

interface OracleResponse {
  success: boolean;
  data: any;
  timestamp: number;
  source: string;
  signature?: string;  // For attestations
}

interface VerificationResult {
  milestoneId: string;
  verified: boolean;
  oracleData: any;
  evaluatedCondition: MilestoneCondition;
  timestamp: number;
}
```

---

## 7. Token Standards

### 7.1 Pledge Token (ERC-721)

**Purpose**: Represents active pledge commitment, held in backer's wallet

**Metadata Schema**:
```json
{
  "name": "Pledge #1047",
  "description": "Active pledge for Portland Marathon 2026 - Sarah Chen",
  "image": "ipfs://QmXxx.../pledge-1047.png",
  "external_url": "https://pledgeprotocol.xyz/pledges/pledge_4d5e6f7g",
  "attributes": [
    {"trait_type": "Campaign", "value": "Portland Marathon 2026"},
    {"trait_type": "Subject", "value": "Sarah Chen"},
    {"trait_type": "Beneficiary", "value": "Portland Habitat for Humanity"},
    {"trait_type": "Pledge Type", "value": "Per Mile"},
    {"trait_type": "Escrowed Amount", "value": "60.00 USD"},
    {"trait_type": "Max Potential", "value": "60.00 USD"},
    {"trait_type": "Status", "value": "Active"},
    {"trait_type": "Created", "value": 1709510400, "display_type": "date"}
  ]
}
```

**Image Generation**:
- Dynamic SVG or PNG
- Shows campaign name, pledge amount, status
- Updated when status changes
- Regenerated on resolution (before burn)

### 7.2 Commemorative Token (ERC-5192 Soulbound)

**Purpose**: Permanent proof of backing, non-transferable

**Metadata Schema**:
```json
{
  "name": "Commemorative #1047",
  "description": "Backed Portland Marathon 2026 - Sarah Chen completed 26.2 miles",
  "image": "ipfs://QmYyy.../commemorative-1047.png",
  "external_url": "https://pledgeprotocol.xyz/commemoratives/1047",
  "attributes": [
    {"trait_type": "Campaign", "value": "Portland Marathon 2026"},
    {"trait_type": "Subject", "value": "Sarah Chen"},
    {"trait_type": "Beneficiary", "value": "Portland Habitat for Humanity"},
    {"trait_type": "Outcome", "value": "26.2 miles in 3:47:22"},
    {"trait_type": "Your Contribution", "value": "52.40 USD"},
    {"trait_type": "Total Raised", "value": "2847.00 USD"},
    {"trait_type": "Backed", "value": 1709510400, "display_type": "date"},
    {"trait_type": "Resolved", "value": 1712361600, "display_type": "date"},
    {"trait_type": "Backer Rank", "value": "#12 of 47"}
  ],
  "properties": {
    "soulbound": true,
    "locked": true
  }
}
```

### 7.3 Commemorative Templates

| Template | Use Case | Visual Style |
|----------|----------|--------------|
| Race | Marathon, triathlon | Bib number style with results |
| Academic | Graduation, degree | Diploma certificate style |
| Creative | Album, film, book | Album art with backer credit |
| Open Source | GitHub contributions | Commit badge style |
| Generic | All other cases | Clean card with details |

---

## 8. Resolution Engine

### 8.1 Resolution Flow

```
┌──────────────────┐
│  Event Completes │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│  Poll Oracles    │────►│  Data Available? │
└──────────────────┘     └────────┬─────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │ Yes                       │ No
                    ▼                           ▼
         ┌──────────────────┐       ┌──────────────────┐
         │ Trigger Resolution│       │  Wait / Retry    │
         └────────┬─────────┘       └──────────────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ Verify Milestones│
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ Calculate Amounts│
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ Execute Escrow   │
         │ (Release/Refund) │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │Mint Commemoratives│
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ Mark Resolved    │
         └──────────────────┘
```

### 8.2 Pledge Amount Calculation

```typescript
function calculatePledgeAmount(
  pledge: Pledge,
  oracleData: OracleData
): { release: Amount; refund: Amount } {

  const pledgeType = getPledgeType(pledge.pledgeTypeId);
  const calc = pledgeType.calculation;

  switch (calc.type) {
    case "flat":
      // Full amount if milestone verified, else full refund
      if (allMilestonesVerified(pledge.campaignId, oracleData)) {
        return { release: pledge.escrowedAmount, refund: 0n };
      }
      return { release: 0n, refund: pledge.escrowedAmount };

    case "per_unit":
      // Amount = units × perUnitAmount, capped
      const units = extractUnits(oracleData, calc.unitField);
      const calculated = units * calc.perUnitAmount;
      const release = min(calculated, calc.cap ?? calculated, pledge.escrowedAmount);
      return { release, refund: pledge.escrowedAmount - release };

    case "tiered":
      // Apply tiered rates
      const tierRelease = calculateTieredAmount(oracleData, calc.tiers);
      return {
        release: min(tierRelease, pledge.escrowedAmount),
        refund: pledge.escrowedAmount - tierRelease
      };

    case "conditional":
      // All or nothing based on condition
      if (evaluateCondition(calc.condition, oracleData)) {
        return { release: pledge.escrowedAmount, refund: 0n };
      }
      return { release: 0n, refund: pledge.escrowedAmount };
  }
}
```

### 8.3 Failure Handling

| Scenario | Action |
|----------|--------|
| Milestone failed | Refund proportional escrow |
| Deadline passed | Refund all remaining escrow |
| Oracle unavailable | Extend deadline or manual resolution |
| Partial completion | Calculate per-unit, refund remainder |

---

## 9. Storage Architecture

### 9.1 On-Chain Data
- Campaign registry (IDs, status, addresses)
- Pledge records (amounts, status)
- Escrow balances
- Token ownership
- Oracle data hashes (not full data)

### 9.2 Off-Chain Data

**PostgreSQL Schema**:
```sql
-- Campaigns (full metadata)
CREATE TABLE campaigns (
  id VARCHAR(50) PRIMARY KEY,
  chain_id VARCHAR(66),  -- On-chain ID
  creator_address VARCHAR(42),
  metadata JSONB,
  status VARCHAR(20),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Pledges
CREATE TABLE pledges (
  id VARCHAR(50) PRIMARY KEY,
  chain_id VARCHAR(66),
  campaign_id VARCHAR(50) REFERENCES campaigns(id),
  backer_address VARCHAR(42),
  escrowed_amount NUMERIC(78, 0),
  calculation_params JSONB,
  status VARCHAR(20),
  created_at TIMESTAMP
);

-- Oracle Responses (cache)
CREATE TABLE oracle_responses (
  id SERIAL PRIMARY KEY,
  oracle_id VARCHAR(50),
  campaign_id VARCHAR(50),
  response_data JSONB,
  data_hash VARCHAR(66),
  queried_at TIMESTAMP
);

-- Commemoratives
CREATE TABLE commemoratives (
  id VARCHAR(50) PRIMARY KEY,
  token_id VARCHAR(50),
  pledge_id VARCHAR(50) REFERENCES pledges(id),
  metadata JSONB,
  image_uri VARCHAR(500),
  minted_at TIMESTAMP
);

-- Indexes
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_pledges_campaign ON pledges(campaign_id);
CREATE INDEX idx_pledges_backer ON pledges(backer_address);
```

### 9.3 IPFS/Arweave Storage

| Content | Storage | Pinning |
|---------|---------|---------|
| Campaign metadata | IPFS | Pinata / Infura |
| Pledge token images | IPFS | Pinata |
| Commemorative images | Arweave | Permanent |
| Commemorative metadata | Arweave | Permanent |
| Evidence files | IPFS | Campaign-specific |

---

## 10. Security Requirements

### 10.1 Smart Contract Security

| Requirement | Implementation |
|-------------|----------------|
| Reentrancy protection | ReentrancyGuard on all external calls |
| Access control | OpenZeppelin AccessControl |
| Integer overflow | Solidity 0.8+ built-in checks |
| Escrow safety | Pull over push pattern |
| Upgrade safety | Transparent proxy or UUPS |

### 10.2 Oracle Security

| Requirement | Implementation |
|-------------|----------------|
| Data integrity | Hash verification on-chain |
| Attestation verification | ECDSA signature validation |
| API authentication | Secrets in vault (AWS/GCP) |
| Rate limiting | Per-oracle query limits |
| Timeout handling | Configurable with fallback |

### 10.3 API Security

| Requirement | Implementation |
|-------------|----------------|
| Authentication | JWT with wallet signature |
| Rate limiting | 100 req/min per IP |
| Input validation | Zod/Joi schemas |
| SQL injection | Parameterized queries |
| CORS | Whitelist origins |

### 10.4 Key Management

| Key Type | Storage |
|----------|---------|
| Contract deployer | Hardware wallet |
| Oracle API keys | Cloud secrets manager |
| JWT signing keys | Rotated monthly |
| Attestor keys | Individual hardware wallets |

---

## 11. Development Phases

### Phase 1: Core Protocol (MVP)
**Duration**: First milestone
**Deliverables**:
- [ ] CampaignRegistry contract
- [ ] EscrowVault contract
- [ ] PledgeManager contract
- [ ] Basic flat pledge type only
- [ ] Manual attestation oracle
- [ ] Basic API (create campaign, create pledge)
- [ ] Simple CLI for testing

**Acceptance Criteria**:
- Can create campaign, pledge, and resolve with attestation
- Funds correctly escrow and release
- Basic happy path works end-to-end

### Phase 2: Oracle Integration
**Deliverables**:
- [ ] OracleRegistry contract
- [ ] Oracle Router service
- [ ] API oracle framework
- [ ] Race timing integration (first external oracle)
- [ ] Automated resolution triggering
- [ ] Webhook handlers

**Acceptance Criteria**:
- External oracle data triggers resolution
- Multiple oracle types supported
- Resolution fully automated

### Phase 3: Token System
**Deliverables**:
- [ ] PledgeToken (ERC-721) contract
- [ ] CommemorativeToken (ERC-5192) contract
- [ ] Token metadata generation
- [ ] Commemorative image generator
- [ ] IPFS/Arweave integration
- [ ] Wallet integration testing

**Acceptance Criteria**:
- Pledge tokens appear in wallets
- Commemoratives minted on resolution
- Images render correctly

### Phase 4: Advanced Pledges
**Deliverables**:
- [ ] Per-unit pledge calculations
- [ ] Tiered pledge support
- [ ] Conditional pledge support
- [ ] Partial release/refund logic
- [ ] Complex calculation testing

**Acceptance Criteria**:
- All pledge types work correctly
- Edge cases handled (partial completion, etc.)

### Phase 5: Ecosystem
**Deliverables**:
- [ ] Additional oracle integrations (GitHub, academic, Strava)
- [ ] Campaign templates
- [ ] Creator dashboard (web UI)
- [ ] Backer mobile app
- [ ] Hosted implementation for non-technical users
- [ ] Documentation site

**Acceptance Criteria**:
- Non-technical users can create campaigns
- Full product experience complete

---

## 12. Testing Requirements

### 12.1 Smart Contract Testing

```
Unit Tests (Hardhat/Foundry):
├── CampaignRegistry
│   ├── createCampaign() - success, invalid params, duplicate
│   ├── activateCampaign() - owner only, state transitions
│   ├── resolveCampaign() - milestone verification, fund distribution
│   └── cancelCampaign() - refund all, state cleanup
├── EscrowVault
│   ├── deposit() - correct accounting, events
│   ├── release() - only authorized, correct amounts
│   ├── refund() - conditions, full amount
│   └── partialRelease() - math correctness
├── PledgeManager
│   ├── createPledge() - all pledge types, validation
│   ├── calculateFinalAmount() - each calculation type
│   └── resolvePledge() - correct token operations
└── Tokens
    ├── mint/burn - access control
    ├── transfer - pledge transferable, commemorative locked
    └── metadata - correct URIs

Integration Tests:
├── Full flow: create → pledge → resolve → commemorative
├── Failure flow: pledge → deadline → refund
├── Partial flow: per-unit pledge → partial completion
└── Multi-pledge: multiple backers, aggregate correctly

Gas Tests:
├── Measure gas for all operations
├── Optimize hot paths
└── Document gas costs
```

### 12.2 API Testing

```
Unit Tests (Jest/Vitest):
├── Request validation
├── Response formatting
├── Error handling
└── Business logic

Integration Tests:
├── Database operations
├── Blockchain interactions
├── Oracle queries
└── Token metadata generation

E2E Tests (Playwright/Cypress for UI):
├── Campaign creation flow
├── Pledge flow
├── Resolution flow
└── Wallet connection
```

### 12.3 Oracle Testing

```
Mock Oracles:
├── Configurable responses
├── Failure simulation
├── Latency simulation
└── Schema validation

Integration with Real APIs (Staging):
├── Race timing API sandbox
├── GitHub API with test repos
└── Attestation signing tests
```

### 12.4 Coverage Requirements

| Component | Minimum Coverage |
|-----------|------------------|
| Smart Contracts | 95% |
| API Routes | 90% |
| Business Logic | 90% |
| Oracle Router | 85% |

---

## Appendix A: NatLangChain Contract Template

```
CONTRACT: Pledge Agreement
ID: {{pledge_id}}
Created: {{created_at}}

PARTIES:
  Backer: {{backer_name}} ({{backer_address}})
  Beneficiary: {{beneficiary_name}} ({{beneficiary_address}})
  Subject: {{subject_name}}

INTENT:
  {{backer_name}} pledges financial support for {{subject_name}}'s
  participation in {{campaign_name}}, with proceeds
  benefiting {{beneficiary_name}}.

COMMITMENT:
  Type: {{pledge_type_name}}
  {{#if is_per_unit}}
  Amount: {{per_unit_amount}} per {{unit_name}}
  Maximum: {{cap}}
  {{else}}
  Amount: {{flat_amount}}
  {{/if}}
  Escrowed: {{escrowed_amount}}

CONDITIONS:
  Verification Source: {{oracle_name}}
  Subject Identifier: {{subject_identifier}}
  Resolution Deadline: {{resolution_deadline}}

RESOLUTION:
  On verification of {{milestone_description}}:
    - Calculated amount released to Beneficiary
    - Remainder returned to Backer
    - Commemorative token issued to Backer

  On deadline without verification:
    - Full escrow returned to Backer

SIGNATURES:
  Backer: {{backer_signature}}
  Protocol: {{protocol_attestation}}
```

---

## Appendix B: Error Codes

| Code | Description |
|------|-------------|
| E001 | Campaign not found |
| E002 | Campaign not active |
| E003 | Pledge window closed |
| E004 | Insufficient pledge amount |
| E005 | Maximum pledge exceeded |
| E006 | Pledge not found |
| E007 | Unauthorized action |
| E008 | Campaign already resolved |
| E009 | Oracle unavailable |
| E010 | Milestone verification failed |
| E011 | Invalid signature |
| E012 | Escrow insufficient |
| E013 | Resolution deadline passed |
| E014 | Refund not allowed |
| E015 | Transfer not allowed (soulbound) |

---

## Appendix C: Event Schema (for indexing)

```typescript
// Contract Events
interface CampaignCreatedEvent {
  campaignId: bytes32;
  creator: address;
  beneficiary: address;
  metadataUri: string;
  timestamp: uint256;
}

interface PledgeCreatedEvent {
  pledgeId: bytes32;
  campaignId: bytes32;
  backer: address;
  amount: uint256;
  pledgeType: uint8;
  timestamp: uint256;
}

interface MilestoneVerifiedEvent {
  milestoneId: bytes32;
  campaignId: bytes32;
  oracleId: bytes32;
  dataHash: bytes32;
  timestamp: uint256;
}

interface FundsReleasedEvent {
  campaignId: bytes32;
  pledgeId: bytes32;
  amount: uint256;
  recipient: address;
  timestamp: uint256;
}

interface CommemorativeMintedEvent {
  tokenId: uint256;
  pledgeId: bytes32;
  holder: address;
  metadataUri: string;
  timestamp: uint256;
}
```

---

*Last Updated: {{current_date}}*
*Version: 1.0.0*
