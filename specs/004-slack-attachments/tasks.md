# Tasks: Slack Message Attachments Support

**Input**: Design documents from `/specs/004-slack-attachments/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are OPTIONAL per spec - unit tests included for critical components, manual E2E testing for user stories.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Lambda functions: `lambda/slack-event-handler/`, `lambda/bedrock-processor/`
- CDK infrastructure: `cdk/lib/constructs/`
- Tests: `lambda/*/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependency management, and Lambda Layer setup

- [ ] T001 Update Slack app manifest to add `files:read` scope in `docs/slack-app-manifest.yaml`
- [ ] T002 [P] Update Lambda dependencies: Add requests>=2.31.0 to `lambda/bedrock-processor/requirements.txt`
- [ ] T003 [P] Update Lambda dependencies: Add PyPDF2>=3.0.0 to `lambda/bedrock-processor/requirements.txt`
- [ ] T004 [P] Update Lambda dependencies: Add python-docx>=1.1.0 to `lambda/bedrock-processor/requirements.txt`
- [ ] T005 [P] Update Lambda dependencies: Add openpyxl>=3.1.0 to `lambda/bedrock-processor/requirements.txt`
- [ ] T006 [P] Update Lambda dependencies: Add python-pptx>=0.6.21 to `lambda/bedrock-processor/requirements.txt`
- [ ] T007 Create or obtain LibreOffice Lambda Layer for PPTX image conversion (see quickstart.md for setup instructions)
- [ ] T008 Update CDK bedrock-processor construct to include LibreOffice Lambda Layer in `cdk/lib/constructs/bedrock-processor.ts`
- [ ] T009 Update CDK bedrock-processor construct to increase Lambda memory to 512MB+ in `cdk/lib/constructs/bedrock-processor.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core attachment processing infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T010 Create attachment extractor module `lambda/slack-event-handler/attachment_extractor.py` to extract and validate attachment metadata from Slack events
- [ ] T011 Modify Slack event handler to extract `event.files` array in `lambda/slack-event-handler/handler.py`
- [ ] T012 Modify Slack event handler to include attachment metadata in payload to bedrock-processor in `lambda/slack-event-handler/handler.py`
- [ ] T013 Create file downloader module `lambda/bedrock-processor/file_downloader.py` to download files from Slack CDN with bot token authentication
- [ ] T014 Create document extractor module `lambda/bedrock-processor/document_extractor.py` with functions for PDF, DOCX, CSV, XLSX, PPTX, TXT text extraction
- [ ] T015 Add PPTX slide-to-image conversion function `convert_pptx_slides_to_images()` in `lambda/bedrock-processor/document_extractor.py` using LibreOffice
- [ ] T016 Create attachment processor module `lambda/bedrock-processor/attachment_processor.py` to orchestrate attachment download and content extraction
- [ ] T017 Modify bedrock processor handler to accept attachment metadata from payload in `lambda/bedrock-processor/handler.py`
- [ ] T018 Modify bedrock client to support image input (base64 encoding) in `lambda/bedrock-processor/bedrock_client.py`

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Process Messages with Image Attachments (Priority: P1) 🎯 MVP

**Goal**: Enable bot to process messages with image attachments, analyzing visual content using AWS Bedrock vision capabilities

**Independent Test**: Send a message with an image attachment to the bot and verify that the bot's response acknowledges or analyzes the image content. Can be fully tested independently without document processing functionality.

### Implementation for User Story 1

- [ ] T019 [US1] Implement image attachment detection in `lambda/slack-event-handler/attachment_extractor.py` (filter files with `mimetype` starting with "image/")
- [ ] T020 [US1] Implement image file size validation (max 10MB) in `lambda/bedrock-processor/attachment_processor.py`
- [ ] T021 [US1] Implement image download from Slack CDN in `lambda/bedrock-processor/file_downloader.py` with bot token authentication
- [ ] T022 [US1] Implement base64 encoding for images in `lambda/bedrock-processor/attachment_processor.py`
- [ ] T023 [US1] Modify bedrock client to accept image content blocks in `lambda/bedrock-processor/bedrock_client.py` (add `prepare_image_content()` function)
- [ ] T024 [US1] Modify bedrock client `invoke_bedrock()` to support image input parameters in `lambda/bedrock-processor/bedrock_client.py`
- [ ] T025 [US1] Integrate image processing into bedrock processor handler in `lambda/bedrock-processor/handler.py` (process images and include in Bedrock request)
- [ ] T026 [US1] Add error handling for image download failures in `lambda/bedrock-processor/attachment_processor.py` (graceful degradation per FR-008)
- [ ] T027 [US1] Add logging for image processing events with correlation IDs in `lambda/bedrock-processor/attachment_processor.py`
- [ ] T028 [US1] Test image attachment processing: Send message with PNG image, verify bot analyzes image

**Checkpoint**: At this point, User Story 1 should be fully functional - bot can process image attachments and provide AI analysis

---

## Phase 4: User Story 2 - Handle Document Attachments (Priority: P2)

**Goal**: Enable bot to extract text content from document attachments (PDF, TXT, DOCX, CSV, XLSX, PPTX) and process PPTX slides as images for comprehensive analysis

**Independent Test**: Send a message with a document attachment and verify that the bot can reference or analyze the document content in its response. For PPTX files, verify both text extraction and slide image conversion work.

### Implementation for User Story 2

#### Document Text Extraction

- [ ] T029 [P] [US2] Implement PDF text extraction function `extract_text_from_pdf()` in `lambda/bedrock-processor/document_extractor.py`
- [ ] T030 [P] [US2] Implement DOCX text extraction function `extract_text_from_docx()` in `lambda/bedrock-processor/document_extractor.py`
- [ ] T031 [P] [US2] Implement CSV text extraction function `extract_text_from_csv()` in `lambda/bedrock-processor/document_extractor.py`
- [ ] T032 [P] [US2] Implement XLSX text extraction function `extract_text_from_xlsx()` in `lambda/bedrock-processor/document_extractor.py`
- [ ] T033 [P] [US2] Implement PPTX text extraction function `extract_text_from_pptx()` in `lambda/bedrock-processor/document_extractor.py`
- [ ] T034 [P] [US2] Implement TXT text extraction function `extract_text_from_txt()` in `lambda/bedrock-processor/document_extractor.py`

#### PPTX Image Conversion

- [ ] T035 [US2] Implement PPTX slide-to-image conversion function `convert_pptx_slides_to_images()` in `lambda/bedrock-processor/document_extractor.py` using LibreOffice subprocess
- [ ] T036 [US2] Add error handling for LibreOffice conversion failures in `lambda/bedrock-processor/document_extractor.py` (fallback to text extraction only)
- [ ] T037 [US2] Add timeout handling (60 seconds) for PPTX conversion in `lambda/bedrock-processor/document_extractor.py`
- [ ] T038 [US2] Add temporary file cleanup for PPTX conversion in `lambda/bedrock-processor/document_extractor.py`

#### Document Processing Integration

- [ ] T039 [US2] Implement document file size validation (max 5MB) in `lambda/bedrock-processor/attachment_processor.py`
- [ ] T040 [US2] Implement document download from Slack CDN in `lambda/bedrock-processor/file_downloader.py`
- [ ] T041 [US2] Integrate document text extraction into attachment processor in `lambda/bedrock-processor/attachment_processor.py` (route by MIME type)
- [ ] T042 [US2] Integrate PPTX image conversion into attachment processor in `lambda/bedrock-processor/attachment_processor.py` (process both text and images)
- [ ] T043 [US2] Modify bedrock processor handler to include document text in AI prompt in `lambda/bedrock-processor/handler.py`
- [ ] T044 [US2] Add error handling for document extraction failures in `lambda/bedrock-processor/attachment_processor.py` (graceful degradation per FR-008)
- [ ] T045 [US2] Add error messages for unsupported document types in `lambda/bedrock-processor/attachment_processor.py` (per FR-012)
- [ ] T046 [US2] Add error messages for files exceeding size limits in `lambda/bedrock-processor/attachment_processor.py` (per FR-007, FR-012)
- [ ] T047 [US2] Add logging for document processing events with correlation IDs in `lambda/bedrock-processor/attachment_processor.py`
- [ ] T048 [US2] Test PDF attachment: Send message with PDF, verify text extraction and AI response
- [ ] T049 [US2] Test DOCX attachment: Send message with DOCX, verify text extraction and AI response
- [ ] T050 [US2] Test CSV attachment: Send message with CSV, verify data extraction and AI response
- [ ] T051 [US2] Test XLSX attachment: Send message with XLSX, verify sheet data extraction and AI response
- [ ] T052 [US2] Test PPTX attachment: Send message with PPTX, verify text extraction AND slide image conversion and AI response
- [ ] T053 [US2] Test TXT attachment: Send message with TXT, verify text extraction and AI response
- [ ] T054 [US2] Test error handling: Send message with unsupported file type, verify user-friendly error message
- [ ] T055 [US2] Test error handling: Send message with file exceeding size limit, verify user-friendly error message

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently - bot can process images and documents

---

## Phase 5: User Story 3 - Handle Messages with Multiple Attachments (Priority: P2)

**Goal**: Enable bot to process messages with multiple attachments of different types, handling all attachments appropriately and providing unified response

**Independent Test**: Send a message with multiple attachments (images and documents) and verify that the bot processes all supported attachments and provides a coherent response addressing all attachments.

### Implementation for User Story 3

- [ ] T056 [US3] Modify attachment processor to handle multiple attachments sequentially in `lambda/bedrock-processor/attachment_processor.py` (process each attachment in loop)
- [ ] T057 [US3] Implement attachment processing result tracking in `lambda/bedrock-processor/attachment_processor.py` (track success/failure for each attachment)
- [ ] T058 [US3] Modify bedrock processor handler to combine multiple attachment contents in `lambda/bedrock-processor/handler.py` (aggregate images and document texts)
- [ ] T059 [US3] Implement partial success handling in `lambda/bedrock-processor/attachment_processor.py` (process as many attachments as possible per FR-011)
- [ ] T060 [US3] Add logging for multiple attachment processing in `lambda/bedrock-processor/attachment_processor.py` (log count, types, results)
- [ ] T061 [US3] Test multiple image attachments: Send message with 2-3 images, verify all images analyzed
- [ ] T062 [US3] Test mixed attachments: Send message with image + document, verify both processed appropriately
- [ ] T063 [US3] Test partial failure: Send message with valid + invalid attachments, verify valid ones processed and error message for invalid ones
- [ ] T064 [US3] Test attachment limit handling: Send message with attachments exceeding processing limits, verify partial processing with indication

**Checkpoint**: At this point, all user stories should work independently - bot can handle single and multiple attachments

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories, backward compatibility validation, and final polish

- [ ] T065 [P] Add unit tests for attachment extractor in `lambda/slack-event-handler/tests/test_attachment_extractor.py`
- [ ] T066 [P] Add unit tests for file downloader in `lambda/bedrock-processor/tests/test_file_downloader.py`
- [ ] T067 [P] Add unit tests for document extractor in `lambda/bedrock-processor/tests/test_document_extractor.py`
- [ ] T068 [P] Add unit tests for attachment processor in `lambda/bedrock-processor/tests/test_attachment_processor.py`
- [ ] T069 Modify existing handler tests to include attachment extraction in `lambda/slack-event-handler/tests/test_handler.py`
- [ ] T070 Modify existing bedrock processor tests to include attachment processing in `lambda/bedrock-processor/tests/test_handler.py`
- [ ] T071 Validate backward compatibility: Test text-only messages still work as before (per FR-006, SC-005)
- [ ] T072 Add structured logging for all attachment processing operations with correlation IDs (per Constitution IV)
- [ ] T073 Validate error handling: Ensure 100% of attachment processing failures result in user-friendly messages (per SC-004)
- [ ] T074 Validate performance: Test messages with attachments processed within 30 seconds for images <5MB and documents <2MB (per SC-003)
- [ ] T075 Run quickstart.md validation: Execute all test cases from quickstart guide
- [ ] T076 Update documentation: Ensure README.md reflects attachment processing capabilities
- [ ] T077 Code cleanup: Review and refactor attachment processing code for consistency
- [ ] T078 Security review: Verify file size validation prevents resource exhaustion attacks

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User Story 1 (P1): Can start immediately after Foundational - No dependencies on other stories
  - User Story 2 (P2): Can start immediately after Foundational - No dependencies on other stories (PPTX conversion uses LibreOffice Layer from Setup)
  - User Story 3 (P2): Depends on User Stories 1 and 2 completion (builds on single attachment processing)
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
  - Independent: Image processing does not require document processing
  - MVP scope: Can deliver User Story 1 as standalone MVP
  
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - No dependencies on User Story 1
  - Independent: Document processing does not require image processing
  - PPTX image conversion uses LibreOffice Layer from Setup phase
  - Can be implemented in parallel with User Story 1 if team capacity allows
  
- **User Story 3 (P2)**: Depends on User Stories 1 and 2 completion
  - Requires: Single attachment processing from US1 and US2
  - Builds on: Attachment processor logic from both stories
  - Cannot be independent: Needs both image and document processing to handle mixed attachments

### Within Each User Story

- File downloader before attachment processor (T013 → T016)
- Document extractor functions before attachment processor integration (T014-T015 → T041-T042)
- Bedrock client image support before handler integration (T018, T023-T024 → T025)
- Core implementation before error handling and logging
- Story complete before moving to next priority

### Parallel Opportunities

**Setup Phase (Phase 1)**:
- All dependency updates (T002-T006) can run in parallel
- Lambda Layer setup (T007) can run in parallel with dependency updates

**Foundational Phase (Phase 2)**:
- Attachment extractor (T010) and file downloader (T013) can be developed in parallel
- Document extractor functions (T014) can be developed in parallel with other modules
- Bedrock client modification (T018) can be done in parallel with other modules

**User Story 1 (Phase 3)**:
- Image processing tasks (T019-T024) can be developed in parallel where files differ
- Error handling and logging (T026-T027) can be done in parallel

**User Story 2 (Phase 4)**:
- All document extraction functions (T029-T034) can be developed in parallel
- PPTX conversion (T035-T038) can be developed independently
- Document processing integration tasks can proceed sequentially after extractors complete
- Testing tasks (T048-T055) can be done in parallel for different file types

**User Story 3 (Phase 5)**:
- Multiple attachment handling tasks (T056-T059) build on US1 and US2
- Testing tasks (T061-T064) can be done in parallel

**Polish Phase (Phase 6)**:
- All unit test tasks (T065-T068) can run in parallel
- Documentation and cleanup tasks (T075-T078) can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch image processing implementation tasks in parallel:
Task: "T019 [US1] Implement image attachment detection in lambda/slack-event-handler/attachment_extractor.py"
Task: "T021 [US1] Implement image download from Slack CDN in lambda/bedrock-processor/file_downloader.py"
Task: "T023 [US1] Modify bedrock client to accept image content blocks in lambda/bedrock-processor/bedrock_client.py"

# Then integrate:
Task: "T025 [US1] Integrate image processing into bedrock processor handler in lambda/bedrock-processor/handler.py"
```

---

## Parallel Example: User Story 2

```bash
# Launch all document extraction functions in parallel:
Task: "T029 [P] [US2] Implement PDF text extraction function in lambda/bedrock-processor/document_extractor.py"
Task: "T030 [P] [US2] Implement DOCX text extraction function in lambda/bedrock-processor/document_extractor.py"
Task: "T031 [P] [US2] Implement CSV text extraction function in lambda/bedrock-processor/document_extractor.py"
Task: "T032 [P] [US2] Implement XLSX text extraction function in lambda/bedrock-processor/document_extractor.py"
Task: "T033 [P] [US2] Implement PPTX text extraction function in lambda/bedrock-processor/document_extractor.py"
Task: "T034 [P] [US2] Implement TXT text extraction function in lambda/bedrock-processor/document_extractor.py"

# Then integrate document processing:
Task: "T041 [US2] Integrate document text extraction into attachment processor in lambda/bedrock-processor/attachment_processor.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (dependencies, Lambda Layer)
2. Complete Phase 2: Foundational (attachment extraction, download, processing infrastructure)
3. Complete Phase 3: User Story 1 (image attachment processing)
4. **STOP and VALIDATE**: Test User Story 1 independently
   - Send message with image attachment
   - Verify bot analyzes image and responds appropriately
   - Verify backward compatibility (text-only messages still work)
5. Deploy/demo if ready

**MVP Deliverable**: Bot can process image attachments and provide AI analysis

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
   - PDF, DOCX, CSV, XLSX, TXT text extraction
   - PPTX text extraction + slide image conversion
4. Add User Story 3 → Test independently → Deploy/Demo
   - Multiple attachment handling
5. Polish Phase → Final validation and cleanup
6. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - **Developer A**: User Story 1 (image processing)
   - **Developer B**: User Story 2 (document processing - can start in parallel with US1)
   - **Developer C**: Setup LibreOffice Layer and PPTX conversion (can start in parallel)
3. After US1 and US2 complete:
   - **Developer A + B**: User Story 3 (multiple attachments - requires both US1 and US2)
4. All developers: Polish Phase (tests, documentation, cleanup)

---

## Notes

- **[P] tasks** = different files, no dependencies - can run in parallel
- **[Story] label** maps task to specific user story for traceability
- Each user story should be independently completable and testable
- User Story 1 (P1) is MVP scope - can be delivered independently
- User Story 2 can be developed in parallel with User Story 1 (different file types)
- User Story 3 requires both US1 and US2 (builds on single attachment processing)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- LibreOffice Lambda Layer must be set up before PPTX conversion can be tested
- Backward compatibility must be maintained: text-only messages continue to work (FR-006, SC-005)

