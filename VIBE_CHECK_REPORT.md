# Vibe-Code Detection Audit v2.0 — Pledge Protocol

**Audit Date:** February 23, 2026
**Framework:** Vibe-Code Detection Audit v2.0
**Repository:** kase1111-hash/Pledge-Protocol
**Commit:** fa63013 (main)

---

## Final Score

| Domain | Weight | Scores | Authenticity% | Weighted |
|--------|--------|--------|--------------|----------|
| **A: Surface Provenance** | 20% | 9/21 | 14.3% | 2.9% |
| **B: Behavioral Integrity** | 50% | 10/21 | 21.4% | 10.7% |
| **C: Interface Authenticity** | 30% | 8/15 | 30.0% | 9.0% |
| **Weighted Authenticity** | | | | **22.6%** |

### **Vibe-Code Confidence: 77.4% — Predominantly Vibe-Coded**

Classification: **61-85% = Predominantly Vibe-Coded**

---

## Domain A: Surface Provenance (20%)

### A1: Commit History — Score: 1 (Weak)

**Finding:** 23 of 42 commits authored by "Claude" (the AI). The remaining 19 are by "Kase Branham" and consist entirely of merge commits and GitHub-generated actions (Create LICENSE, Update README.md).

Every substantive code commit follows a formulaic pattern:
- `Implement Phase 1 of Pledge Protocol`
- `Implement Phase 2: API Oracle Framework and Automated Resolution`
- `Implement Phase 3: Token System and Commemoratives`
- ... through Phase 10

Each "Implement Phase N" commit is a single massive atomic commit containing thousands of lines. No incremental development, no WIP commits, no "fix typo" commits, no branch-and-iterate history. This is the canonical AI-generation pattern: complete phases materialized in single commits.

**Evidence:** `git log --format="%an" | sort | uniq -c` → Claude: 23, Kase Branham: 19 (merges only)

### A2: Comments & Docstrings — Score: 1 (Weak)

**Finding:** Comments are uniformly tutorial-style, explaining *what* code does rather than *why* decisions were made. Every file follows an identical header pattern:

```typescript
/**
 * Phase N: [Feature Name]
 * [Brief description of what this module does]
 */
```

Zero TODO, FIXME, HACK, or XXX comments across the entire codebase (`grep -r "TODO\|FIXME\|HACK\|XXX" src/` returns nothing). Real codebases accumulate these organically during development. Their total absence is a strong AI-generation signal.

Comments in `src/security/auth-service.ts:190-227` explicitly state the code is incomplete:
```typescript
// This is a simplified version for testing
// In production, use proper ECDSA recovery:
// const { verifyMessage } = require('ethers');
// return verifyMessage(message, signature);
```

This "in production, do X" pattern appears repeatedly — the AI acknowledges what real code would do while shipping a placeholder.

### A3: Test Quality — Score: 1 (Weak)

**Finding:** Mixed quality. Smart contract tests (`test/PledgeProtocol.integration.test.ts`) are genuinely functional — they deploy real contracts to Hardhat, create campaigns, verify escrow balances, and test fund release flows. These tests exercise real behavior.

However, `test/api.integration.test.ts` is a **complete sham**. It defines a `MockApiClient` class (line 33) that returns hardcoded responses:
```typescript
class MockApiClient {
  async request(req: MockRequest): Promise<MockResponse> {
    // This is a mock implementation for demonstration
    // In real tests, use supertest with the actual Express app
    if (req.path === "/campaigns" && req.method === "POST") {
      return { status: 201, body: { id: `campaign_${Date.now()}`, ...req.body } };
    }
```
This tests the mock, not the code. No actual HTTP requests are made.

Phase 10 tests (`test/Phase10Platform.test.ts`) import from `vitest`, but **vitest is not in package.json**. These tests cannot run:
```typescript
import { describe, it, expect, beforeEach } from "vitest"; // ← Not installed
```

**Evidence:** `grep vitest package.json` → no matches

### A4: Dependency Usage — Score: 2 (Moderate)

**Finding:** `package.json` lists 4 runtime dependencies: `@openzeppelin/contracts`, `dotenv`, `express`, `uuid`, `zod`. These are all actually imported in code — no phantom runtime dependencies.

However, the codebase references numerous external services (Stripe, Circle, SendGrid, Firebase, Strava, Slack, Discord) without importing their SDKs. `grep -r "import.*from.*(stripe|@circle|sendgrid|firebase)" src/` returns only `src/database/postgres-store.ts` (for `pg`). All external integrations are mocked in-memory.

