# Remediation Plan — Pledge Protocol

**Date:** February 23, 2026
**Based on:** Vibe-Code Detection Audit v2.0 (77.4% vibe-coded)
**Branch:** `claude/code-review-vibe-check-3orj6`

---

## Executive Summary

The audit classified this codebase as **predominantly vibe-coded (77.4% confidence)**. The core issues fall into five themes:

1. **Fake backends** — Payment, deployment, and integration providers are in-memory simulations
2. **Broken authentication** — Signature verification does not perform real ECDSA recovery
3. **Resource leaks** — Cleanup methods exist but are never scheduled
4. **Test theater** — API integration tests mock themselves; Phase 10 tests can't run
5. **Documentation fiction** — README describes a finished product; code implements a prototype

This plan is organized into **four tiers** by deployment urgency, with concrete file-level changes, dependency additions, and estimated scope for each item.

---

## Tier 0: Critical Security (Must Fix Before Any Deployment)

These issues allow authentication bypass or financial loss.

### 0.1 Replace Fake ECDSA Signature Verification

**Finding:** `src/security/auth-service.ts:193-227` — `recoverAddress()` accepts any 132-char hex string as a valid wallet signature. The authentication system is decorative.

**Fix:**
- Add `ethers` to runtime dependencies (currently dev-only)
- Replace the `recoverAddress()` method body with:
  ```typescript
  import { verifyMessage } from "ethers";
  // ...
  private recoverAddress(message: string, signature: string): string {
    return verifyMessage(message, signature);
  }
  ```
- Remove the `crypto.createHash` workaround and all "NOT cryptographically secure" comments
- Update `hashMessage()` to use `ethers.hashMessage()` for consistency

**Files:** `src/security/auth-service.ts`, `package.json`
**New dependency:** Move `ethers` from devDependencies to dependencies
**Scope:** ~30 lines changed

### 0.2 Add Auth Middleware to Unprotected Write Endpoints

**Finding:** Only 6 of 23 route files import `authMiddleware`. Several write endpoints (notification send, dispute creation, report generation) are unguarded.

**Fix:**
- Audit every POST/PUT/DELETE handler in routes that don't import `authMiddleware`
- Apply `authMiddleware` to all state-mutating endpoints
- Leave GET endpoints and webhook receivers public where appropriate
- Document the auth policy per-route in a comment at the top of each file

**Priority routes to protect:**
| Route file | Unprotected write endpoints |
|---|---|
| `notifications.ts` | POST /notifications/send — anyone can send to any user |
| `disputes.ts` | POST /disputes — anonymous dispute creation |
| `compliance.ts` | POST /compliance/gdpr/export, /delete — unauthenticated data requests |
| `risk.ts` | POST /risk/assess — unauthenticated risk scoring |
| `integrations.ts` | POST /integrations/connect — OAuth without session |
| `enterprise.ts` | POST /enterprise/organizations — unauthenticated org creation |
| `reports.ts` | POST /reports/generate — unauthenticated report generation |
| `campaigns-advanced.ts` | POST /campaigns/advanced — unauthenticated campaign creation |

**Files:** 8 route files listed above, `src/security/middleware.ts` (if changes needed)
**Scope:** ~50 lines added across files

### 0.3 Validate Required Environment Variables at Startup

**Finding:** The server starts successfully with zero env vars set. Config values like `STRIPE_API_KEY`, `DATABASE_URL`, etc. silently fall back to empty strings or mocks.

**Fix:**
- Create `src/config/env.ts` that uses Zod to validate all required env vars at import time
- Fail fast at startup if critical vars are missing (database URL, API keys for enabled providers)
- Distinguish between required (always needed) and conditional (needed if feature enabled) vars
- Import this module at the top of `src/api/server.ts`

**Required vars (always):**
- `DATABASE_URL` or `DATABASE_TYPE=memory` (explicit opt-in to in-memory)
- `NODE_ENV`
- `CORS_ORIGINS` (already enforced in production — good)

**Conditional vars (when feature enabled):**
- `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET` — if payments enabled
- `CIRCLE_API_KEY` — if Circle enabled
- `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` — if Slack integration enabled

**Files:** New `src/config/env.ts`, `src/api/server.ts`
**Scope:** ~80 lines new file

