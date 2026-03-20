# Tasks: Whitelist Channel Label

**Input**: Design documents from `specs/047-whitelist-label/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, quickstart.md ✅

**Tests**: TDD is mandatory per Constitution Principle II. Test tasks precede every implementation task and must fail before implementation begins.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths are included in every description

---

## Phase 1: Setup

**Purpose**: Verify working environment and confirm baseline tests pass before any changes.

- [X] T001 Confirm existing test suite passes: `cd verification-zones/verification-agent && python -m pytest tests/ -v` and `cd verification-zones/verification-agent/cdk && npm test`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend shared data structures (`AuthorizationResult` dataclass and `channel_labels` dict in whitelist cache) that all user stories depend on. Must be complete before any user-story phase begins.

**⚠️ CRITICAL**: No user story implementation can begin until this phase is complete.

### Tests (write first — must fail before implementation)

- [X] T002 Write failing tests in `verification-zones/verification-agent/tests/test_authorization.py` (new file): assert `AuthorizationResult` has `channel_label: Optional[str]` field defaulting to `None`; assert `load_whitelist_config()` return value includes `"channel_labels"` key of type `dict`; assert authorization success/failure log events include `"channel_label"` when label is set and omit the key when label is absent
- [X] T003 Update `verification-zones/verification-agent/tests/test_main.py`: add `channel_label=None` to all `AuthorizationResult` mock instances so existing tests still pass after dataclass field addition
- [X] T004 Update `verification-zones/verification-agent/tests/test_slack_url_resolver.py`: add `"channel_labels": {}` to all `load_whitelist_config` mock return dicts

### Implementation

- [X] T005 Add `channel_label: Optional[str] = None` field to `AuthorizationResult` dataclass in `verification-zones/verification-agent/src/authorization.py` (after existing `channel_id` field, before `unauthorized_entities`)
- [X] T006 [P] Add `channel_label: Optional[str] = None` field to `AuthorizationResult` dataclass in `verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler/authorization.py` (same position as T005)
- [X] T007 Update `load_whitelist_config()` in `verification-zones/verification-agent/src/authorization.py`: add `"channel_labels": {}` (empty dict) to the cache structure and return value; populate it from loader functions in later phases
- [X] T008 [P] Update `load_whitelist_config()` in `verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler/whitelist_loader.py`: same change as T007 (add `"channel_labels": {}` to cache dict and return)
- [X] T009 Update `authorize_request()` in `verification-zones/verification-agent/src/authorization.py`: after channel_id whitelist match, look up `whitelist["channel_labels"].get(channel_id)` and store as `channel_label`; inject `"channel_label": channel_label` into `whitelist_authorization_success` and `whitelist_authorization_failed` log events only when `channel_label` is truthy; set `channel_label` on returned `AuthorizationResult`
- [X] T010 [P] Apply the same `authorize_request()` log injection changes to `verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler/authorization.py` (parallel to T009, different file)
- [X] T011 Run `python -m pytest tests/ -v` from `verification-zones/verification-agent/` — all tests must pass

**Checkpoint**: Shared data structures complete. All user story phases can now begin.

---

## Phase 3: User Story 1 — DynamoDB Label Loading (Priority: P1) 🎯 MVP

**Goal**: `_get_whitelist_from_dynamodb()` reads the optional `label` attribute from DynamoDB items and populates `channel_labels` in the returned whitelist dict.

**Independent Test**: Add a `label` attribute to a `channel_id` DynamoDB item; confirm auth logs show `channel_label` in the authorization event.

### Tests (write first — must fail before implementation)

- [X] T012 Add failing tests to `verification-zones/verification-agent/tests/test_authorization.py`: mock DynamoDB response with a `channel_id` item containing `label` attribute → assert `load_whitelist_config()["channel_labels"]` maps that channel ID to its label; mock item without `label` attribute → assert channel ID is NOT in `channel_labels`; mock item with empty string `label` → assert channel ID is NOT in `channel_labels`

### Implementation

- [X] T013 Update `_get_whitelist_from_dynamodb()` in `verification-zones/verification-agent/src/authorization.py`: when `entity_type == "channel_id"`, also read `item.get("label", {}).get("S", "")` and if non-empty add `{entity_id: label}` to a local `channel_labels` dict; include `channel_labels` in the returned dict
- [X] T014 [P] Apply the same DynamoDB label parsing to `get_whitelist_from_dynamodb()` in `verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler/whitelist_loader.py` (parallel to T013, different file)
- [X] T015 Run `python -m pytest tests/ -v` from `verification-zones/verification-agent/` — all tests must pass

**Checkpoint**: US1 complete. DynamoDB-sourced labels appear in auth logs.

---

## Phase 4: User Story 2 — Secrets Manager Object Format (Priority: P2)

**Goal**: `_get_whitelist_from_secrets_manager()` accepts `channel_ids` elements as either plain strings or `{"id": "...", "label": "..."}` objects, populating `channel_labels`.

**Independent Test**: Set Secrets Manager secret with mixed-format `channel_ids`; confirm auth passes and labels appear in logs.

### Tests (write first — must fail before implementation)

- [X] T016 Add failing tests to `verification-zones/verification-agent/tests/test_authorization.py`: mock Secrets Manager response with `channel_ids: [{"id": "C001", "label": "#general"}, "C002"]` → assert `channel_labels == {"C001": "#general"}` and `channel_ids == {"C001", "C002"}`; mock with all strings → assert `channel_labels == {}`; mock with object missing `"label"` key → assert channel ID present in `channel_ids` with no label; mock with mixed format including empty `"label"` → treated as absent

### Implementation

- [X] T017 Update `_get_whitelist_from_secrets_manager()` in `verification-zones/verification-agent/src/authorization.py`: parse each element of `secret_data.get("channel_ids", [])` — if `str`, add to `channel_ids` set; if `dict` with `"id"` key, add `entry["id"]` to `channel_ids` set and add to `channel_labels` if `entry.get("label", "")` is truthy
- [X] T018 [P] Apply the same Secrets Manager parsing to `get_whitelist_from_secrets_manager()` in `verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler/whitelist_loader.py` (parallel to T017, different file)
- [X] T019 Run `python -m pytest tests/ -v` from `verification-zones/verification-agent/` — all tests must pass

**Checkpoint**: US2 complete. Secrets Manager object-format entries supported.

---

## Phase 5: User Story 3 — CDK Config Dict Format (Priority: P3)

**Goal**: `cdk.config.{env}.json` and `--context` args accept `{"id": "...", "label": "..."}` objects for `autoReplyChannelIds` / `mentionChannelIds`. Lambda receives comma-separated IDs only (labels stripped in CDK).

**Independent Test**: Set `cdk.config.dev.json` with object-format channel entries; run `npm run synth` and confirm `AUTO_REPLY_CHANNEL_IDS` env var contains IDs only; confirm CDK Jest tests pass.

### Tests (write first — must fail before implementation)

- [X] T020 Add failing Jest tests in `verification-zones/verification-agent/cdk/test/verification-stack.test.ts`: instantiate stack with `autoReplyChannelIds: [{ id: "C001", label: "#general" }, "C002"]` and assert `AUTO_REPLY_CHANNEL_IDS` Lambda env var equals `"C001,C002"` (IDs only, no labels)
- [X] T021 Add failing unit tests for `parseChannelIdContext` in a new file `verification-zones/verification-agent/cdk/test/cdk-config.test.ts`: assert object-format JSON string is parsed correctly; assert plain string CSV is parsed correctly; assert mixed array (string + object) returns `ChannelIdEntry[]`; assert backward-compat with plain `string[]` fallback

### Implementation

- [X] T022 Add `ChannelIdEntry` union type and update `CdkConfig` interface and Zod schema in `verification-zones/verification-agent/cdk/lib/types/cdk-config.ts`: export `type ChannelIdEntry = string | { id: string; label: string }`; update `autoReplyChannelIds?: ChannelIdEntry[]`; update `mentionChannelIds?: ChannelIdEntry[]`; update Zod schema with `z.union([z.string(), z.object({ id: z.string(), label: z.string() })])`
- [X] T023 Update `parseChannelIdContext()` in `verification-zones/verification-agent/cdk/bin/cdk.ts`: change return type to `ChannelIdEntry[]`; when JSON-parsing produces an array, map elements — if string keep as-is, if object with `"id"` key keep as `ChannelIdEntry`; handle comma-separated string fallback (plain strings only, backward-compat)
- [X] T024 Update `SlackEventHandlerProps` and env var serialization in `verification-zones/verification-agent/cdk/lib/constructs/slack-event-handler.ts`: change `autoReplyChannelIds?: string[]` to `ChannelIdEntry[]`; change `mentionChannelIds?: string[]` to `ChannelIdEntry[]`; update the `join(",")` calls to first `.map(e => typeof e === "string" ? e : e.id)` before joining
- [X] T025 Update `verification-zones/verification-agent/cdk/cdk.config.json.example`: add object-format examples to `autoReplyChannelIds` and `mentionChannelIds` with a comment explaining mixed format support
- [X] T026 Run `npm test` from `verification-zones/verification-agent/cdk/` — all Jest tests must pass

**Checkpoint**: US3 complete. CDK config supports object format; Lambda env vars contain IDs only.

---

## Phase 6: User Story 4 — Environment Variable `ID:label` Format (Priority: P4)

**Goal**: `_get_whitelist_from_env()` parses `WHITELIST_CHANNEL_IDS` tokens in `ID:label` format alongside plain IDs.

**Independent Test**: Export `WHITELIST_CHANNEL_IDS=C001:#general,C002` and confirm auth logs show `channel_label=#general` for `C001` and no label for `C002`.

