# Changelog

All notable changes to Pledge Protocol will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Project documentation (CONTRIBUTING.md, SECURITY.md, CHANGELOG.md)
- GitHub issue and PR templates

## [0.1.0] - 2026-01-23

### Added

#### Phase 1: Core Protocol
- Campaign Registry smart contract for campaign management
- Escrow Vault for secure fund holding
- Pledge Manager for pledge lifecycle
- Manual attestation for milestone verification
- Basic API routes for campaigns and pledges

#### Phase 2: Oracle Framework
- Oracle Registry for data source management
- API Oracle provider for generic REST APIs
- Race Timing provider (Athlinks, RunSignUp, Chronotrack)
- GitHub provider for repository verification
- Resolution Engine for milestone verification

#### Phase 3: Token System
- Pledge Token (ERC-721) for backer commitments
- Commemorative Token (ERC-5192 Soulbound) for proof of backing
- Dynamic image generation for tokens
- Metadata generation with campaign data
- IPFS and Arweave storage integration

#### Phase 4: Advanced Pledges
- Flat pledge calculations
- Per-unit pledge calculations (e.g., per mile)
- Tiered pledge calculations with thresholds
- Conditional pledges with operator comparisons

#### Phase 5: Ecosystem Expansion
- Strava integration for fitness verification
- Academic provider for education milestones
- Streaming provider (Spotify, YouTube, Twitch)
- Aggregator Oracle for multi-source consensus
- Campaign templates (charity-race, creative-project, academic, etc.)

#### Phase 6: Governance & Discovery
- Multi-tier dispute resolution system
- Webhook system for event notifications
- Search and discovery API
- Analytics dashboard for creators and backers
- Trending campaigns algorithm

#### Phase 7: Production Infrastructure
- Wallet-based authentication with sessions
- API key management
- Rate limiting (anonymous, authenticated, premium, API tiers)
- In-memory caching with LRU eviction
- Background job queue with priorities
- Health checks and Prometheus metrics
- Audit logging and security event tracking

#### Phase 8: Multi-Chain & Social
- Multi-chain deployment support (Ethereum, Polygon, Arbitrum, Optimism, Base)
- TypeScript SDK with full type safety
- User profiles and social features
- Follow system and activity feeds
- Comments with threading and likes
- Creator and backer leaderboards

#### Phase 9: Enterprise Features
- Fiat payment processing (Stripe, Circle, Moonpay)
- Automatic stablecoin settlement
- GDPR and CCPA compliance tools
- Organization and team management
- SSO integration (SAML, OIDC)
- Bulk operations for enterprises
- Trust scoring and fraud detection
- Creator verification system
- Developer CLI and local sandbox

#### Phase 10: Platform Maturity
- Multi-channel notification system (email, push, in-app, SMS)
- Notification preferences and quiet hours
- Digest generation (daily, weekly, monthly)
- Internationalization with 12 locales
- Currency conversion with live rates
- Financial reports and tax summaries
- Transaction history and audit trails
- Third-party integrations (Slack, Discord, Zapier, Telegram)
- Recurring campaigns with auto-renewal
- Stretch goals and funding predictions
- Campaign scheduling and series management

### Infrastructure
- Solidity 0.8.24 with OpenZeppelin v5
- Hardhat development framework
- TypeScript 5.3 with strict mode
- Express.js API server
- ESLint and Prettier configuration
- Comprehensive test suites

---

## Version History

- **0.1.0** - Initial release with all 10 phases implemented