---

## Tier 1: Functional Correctness (Required for MVP)

These issues mean core features don't actually work.

### 1.1 Integrate Real Stripe Payment Processing

**Finding:** `src/payments/stripe-provider.ts` generates fake session IDs, fake checkout URLs, and fake refunds. No Stripe SDK imported. Payment endpoints return success without contacting any processor.

**Fix:**
- Install `stripe` package
- Replace `createCheckout()` with `stripe.checkout.sessions.create()`
- Replace `confirmPayment()` with real payment intent confirmation
- Replace `createRefund()` with `stripe.refunds.create()`
- Replace `verifyWebhookSignature()` with `stripe.webhooks.constructEvent()`
- Remove `simulatePaymentSuccess()` test helper from production code
- Add proper error handling for Stripe-specific errors (card declined, insufficient funds, network errors)

**Files:** `src/payments/stripe-provider.ts`, `package.json`
**New dependency:** `stripe`
**Scope:** ~200 lines rewritten

### 1.2 Integrate Real Circle/USDC Payment Processing

**Finding:** `src/payments/circle-provider.ts` returns mock transfer IDs and fake transaction hashes. KYC records stored in memory only.

**Fix:**
- Install Circle SDK
- Replace mock checkout/confirm with real Circle API calls
- Replace `getUsdcBalance()` hardcoded return with real API query
- Replace `transferUsdc()` mock with real CCTP call
- KYC integration can be deferred (see Tier 2) but mock should be clearly flagged

**Files:** `src/payments/circle-provider.ts`, `package.json`
**New dependency:** Circle SDK or direct API client
**Scope:** ~250 lines rewritten

### 1.3 Replace Settlement Simulations with Real Blockchain Calls

**Finding:** `src/payments/settlement-service.ts` uses `simulateConversion()` (100ms delay) and `simulateBlockchainTransfer()` (random hex hash). No actual on-chain transactions.

**Fix:**
- Use ethers.js `Contract` and `Wallet` for real transaction submission
- Replace hardcoded exchange rates with Chainlink oracle or CoinGecko API
- Add gas estimation before submission
- Add transaction receipt confirmation (wait for N block confirmations)
- Add timeout and retry logic for failed transactions
- Store settlement records in the database (not in-memory Map)

**Files:** `src/payments/settlement-service.ts`
**Scope:** ~150 lines rewritten

### 1.4 Implement Real Contract Deployment

**Finding:** `src/multichain/deployment-service.ts:263-286` uses `simulateDeployment()` to generate random contract addresses. No actual deployment to any chain.

**Fix:**
- Use Hardhat artifacts (ABI + bytecode) for contract deployment
- Replace `simulateDeployment()` with `ContractFactory.deploy()` via ethers.js
- Add deployment verification via block explorer APIs (Etherscan, etc.)
- Store deployment records in database with chain ID, tx hash, block number
- Add deployment dry-run mode that estimates gas without submitting

**Files:** `src/multichain/deployment-service.ts`
**Scope:** ~200 lines rewritten

### 1.5 Schedule Automatic Resource Cleanup

**Finding:** Four subsystems have `cleanup()` methods that are never called:
- `src/infrastructure/cache.ts:265-282`
- `src/security/auth-service.ts:614-634`
- `src/infrastructure/job-queue.ts:413-432`
- `src/security/rate-limiter.ts:236-255`

Long-running servers will OOM as Maps grow unbounded.

**Fix:**
Add to `src/api/server.ts` after `jobQueue.start()`:
```typescript
// Schedule automatic cleanup
const FIVE_MINUTES = 5 * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;
const SIX_HOURS = 6 * 60 * 60 * 1000;

setInterval(() => cache.cleanup(), FIVE_MINUTES);
setInterval(() => authService.cleanup(), FIVE_MINUTES);
setInterval(() => rateLimiter.cleanup(), THIRTY_MINUTES);
setInterval(() => jobQueue.cleanup(24 * 60 * 60 * 1000), SIX_HOURS);
```

Also add size limits to `MemoryStore` with LRU eviction (or migrate to Redis/PostgreSQL per 1.7).

**Files:** `src/api/server.ts`, `src/database/memory-store.ts`
**Scope:** ~40 lines added

