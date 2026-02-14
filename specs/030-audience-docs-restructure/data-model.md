# Data Model: Content Migration Mapping

**Feature**: 030-audience-docs-restructure
**Date**: 2026-02-14

## Entity: Source Document

| Source File | Lines | Content Summary |
|-------------|-------|-----------------|
| `docs/quickstart.md` | 649 | Prerequisites, CDK config, Slack setup, deploy, whitelist, verify |
| `docs/reference/architecture/overview.md` | 255 | System overview, components, data flow, security principles, deploy options |
| `docs/reference/architecture/cross-account.md` | 275 | Cross-account IAM/API key auth, deploy phases, CDK config |
| `docs/reference/architecture/implementation-details.md` | 1,178 | Existence Check, handlers, processor, attachment pipeline, rate limiter |
| `docs/reference/architecture/user-experience.md` | 381 | End-user flows, timing, error scenarios, performance targets |
| `docs/reference/operations/slack-setup.md` | 535 | Slack App creation, OAuth, events, troubleshooting |
| `docs/reference/operations/monitoring.md` | 183 | CloudWatch alarms, incident response playbooks |
| `docs/reference/operations/deployment-iam-policy.md` | 54 | AgentCore IAM policy |
| `docs/reference/operations/testing.md` | 287 | BDD scenarios, compliance standards, traceability |
| `docs/reference/requirements/functional-requirements.md` | 97 | Business objectives, core features, NFRs, constraints |
| `docs/reference/security/authentication-authorization.md` | 757 | Two-Key Defense, 5-layer auth, attack scenarios, code examples |
| `docs/reference/security/threat-model.md` | 71 | Threat actors, T-01 to T-12 analysis |
| `docs/reference/security/requirements.md` | 152 | SR-01 to SR-05, NFR-01 to NFR-16 |
| `docs/reference/security/implementation.md` | 411 | 6-layer defense, Existence Check, whitelist, rate limiter, PII masking |
| `docs/reference/security/bedrock-cmk-consideration.md` | 53 | CMK requirements, enablement steps |
| `docs/explanation/adr/README.md` | 74 | ADR index, template, guidelines |
| `docs/explanation/adr/001-bedrock-foundation-model.md` | 95 | Bedrock model selection decision |
| `docs/explanation/adr/002-regex-pii-detection.md` | 86 | Regex PII detection decision |
| `docs/explanation/adr/003-response-url-async.md` | 55 | Async response pattern decision |
| `docs/explanation/adr/004-slack-api-existence-check.md` | 95 | Existence Check decision |
| `docs/explanation/design-principles.md` | 231 | 9 behavioral theories with citations |
| `docs/presentation/security-overview.md` | 563 | 20-slide non-technical security deck |
| `docs/presentation/non-technical-overview.md` | 448 | 20-slide system value/features deck |
| `docs/presentation/README.md` | 117 | Presentation index |
| `docs/how-to/troubleshooting.md` | 575 | Error catalog, AgentCore issues, log patterns |
| `docs/how-to/troubleshooting-no-reply.md` | 120 | No-reply checklist |
| `docs/how-to/verify-processing-flow.md` | 166 | E2E flow diagram, per-stage verification |
| `docs/appendix.md` | 135 | Glossary, references, bibliography |
| `docs/implementation/roadmap.md` | 270 | 5-phase roadmap (all complete) |
| **Total** | **7,359** | |

## Entity: Target Document

| Target | Est. Lines | Sources (count) | Action |
|--------|-----------|-----------------|--------|
| `developer/quickstart.md` | 550 | 1 | Adapt |
| `developer/architecture.md` | 800 | 5 | Merge |
| `developer/runbook.md` | 650 | 3 | Merge |
| `developer/testing.md` | 250 | 1 | Adapt |
| `developer/requirements.md` | 300 | 2 | Merge |
| `developer/adr/` (5 files) | 380 | 5 | Move |
| `developer/security.md` | 900 | 5 | Merge |
| `developer/troubleshooting.md` | 700 | 3 | Merge |
| `decision-maker/proposal.md` | 200 | 1 (partial) | New/derive |
| `decision-maker/security-overview.md` | 500 | 1 | Adapt |
| `decision-maker/design-principles.md` | 300 | 2 | Adapt |
| `decision-maker/cost-and-resources.md` | 100 | 0 | New |
| `decision-maker/governance.md` | 80 | 0 | New |
| `user/user-guide.md` | 150 | 2 (partial) | New/derive |
| `user/usage-policy.md` | 80 | 0 | New |
| `user/faq.md` | 100 | 3 (partial) | New/aggregate |
| **Total** | **~6,040** | | **~18% reduction** |

## Relationships: Source → Target

```text
quickstart.md ──────────────────────────────► developer/quickstart.md
reference/architecture/overview.md ─────────┐
reference/architecture/cross-account.md ────┤
reference/architecture/implementation-details.md ──┤
reference/architecture/user-experience.md ──┼──► developer/architecture.md
appendix.md (glossary) ────────────────────┘      ├──► user/user-guide.md (UX portions)
reference/operations/slack-setup.md ────────┐
reference/operations/monitoring.md ─────────┼──► developer/runbook.md
reference/operations/deployment-iam-policy.md ──┘
reference/operations/testing.md ────────────► developer/testing.md
reference/requirements/functional-requirements.md ─┐
implementation/roadmap.md ─────────────────────────┼──► developer/requirements.md
reference/security/authentication-authorization.md ─┐
reference/security/threat-model.md ─────────────────┤
reference/security/requirements.md ─────────────────┤
reference/security/implementation.md ───────────────┼──► developer/security.md
reference/security/bedrock-cmk-consideration.md ────┘
explanation/adr/README.md ──────────────────┐
explanation/adr/001-*.md ───────────────────┤
explanation/adr/002-*.md ───────────────────┼──► developer/adr/ (subfolder)
explanation/adr/003-*.md ───────────────────┤
explanation/adr/004-*.md ───────────────────┘
how-to/troubleshooting.md ─────────────────┐
how-to/troubleshooting-no-reply.md ────────┼──► developer/troubleshooting.md
how-to/verify-processing-flow.md ──────────┘
explanation/design-principles.md ──────────┐
appendix.md (bibliography) ───────────────┼──► decision-maker/design-principles.md
presentation/security-overview.md ─────────► decision-maker/security-overview.md
presentation/non-technical-overview.md ────┬──► decision-maker/proposal.md
                                           └──► user/user-guide.md (usage portions)
presentation/README.md ────────────────────► (archived — no target)
```

## State Transitions

```text
Source files: EXISTS → MIGRATED → DELETED (after legacy folder removal)
Target files: NOT_EXISTS → CREATED → VALIDATED (header + quality check)
Legacy folders: EXISTS → EMPTIED → DELETED
Links: CURRENT_PATH → UPDATED_PATH → VERIFIED
```
