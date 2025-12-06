# Feature Specification: Canvas for Long Replies

**Feature Branch**: `005-canvas-long-reply`  
**Created**: 2025-01-30  
**Status**: Draft  
**Input**: User description: "返信が長文になる場合は slack canvas を使うようにしたい" (updated: "単に長いだけでなく、構造化したドキュメントの形式をとる場合なども canvas を使うようにしたい")

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Use Canvas for Long Replies and Structured Documents (Priority: P1)

A Slack workspace user receives an AI-generated reply from the bot, and when the reply content either exceeds a length threshold or contains structured document formatting (headings, lists, tables, code blocks, etc.), the bot automatically creates a Canvas and shares it instead of posting a message that may be truncated, difficult to read, or poorly formatted.

**Why this priority**: This is the core functionality - automatically detecting both long replies and structured document formats, using Canvas to provide a better reading experience. Canvas allows for better formatting, structure, and readability for both lengthy content and structured documents (reports, plans, meeting notes, etc.) compared to plain text messages.

**Independent Test**: Can be fully tested by triggering a bot response that either exceeds the length threshold or contains structured formatting (headings, lists, etc.) and verifying that a Canvas is created and shared in the thread (or channel), with a brief summary message indicating the Canvas was created. Delivers value by improving readability and presentation of both long AI responses and structured document content.

**Acceptance Scenarios**:

1. **Given** the bot generates a reply that exceeds the length threshold, **When** the bot posts the response, **Then** a Canvas is created containing the full reply content and shared in the thread (or channel if no thread)
2. **Given** the bot generates a reply that contains structured document formatting (headings, lists, tables, code blocks, etc.), **When** the bot posts the response, **Then** a Canvas is created containing the structured content and shared in the thread (or channel if no thread)
3. **Given** the bot generates a reply that exceeds the length threshold, **When** the bot posts the response, **Then** a brief summary message is posted in the thread (or channel) indicating that a Canvas was created with the full response
4. **Given** the bot generates a reply that contains structured document formatting, **When** the bot posts the response, **Then** a brief summary message is posted indicating that a Canvas was created with the structured content
5. **Given** the bot generates a reply that is below the length threshold and has no structured formatting, **When** the bot posts the response, **Then** the reply is posted as a normal message (no Canvas is created)
6. **Given** the bot generates a long reply and creates a Canvas, **When** a user views the Canvas, **Then** the Canvas contains the complete, formatted reply content
7. **Given** the bot generates a structured document reply and creates a Canvas, **When** a user views the Canvas, **Then** the Canvas preserves the structure (headings, lists, tables, code blocks) appropriately
8. **Given** the bot generates a long reply in a thread context, **When** the bot creates a Canvas, **Then** the Canvas is shared in the same thread where the conversation is happening

---

### User Story 2 - Fallback to Regular Message When Canvas Creation Fails (Priority: P2)

