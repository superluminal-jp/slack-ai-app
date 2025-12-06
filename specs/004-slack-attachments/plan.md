# Implementation Plan: Slack Message Attachments Support

**Branch**: `004-slack-attachments` | **Date**: 2025-01-27 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-slack-attachments/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Enable the Slack bot to process message attachments (images and documents) alongside text messages. The system must extract attachment metadata from Slack events, download attachments when needed, extract content (images for visual analysis, documents for text extraction), and include attachment information in AI processing. PPTX files are processed with both text extraction and slide-to-image conversion for comprehensive visual analysis. This extends the bot's capabilities to handle visual content and document analysis while maintaining backward compatibility with text-only messages.

## Technical Context

**Language/Version**: Python 3.11+ for Lambda functions, TypeScript for AWS CDK infrastructure  
**Primary Dependencies**: AWS CDK, boto3 (Bedrock SDK), slack-sdk (Python), AWS Lambda runtime, requests for file downloads, PyPDF2 for PDF extraction, python-docx for DOCX extraction, openpyxl for XLSX extraction, python-pptx for PPTX extraction, LibreOffice (Lambda Layer) for PPTX to image conversion, csv (built-in) for CSV extraction  
**Storage**: N/A (attachments downloaded temporarily in Lambda memory; no persistent storage required per spec Out of Scope)  
**Testing**: pytest for Python unit tests, manual E2E testing in Slack workspace  
**Target Platform**: AWS Lambda (serverless), triggered by Slack events via API Gateway  
**Project Type**: Web application (API backend only, no frontend)  
**Performance Goals**: Messages with attachments processed within 30 seconds for images under 5MB and documents under 2MB (per spec SC-003)  
**Constraints**:

- Slack API rate limits for file downloads (Tier 2: 20 requests/minute per method)
- Lambda memory limits (128MB-10GB) for processing large attachments
- Lambda timeout limits (15 minutes max) for document extraction and PPTX image conversion
- Bedrock vision model support for image analysis (Claude 3 Sonnet/Haiku with vision capabilities)
- File size limits: images under 10MB, documents under 5MB (per assumptions)
- Network bandwidth for downloading attachments from Slack CDN
- LibreOffice Lambda Layer size (~200-300MB) for PPTX image conversion
- Lambda memory requirement: 512MB+ recommended for LibreOffice processing
  **Scale/Scope**: Extension to existing MVP functionality; supports single workspace with attachment processing capabilities including PPTX slide-to-image conversion

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### Pre-Phase 0 Evaluation

| Principle                         | Status               | Compliance                                                                                               | Justification                                                                                                                                                                                                                                                     |
| --------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Security-First Architecture    | ✅ COMPLIANT         | Maintains existing security mechanisms<br>Adds attachment validation<br>No new attack vectors introduced | Attachment processing uses existing HMAC signature verification and async processing. File downloads require bot token authentication. File size validation prevents resource exhaustion. No new security risks beyond existing Slack integration.                |
| II. Non-Blocking Async Processing | ✅ COMPLIANT         | Maintains existing async pattern                                                                         | Attachment processing occurs in Bedrock Processor (Lambda②) asynchronously. File downloads, content extraction, and PPTX image conversion happen in background, not blocking Slack Event Handler response.                                                        |
| III. Context History Management   | ✅ N/A               | Not applicable                                                                                           | Attachment processing does not require context history changes. Attachments are processed per-message without persistent storage (per spec Out of Scope).                                                                                                         |
| IV. Observability & Monitoring    | ✅ COMPLIANT         | Maintains existing logging<br>Adds attachment-specific events                                            | Attachment processing events logged with correlation IDs (download start/failure, extraction success/failure, PPTX conversion success/failure, processing errors). No PII in logs (file names may be logged but not content).                                     |
| V. Error Handling & Resilience    | ✅ COMPLIANT         | Comprehensive error handling required                                                                    | FR-008, FR-012 require graceful handling of download failures, invalid files, unsupported types, PPTX conversion failures. Error messages posted to Slack users. Attachment failures don't crash system (FR-008).                                                 |
| VI. Cost Management               | ✅ COMPLIANT         | File size limits enforced                                                                                | FR-007 requires file size validation before processing. Assumptions specify reasonable limits (images <10MB, documents <5MB). Prevents excessive Bedrock API costs from large files. PPTX image conversion adds processing time but within Lambda timeout limits. |
| VII. Compliance Standards         | ✅ COMPLIANT         | No compliance changes                                                                                    | Attachment processing uses existing data protection mechanisms. Files downloaded temporarily in Lambda memory (no persistent storage). No PII extraction beyond existing text processing.                                                                         |
| VIII. Testing Discipline          | ⚠️ PARTIAL COMPLIANT | Unit tests + manual E2E                                                                                  | Unit tests for attachment extraction, download, content extraction, PPTX conversion. Manual E2E testing for attachment processing flows. BDD scenarios deferred (not security-critical feature).                                                                  |