Zod is imported in only 10 of 25+ route files — exclusively Phase 1-6 routes. Phase 7-10 routes either use custom validation or none, indicating the prompting template changed between phases.

### A5: Naming Uniformity — Score: 1 (Weak)

**Finding:** Unnaturally perfect consistency. Every module follows the identical pattern:
- `types.ts` — Type definitions
- `[feature]-service.ts` — Service implementation
- `index.ts` — Barrel exports

File names, class names, method names, and variable names exhibit zero organic variation. No abbreviations, no inconsistent casing, no legacy naming artifacts. Human codebases accumulate naming drift over time; this codebase has none.

Every service class follows the same structural template: constructor → public CRUD methods → private helpers. Every route file follows: import → Router() → endpoint handlers → export default router.

### A6: Documentation-Reality Gap — Score: 1 (Weak)

**Finding:** The README.md is 2,240 lines — exhaustively documenting every API endpoint across all 10 phases with request/response examples, tables of enum values, and usage guides. This level of documentation is disproportionate for a codebase where core integrations are mocked.

The README claims features like "Fiat payment processing with automatic settlement to stablecoin escrow" (`src/payments/stripe-provider.ts:70-71`), but the code itself comments: `// In production, this would call Stripe API`. The documentation describes a finished product; the code implements a prototype.

The README (line 3) claims "A NatLangChain application" and dedicates 9 lines to NatLangChain integration (lines 161-169), but `grep -r "NatLangChain\|natlangchain" src/` returns zero results. NatLangChain is not imported, used, or referenced anywhere in code.

The Architecture.md was created as the *second commit* in the repo (before any code existed), suggesting spec-first AI generation.

### A7: Utility & Dead Code — Score: 2 (Moderate)

**Finding:** Barrel `index.ts` files export everything from each module, but many exports are never consumed by other modules. For example, `src/oracle/index.ts` exports `StravaActivityResult`, `AcademicVerificationResult`, `DegreeVerification`, `StreamingPlatform`, `ChannelMilestoneResult`, `DisputeInfo`, etc. — types that exist for API surface area but are never used internally.

No dead imports found within individual files (likely cleaned by the same AI session). But the codebase is over-exported and under-consumed.

**Domain A Scores:** A1=1, A2=1, A3=1, A4=2, A5=1, A6=1, A7=2 → Total: 9/21

Using the framework's 1-3 scale where 1=Weak, 3=Strong, minimum possible = 7, maximum = 21:

**Domain A Authenticity: (9 - 7) / (21 - 7) × 100 = 14.3%**

---

## Domain B: Behavioral Integrity (50%)

### B1: Error Handling — Score: 1 (Weak)

**Finding:** 261 catch blocks across 44 files. The vast majority are bare catches that either swallow errors or return generic messages.

Critical financial operations fail silently:

`src/payments/stripe-provider.ts:226-237` — Refund processing uses `setTimeout` without error handling:
```typescript
setTimeout(() => {
  refund.status = "succeeded";
  refund.processedAt = Date.now();
}, 100);
return refund; // Returns immediately, caller never knows if refund succeeded
```

`src/oracle/resolution-engine.ts:547-549` — Commemorative minting failure swallowed:
```typescript
} catch (error) {
  console.error(`Failed to mint commemorative for pledge ${pledge.id}:`, error);
  // No retry, no escalation, silent continuation
}
```

`src/compliance/gdpr-service.ts:186-188` — Data export failure captured with no context:
```typescript
} catch (error) {
  request.status = "failed";
  // No error message, no logging, no notification
}
```

No error type differentiation anywhere. Network errors, validation errors, and fatal errors are treated identically.

### B2: Config Usage — Score: 1 (Weak)

**Finding:** `.env.example` defines 7 environment variables. The codebase references many more (`SLACK_CLIENT_ID`, `DISCORD_CLIENT_ID`, `GOOGLE_CLIENT_ID`, `SENDGRID_API_KEY`, `FIREBASE_PROJECT_ID`, `BASE_URL`, `DATABASE_TYPE`, `DATABASE_POOL_MAX`, etc.) without validation.

Environment variables are loaded into local scope but never used for real API calls. Example from `src/integrations/integration-service.ts`:
```typescript
const clientId = process.env.SLACK_CLIENT_ID || "";
```
This value is read but the Slack integration handler never makes an HTTP call — it stores data in a Map.

No startup validation ensures required config is present. The server starts successfully with zero environment variables set.

