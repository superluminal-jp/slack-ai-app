# Tasks: Slack ファイル生成（ベストプラクティス適用）

**Input**: Design documents from `/specs/027-slack-file-generation-best-practices/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Execution Agent**: `cdk/lib/execution/agent/execution-agent/`
- **Tools**: `cdk/lib/execution/agent/execution-agent/tools/`
- **CDK**: `cdk/lib/execution/constructs/`
- **Docs**: `specs/027-slack-file-generation-best-practices/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify feature context and prerequisite (026 best practices applied)

- [x] T001 Verify feature branch `027-slack-file-generation-best-practices` and spec structure in specs/027-slack-file-generation-best-practices/
- [x] T002 [P] Confirm 026 best practices are applied (HTTPS, IAM, AgentCore retry) per specs/026-best-practices-alignment/tasks.md — blocks foundational work if not

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core file generation infrastructure — MUST complete before any user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Extend file_config.py in cdk/lib/execution/agent/execution-agent/file_config.py: add MAX_FILE_SIZE_BYTES (10 MB), MAX_TEXT_FILE_BYTES (1 MB), MAX_OFFICE_FILE_BYTES (10 MB), MAX_IMAGE_FILE_BYTES (5 MB) per research.md §2.1
- [x] T004 Add sanitize_filename() to cdk/lib/execution/agent/execution-agent/file_config.py: remove control chars, replace `\ / : * ? " < > |` with `_`, strip leading/trailing spaces/dots, fallback to `generated_file_{timestamp}.{ext}` when empty per data-model.md
- [x] T005 Extend get_allowed_mime_types() defaults in cdk/lib/execution/agent/execution-agent/file_config.py: add text/markdown, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.openxmlformats-officedocument.presentationml.presentation, image/png per contracts/execution-response.yaml
- [x] T006 Add openpyxl~=3.1.0, python-docx~=1.1.0, python-pptx~=1.0.0, matplotlib~=3.9.0, Pillow~=11.0.0 to cdk/lib/execution/agent/execution-agent/requirements.txt per research.md §2.4
- [x] T007 Create tools/ directory with __init__.py in cdk/lib/execution/agent/execution-agent/tools/
- [x] T008 Create agent_factory.py skeleton in cdk/lib/execution/agent/execution-agent/agent_factory.py: Strands Agent creation function with empty tool list (to be populated per user story)

**Checkpoint**: Foundation ready — user story implementation can begin

---

## Phase 3: User Story 1 - テキストベースのファイル生成 (Priority: P1) 🎯 MVP

**Goal**: Markdown (.md), CSV (.csv), plain text (.txt) generation and upload to Slack thread.

**Independent Test**: User requests "売上データのCSVファイルを作って" → CSV file is uploaded to Slack thread with description message.

### Implementation for User Story 1

- [x] T009 [US1] Implement generate_text_file tool in cdk/lib/execution/agent/execution-agent/tools/generate_text_file.py: accept content, filename; return file bytes, mime type; add Japanese docstring per contracts/tool-definitions.yaml and research.md §2.3
- [x] T010 [US1] Register generate_text_file in agent_factory.py in cdk/lib/execution/agent/execution-agent/agent_factory.py: add tool to Strands Agent toolConfig
- [x] T011 [US1] Modify main.py in cdk/lib/execution/agent/execution-agent/main.py: replace invoke_bedrock() with Strands Agent invocation from agent_factory; preserve attachment flow (024)
- [x] T012 [US1] Add file_artifact extraction logic in cdk/lib/execution/agent/execution-agent/main.py: read GeneratedFile from ToolContext.invocation_state after agent loop; validate size via file_config.is_within_size_limit(); build file_artifact for ExecutionResponse
- [x] T013 [US1] Add size exceed handling in cdk/lib/execution/agent/execution-agent/main.py: when file exceeds limit, omit file_artifact and add Japanese error message to response_text per FR-009
- [x] T014 [US1] Apply sanitize_filename() to tool output in cdk/lib/execution/agent/execution-agent/tools/generate_text_file.py before returning filename