### 1.6 Fix Graceful Shutdown

**Finding:** `src/api/server.ts:176-186` — Shutdown stops the job queue but doesn't flush caches, close database connections, drain pending HTTP requests, or clear cleanup intervals.

**Fix:**
```typescript
const server = app.listen(PORT, () => { ... });

process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close();           // Stop accepting new connections
  jobQueue.stop();          // Stop processing jobs
  clearInterval(cacheCleanup);
  clearInterval(authCleanup);
  clearInterval(rateLimiterCleanup);
  clearInterval(jobQueueCleanup);
  await database.close();   // Close DB pool
  process.exit(0);
});
```

**Files:** `src/api/server.ts`
**Scope:** ~20 lines changed

### 1.7 Wire Up PostgreSQL as Default Store

**Finding:** `src/database/postgres-store.ts` exists but is never used. All route files use `new Map()` directly or import `MemoryStore`. The PostgreSQL adapter was written but never wired into the application.

**Fix:**
- In `src/api/server.ts`, initialize the database service based on `DATABASE_TYPE` env var
- Pass the database service instance to route factories (requires refactoring routes to accept a DB parameter)
- Default to PostgreSQL in production, memory in development/test
- Run `schema.sql` on first connection (or use a migration tool)
- Replace all route-local `Map` instances with calls to the database service

**Files:** `src/api/server.ts`, all 23 route files, `src/database/postgres-store.ts`
**New dependency:** `pg`, `@types/pg`
**Scope:** Large — each route file needs its `Map` replaced with DB calls. ~500 lines across 23 files.

---

## Tier 2: Test & Quality (Required Before Production)

### 2.1 Replace Mock API Integration Tests with Real HTTP Tests

**Finding:** `test/api.integration.test.ts` defines a `MockApiClient` that returns hardcoded responses. It tests the mock, not the code.

**Fix:**
- Install `supertest`
- Replace `MockApiClient` with `supertest(app)` calls against the real Express app
- Test actual HTTP request/response cycles including validation, auth, error handling
- Cover at minimum: campaign CRUD, pledge creation, auth flow, payment initiation

**Files:** `test/api.integration.test.ts`
**New dependency:** `supertest`, `@types/supertest`
**Scope:** ~300 lines rewritten

### 2.2 Fix Phase 10 Test Dependencies

**Finding:** `test/Phase10Platform.test.ts` imports from `vitest` which is not in `package.json`. These tests cannot run.

**Fix:** Either:
- **(A)** Add `vitest` to devDependencies and configure it, OR
- **(B)** Port Phase 10 tests to mocha/chai (consistent with the rest of the test suite)

Option B is recommended for consistency. The test structure (describe/it/expect) maps cleanly to mocha/chai.

**Files:** `test/Phase10Platform.test.ts`, `package.json`
**Scope:** ~50 lines changed (mostly import swaps)

### 2.3 Add Real Behavioral Assertions to Existing Tests

**Finding:** Many tests use trivial truthiness checks (`expect(triggered).to.be.true`) without validating the actual behavior.

**Fix prioritization:**
1. `test/CampaignRegistry.test.ts` — Assert on event args (campaignId, beneficiary, amounts), not just event existence
2. `test/ResolutionEngine.test.ts` — Assert on job state transitions, milestone data, and pledge amounts after resolution
3. `test/api.integration.test.ts` — (covered by 2.1 above)

**Files:** `test/CampaignRegistry.test.ts`, `test/ResolutionEngine.test.ts`, other test files
**Scope:** ~100 lines changed across test files

### 2.4 Add Missing Edge Case Tests

**Finding:** No coverage for: race conditions in escrow, oracle disagreement handling, partial refund accuracy, payment processing failure recovery.

**New tests to add:**
| Test | What it covers |
|---|---|
| Concurrent pledge + refund on same campaign | Race condition in escrow state |
| Oracle returns conflicting results | Aggregator tiebreaking logic |
| Partial milestone completion | Correct percentage-based fund release |
| Payment webhook arrives before checkout confirms | Out-of-order event handling |
| Database connection lost mid-transaction | Graceful degradation |
| Rate limiter under concurrent load | No bypass at async boundaries |

