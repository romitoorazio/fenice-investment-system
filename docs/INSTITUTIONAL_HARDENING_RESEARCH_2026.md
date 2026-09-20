# Fenice Institutional Hardening Research — 2026

Status: research/engineering backlog only. This document does **not** authorize live trading.

## Non-negotiable safety invariant

- Live order submission remains compile-time blocked.
- Research changes must be developed and validated in paper/read-only mode first.
- No control may be marked PASS without machine-verifiable or runtime evidence.
- Secrets must never be committed, logged, printed, or embedded in generated evidence.

## Public benchmark findings

### 1. Pre-trade market-access controls
Benchmark: SEC Rule 15c3-5 / FINRA market-access guidance.

Fenice target controls:
- aggregate capital/exposure ceilings plus per-symbol/per-sector limits;
- order notional and quantity ceilings;
- dynamic price collars / fat-finger rejection;
- duplicate-order and burst-rate detection;
- restricted-instrument/account gate;
- authorization gate before any executable path;
- immediate post-trade/paper-execution surveillance events;
- fail-closed behavior when required risk inputs are stale, unavailable, inconsistent, or unverifiable.

Design rule: a violating order must be rejected before routing; cancel-after-send is not an acceptable risk control.

### 2. Algorithm lifecycle and operational safety
Benchmark: FINRA algorithmic-trading examination priorities.

Fenice target controls:
- independent pre-implementation tests;
- versioned model/strategy/risk configuration;
- production/paper behavior monitoring;
- firmwide hierarchical kill switch;
- controlled deployment/change management;
- deterministic replay of incidents and order-state transitions.

### 3. Order-state correctness
Benchmark: FIX Trading Community order-state matrices.

Fenice target controls:
- explicit state-transition matrix;
- impossible-transition rejection;
- partial-fill, cancel/replace, reject, timeout and recovery scenarios;
- idempotent event processing;
- reconciliation after restart/disconnect;
- deterministic audit history for every transition.

### 4. Secure software supply chain
Benchmark: NIST SSDF 1.2 draft and secure-development practices.

Fenice target controls:
- dependency inventory / SBOM generation;
- dependency vulnerability gate in CI;
- pinned/reproducible dependency policy where practical;
- provenance/evidence for certification builds;
- secret scanning and generated-artifact scanning;
- least-privilege CI permissions;
- documented security review for dependency upgrades.

## Additional Fenice expert controls

### Risk-of-ruin firewall
Before an order can become executable (future capability only), compute projected gross/net exposure, concentration, liquidity-adjusted exposure, drawdown budget and correlated-factor exposure. Any unavailable required input => BLOCKED.

### Data confidence firewall
Every decision input should carry source, timestamp, freshness, confidence and independent-validation metadata. Critical stale/divergent data must degrade the system to NO-NEW-RISK rather than silently falling back to an unqualified value.

### Shadow-vs-paper divergence
Run strategy decisions through a deterministic shadow path and compare expected intent, risk decision, simulated fill and resulting portfolio state. Material unexplained divergence => certification failure.

### Resilience / chaos certification
Inject disconnects, stale quotes, malformed broker messages, duplicated events, out-of-order events, partial writes, restart during transition, clock skew and unavailable upstream sources. Required outcome: no unauthorized order path, no silent state corruption, deterministic recovery or explicit BLOCKED state.

### Evidence-based certification
Certification must be generated from evidence, not manually asserted booleans. Evidence records should include test/control id, software revision, timestamp, environment class, result, evidence hash/reference and expiry where relevant. Time-matured controls (for example paper-30d) cannot be bypassed by configuration.

## Acceptance gates before Fenice READY

1. Production CI GREEN at the candidate revision.
2. Current-tree secret scan GREEN.
3. Critical sources GREEN or documented fail-safe fallback.
4. Data Quality and cross-source validation PASS.
5. System/risk/resilience tests PASS with retained evidence.
6. Paper OMS validated, including restart/reconciliation scenarios.
7. Required time-matured paper evidence completed.
8. Runtime read-only broker evidence completed where required.
9. No unresolved critical/high certification findings.
10. Live trading remains blocked.