### Gate Decision: ✅ PASS

**Rationale**: This feature extension maintains all existing security and architectural patterns. Attachment processing is a functional enhancement that does not introduce new security risks or architectural complexity. PPTX image conversion adds processing complexity but remains within async processing pattern. All constitution principles remain satisfied:

1. **Security**: Uses existing authentication/authorization; file validation prevents abuse
2. **Async Processing**: Maintains existing async pattern; downloads and conversions occur in background
3. **Error Handling**: Comprehensive error handling required per spec
4. **Cost Management**: File size limits prevent excessive costs
5. **Testing**: Unit tests + manual E2E sufficient for non-security-critical feature

## Project Structure

### Documentation (this feature)

```text
specs/004-slack-attachments/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── slack-attachments-api.yaml  # OpenAPI spec for attachment processing
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
lambda/
├── slack-event-handler/            # Slack Event Handler - receives Slack events
│   ├── handler.py                  # Main Lambda handler (MODIFY: extract event.files)
│   ├── slack_verifier.py           # HMAC SHA256 signature verification (no changes)
│   ├── attachment_extractor.py     # NEW: Extract attachment metadata from events
│   ├── requirements.txt            # MODIFY: Add requests if needed
│   └── tests/
│       ├── test_handler.py         # MODIFY: Test attachment extraction
│       └── test_attachment_extractor.py  # NEW: Test attachment metadata extraction
└── bedrock-processor/              # Bedrock Processor - processes with Bedrock
    ├── handler.py                  # Main Lambda handler (MODIFY: accept attachments)
    ├── bedrock_client.py           # Bedrock API wrapper (MODIFY: support image input)
    ├── slack_poster.py             # Posts response to Slack (no changes)
    ├── attachment_processor.py    # NEW: Download and process attachments
    ├── file_downloader.py          # NEW: Download files from Slack CDN
    ├── document_extractor.py       # NEW: Extract text from PDF/DOCX/CSV/XLSX/PPTX/TXT and convert PPTX to images
    ├── requirements.txt            # MODIFY: Add PyPDF2, python-docx, openpyxl, python-pptx, requests
    └── tests/
        ├── test_handler.py         # MODIFY: Test attachment processing
        ├── test_attachment_processor.py  # NEW: Test attachment processing logic
        ├── test_file_downloader.py # NEW: Test file download from Slack
        └── test_document_extractor.py    # NEW: Test document text extraction and PPTX conversion

cdk/
└── lib/
    └── constructs/
        └── bedrock-processor.ts    # MODIFY: Add LibreOffice Lambda Layer
```

**Structure Decision**: Extension to existing MVP codebase. No new infrastructure or Lambda functions required. Changes limited to:

