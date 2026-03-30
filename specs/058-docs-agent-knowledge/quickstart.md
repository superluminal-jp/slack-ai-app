# Quickstart: Working on documentation for this feature

## Prerequisites

- Repository clone with `docs/` at the project root.
- Read `docs/DOCUMENTATION_STANDARDS.md` and `specs/058-docs-agent-knowledge/spec.md`.

## Edit flow

1. Identify gaps using `contracts/inquiry-coverage-checklist.md` and the success criteria in the spec (SC-001–SC-004).
2. Add or revise Markdown under `docs/user/`, `docs/developer/`, or `docs/decision-maker/` as appropriate.
3. Update `docs/README.md` navigation tables if new files or major sections are added.
4. Run any project doc checks (e.g., link checker if configured) and fix broken relative links.
5. Prepare `CHANGELOG.md` `[Unreleased]` entry in the same change set as the documentation updates.

## Local verification of Docs Agent search behavior (optional)

The Docs Agent `search_docs` tool reads bundled documentation (default `/app/docs`). For local runs, set `DOCS_PATH` to your repository root `docs/` directory when executing the agent so queries hit the same files you edited:

```bash
export DOCS_PATH="/absolute/path/to/slack-ai-app/docs"
```

(Exact invocation depends on the zone’s run instructions in `execution-zones/docs-agent/README.md`.)

## Definition of done (documentation slice)

- Inquiry-pattern checklist shows ≥90% coverage for the agreed sample set (SC-001).
- User-facing doc has ≥15 distinct FAQ/guide-style entries or sections (SC-002).
- No contradictory duplicate answers in the same release for the same question (SC-002).
- Stakeholder review outcome recorded for SC-004.
