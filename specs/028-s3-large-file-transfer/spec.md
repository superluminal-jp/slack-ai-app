# Feature Specification: S3-backed Large File Artifact

**Feature Branch**: `028-s3-large-file-transfer`  
**Created**: 2026-02-11  
**Status**: Draft  
**Input**: SQS の 256KB 制限を回避するため、大容量ファイル（200KB 超）を既存の file-exchange ストレージにアップロードし、メッセージキューには署名付き URL のみを含める方式を導入する。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Receive Large AI-Generated File in Slack (Priority: P1)

A user asks the AI assistant to generate a large file (e.g., a detailed PowerPoint presentation, Excel workbook with charts, or high-resolution image) and expects to receive it as a file attachment in the Slack thread.

**Why this priority**: Without this capability, users cannot receive AI-generated files over approximately 192KB, causing silent failures or errors. This is the primary value of the feature.

**Independent Test**: Can be fully tested by requesting an AI-generated file larger than 200KB and verifying it appears in Slack as a downloadable attachment.

**Acceptance Scenarios**:

1. **Given** the AI has generated a file larger than 200KB, **When** the system delivers the response to Slack, **Then** the user receives the file as an attachment in the thread.
2. **Given** a user requests a PowerPoint or Excel report, **When** the generated file exceeds 200KB, **Then** the file is available in Slack within a reasonable time.
3. **Given** any AI-generated file over 200KB, **When** posted to Slack, **Then** the file name and format are preserved correctly.

---

### User Story 2 - Small Files Continue to Work (Priority: P2)

A user requests an AI-generated small file (e.g., a simple chart image, short Markdown snippet, or minimal spreadsheet) and receives it as before via the existing inline mechanism.

**Why this priority**: Backward compatibility ensures no regression for the majority of file generation use cases.

**Independent Test**: Can be tested by requesting a file under 200KB and verifying it is delivered via the existing inline path without behavior change.

**Acceptance Scenarios**:

1. **Given** the AI has generated a file smaller than or equal to 200KB, **When** the system delivers the response, **Then** the file is sent using the existing inline mechanism.
2. **Given** a file exactly at the 200KB boundary, **When** the system routes it, **Then** the chosen path is deterministic and consistent.
3. **Given** any file under 200KB, **When** posted to Slack, **Then** the user experience is unchanged from the current behavior.

---

### User Story 3 - Transparent Handling of Both Formats (Priority: P3)

The system consuming the queue must handle both inline (base64) and URL-based file artifacts without requiring the caller to know which format was used.

**Why this priority**: Encapsulation reduces coupling and ensures the poster can evolve routing logic independently.

**Independent Test**: Can be tested by sending mixed workloads (small and large files) and verifying all are posted correctly.

**Acceptance Scenarios**:

1. **Given** a message contains an inline file artifact, **When** the poster processes it, **Then** the file is posted to Slack successfully.
2. **Given** a message contains an S3-backed file artifact (URL only), **When** the poster processes it, **Then** the poster fetches the file and posts it to Slack successfully.
3. **Given** mixed artifacts in a batch, **When** processed, **Then** both formats are handled correctly without errors.

---

### Edge Cases

- What happens when a file is exactly 200KB? The system MUST use a deterministic rule (e.g., inline if ≤200KB, S3 if >200KB).
- How does the system handle storage upload failure? The user receives a clear error message; the text portion (if any) is still posted; the file portion fails gracefully.
- What if the URL expires before the poster consumes the message? Presigned URL validity (e.g., 15 minutes) MUST exceed the maximum expected processing delay (e.g., 60 seconds), and the poster SHOULD consume messages promptly.
- What happens when storage is temporarily unavailable? The system retries per existing resilience patterns; on persistent failure, the user receives an error message.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support posting AI-generated files larger than 200KB to Slack.
- **FR-002**: System MUST route files at or below 200KB via the existing inline mechanism (content in message body).
- **FR-003**: System MUST store large files temporarily in a dedicated storage area with automatic cleanup (e.g., 1-day retention).
- **FR-004**: System MUST include only a time-limited, presigned URL in the message for large files—never the full file content.
- **FR-005**: System MUST maintain backward compatibility so that existing messages with inline file artifacts continue to work.
- **FR-006**: System MUST preserve file name and MIME type for both inline and S3-backed artifacts.
- **FR-007**: The poster MUST support both inline (contentBase64) and URL-based (s3PresignedUrl) file artifact formats and fetch the file when a URL is provided.
- **FR-008**: System MUST use a size threshold of 200KB to decide between inline and S3-backed routing.

### Key Entities

- **File artifact**: Represents an AI-generated file to be posted to Slack. Has size, name, MIME type, and either inline content or a presigned URL.
- **Large file**: A file artifact whose size exceeds 200KB, requiring S3-backed storage and URL-only delivery.
- **Presigned URL**: A time-limited URL that allows reading the file from storage without authentication; validity must exceed expected processing delay.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users receive AI-generated files up to 5MB in Slack without delivery failures attributable to message size limits.
- **SC-002**: Files at or below 200KB are delivered via the existing inline path with no regression in success rate or latency.
- **SC-003**: Large files are delivered to Slack within 60 seconds of generation completion in normal conditions.
- **SC-004**: Zero increase in message queue delivery failures for file artifacts after rollout.
- **SC-005**: Temporary storage objects are automatically removed within 24 hours; no manual cleanup required.
