# Implementation Plan: Execution-Zones Code Cleanup

**Branch**: `043-exec-cleanup` | **Date**: 2026-03-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/043-exec-cleanup/spec.md`

## Summary

Remove 29 unused imports (ruff F401) and 10 spec-number annotations from Python source and test files across all four execution-zone agents (`file-creator-agent`, `fetch-url-agent`, `docs-agent`, `time-agent`). No behavioral changes — pure cleanup. Full inventory in [research.md](research.md).

## Technical Context

**Language/Version**: Python 3.11
**Primary Dependencies**: ruff (linting), pytest (test runner)
**Storage**: N/A
**Testing**: `python -m pytest tests/ -v` from each agent root
**Target Platform**: Linux (ARM64 container) — development cleanup only
**Project Type**: Multi-agent (four independent agent directories)
**Performance Goals**: N/A
**Constraints**: Zero behavioral changes; all tests must pass after each file edit
**Scale/Scope**: 29 F401 violations across 26 files; 10 spec-number annotations across 10 files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Required checks for every PR (constitution v1.1.0)**:
- [X] **SDD (I)**: spec in `specs/043-exec-cleanup/` exists; acceptance criteria are Given/When/Then verifiable
- [X] **TDD (II)**: cleanup-only — no new behavior added; existing tests act as regression guard; justified in Complexity Tracking
- [X] **Security-First (III)**: no security pipeline changes; not applicable
- [X] **Zone Isolation (V)**: changes are within execution-zones only; no cross-zone imports introduced
- [X] **Doc & Deploy Parity (VI)**: CHANGELOG and CLAUDE.md update tasks included in task plan

## Project Structure

### Documentation (this feature)

```text
specs/043-exec-cleanup/
├── plan.md       ← this file
├── research.md   ← Phase 0 output (inventory of violations)
├── tasks.md      ← Phase 2 output (/speckit.tasks)
└── checklists/
    └── requirements.md
```

### Source Code (affected files)

```text
execution-zones/
├── docs-agent/
│   └── src/main.py                               # remove `time`
├── fetch-url-agent/
│   ├── src/agent_card.py                         # remove `json`
│   ├── src/bedrock_client_converse.py            # remove `json`
│   └── tests/
│       ├── test_agent_card.py                    # remove `pytest`
│       ├── test_fetch_url.py                     # remove `pytest`
│       └── test_main.py                          # remove `pytest`
└── file-creator-agent/
    ├── src/
    │   ├── agent_card.py                         # remove `json`
    │   ├── attachment_processor.py               # remove `json`
    │   ├── bedrock_client_converse.py            # remove `json`
    │   ├── cloudwatch_metrics.py                 # remove `json`
    │   ├── document_extractor.py                 # remove `json`
    │   ├── file_config.py                        # remove spec-nums (014)(027)
    │   ├── file_downloader.py                    # remove `json` [preserve (429)]
    │   ├── main.py                               # remove spec-num (027) from comment
    │   ├── thread_history.py                     # remove `typing.Optional`
    │   └── tools/
    │       ├── __init__.py                       # remove spec-num (027)
    │       └── generate_chart_image.py           # remove `typing.List`
    └── tests/
        ├── test_agent_card.py                    # remove `pytest`; spec-num (035)
        ├── test_agent_factory.py                 # remove spec-nums (035)
        ├── test_attachment_processor.py          # remove `pytest`
        ├── test_bedrock_client.py                # remove `pytest`
        ├── test_cloudwatch_metrics.py            # remove `pytest`; 4 unused constants
        ├── test_file_config.py                   # remove `pytest`
        ├── test_file_downloader.py               # remove `pytest`
        ├── test_main.py                          # remove `time`,`threading`,`MagicMock`,`pytest`; spec-nums (021)(027)
        └── test_response_formatter.py            # remove `pytest`; spec-num (014)
```

**Structure Decision**: No new files or directories. All changes are targeted edits within existing files.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| TDD gate — no red phase | Cleanup removes unused code with zero behavior change; existing passing tests act as the regression guard | Introducing a failing test just to satisfy the gate mechanically would add test noise without improving safety; same approach used in 042-code-cleanup |