### Tests (write first — must fail before implementation)

- [X] T027 Add failing tests to `verification-zones/verification-agent/tests/test_authorization.py`: set env var to `"C001:#general,C002:#ops,C003"` → assert `channel_ids == {"C001", "C002", "C003"}` and `channel_labels == {"C001": "#general", "C002": "#ops"}`; set env var to `"C001,C002"` (plain, backward-compat) → assert `channel_labels == {}`; set env var with empty label `"C001:"` → assert `C001` in `channel_ids` but NOT in `channel_labels`

### Implementation

- [X] T028 Update `_get_whitelist_from_env()` in `verification-zones/verification-agent/src/authorization.py`: for each comma-split token call `token.split(":", 1)` — first part is `channel_id`, second part (if present and non-empty) is `label`; populate `channel_labels` dict accordingly; add `channel_labels` to returned dict
- [X] T029 [P] Apply the same env var parsing to `_get_whitelist_from_env()` in `verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler/whitelist_loader.py` (parallel to T028, different file)
- [X] T030 Run `python -m pytest tests/ -v` from `verification-zones/verification-agent/` — all tests must pass

**Checkpoint**: All four user stories complete and independently testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Full validation, documentation sync, and deployment script verification.

- [X] T031 Run full Python test suite from `verification-zones/verification-agent/`: `python -m pytest tests/ -v` — all tests green
- [X] T032 [P] Run CDK Jest tests from `verification-zones/verification-agent/cdk/`: `npm test` — all tests green
- [X] T033 [P] Run ruff linter: `cd verification-zones/verification-agent/src && ruff check .` — zero errors
- [X] T034 Update `CHANGELOG.md` `[Unreleased]` section: add entry for channel label support across DynamoDB, Secrets Manager, CDK config, and environment variable paths
- [X] T035 [P] Update `verification-zones/verification-agent/README.md` and `verification-zones/verification-agent/README.ja.md`: document the optional `label` attribute for whitelist channel entries and the four configuration formats
- [X] T036 Update `CLAUDE.md` "Recent Changes": add entry for this feature describing the `label` addition and four configuration paths

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — **BLOCKS all user story phases**
- **US1 (Phase 3)**: Depends on Phase 2 — no dependency on US2/US3/US4
- **US2 (Phase 4)**: Depends on Phase 2 — no dependency on US1/US3/US4
- **US3 (Phase 5)**: Depends on Phase 2 — no dependency on US1/US2/US4
- **US4 (Phase 6)**: Depends on Phase 2 — no dependency on US1/US2/US3
- **Polish (Phase 7)**: Depends on all desired user stories complete