**Files:** New test files or additions to existing suites
**Scope:** ~400 lines new tests

### 2.5 Standardize Error Response Format

**Finding:** Five distinct error formats across routes: `{error: {code, message}}`, `{success: false, error, details}`, custom `errorResponse()` helper, and simple `{error: "..."}`.

**Fix:**
- Define a single `ApiError` class and `errorResponse()` utility
- Standardize on:
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Human-readable message",
      "details": {}
    }
  }
  ```
- Apply consistently across all 23 route files
- Update `errorHandlerMiddleware` to use the same format for uncaught errors

**Files:** New `src/api/error.ts`, all 23 route files, `src/security/middleware.ts`
**Scope:** ~200 lines across files

### 2.6 Standardize Validation Approach

**Finding:** Phase 1-6 routes use Zod. Phase 7-10 routes use manual checks or nothing. The split indicates different generation passes.

**Fix:**
- Pick one: Zod (already a dependency, used in 10 files)
- Add Zod schemas to all Phase 7-10 route files
- Create shared schema modules for common types (pagination, IDs, addresses)
- Remove redundant manual validation where Zod covers it

**Files:** 13 route files (Phase 7-10), new `src/api/schemas/` directory
**Scope:** ~300 lines added

---

## Tier 3: Production Hardening (Pre-Launch Polish)

### 3.1 Implement At Least One Real External Integration

**Finding:** All five integration platforms (Slack, Discord, Zapier, Telegram, Google Calendar) are `console.log` only. OAuth token exchange is fake.

**Recommended starting point:** Slack (most commonly used for notifications).

**Fix:**
- Install `@slack/web-api`
- Replace `sendSlackNotification()` in `src/integrations/integration-service.ts:439-459` with real Slack API calls
- Implement real OAuth token exchange for Slack
- Add Slack webhook verification

**Files:** `src/integrations/integration-service.ts`
**New dependency:** `@slack/web-api`
**Scope:** ~100 lines for Slack; repeat pattern for Discord/Telegram

### 3.2 Add Distributed Tracing

**Finding:** Request IDs are generated but not propagated through service calls. No OpenTelemetry, no correlation IDs in logs.

**Fix:**
- Use AsyncLocalStorage to propagate request IDs through the call chain
- Pass request context through service method calls
- Include request ID in all log output
- Optionally add OpenTelemetry spans for critical paths (payment, resolution)

**Files:** `src/security/middleware.ts`, service files
**New dependency:** (optional) `@opentelemetry/sdk-node`
**Scope:** ~150 lines

### 3.3 Add WebSocket or SSE for Real-Time Updates

**Finding:** README mentions "live updates" for backers. No WebSocket implementation exists. Webhook system uses HTTP POST only.

**Fix:**
- Add `ws` or use Express SSE for backer progress updates
- Emit events on: pledge created, milestone verified, fund released, campaign completed
- Connect to the existing event emitter in `ResolutionEngine`

**Files:** New `src/api/websocket.ts`, `src/api/server.ts`
**New dependency:** `ws` or none (SSE is built into Express)
**Scope:** ~150 lines

### 3.4 Replace Fire-and-Forget Async Patterns

**Finding:** `src/compliance/gdpr-service.ts:98` — `this.processExport(requestId)` is not awaited. `src/payments/stripe-provider.ts:226` — `setTimeout` for refund processing with no completion tracking.

**Fix:**
- Route async work through the existing job queue instead of fire-and-forget
- For GDPR exports: `jobQueue.add({ type: 'gdpr-export', data: { requestId } })`
- For refund processing: `jobQueue.add({ type: 'process-refund', data: { refundId } })`
- Add job handlers that update status on completion/failure
- Expose job status via API so callers can poll for completion

**Files:** `src/compliance/gdpr-service.ts`, `src/payments/stripe-provider.ts`, `src/infrastructure/job-queue.ts`
**Scope:** ~100 lines

### 3.5 Add Differentiated Error Handling

**Finding:** 261 catch blocks across 44 files. No distinction between retryable and fatal errors. Financial operations fail silently.

**Fix:**
- Create error hierarchy: `AppError` → `RetryableError`, `ValidationError`, `AuthError`, `ExternalServiceError`
- In catch blocks, match on error type and take appropriate action:
  - `RetryableError`: Log, enqueue retry via job queue
  - `ValidationError`: Return 400 with details
  - `AuthError`: Return 401/403
  - `ExternalServiceError`: Return 502/503, alert monitoring
- Add alerting for financial operation failures (payment, settlement, escrow release)

**Files:** New `src/errors.ts`, updated catch blocks across service files
**Scope:** ~200 lines new, ~100 lines changed across services

### 3.6 Clean Up Documentation-Reality Gap

**Finding:** README is 2,240 lines describing a finished product. References "NatLangChain" which doesn't exist in code. Claims features that are mocked.

**Fix:**
- Remove NatLangChain references (lines 3, 161-169) unless actually integrating it
- Add a "Status" section at the top that honestly describes what works vs. what's planned
- Move aspirational feature descriptions to a `ROADMAP.md`
- Shrink the README to cover: what the project does, how to run it, what's implemented, what's not

**Files:** `README.md`, new `ROADMAP.md`
**Scope:** README edit/reduction, ~200 lines moved

### 3.7 Remove Dead Code and Unused Exports

**Finding:** Barrel `index.ts` files export types never consumed by other modules. `postgres-store.ts` interfaces defined but PostgreSQL never instantiated (until Tier 1.7 is done).

**Fix (after Tier 1.7):**
- Remove unused type exports from `src/oracle/index.ts` and other barrel files
- Remove `simulateDeployment()`, `simulatePaymentSuccess()`, and other test-only methods from production source (move to test helpers)
- Remove all "In production, use X" comments — the production code should just use X

**Files:** Various `index.ts`, provider files
**Scope:** ~100 lines removed

---

## Dependency Summary

| Package | Tier | Purpose |
|---|---|---|
| `ethers` (move to deps) | 0.1 | Real ECDSA signature verification |
| `stripe` | 1.1 | Stripe payment processing |
| `pg`, `@types/pg` | 1.7 | PostgreSQL database |
| `supertest`, `@types/supertest` | 2.1 | Real HTTP testing |
| `@slack/web-api` | 3.1 | Slack integration |
| `ws` | 3.3 | WebSocket support (optional) |

---

## Implementation Order

```
Week 1: Tier 0 (Security)
  ├── 0.1 Fix ECDSA verification
  ├── 0.2 Add auth to unprotected routes
  └── 0.3 Validate env vars at startup