### B3: Call Chain Completeness — Score: 1 (Weak)

**Finding:** This is the most critical failure. Call chains are structurally complete (routes → services → providers) but the terminal link (providers → external APIs) is entirely missing.

**Payments:** `src/payments/stripe-provider.ts:51-100` generates fake Stripe session IDs (`stripe_cs_${randomUUID()}`), fake checkout URLs (`https://checkout.stripe.com/pay/${id}`), and hardcoded test card data (`visa`, `4242`, exp `12/2028`). No Stripe SDK imported.

**Blockchain:** `src/multichain/deployment-service.ts:263-286` uses `simulateDeployment()` to generate random contract addresses (`0x${randomBytes(20).toString("hex")}`). No actual contract deployment to any chain.

**Circle/USDC:** `src/payments/circle-provider.ts:377-395` returns mock transfer IDs and fake transaction hashes. Comment admits: `// In production: Circle Cross-Chain Transfer Protocol (CCTP)`.

**All external integrations** (Slack, Discord, SendGrid, Firebase, Strava, etc.) are in-memory simulations.

### B4: Async Correctness — Score: 2 (Moderate)

**Finding:** Multiple fire-and-forget async patterns without completion tracking:

`src/compliance/gdpr-service.ts:98-101` — Export processing launched without await:
```typescript
this.processExport(requestId); // NOT awaited — caller can't know when it completes
return request;
```

Same pattern for deletion requests (line 398-403).

`src/payments/stripe-provider.ts:226` — `setTimeout` for refund processing without any completion mechanism.

However, the `ResolutionEngine` uses intentional async patterns with event emission (`this.emit("resolution:queued", job)`), which is a reasonable design choice. The job queue (`src/infrastructure/job-queue.ts:298-333`) has proper async handling with retry and backoff.

### B5: State Management — Score: 2 (Moderate)

**Finding:** All state lives in JavaScript `Map` objects without synchronization. While Node.js is single-threaded, async boundaries create race windows:

`src/database/memory-store.ts:25-97` — Read-modify-write on Maps without protection. Two concurrent `update()` calls on the same entity lose writes.

`src/security/rate-limiter.ts:33-102` — Rate limit entries modified between `get()` and `set()`. Concurrent requests could bypass limits.

`src/infrastructure/cache.ts:44-90` — Stats counters (`hits`, `misses`) updated without atomicity.

Partially mitigated by Node.js single-threaded execution model, but real race conditions exist across await boundaries.

### B6: Security Depth — Score: 2 (Moderate)

**Finding:** Security infrastructure is genuinely implemented but has a critical gap.

**Real:** Rate limiting middleware (`src/security/middleware.ts:214-260`) actually blocks requests (returns 429). Auth middleware (`src/security/middleware.ts:71-137`) actually validates sessions and rejects unauthorized requests. Input validation exists using both Zod (Phase 1-6) and custom validators (Phase 7-10). Security headers and CORS are configured. CORS requires explicit `CORS_ORIGINS` in production.

**Critical Gap:** Signature verification in `src/security/auth-service.ts:193-227` is **completely fake**. The `recoverAddress()` method does not perform actual ECDSA recovery — it hashes the message with the signature to produce a deterministic but meaningless address. Any properly-formatted 132-character hex string passes as a valid signature. The code comments explicitly:
```typescript
// This is NOT cryptographically secure - just for testing
```

This means the authentication system blocks unauthorized requests... but authorization can be forged by anyone who knows the signature format.

### B7: Resource Management — Score: 1 (Weak)

**Finding:** Every cleanup method in the codebase exists but is never called:

- `src/infrastructure/cache.ts:265-282` — `cleanup()` removes expired entries. Never invoked.
- `src/security/auth-service.ts:614-634` — `cleanup()` removes expired sessions/challenges. Never invoked.
- `src/infrastructure/job-queue.ts:413-432` — `cleanup()` removes completed/failed jobs. Never invoked.
- `src/security/rate-limiter.ts:236-255` — `cleanup()` removes old rate limit entries. Never invoked.

`src/database/memory-store.ts` has no size limits, no LRU eviction, no TTL. In-memory data grows unbounded. Long-running server processes will eventually OOM.

The server's graceful shutdown (`src/api/server.ts:176-186`) stops the job queue but doesn't flush caches, close database connections, or drain pending requests.

**Domain B Scores:** B1=1, B2=1, B3=1, B4=2, B5=2, B6=2, B7=1 → Total: 10/21

**Domain B Authenticity: (10 - 7) / (21 - 7) × 100 = 21.4%**