### User Story Dependencies

- **US1 (P1)**: Independent — DynamoDB loader only
- **US2 (P2)**: Independent — Secrets Manager loader only
- **US3 (P3)**: Independent — TypeScript CDK only (no Python loader overlap)
- **US4 (P4)**: Independent — env var loader only

### Parallel Opportunities Within Each Phase

| Phase | Parallel Tasks |
|---|---|
| Phase 2 | T006 ∥ T008 ∥ T010 (different files) |
| Phase 3 | T013 ∥ T014 (agent src vs Lambda copy) |
| Phase 4 | T017 ∥ T018 (agent src vs Lambda copy) |
| Phase 6 | T028 ∥ T029 (agent src vs Lambda copy) |
| Phase 7 | T032 ∥ T033 ∥ T035 |

### Cross-phase Parallel Opportunities

After Phase 2 (Foundational) is complete, US1/US2/US3/US4 can all proceed in parallel since they touch disjoint files.

---

## Parallel Example: Phase 2 (Foundational)

```bash
# After T002-T004 tests are written:
# Run in parallel:
Task T005: Add channel_label field to authorization.py (agent src)
Task T006: Add channel_label field to authorization.py (Lambda copy)   ← parallel with T005

Task T007: Update load_whitelist_config() in authorization.py (agent src)
Task T008: Update load_whitelist_config() in whitelist_loader.py (Lambda)  ← parallel with T007

Task T009: Update authorize_request() logging in authorization.py (agent src)
Task T010: Update authorize_request() logging in authorization.py (Lambda)  ← parallel with T009
```