When the bot attempts to create a Canvas for a long reply but Canvas creation fails, the system gracefully falls back to posting the reply as a regular message (potentially truncated if it exceeds Slack's message limit).

**Why this priority**: System resilience is important. If Canvas creation fails (due to API errors, permissions, or other issues), users should still receive the bot's response, even if it's not in the ideal format.

**Independent Test**: Can be tested by simulating Canvas creation failures and verifying that the bot posts the reply as a regular message with appropriate error handling, ensuring users still receive responses.

**Acceptance Scenarios**:

1. **Given** the bot generates a long reply and attempts to create a Canvas, **When** Canvas creation fails due to API error, **Then** the bot posts the reply as a regular message (truncated if necessary) and logs the error
2. **Given** the bot generates a long reply and attempts to create a Canvas, **When** Canvas creation fails due to insufficient permissions, **Then** the bot posts the reply as a regular message and logs a warning about permissions
3. **Given** the bot generates a long reply and Canvas creation fails, **When** the bot falls back to a regular message, **Then** users receive the response without experiencing a system error or crash
4. **Given** Canvas creation fails and the bot falls back to a regular message, **When** the message exceeds Slack's character limit, **Then** the message is truncated appropriately with an indication that the full content was too long

---

### User Story 3 - Canvas Content Formatting and Structure (Priority: P3)

When a Canvas is created for a long reply, the content is formatted in a readable, structured manner that enhances comprehension compared to a plain text message.

**Why this priority**: Canvas provides better formatting capabilities than plain messages. Properly structured Canvas content improves user experience and makes long responses easier to read and navigate.

**Independent Test**: Can be tested by generating a long reply, creating a Canvas, and verifying that the Canvas content is well-formatted with appropriate structure (headings, paragraphs, lists if applicable) that improves readability.

**Acceptance Scenarios**:

1. **Given** the bot creates a Canvas for a long reply, **When** a user views the Canvas, **Then** the content is formatted with appropriate structure (paragraphs, headings if applicable) for readability
2. **Given** the bot creates a Canvas containing structured content (lists, code blocks, etc.), **When** a user views the Canvas, **Then** the formatting is preserved appropriately
3. **Given** the bot creates a Canvas for a long reply, **When** a user views the Canvas, **Then** the Canvas title or header indicates it contains the bot's response

---

### Edge Cases

- What happens when the reply length is exactly at the threshold boundary?
- How does the system detect structured document formatting - what specific patterns or elements trigger Canvas usage?
- What happens when a reply has structured formatting but is below the length threshold - does it still use Canvas?
- How does the system handle Canvas creation when the bot doesn't have Canvas creation permissions?
- What happens when Canvas creation succeeds but sharing the Canvas in the thread/channel fails?
- How does the system handle very long replies that exceed Canvas content limits (if any)?
- What happens when multiple long or structured replies are generated in quick succession - are multiple Canvases created?
- How does the system handle Canvas creation in private channels vs public channels vs direct messages?
- What happens when a Canvas is created but the thread or channel is deleted before the Canvas is shared?
- How does the system handle Canvas creation when the workspace has Canvas features disabled?
- What happens when the reply contains special characters or formatting that may not be supported in Canvas?
- How does the system handle Canvas creation timeouts or rate limiting from Slack API?
- What happens when a reply contains both structured formatting and exceeds the length threshold - is Canvas used once or multiple times?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST detect when a generated reply exceeds the length threshold for Canvas usage
- **FR-002**: System MUST detect when a generated reply contains structured document formatting (headings, lists, tables, code blocks, etc.) for Canvas usage
- **FR-003**: System MUST create a Canvas containing the full reply content when the reply exceeds the length threshold OR contains structured document formatting
- **FR-004**: System MUST share the created Canvas in the appropriate thread (if thread context exists) or channel (if no thread)
- **FR-005**: System MUST post a brief summary message in the thread/channel indicating that a Canvas was created with the full response
- **FR-006**: System MUST post replies as regular messages when the reply length is below the threshold AND has no structured document formatting (no Canvas creation)
- **FR-007**: System MUST handle Canvas creation failures gracefully by falling back to posting a regular message
- **FR-008**: System MUST truncate regular messages appropriately when fallback occurs and message exceeds Slack's character limit
- **FR-009**: System MUST maintain backward compatibility: replies below the threshold and without structured formatting continue to work as before (no regression)
- **FR-010**: System MUST format Canvas content in a readable, structured manner
- **FR-011**: System MUST preserve structured formatting (headings, lists, tables, code blocks, etc.) when creating Canvas content
- **FR-012**: System MUST handle Canvas creation in both thread and non-thread contexts
- **FR-013**: System MUST log Canvas creation attempts, successes, and failures for monitoring
- **FR-014**: System MUST handle Canvas API rate limits and timeouts appropriately
- **FR-015**: System MUST respect Slack workspace permissions for Canvas creation and sharing
- **FR-016**: System MUST use Canvas for replies that exceed 800 characters (providing better readability for longer chat responses while staying well under Slack's 4000 character message limit)
- **FR-017**: System MUST use Canvas for replies that contain structured document formatting regardless of length

### Key Entities

- **Reply Length Threshold**: The character count that determines when a reply should use Canvas instead of a regular message. When a reply exceeds this threshold, Canvas is used.
- **Structured Document Formatting**: Content that contains structural elements such as headings, lists (ordered or unordered), tables, code blocks, or other document-like formatting that benefits from Canvas presentation.
- **Canvas**: A Slack Canvas object containing formatted, structured content that can be shared in channels or threads, providing better readability for long content and structured documents than plain text messages.
- **Canvas Summary Message**: A brief message posted in the thread/channel that indicates a Canvas was created and contains the full response, providing context and a link to the Canvas.
- **Canvas Creation Result**: The outcome of attempting to create a Canvas (success with Canvas ID, failure with error reason).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: System successfully creates and shares Canvas for at least 95% of replies that exceed the threshold OR contain structured document formatting
- **SC-002**: System maintains response time performance: Canvas creation and sharing adds no more than 5 seconds to the total response time compared to regular message posting
- **SC-003**: System handles Canvas creation failures gracefully: 100% of Canvas creation failures result in fallback to regular messages (no user-facing errors or crashes)
- **SC-004**: Users can successfully view Canvas content: at least 90% of users can access and read Canvas content on first attempt
- **SC-005**: System maintains backward compatibility: 100% of replies below the threshold and without structured formatting continue to work as regular messages (no regression)
- **SC-006**: Canvas content is readable and well-formatted: at least 85% of users find Canvas content easier to read than equivalent long text messages or structured content in plain messages
- **SC-007**: System correctly determines when to use Canvas: 100% of replies above threshold OR with structured formatting use Canvas, 100% of replies below threshold and without structured formatting use regular messages
- **SC-008**: System correctly detects structured document formatting: at least 90% of replies with structured elements (headings, lists, tables, code blocks) are identified and use Canvas

## Assumptions _(if applicable)_

- Slack Canvas API is available and supports programmatic Canvas creation and sharing
- Slack bot token has necessary permissions to create and share Canvases (`canvas:write` or equivalent scope)
- Canvas creation and sharing can be performed from Lambda functions with appropriate API access
- Canvas content can contain formatted text, lists, and basic structure suitable for AI-generated replies
- Canvas can be shared in both threads and channels
- Canvas provides better user experience for both long content and structured documents compared to truncated, multi-part, or poorly formatted messages
- The length threshold for Canvas usage is 800 characters (providing better readability for longer chat responses while staying well under Slack's 4000 character message limit)
- Structured document formatting (headings, lists, tables, code blocks) benefits from Canvas presentation regardless of length
- Users prefer Canvas for long replies and structured documents over truncated messages, multiple message parts, or plain text formatting
- Canvas creation failures are rare but should be handled gracefully
- Existing message posting functionality continues to work for short replies

## Dependencies _(if applicable)_

- Slack Canvas API is available and documented
- Slack bot token has permissions to create and share Canvases
- System has network access to Slack Canvas API endpoints
- Existing Bedrock processor can determine reply length and detect structured formatting before posting
- Existing Slack posting functionality can be extended to support Canvas creation
- Canvas API supports sharing Canvases in threads (using thread_ts parameter)

## Out of Scope _(if applicable)_

The following items are explicitly deferred for future iterations:

- User preference settings for Canvas vs regular messages
- Canvas editing or updating after creation
- Canvas templates or custom formatting styles
- Canvas analytics or usage tracking
- Interactive Canvas elements (buttons, forms, etc.)
- Canvas versioning or history
- Canvas sharing permissions or access control
- Canvas search or indexing
- Canvas collaboration features (real-time editing by multiple users)
- Canvas export or download functionality
- Custom Canvas layouts or designs
- Canvas content caching or optimization
- Multi-language Canvas content formatting
- Canvas content preview or thumbnails