1. **slack-event-handler/handler.py**: Extract `event.files` array from Slack event and include attachment metadata in payload to bedrock-processor
2. **slack-event-handler/attachment_extractor.py**: NEW module to extract and validate attachment metadata from Slack events
3. **bedrock-processor/handler.py**: Accept attachment metadata from payload and coordinate attachment processing
4. **bedrock-processor/attachment_processor.py**: NEW module to orchestrate attachment download and content extraction
5. **bedrock-processor/file_downloader.py**: NEW module to download files from Slack CDN with authentication
6. **bedrock-processor/document_extractor.py**: NEW module to extract text from PDF, DOCX, CSV, XLSX, PPTX, TXT files and convert PPTX slides to images using LibreOffice
7. **bedrock-processor/bedrock_client.py**: MODIFY to support image input for vision models (base64 encoding)
8. **Lambda Layer**: NEW layer with LibreOffice headless installation for PPTX to image conversion
9. **CDK bedrock-processor construct**: MODIFY to include LibreOffice Lambda Layer and increase memory to 512MB+

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations identified. This feature extension maintains existing architecture and security patterns. Attachment processing adds functional capabilities without introducing architectural complexity. PPTX image conversion via LibreOffice Lambda Layer adds deployment complexity but is justified by requirement for visual analysis of presentation slides.

---

## Post-Phase 1 Constitution Check

_Re-evaluation after Phase 1 design completion._

### Post-Phase 1 Evaluation

| Principle                         | Status               | Compliance                                                                                                                           | Justification                                                                                                                                                                                                                                                      |
| --------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Security-First Architecture    | ✅ COMPLIANT         | File downloads use bot token authentication<br>File size validation prevents resource exhaustion<br>No new attack vectors introduced | Attachment processing uses existing security mechanisms. File downloads require valid bot token. Size limits prevent DoS attacks. PPTX conversion uses subprocess with timeout, preventing resource exhaustion. No PII extraction beyond existing text processing. |
| II. Non-Blocking Async Processing | ✅ COMPLIANT         | Attachment processing in Bedrock Processor (async)                                                                                   | File downloads, content extraction, and PPTX image conversion occur in Bedrock Processor Lambda (background), not blocking Slack Event Handler response. Maintains <3 second response time. PPTX conversion may take 10-30 seconds but occurs asynchronously.      |
| III. Context History Management   | ✅ N/A               | Not applicable                                                                                                                       | Attachment processing does not require context history. Files processed per-message without persistent storage.                                                                                                                                                    |
| IV. Observability & Monitoring    | ✅ COMPLIANT         | Attachment processing events logged                                                                                                  | Download start/failure, extraction success/failure, PPTX conversion success/failure logged with correlation IDs. File names logged (not content). Error rates tracked. LibreOffice conversion failures logged with error details.                                  |
| V. Error Handling & Resilience    | ✅ COMPLIANT         | Comprehensive error handling designed                                                                                                | File download failures, extraction errors, PPTX conversion failures, unsupported types all handled gracefully. Errors don't crash system. User-friendly error messages. PPTX conversion failures fall back to text extraction only.                                |
| VI. Cost Management               | ✅ COMPLIANT         | File size limits enforced                                                                                                            | 10MB image limit, 5MB document limit enforced before processing. Prevents excessive Bedrock API costs. PPTX image conversion adds Lambda execution time but within timeout limits.                                                                                 |
| VII. Compliance Standards         | ✅ COMPLIANT         | No compliance changes                                                                                                                | Files downloaded temporarily in Lambda memory (no persistent storage). No PII extraction beyond existing patterns.                                                                                                                                                 |
| VIII. Testing Discipline          | ⚠️ PARTIAL COMPLIANT | Unit tests + manual E2E planned                                                                                                      | Unit tests for attachment extraction, download, content extraction, PPTX conversion. Manual E2E testing for attachment processing flows. BDD scenarios deferred (not security-critical).                                                                           |

### Gate Decision: ✅ PASS

**Rationale**: Phase 1 design maintains all constitution principles. Attachment processing architecture including PPTX image conversion:

1. **Security**: Uses existing authentication; file validation prevents abuse
2. **Async**: Maintains existing async pattern; downloads and conversions in background
3. **Error Handling**: Comprehensive error handling designed per spec
4. **Cost Management**: File size limits prevent excessive costs
5. **Testing**: Unit tests + manual E2E sufficient for functional feature

**Design Validation**:

- Data model defines clear entity boundaries
- API contracts specify payload structures
- Error handling covers all edge cases including PPTX conversion failures
- Backward compatibility maintained
- LibreOffice Lambda Layer integration documented

**Ready for Phase 2**: `/speckit.tasks` to generate implementation tasks.
