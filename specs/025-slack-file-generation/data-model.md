# Data Model: Slack File Generation

**Feature Branch**: `025-slack-file-generation`
**Date**: 2026-02-11

## Entities

### GeneratedFile (new — stored in ToolContext.invocation_state)

| Field | Type | Description |
|-------|------|-------------|
| file_bytes | bytes | Raw binary content of the generated file |
| file_name | string | Auto-generated filename with extension (e.g., "quarterly_report.xlsx") |
| mime_type | string | MIME type (e.g., "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") |
| description | string | Human-readable description of the generated file content |

**Lifecycle**: Created by @tool function → read by handler after agent loop → encoded as file_artifact → discarded after response

### Supported File Types (configuration)

| Category | Extension | MIME Type | Generation Library |
|----------|-----------|-----------|-------------------|
| Text | .md | text/markdown | Built-in |
| Text | .csv | text/csv | Built-in |
| Text | .txt | text/plain | Built-in |
| Office | .xlsx | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet | openpyxl |
| Office | .docx | application/vnd.openxmlformats-officedocument.wordprocessingml.document | python-docx |
| Office | .pptx | application/vnd.openxmlformats-officedocument.presentationml.presentation | python-pptx |
| Image | .png | image/png | matplotlib |

### Tool Input Schemas

#### generate_text_file

```json
{
  "content": "string — Complete file content as text",
  "filename": "string — Filename with extension (e.g., report.md, data.csv)"
}
```

#### generate_excel

```json
{
  "filename": "string — Filename without extension (e.g., quarterly_report)",
  "sheets": [
    {
      "name": "string — Sheet name",
      "headers": ["string — Column headers"],
      "rows": [["string|number — Cell values"]]
    }
  ]
}
```

#### generate_word

```json
{
  "filename": "string — Filename without extension",
  "title": "string — Document title",
  "sections": [
    {
      "heading": "string — Section heading",
      "content": "string — Paragraph text"
    }
  ]
}
```

#### generate_powerpoint

```json
{
  "filename": "string — Filename without extension",
  "slides": [
    {
      "title": "string — Slide title",
      "body": "string — Slide body text",
      "layout": "string — optional: title_slide | title_and_content | blank"
    }
  ]
}
```

#### generate_chart_image

```json
{
  "filename": "string — Filename without extension",
  "chart_type": "string — bar | line | pie | scatter",
  "title": "string — Chart title",
  "data": {
    "labels": ["string — X-axis labels or pie segment names"],
    "datasets": [
      {
        "label": "string — Dataset label",
        "values": ["number — Data values"]
      }
    ]
  },
  "x_label": "string — optional: X-axis label",
  "y_label": "string — optional: Y-axis label"
}
```

## Existing Entities (unchanged)

### ExecutionResponse

No structural changes. The `file_artifact` field already supports generated file output.

### FileArtifact (SQS message format)

No structural changes. Format remains:

```json
{
  "contentBase64": "base64-encoded-bytes",
  "fileName": "report.xlsx",
  "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
}
```

### file_config.py — ALLOWED_MIME_TYPES update needed

Current defaults: `text/csv, application/json, text/plain`

New required MIME types for generated files:
- `text/markdown`
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `application/vnd.openxmlformats-officedocument.presentationml.presentation`
- `image/png`

## State Transitions

```
[User Request]
    ↓
[strands Agent — no file generated yet]
    ↓ (model decides to call tool)
[Tool Execution — GeneratedFile created in invocation_state]
    ↓ (tool returns text description to model)
[strands Agent — model writes response_text]
    ↓ (agent loop ends)
[Handler — extracts GeneratedFile, builds file_artifact]
    ↓
[ExecutionResponse with file_artifact]
    ↓ (Verification Agent → SQS → Slack Poster)
[File uploaded to Slack]
```