**Checkpoint**: User Story 1 complete — CSV, Markdown, TXT files can be generated and posted to Slack

---

## Phase 4: User Story 2 - オフィスドキュメントの生成 (Priority: P2)

**Goal**: Word (.docx), Excel (.xlsx), PowerPoint (.pptx) generation and upload to Slack.

**Independent Test**: User requests "プロジェクト計画のExcelファイルを作って" → .xlsx file is uploaded to Slack and opens in Excel.

### Implementation for User Story 2

- [x] T015 [P] [US2] Implement generate_excel tool in cdk/lib/execution/agent/execution-agent/tools/generate_excel.py: accept filename, sheets (name, headers, rows); use openpyxl; add Japanese docstring per contracts/tool-definitions.yaml
- [x] T016 [P] [US2] Implement generate_word tool in cdk/lib/execution/agent/execution-agent/tools/generate_word.py: accept filename, title, sections (heading, content); use python-docx; add Japanese docstring per contracts/tool-definitions.yaml
- [x] T017 [P] [US2] Implement generate_powerpoint tool in cdk/lib/execution/agent/execution-agent/tools/generate_powerpoint.py: accept filename, slides (title, body, layout); use python-pptx; add Japanese docstring per contracts/tool-definitions.yaml
- [x] T018 [US2] Register generate_excel, generate_word, generate_powerpoint in agent_factory.py in cdk/lib/execution/agent/execution-agent/agent_factory.py
- [x] T019 [US2] Apply sanitize_filename() and size validation (MAX_OFFICE_FILE_BYTES) in cdk/lib/execution/agent/execution-agent/tools/ for generate_excel, generate_word, generate_powerpoint

**Checkpoint**: User Story 2 complete — Office documents can be generated and posted to Slack

---

## Phase 5: User Story 3 - 画像の生成 (Priority: P3)

**Goal**: Chart images (.png) generation and upload to Slack.

**Independent Test**: User requests "売上推移の棒グラフを作って" → PNG chart image is uploaded to Slack.

### Implementation for User Story 3

- [x] T020 [US3] Implement generate_chart_image tool in cdk/lib/execution/agent/execution-agent/tools/generate_chart_image.py: accept filename, chart_type (bar/line/pie/scatter), title, data (labels, datasets); use matplotlib; add Japanese docstring per contracts/tool-definitions.yaml
- [x] T021 [US3] Register generate_chart_image in agent_factory.py in cdk/lib/execution/agent/execution-agent/agent_factory.py
- [x] T022 [US3] Apply sanitize_filename() and size validation (MAX_IMAGE_FILE_BYTES) in cdk/lib/execution/agent/execution-agent/tools/generate_chart_image.py

**Checkpoint**: User Story 3 complete — Chart images can be generated and posted to Slack

---

## Phase 6: User Story 4 - 添付ファイルを基にしたファイル変換・再生成 (Priority: P4)

**Goal**: Input-attachment-based file conversion (e.g., CSV attachment → Excel output).

**Independent Test**: User attaches CSV, requests "このデータをExcelレポートにして" → Excel file is uploaded to Slack.

### Implementation for User Story 4

- [x] T023 [US4] Verify 024 attachment flow passes document content to Bedrock Converse in cdk/lib/execution/agent/execution-agent/attachment_processor.py and bedrock_client_converse.py — ensure tools receive context from attachments
- [x] T024 [US4] Add error handling for tool failures in cdk/lib/execution/agent/execution-agent/main.py: return Japanese error message per FR-010 when tool raises exception
- [x] T025 [US4] Ensure FR-008 (max 1 file per request) is enforced: handler extracts at most one file_artifact from invocation_state in cdk/lib/execution/agent/execution-agent/main.py

**Checkpoint**: User Story 4 complete — Attachment-based conversion works end-to-end

---

## Phase 7: User Story 5 - ベストプラクティスに基づく品質保証 (Priority: P1)

**Goal**: Security, reliability, maintainability verified against best practices checklist.

