# Research: Slack File Generation

**Feature Branch**: `025-slack-file-generation`
**Date**: 2026-02-11

## Decision 1: File Generation Architecture — Strands Agent with @tool vs Direct Converse API

### Decision

Use **strands Agent with @tool decorator** for file generation, replacing the current direct `invoke_bedrock()` call in the Execution Agent.

### Rationale

1. **Framework-managed tool-use loop**: Strands handles the model→toolUse→toolResult→model loop automatically, eliminating manual implementation of the multi-turn tool-use cycle
2. **Clean @tool pattern**: Adding new file types in the future requires only defining a new `@tool` function — no changes to the invocation loop
3. **AWS best practice**: strands-agents is AWS's official agent SDK; the project already depends on it (`strands-agents[a2a]~=1.25.0`)
4. **Multimodal support**: `Agent.__call__` accepts `str | list[ContentBlock]`, supporting existing image/document attachment flow

### Alternatives Considered

| Alternative | Rejected Because |
|-------------|-----------------|
| Direct Converse API with toolConfig | Must implement tool-use loop manually; more code to maintain; doesn't leverage existing dependency |
| Post-processing AI text output for file markers | Fragile (depends on model following format); can't handle binary files (Excel, PPTX); no real execution for charts |
| AgentCore Code Interpreter | Overkill for predefined file generation; slower (spins up separate sandbox); less predictable output quality |

---

## Decision 2: Tool Design — Dedicated Tools per File Category

### Decision

Define 5 focused file generation tools:

| Tool | File Types | Library |
|------|-----------|---------|
| `generate_text_file` | .md, .csv, .txt | Built-in (write string) |
| `generate_excel` | .xlsx | openpyxl (already installed) |
| `generate_word` | .docx | python-docx |
| `generate_powerpoint` | .pptx | python-pptx |
| `generate_chart_image` | .png | matplotlib |

### Rationale

1. **Clear tool descriptions** help the model choose the right tool — Bedrock Converse relies on tool descriptions for selection
2. **Typed inputs per tool** ensure the model provides the correct data structure (e.g., Excel needs sheets/rows, PowerPoint needs slides)
3. **One tool per category** (not per file extension) keeps the tool count manageable while covering all spec requirements

### Alternatives Considered

| Alternative | Rejected Because |
|-------------|-----------------|
| Single `generate_file` tool with format parameter | Too broad; model gets less guidance on what inputs to provide; harder to validate |
| One tool per file extension | Too many tools (7+); some share the same underlying logic (md/csv/txt are all text) |

---

## Decision 3: File Artifact Return Path — ToolContext + Existing Pipeline

### Decision

Tools store generated file bytes in `tool_context.invocation_state` (strands mechanism). After the agent loop completes, the handler extracts the file and builds `file_artifact` using the existing format.

### Rationale

1. **Reuses existing pipeline**: No changes needed to Verification Agent, SQS, or Slack Poster — they already handle `file_artifact`
2. **Clean separation**: The tool generates the file; the handler manages the artifact format
3. **ToolContext is the strands-idiomatic way** to share state between tools and the handler

### Flow

```
User message → strands Agent(tools=[...])
    → Model decides to call generate_excel
    → @tool generate_excel runs, stores bytes in tool_context.invocation_state["generated_file"]
    → Returns text: "Excelファイル「report.xlsx」を作成しました。"
    → Model uses this to write response_text
    → Agent loop ends
    → Handler extracts generated_file from invocation_state
    → Builds file_artifact (Base64 + fileName + mimeType)
    → Returns ExecutionResponse with response_text + file_artifact
```

---

## Decision 4: Container Dependencies — Within 2GB Image Limit

### Decision

Add `python-pptx`, `python-docx`, `matplotlib`, `Pillow` to Execution Agent container. Update Dockerfile with build dependencies for ARM64 compilation.

### Size Estimates

| Library | Size (ARM64) | Notes |
|---------|-------------|-------|
| Base image (python:3.11-slim) | ~150 MB | Existing |
| strands-agents + boto3 + fastapi + uvicorn | ~200-300 MB | Existing |
| openpyxl ~3.1.0 | ~5 MB | Already installed |
| python-pptx ~1.0.0 | ~15 MB | New — pure Python |
| python-docx ~1.1.0 | ~10 MB | New — pure Python |
| matplotlib ~3.9.0 | ~60-80 MB | New — requires numpy (C ext) |
| Pillow ~11.0.0 | ~20-30 MB | New — C extensions |
| **Total estimated** | **~500-600 MB** | **Well within 2 GB limit** |

### AgentCore Constraints

| Resource | Limit | Impact |
|----------|-------|--------|
| Docker image size | 2 GB | ~600 MB used — 70% headroom |
| Memory per session | 8 GB | matplotlib peaks ~200-500 MB — safe |
| Disk per session | 10 GB | /tmp for file generation — safe |
| Payload size | 100 MB | Base64 file in response — 5 MB limit per file_config |

---

## Decision 5: Generated File Size Limit

### Decision

Maintain the existing 5 MB limit from `file_config.py` for generated files. This aligns with Slack's standard file upload limits and the existing pipeline.

### Rationale

- Slack's `files_upload_v2` has a practical limit aligned with workspace plan
- Base64 encoding inflates ~33%, so a 5 MB file becomes ~6.7 MB in the JSON payload — within AgentCore's 100 MB payload limit
- SQS message size limit is 256 KB for the message body, but `file_artifact` is included in the body — **this needs investigation**

### Open Risk: SQS Message Size

The `slack_post_request.py` sends the entire `file_artifact` (including `contentBase64`) in a single SQS message. SQS has a 256 KB message body limit. A 5 MB Base64-encoded file would be ~6.7 MB — **exceeding SQS limits**.

**Resolution**: The current 024 implementation already handles this (it works in production), so there must be either:
1. Extended message size via SQS Extended Client Library, or
2. The current file artifacts are small enough to fit, or
3. The file_artifact is uploaded to S3 with a reference in SQS

This needs verification during implementation. If SQS is the bottleneck, we'll use S3 as the file exchange layer (upload generated file to S3, send S3 key in SQS message).

---

## Decision 6: Tool Return Pattern for Model Communication

### Decision

Tools return a **text description** to the model (not the file bytes). The file bytes are stored in `invocation_state` for the handler to extract.

### Rationale

- The Bedrock ToolResult supports `document` and `image` content blocks, but these are for the model to **analyze** the file, not for passing it downstream
- Returning a 5 MB Excel file as a document ToolResult would waste tokens and confuse the model
- The text description allows the model to write a coherent `response_text` explaining what was generated

### Example Tool Return

```python
return {
    "status": "success",
    "content": [{"text": "Excelファイル「quarterly_report.xlsx」を作成しました。3シート（売上、費用、利益）を含みます。"}]
}
```

---

## Decision 7: Backward Compatibility with Text-Only Requests

### Decision

The strands Agent handles ALL requests (not just file generation). For text-only responses, the model simply doesn't call any tools — the tool-use feature is additive.

### Rationale

- No branching logic needed ("is this a file generation request?")
- The model intelligently decides when to use tools based on the user's intent
- Simpler code path, easier to test
- If tools are defined but not used, the response time overhead is minimal (~1 extra API field in the request)