## Parallel Example: After Phase 2 Complete

```bash
# All four user stories can proceed in parallel:
Team A → Phase 3 (US1): DynamoDB loader  (Python, authorization.py + whitelist_loader.py)
Team B → Phase 4 (US2): Secrets Manager  (Python, authorization.py + whitelist_loader.py)
Team C → Phase 5 (US3): CDK config       (TypeScript only — zero Python overlap)
Team D → Phase 6 (US4): Env var loader   (Python, authorization.py + whitelist_loader.py)
```

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational ← **CRITICAL**
3. Complete Phase 3: US1 (DynamoDB)
4. **STOP and VALIDATE**: Add a labeled entry to DynamoDB, trigger a request, confirm `channel_label` in logs
5. Ship MVP — remaining stories add value incrementally

### Incremental Delivery

1. Phase 1 + 2 → Foundation ready
2. Phase 3 (US1) → Labels work for DynamoDB-managed whitelists → deploy/demo
3. Phase 4 (US2) → Labels work for Secrets Manager-managed whitelists → deploy/demo
4. Phase 5 (US3) → Labels work in CDK config → deploy/demo (requires CDK redeploy)
5. Phase 6 (US4) → Labels work in env var fallback → deploy/demo

---

## Task Summary

| Phase | Tasks | Story |
|---|---|---|
| Phase 1: Setup | T001 | — |
| Phase 2: Foundational | T002–T011 | — |
| Phase 3: DynamoDB | T012–T015 | US1 |
| Phase 4: Secrets Manager | T016–T019 | US2 |
| Phase 5: CDK Config | T020–T026 | US3 |
| Phase 6: Env Var | T027–T030 | US4 |
| Phase 7: Polish | T031–T036 | — |
| **Total** | **36 tasks** | |

- Tests: T002, T003, T004, T012, T016, T020, T021, T027 (8 test-writing tasks)
- Implementation: T005–T011, T013–T014, T017–T018, T022–T025, T028–T029 (17 tasks)
- Validation runs: T001, T011, T015, T019, T026, T030, T031–T033 (9 tasks)
- Documentation: T034–T036 (3 tasks)
- Parallel opportunities: 14 tasks marked [P]