**Independent Test**: Run specs/027-slack-file-generation-best-practices/contracts/best-practices-checklist.yaml validation; all items pass.

### Implementation for User Story 5

- [x] T026 [US5] Verify HTTPS for all Bedrock/AgentCore calls (boto3 default) — document in specs/027-slack-file-generation-best-practices/checklists/ or reference 026 audit
- [x] T027 [US5] Verify minimal IAM for Execution Agent in cdk/lib/execution/constructs/execution-agent-runtime.ts — only InvokeModel, S3, etc. per need
- [x] T028 [US5] Run best-practices-checklist.yaml validation: confirm BP-FG-001 (file size), BP-FG-002 (sanitize), BP-FG-003 (size exceed notify), BP-S-001 (docstrings), BP-S-002 (contract sync) pass
- [x] T029 [US5] Document gap analysis in specs/027-slack-file-generation-best-practices/checklists/requirements.md or research.md per SC-006

**Checkpoint**: User Story 5 complete — Best practices verified and documented

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, validation, final cleanup

- [x] T030 [P] Update CHANGELOG.md with 027-slack-file-generation-best-practices feature summary
- [x] T031 Run quickstart.md validation: cd cdk/lib/execution/agent/execution-agent/ && pip install -r requirements.txt && pytest tests/unit/ (add tests/unit/tools/ if tests exist)
- [x] T032 Add unit tests for tools in cdk/lib/execution/agent/execution-agent/tests/unit/tools/ (test generate_text_file, sanitize_filename, size validation) — optional per spec
- [x] T033 Add unit test for sanitize_filename in cdk/lib/execution/agent/execution-agent/tests/test_file_config.py

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP
- **User Story 2 (Phase 4)**: Depends on User Story 1 (agent_factory, main.py integration)
- **User Story 3 (Phase 5)**: Depends on User Story 1
- **User Story 4 (Phase 6)**: Depends on User Stories 1, 2, 3 (all tools) + 024
- **User Story 5 (Phase 7)**: Can run in parallel with Phase 4–6 (verification)
- **Polish (Phase 8)**: Depends on all desired user stories complete

### User Story Dependencies

- **US1 (P1)**: No dependencies on other stories — MVP
- **US2 (P2)**: Depends on US1 (agent_factory, main.py)
- **US3 (P3)**: Depends on US1
- **US4 (P4)**: Depends on US1, US2, US3
- **US5 (P1)**: Cross-cutting — can verify after US1 or in parallel

### Within Each User Story

- Tools before agent_factory registration
- agent_factory registration before main.py integration (US1 only)
- Core implementation before error handling

### Parallel Opportunities

- T015, T016, T017 (US2 tools) can run in parallel
- T030 (docs) can run in parallel with final validation
- US5 (T026–T029) can run in parallel with US2/US3 after US1 complete

---

## Parallel Example: User Story 2

```bash
# Launch all Office tools in parallel:
Task: "Implement generate_excel tool in cdk/lib/execution/agent/execution-agent/tools/generate_excel.py"
Task: "Implement generate_word tool in cdk/lib/execution/agent/execution-agent/tools/generate_word.py"
Task: "Implement generate_powerpoint tool in cdk/lib/execution/agent/execution-agent/tools/generate_powerpoint.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test "売上データのCSVファイルを作って" in Slack
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add User Story 1 → Test CSV/MD/TXT → Deploy (MVP!)
3. Add User Story 2 → Test Excel/Word/PPT → Deploy
4. Add User Story 3 → Test charts → Deploy
5. Add User Story 4 → Test attachment conversion → Deploy
6. User Story 5 verification throughout

### Suggested MVP Scope

- **MVP**: Phase 1 + Phase 2 + Phase 3 (User Story 1)
- **Tasks**: T001–T014 (14 tasks)
- **Deliverable**: Markdown, CSV, plain text file generation in Slack

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- 025 design is inherited; 026 best practices are prerequisite
- Dockerfile may need gcc/g++ for ARM64 numpy/Pillow if not present (per 025 quickstart)