Week 2-3: Tier 1 (Core Functionality)
  ├── 1.5 Schedule cleanup (quick win)
  ├── 1.6 Fix graceful shutdown (quick win)
  ├── 1.7 Wire up PostgreSQL (largest item)
  ├── 1.1 Real Stripe integration
  ├── 1.2 Real Circle integration
  ├── 1.3 Real settlement service
  └── 1.4 Real contract deployment

Week 4: Tier 2 (Tests & Quality)
  ├── 2.1 Real API integration tests
  ├── 2.2 Fix Phase 10 test deps
  ├── 2.3 Better assertions
  ├── 2.4 Edge case tests
  ├── 2.5 Standardize errors
  └── 2.6 Standardize validation

Week 5+: Tier 3 (Hardening)
  ├── 3.1 Real Slack integration
  ├── 3.2 Distributed tracing
  ├── 3.3 WebSocket updates
  ├── 3.4 Fix fire-and-forget async
  ├── 3.5 Error hierarchy
  ├── 3.6 Fix documentation
  └── 3.7 Remove dead code
```

---

## Success Criteria

The remediation is complete when:

1. **Auth is real** — A forged signature is rejected; only cryptographically valid wallet signatures authenticate
2. **Payments are real** — A test-mode Stripe checkout creates a real Stripe session; webhooks verify signatures
3. **Data persists** — Server restart does not lose campaigns, pledges, or payment records
4. **Tests test the code** — `npm test` runs all suites with zero mocked-self assertions; API tests hit real HTTP
5. **Cleanup runs** — A server running for 24 hours does not accumulate unbounded memory
6. **Errors are handled** — A failed payment produces a 502, logs the error, and does not return `{ status: "success" }`
7. **Documentation is honest** — README describes what the code actually does today, with a roadmap for what's planned
