# Claude.md - Pledge Protocol

## Project Overview

Pledge Protocol is a milestone-verified crowdfunding platform built on blockchain. Money is locked in escrow until external oracles verify milestone completion (race results, academic records, GitHub commits, etc.). Backers receive Pledge Tokens during campaigns and soulbound Commemorative Tokens after resolution.

**Version**: 0.1.0
**License**: MIT
**Node**: 20.x LTS

## Tech Stack

### Smart Contracts
- Solidity 0.8.24 with OpenZeppelin v5.0.0
- Hardhat 2.19.0 for development/testing/deployment
- Ethers.js v6.9.0 with TypeChain bindings

### Backend
- TypeScript 5.3 (strict mode)
- Express.js 4.18
- Zod 3.22 for validation
- PostgreSQL database

### Testing
- Mocha/Chai via Hardhat
- 13 test suites covering all phases

## Directory Structure

```
contracts/           # Solidity smart contracts
  ├── CampaignRegistry.sol    # Campaign lifecycle
  ├── PledgeManager.sol       # Pledge management
  ├── EscrowVault.sol         # Fund escrow
  ├── OracleRegistry.sol      # Oracle management
  └── tokens/                 # ERC-721/ERC-5192 tokens

src/
  ├── api/routes/    # Express API endpoints (18 routes)
  ├── oracle/        # Oracle providers and resolution engine
  ├── tokens/        # Token minting and metadata
  ├── governance/    # Dispute resolution
  ├── security/      # Auth, rate limiting, audit
  ├── infrastructure/# Caching, jobs, health checks
  └── database/      # PostgreSQL schema

test/                # Test suites by phase
```

## Commands

```bash
# Development
npm install          # Install dependencies
npm run compile      # Compile contracts
npm run api:dev      # Start API with hot reload
npm run node         # Start local Hardhat node

# Testing
npm test             # Run all tests
npm run test:coverage

# Build & Deploy
npm run build        # Compile TypeScript
npm run deploy:local # Deploy to local node
npm run deploy:testnet # Deploy to Sepolia
```

## Key Architecture Patterns

### Oracle System
Oracles verify milestones via external data sources. All providers extend `BaseOracleProvider`:

```typescript
// src/oracle/base-provider.ts
export abstract class BaseOracleProvider implements IOracleProvider {
  abstract query(params: Record<string, any>): Promise<OracleResponse>;
  verifyCondition(data: any, condition: MilestoneCondition): boolean;
}
```

Available providers: API, RaceTiming, GitHub, Strava, Academic, Streaming, Aggregator

### Resolution Engine
Event-driven resolution at `src/oracle/resolution-engine.ts`:
- Emits: `milestone:verified`, `pledge:resolved`, `campaign:completed`

### API Routes
All routes use Zod validation and follow this pattern:

```typescript
const schema = z.object({ /* validation */ });
router.post("/", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error });
  // ... handle request
});
```

### Middleware Stack
Request flow: requestId -> CORS -> security headers -> JSON parsing -> logging -> rate limiting -> auth (optional) -> error handling

## Coding Conventions

### TypeScript
- Use strict typing with full annotations
- Define interfaces in separate `types.ts` files
- Use Zod schemas for all API validation
- Prefer async/await over callbacks

### Solidity
- Import OpenZeppelin for standard patterns
- Use AccessControl for role-based permissions
- Apply ReentrancyGuard on external functions
- Emit events for all state changes
- Validate inputs with require statements

### Error Handling
- Use custom error classes extending Error
- Return typed response objects: `{ success: boolean, data?, error? }`
- Log all errors with context

### Naming
- camelCase for variables/functions
- PascalCase for types/interfaces/classes
- SCREAMING_SNAKE_CASE for constants
- Prefix interfaces with `I` (e.g., `IOracleProvider`)

## Testing Guidelines

Tests are organized by implementation phase:

```typescript
describe("FeatureName", () => {
  let contract: ContractType;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    contract = await deployContracts();
  });

  it("should describe expected behavior", async () => {
    // Arrange, Act, Assert
  });
});
```

Run specific tests: `npx hardhat test test/FileName.test.ts`

## Environment Variables

Required in `.env`:
```
SEPOLIA_RPC_URL      # RPC endpoint
PRIVATE_KEY          # Deployer key
PORT=3000            # API port
DATABASE_URL         # PostgreSQL connection
IPFS_API_URL         # IPFS gateway
IPFS_API_KEY         # IPFS auth
```

## Important Files

- `hardhat.config.ts` - Network and compiler configuration
- `src/api/index.ts` - API server entry point
- `src/oracle/resolution-engine.ts` - Core resolution logic
- `contracts/CampaignRegistry.sol` - Main campaign contract

## Phase Organization

The codebase is organized into 10 phases:
1. Core Protocol (campaigns, pledges, escrow)
2. Oracle Integration
3. Token System (Pledge + Commemorative tokens)
4. Advanced Pledges (calculation types)
5. Extended Oracles & Templates
6. Governance & Notifications
7. Security & Infrastructure
8. Multi-chain & Social
9. Enterprise & Payments
10. Platform Maturity (i18n, reporting, integrations)

When adding features, identify the relevant phase and follow existing patterns in that phase's modules.