---

## Domain C: Interface Authenticity (30%)

### C1: API Consistency — Score: 1 (Weak)

**Finding:** Five distinct error response formats across routes with no standardization:

| Route | Format |
|-------|--------|
| campaigns.ts | `{error: {code, message}}` |
| auth.ts | `{success: false, error, details}` |
| payments.ts | Custom `errorResponse()` helper |
| webhooks.ts | `{success: false, error, details}` |
| compliance.ts | Simple `{error: "..."}` |

Phase 1-6 routes use Zod for validation (`import { z } from "zod"` in 10 files). Phase 7-10 routes (13+ files) use no validation library, relying on manual checks or the custom `validateInput` middleware. This split indicates different generation passes with different prompting.

Pagination formats also vary: `{campaigns: [], total, limit, offset}` vs `{data: [], count}` vs `{campaigns: [], pagination: {}, facets}`. No consistent envelope across list endpoints.

### C2: UI Implementation — Score: N/A

Backend-only project. No frontend code.

### C3: Frontend State — Score: N/A

Backend-only project. No frontend code.

### C4: Security Infrastructure — Score: 2 (Moderate)

**Finding:** Security middleware is actually wired in `src/api/server.ts`:
```typescript
app.use(requestIdMiddleware);      // Line 58
app.use(corsMiddleware({...}));    // Line 66
app.use(securityHeadersMiddleware); // Line 74
app.use(rateLimitMiddleware());    // Line 83
```

However, `authMiddleware` is NOT applied globally — it's only used within individual route files that opt in. Many Phase 7-10 routes lack authentication entirely. For example, `src/api/routes/notifications.ts` has no auth middleware — anyone can send notifications to any user.

CORS configuration is properly restrictive in production (requires explicit origins). Security headers are set.

### C5: WebSocket Patterns — Score: 1 (Weak)

**Finding:** No WebSocket implementation exists despite the README mentioning "live updates" for backers watching progress. The webhook system (`src/notifications/notification-service.ts`) uses HTTP POST delivery, not real-time push. No `ws` or `socket.io` dependency.

### C6: Error Messaging — Score: 2 (Moderate)

**Finding:** Error messages in route handlers are mostly helpful for client-side debugging:
```typescript
res.status(400).json({
  error: error instanceof Error ? error.message : "Failed to send notification",
});
```

However, some routes expose internal error details that shouldn't reach clients. The `errorHandlerMiddleware` in `src/security/middleware.ts` handles uncaught errors, but individual route try/catch blocks often return raw error messages without sanitization.

No structured error codes across all routes. Some use `code: "AUTH_REQUIRED"` style codes, most don't.

### C7: Observability — Score: 2 (Moderate)

**Finding:** A structured logger exists (`src/security/audit-logger.ts`) with severity levels and context objects. The audit logger tracks security events and API actions.

However, actual usage is sparse — only 56 `console.log/warn/error` calls across 11 files, and the structured logger is used mainly in the server startup and security middleware. Most service files don't log at all.

Prometheus-style metrics are exposed at `/v1/monitoring/metrics`, but the metrics are computed from in-memory counters that reset on restart. Health checks exist and are Kubernetes-compatible (`/v1/monitoring/health/live`, `/ready`).

No distributed tracing (no OpenTelemetry, no correlation IDs propagated through service calls). Request IDs are generated but not threaded through downstream operations.

**Domain C Scores (excluding N/A):** C1=1, C4=2, C5=1, C6=2, C7=2 → Total: 8/15

**Domain C Authenticity: (8 - 5) / (15 - 5) × 100 = 30.0%**

---

## Score Calculation

| Domain | Scores | Min | Max | Authenticity% | Weight | Weighted |
|--------|--------|-----|-----|--------------|--------|----------|
| A (7 criteria) | 9 | 7 | 21 | 14.3% | 0.20 | 2.9% |
| B (7 criteria) | 10 | 7 | 21 | 21.4% | 0.50 | 10.7% |
| C (5 criteria) | 8 | 5 | 15 | 30.0% | 0.30 | 9.0% |

**Weighted Authenticity = 2.9% + 10.7% + 9.0% = 22.6%**

**Vibe-Code Confidence = 100% - 22.6% = 77.4%**

**Classification: Predominantly Vibe-Coded (61-85%)**

---

## What's Genuine

Not all of this codebase is theater. Several components show real engineering:

1. **Smart Contracts (Solidity):** `contracts/EscrowVault.sol` implements a proper pull-payment pattern with `ReentrancyGuard`, `AccessControl`, and correct state management. The contracts use OpenZeppelin correctly and handle edge cases (partial releases, refund flows). Contract tests deploy real contracts and verify actual on-chain behavior.

2. **Resolution Engine Architecture:** `src/oracle/resolution-engine.ts` has a well-designed event-driven resolution flow with proper job state management and milestone verification logic. The calculation logic for tiered/per-unit/conditional pledges is mathematically correct.

3. **Security Middleware Chain:** The Express middleware pipeline in `src/api/server.ts` is correctly ordered (request ID → CORS → headers → body parsing → logging → rate limiting → routes → error handler → 404). Rate limiting genuinely blocks excess requests. CORS has a production guard.

4. **Job Queue:** `src/infrastructure/job-queue.ts` has real exponential backoff retry logic with configurable max attempts, priorities, and scheduling.

---

## High Severity Findings

### CRITICAL: Authentication Bypass
**File:** `src/security/auth-service.ts:193-227`
**Impact:** Any properly-formatted hex string is accepted as a valid wallet signature. The entire auth system is decorative.
**Fix:** Import `ethers.verifyMessage()` and perform real ECDSA recovery.

### CRITICAL: No Real Payment Processing
**File:** `src/payments/stripe-provider.ts`, `src/payments/circle-provider.ts`
**Impact:** Payment endpoints return success without contacting any payment processor. Funds are never collected, never settled, never refunded.
**Fix:** Integrate actual Stripe and Circle SDKs with proper error handling and webhook verification.

### CRITICAL: No Real Blockchain Deployment
**File:** `src/multichain/deployment-service.ts:263-286`
**Impact:** "Deployed" contracts are random hex addresses. No actual deployment occurs.
**Fix:** Use ethers.js `ContractFactory.deploy()` with real RPC providers.

### HIGH: Phantom Test Dependencies
**File:** `test/Phase10Platform.test.ts:7`
**Impact:** Tests import `vitest` which is not in `package.json`. These tests cannot run.
**Fix:** Add vitest to devDependencies or migrate tests to mocha/chai.

### HIGH: Fake API Integration Tests
**File:** `test/api.integration.test.ts:33-100`
**Impact:** "Integration tests" test a MockApiClient that returns hardcoded responses. Zero actual HTTP testing.
**Fix:** Use `supertest` with the real Express app.

### HIGH: Memory Leaks in Production
**Files:** `src/infrastructure/cache.ts`, `src/security/auth-service.ts`, `src/database/memory-store.ts`
**Impact:** Cleanup methods exist but are never scheduled. All in-memory stores grow unbounded.
**Fix:** Schedule periodic cleanup via `setInterval` or move to Redis/PostgreSQL for state.

---

## Remediation Checklist

- [ ] Replace `recoverAddress()` stub with real ECDSA verification via ethers.js
- [ ] Integrate Stripe SDK for payment processing
- [ ] Integrate Circle SDK for USDC settlement
- [ ] Deploy contracts via real RPC providers instead of `simulateDeployment()`
- [ ] Add vitest to devDependencies (or port Phase 10 tests to mocha)
- [ ] Replace MockApiClient in API tests with supertest
- [ ] Schedule automatic cleanup for cache, sessions, rate limiter, and job queue
- [ ] Add auth middleware to Phase 7-10 route files that currently lack it
- [ ] Standardize error response format across all route files
- [ ] Add Zod validation to Phase 7-10 routes (or use the custom validator consistently)
- [ ] Add size limits to in-memory stores with LRU eviction
- [ ] Validate required environment variables at startup
- [ ] Add real external SDK integrations (SendGrid, Firebase, Strava, etc.)
- [ ] Implement WebSocket or SSE for real-time backer updates
- [ ] Add distributed tracing with request ID propagation through service calls
- [ ] Replace fire-and-forget async patterns with proper completion tracking
- [ ] Add differentiated error handling (retryable vs. fatal errors)

---

## Methodology Notes

This audit was conducted using the Vibe-Code Detection Audit v2.0 framework. Each of the 21 sub-criteria (7 per domain) was scored 1-3 (Weak/Moderate/Strong). Scores were normalized to percentages and weighted: Domain A (20%), Domain B (50%), Domain C (30%). Two criteria (C2, C3) were excluded as N/A for a backend-only project.

All findings reference specific file paths and line numbers. Call chains were traced from API routes through services to terminal providers. Commit history was analyzed with `git log --format`. Dependency usage was verified with grep across the entire source tree.
