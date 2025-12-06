# Research: Slack Message Attachments Support

**Feature**: 004-slack-attachments
**Date**: 2025-01-27
**Purpose**: Resolve technical clarifications and establish implementation patterns for attachment processing functionality

## Overview

This document resolves technical questions about implementing attachment processing in Slack messages and establishes the implementation approach for handling images and documents alongside text messages.

## Research Tasks

### 1. Slack API Attachment Structure in Events

**Question**: How are file attachments represented in Slack event payloads?

**Decision**: Use `event.files` array to extract attachment metadata

**Rationale**:

- **Slack API Documentation**: When a message contains file attachments, Slack includes a `files` array in the event payload
- **Array structure**: Each file object contains metadata (file ID, name, MIME type, size, download URL)
- **Availability**: `event.files` is present when attachments exist, empty array or absent when no attachments
- **File metadata**: Includes `id`, `name`, `mimetype`, `size`, `url_private`, `url_private_download` fields

**Implementation**:

```python
# In slack-event-handler/handler.py
slack_event = body.get("event", {})
files = slack_event.get("files", [])  # Extract files array

# Process each file
for file_info in files:
    file_id = file_info.get("id")
    file_name = file_info.get("name")
    mime_type = file_info.get("mimetype")
    file_size = file_info.get("size")
    download_url = file_info.get("url_private_download")
```

**Event Structure**:

```json
{
  "type": "event_callback",
  "event": {
    "type": "app_mention",
    "ts": "1234567890.123456",
    "channel": "C01234567",
    "text": "<@U98765432> Check this image",
    "user": "U01234567",
    "files": [
      {
        "id": "F01234567",
        "name": "screenshot.png",
        "mimetype": "image/png",
        "size": 1024000,
        "url_private": "https://files.slack.com/files-pri/...",
        "url_private_download": "https://files.slack.com/files-pri/.../download"
      }
    ]
  }
}
```

**Validation**:

- `event.files` may be absent (no attachments) or empty array (no attachments)
- Each file object must have `id`, `mimetype`, `size` for processing decisions
- `url_private_download` required for file downloads (may be absent for some file types)

**Alternatives Considered**:

- **`event.file`**: Single file object, but Slack supports multiple attachments per message
- **`event.attachments`**: Different field used for rich message formatting, not file attachments

**Important Note (Updated 2025-01)**:
- **Slack Files API (`files.info`)**: Initially rejected as "unnecessary overhead", but this was incorrect.
- **Slack Official Best Practice**: `url_private_download` from event payloads may be stale or expired. Always fetch fresh download URL via `files.info` API for reliable downloads.
- **Implementation**: Call `files.info` API to get the latest `url_private_download` before downloading files.

---

### 2. Slack API File Download Methods

**Question**: How to download files from Slack using bot token authentication?

**Decision**: Use `files.info` API to get fresh `url_private_download`, then download with bot token

**Rationale** (Updated 2025-01 based on production issues):

- **Slack Official Best Practice**: Event payload URLs may be stale/expired; always use `files.info` API
- **Bot token**: Use `bot_token` (xoxb-\*) from DynamoDB workspace tokens
- **Two-step process**: 1) Call `files.info` to get fresh URL, 2) Download file
- **Rate limits**: Tier 2 rate limit applies; implement exponential backoff for 429 errors

**Implementation**:

```python
# In bedrock-processor/file_downloader.py
import requests
import time

def get_file_download_url(file_id: str, bot_token: str) -> Optional[str]:
    """
    Get fresh download URL via Slack files.info API.
    
    Slack official best practice: Event payload URLs may be stale.
    Always fetch fresh URL from files.info API.
    """
    response = requests.get(
        "https://slack.com/api/files.info",
        headers={"Authorization": f"Bearer {bot_token}"},
        params={"file": file_id},
        timeout=10,
    )
    data = response.json()
    if data.get("ok"):
        return data.get("file", {}).get("url_private_download")
    return None

def download_file(download_url: str, bot_token: str, max_retries: int = 3) -> bytes:
    """
    Download file from Slack CDN with retry logic and rate limit handling.
    """
    headers = {"Authorization": f"Bearer {bot_token}"}
    
    for attempt in range(max_retries):
        response = requests.get(download_url, headers=headers, timeout=30)
        
        if response.status_code == 429:  # Rate limited
            retry_after = int(response.headers.get("Retry-After", 2 ** attempt))
            time.sleep(retry_after)
            continue
            
        response.raise_for_status()
        return response.content
    
    raise Exception("Max retries exceeded")
```

**Error Handling**:

- **401 Unauthorized**: Bot token invalid or expired → log error, skip file
- **403 Forbidden**: No access to file → log error, notify user about permission
- **404 Not Found**: File deleted or inaccessible → log warning, skip file
- **429 Too Many Requests**: Rate limit exceeded → exponential backoff with Retry-After header
- **Timeout**: Large file download exceeds timeout → log error, skip file
- **HTML Response**: Error page returned instead of file → validate Content-Type header

**Rate Limiting**:

- **Tier 2 limit**: 20 requests/minute per method
- **Mitigation**: Exponential backoff with jitter for 429 errors
- **Retry-After**: Respect Retry-After header from Slack response

**Validation** (Added 2025-01):

- **Content-Type check**: Verify response is not HTML error page
- **Size validation**: Compare downloaded size with expected size
- **Magic bytes check**: Validate image headers (PNG/JPEG/GIF/WebP)

**Alternatives Considered**:

- **`files.sharedPublicURL`**: Creates public URL, but security risk
- **Direct event URL**: Rejected - URLs may be stale (production issue confirmed)
- **S3 presigned URLs**: Would require uploading to S3 first, over-engineered

---

### 3. AWS Bedrock Vision Capabilities for Images

**Question**: How does AWS Bedrock support image analysis? Which models support vision?

**Decision**: Use Claude 3 Sonnet or Haiku with vision capabilities (base64-encoded images)

**Rationale**:

- **Claude 3 models**: Sonnet and Haiku support vision (image input) via base64 encoding
- **API format**: Images included in `content` array with `type: "image"` and `source` object
- **Image format**: Base64-encoded image data with MIME type
- **Model selection**: Sonnet provides better vision analysis, Haiku is faster/cheaper (choose based on requirements)

**Implementation**:

```python
# In bedrock-processor/bedrock_client.py
import base64

def prepare_image_content(image_bytes: bytes, mime_type: str) -> dict:
    """
    Prepare image content for Bedrock API.

    Args:
        image_bytes: Raw image file bytes
        mime_type: MIME type (e.g., "image/png", "image/jpeg")

    Returns:
        dict: Content block for Bedrock API
    """
    base64_image = base64.b64encode(image_bytes).decode('utf-8')

    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": mime_type,
            "data": base64_image
        }
    }

# In Bedrock request
messages = [
    {
        "role": "user",
        "content": [
            {"type": "text", "text": "What's in this image?"},
            prepare_image_content(image_bytes, "image/png")
        ]
    }
]
```

**Supported Image Formats**:

- **PNG**: Full support
- **JPEG/JPG**: Full support
- **GIF**: Supported (first frame analyzed)
- **WebP**: Supported
- **Size limits**: Bedrock accepts images up to 5MB (base64 encoded)

**Model Selection**:

- **Claude 3 Sonnet**: Better vision analysis, higher cost, slower (~3-5 seconds)
- **Claude 3 Haiku**: Faster, cheaper, adequate vision for most use cases (~1-3 seconds)
- **Recommendation**: Start with Haiku, upgrade to Sonnet if vision quality insufficient

**Alternatives Considered**:

- **Amazon Rekognition**: Separate AWS service for image analysis, rejected as adds complexity and cost
- **Text-only models**: Cannot analyze images, rejected per spec requirement FR-009
- **External vision API**: Adds external dependency, rejected for simplicity

---

### 4. Python Libraries for Document Text Extraction

**Question**: Which Python libraries to use for extracting text from PDF, DOCX, TXT, CSV, XLSX, and PPTX files?

**Decision**: Use PyPDF2 for PDF, python-docx for DOCX, built-in csv module for CSV, openpyxl for XLSX, python-pptx for PPTX, built-in file reading for TXT

**Rationale**:

- **PDF extraction**: PyPDF2 is lightweight, Lambda-compatible, supports text extraction
- **DOCX extraction**: python-docx is standard library for Word documents, extracts text reliably
- **CSV extraction**: Built-in `csv` module sufficient for reading CSV files
- **XLSX extraction**: openpyxl is lightweight, Lambda-compatible, supports Excel file reading
- **PPTX extraction**: python-pptx is standard library for PowerPoint files, extracts text from slides
- **PPTX image conversion**: Convert PPTX slides to images for visual analysis using LibreOffice (via Lambda Layer) or python-pptx + Pillow (limited rendering)
- **TXT files**: Built-in Python file reading sufficient (no library needed)
- **Lambda compatibility**: All libraries are pure Python, no system dependencies
- **Size constraints**: Libraries are small enough for Lambda deployment packages

**Implementation**:

```python
# In bedrock-processor/document_extractor.py
import PyPDF2
import docx
import csv
import openpyxl
from pptx import Presentation
from io import BytesIO, StringIO

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from PDF file."""
    pdf_file = BytesIO(pdf_bytes)
    pdf_reader = PyPDF2.PdfReader(pdf_file)

    text_parts = []
    for page in pdf_reader.pages:
        text_parts.append(page.extract_text())

    return "\n\n".join(text_parts)

def extract_text_from_docx(docx_bytes: bytes) -> str:
    """Extract text from DOCX file."""
    docx_file = BytesIO(docx_bytes)
    doc = docx.Document(docx_file)

    text_parts = []
    for paragraph in doc.paragraphs:
        text_parts.append(paragraph.text)

    return "\n".join(text_parts)

def extract_text_from_csv(csv_bytes: bytes) -> str:
    """Extract text from CSV file."""
    csv_string = csv_bytes.decode('utf-8', errors='replace')
    csv_file = StringIO(csv_string)
    reader = csv.reader(csv_file)

    rows = []
    for row in reader:
        rows.append(",".join(row))

    return "\n".join(rows)

def extract_text_from_xlsx(xlsx_bytes: bytes) -> str:
    """Extract text from XLSX file."""
    xlsx_file = BytesIO(xlsx_bytes)
    workbook = openpyxl.load_workbook(xlsx_file, data_only=True)

    text_parts = []
    for sheet_name in workbook.sheetnames:
        sheet = workbook[sheet_name]
        text_parts.append(f"Sheet: {sheet_name}")

        for row in sheet.iter_rows(values_only=True):
            row_text = "\t".join(str(cell) if cell is not None else "" for cell in row)
            if row_text.strip():  # Skip empty rows
                text_parts.append(row_text)

        text_parts.append("")  # Separator between sheets

    return "\n".join(text_parts)

def extract_text_from_pptx(pptx_bytes: bytes) -> str:
    """Extract text from PPTX file."""
    pptx_file = BytesIO(pptx_bytes)
    prs = Presentation(pptx_file)

    text_parts = []
    for slide_num, slide in enumerate(prs.slides, 1):
        text_parts.append(f"Slide {slide_num}:")

        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text:
                text_parts.append(shape.text)

        text_parts.append("")  # Separator between slides

    return "\n".join(text_parts)

def convert_pptx_to_images(pptx_bytes: bytes) -> List[bytes]:
    """
    Convert PPTX slides to images (PNG format).

    Returns list of image bytes, one per slide.
    """
    import subprocess
    import tempfile
    import os
    from pathlib import Path

    # Save PPTX to temporary file
    with tempfile.NamedTemporaryFile(suffix='.pptx', delete=False) as tmp_pptx:
        tmp_pptx.write(pptx_bytes)
        tmp_pptx_path = tmp_pptx.name

    try:
        # Use LibreOffice to convert PPTX to images
        # Requires LibreOffice installed in Lambda Layer
        output_dir = tempfile.mkdtemp()

        # Convert PPTX to PNG images (one per slide)
        subprocess.run([
            'libreoffice',
            '--headless',
            '--convert-to', 'png',
            '--outdir', output_dir,
            tmp_pptx_path
        ], check=True, timeout=60)

        # Read generated images
        image_files = sorted(Path(output_dir).glob('*.png'))
        images = []
        for img_file in image_files:
            with open(img_file, 'rb') as f:
                images.append(f.read())

        return images
    finally:
        # Cleanup
        os.unlink(tmp_pptx_path)
        import shutil
        shutil.rmtree(output_dir, ignore_errors=True)

def extract_text_from_txt(txt_bytes: bytes) -> str:
    """Extract text from TXT file."""
    return txt_bytes.decode('utf-8', errors='replace')
```

**Error Handling**:

- **Corrupted files**: Catch exceptions, return error message
- **Encrypted PDFs**: PyPDF2 cannot extract from password-protected PDFs → log error, skip file
- **Large files**: Monitor memory usage, skip files exceeding Lambda memory limits
- **Encoding issues**: Use `errors='replace'` for TXT files to handle non-UTF-8 content

**PPTX Image Conversion**:

PPTX slides can be converted to images using:

1. **LibreOffice (Recommended)**: Full-featured conversion with accurate rendering

   - Requires LibreOffice installed in Lambda Layer
   - Converts slides to PNG images accurately
   - Handles complex layouts, images, and formatting
   - Lambda Layer size: ~200-300MB

2. **python-pptx + Pillow (Limited)**: Basic conversion without full rendering
   - Limited to text and simple shapes
   - Cannot render complex layouts or embedded images
   - Lighter weight but less accurate

**Decision**: Use LibreOffice via Lambda Layer for accurate slide-to-image conversion

**Implementation**:

- Create Lambda Layer with LibreOffice headless installation
- Use `libreoffice --headless --convert-to png` command
- Convert each slide to separate PNG image
- Base64 encode images for Bedrock API

**Library Alternatives Considered**:

- **pdfplumber**: Better text extraction quality, but larger dependency → consider if PyPDF2 insufficient
- **pypdf**: PyPDF2 successor, but newer and less tested → stick with PyPDF2 for stability
- **python-docx2txt**: Simpler alternative, but python-docx is more standard
- **pandas for XLSX**: More powerful but heavier dependency → openpyxl is lighter and sufficient for text extraction
- **xlrd for XLS**: Older library, XLSX support via openpyxl preferred
- **pptx2image**: Wrapper around LibreOffice, but adds unnecessary abstraction layer
- **Tika**: Apache Tika for multiple formats, but requires Java runtime → rejected for Lambda compatibility

---

### 5. File Size Limits and Processing Constraints

**Question**: What are reasonable file size limits for attachment processing?

**Decision**: Enforce limits: images 10MB, documents 5MB (before base64 encoding)

**Rationale**:

- **Lambda memory**: Lambda functions have memory limits (128MB-10GB); large files consume memory
- **Lambda timeout**: 15-minute max timeout; large files take longer to download and process
- **Bedrock limits**: Bedrock accepts images up to 5MB base64-encoded (~3.75MB raw)
- **Network bandwidth**: Large downloads may exceed Lambda network timeouts
- **Cost**: Larger files increase Bedrock API costs (token usage)

**Implementation**:

```python
# In bedrock-processor/attachment_processor.py
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB
MAX_DOCUMENT_SIZE = 5 * 1024 * 1024  # 5MB

def validate_file_size(file_size: int, mime_type: str) -> bool:
    """Validate file size against limits."""
    if mime_type.startswith("image/"):
        return file_size <= MAX_IMAGE_SIZE
    elif mime_type in [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "text/csv",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ]:
        return file_size <= MAX_DOCUMENT_SIZE
    return False
```

**Size Limits**:

- **Images**: 10MB raw (before base64 encoding → ~7.5MB base64 → under Bedrock 5MB limit)
- **Documents**: 5MB raw (sufficient for most PDF/DOCX files)
- **Validation**: Check `file.size` from event metadata before downloading

**Error Handling**:

- **File too large**: Return user-friendly error message, skip file processing
- **Base64 encoding exceeds limit**: Reject image if base64-encoded size > 5MB
- **Memory exhaustion**: Monitor Lambda memory usage, skip large files if approaching limit

**Alternatives Considered**:

- **No size limits**: Rejected as risks Lambda timeouts and excessive costs
- **Stricter limits (5MB images, 2MB documents)**: Too restrictive, would reject many legitimate files
- **Dynamic limits based on Lambda memory**: Complex to implement, fixed limits simpler

---

### 6. Attachment Processing Flow and Error Handling

**Question**: How should attachment processing be orchestrated? What happens when processing fails?

**Decision**: Process attachments sequentially, continue with text if attachment processing fails

**Rationale**:

- **FR-008 requirement**: Attachment download failures must not crash system
- **FR-014 requirement**: Handle messages with attachments but no text content
- **User experience**: Better to process text and some attachments than fail completely
- **Error isolation**: Each attachment processed independently; failures don't affect others

**Implementation Flow**:

```
1. Extract attachment metadata from event.files
2. Validate file sizes (skip files exceeding limits)
3. For each attachment:
   a. Download file from Slack CDN
   b. Extract content (image bytes or document text)
   c. Prepare for AI processing
   d. If error: log warning, skip attachment, continue
4. Combine text + attachment content into AI prompt
5. If no attachments processed successfully: process text only
6. Send to Bedrock API
7. Post response to Slack
```

**Error Handling Strategy**:

```python
# In bedrock-processor/attachment_processor.py
processed_attachments = []
errors = []

for file_info in attachment_metadata:
    try:
        # Download and process
        content = process_attachment(file_info, bot_token)
        processed_attachments.append(content)
    except FileTooLargeError:
        errors.append(f"{file_info['name']}: File too large")
    except DownloadError:
        errors.append(f"{file_info['name']}: Download failed")
    except ExtractionError:
        errors.append(f"{file_info['name']}: Content extraction failed")
    except Exception as e:
        errors.append(f"{file_info['name']}: Unexpected error")

# Continue with text + successfully processed attachments
if processed_attachments:
    ai_prompt = build_prompt(text, processed_attachments)
else:
    # Fall back to text-only if no attachments processed
    ai_prompt = build_prompt(text, [])
```

**User Feedback**:

- **Partial success**: Include note in AI response if some attachments failed
- **Complete failure**: Process text-only, mention attachments couldn't be processed
- **No text, attachments failed**: Return error message explaining issue

**Alternatives Considered**:

- **Fail fast**: Reject entire message if any attachment fails → rejected as poor UX
- **Parallel processing**: Process attachments concurrently → rejected due to rate limits and complexity
- **Retry logic**: Retry failed downloads → deferred per spec (not in scope)

---

### 7. Slack Bot Permissions for File Access

**Question**: What Slack bot permissions (scopes) are required to download attachments?

**Decision**: Require `files:read` scope in Slack app manifest

**Rationale**:

- **Slack API Documentation**: `files:read` scope allows bot to read files shared in channels/DMs
- **Download access**: Required to access `url_private_download` URLs
- **Event access**: Bot can receive `event.files` in event payloads with this scope
- **Workspace installation**: Scope must be requested during OAuth installation

**Implementation**:

```yaml
# In docs/slack-app-manifest.yaml
oauth_config:
  scopes:
    bot:
      - chat:write # Existing: Send messages
      - im:history # Existing: Read DMs
      - app_mentions:read # Existing: Read mentions
      - files:read # NEW: Read/download files
```

**Permission Validation**:

- **Check during processing**: If download fails with 403 Forbidden, log error indicating missing scope
- **Installation check**: Verify `files:read` scope granted during OAuth flow
- **User guidance**: Provide clear error message if scope missing

**Alternatives Considered**:

- **`files:write`**: Allows uploading files, not needed for reading → rejected
- **`files:read:user`**: User-specific file access, not needed for bot access → rejected
- **No scope**: Cannot access private file URLs → rejected

---

## Summary

**Key Decisions**:

1. Extract attachment metadata from `event.files` array in Slack events
2. Download files using `url_private_download` with bot token authentication
3. Use Claude 3 Sonnet/Haiku with vision capabilities for image analysis (base64 encoding)
4. Use PyPDF2 for PDF, python-docx for DOCX, built-in reading for TXT
5. Enforce file size limits: 10MB images, 5MB documents
6. Process attachments sequentially with error isolation
7. Require `files:read` scope in Slack app manifest

**Implementation Approach**:

- Modify `slack-event-handler/handler.py` to extract `event.files` and include in payload
- Create `bedrock-processor/attachment_processor.py` to orchestrate attachment processing
- Create `bedrock-processor/file_downloader.py` for Slack CDN downloads
- Create `bedrock-processor/document_extractor.py` for text extraction
- Modify `bedrock-processor/bedrock_client.py` to support image input (base64)
- Update Slack app manifest to include `files:read` scope

**Risk Mitigation**:

- File size validation prevents Lambda memory/timeout issues
- Error handling ensures system continues processing even if attachments fail
- Rate limit awareness prevents Slack API throttling
- Backward compatibility maintained (text-only messages continue to work)

## Technology Stack Summary

Based on research above:

| Component            | Technology            | Version                                | Justification                                      |
| -------------------- | --------------------- | -------------------------------------- | -------------------------------------------------- |
| File Download        | requests              | 2.x                                    | Standard HTTP library for file downloads           |
| PDF Extraction       | PyPDF2                | 3.x                                    | Lightweight, Lambda-compatible PDF text extraction |
| DOCX Extraction      | python-docx           | 1.x                                    | Standard library for Word document text extraction |
| CSV Extraction       | csv (built-in)        | N/A                                    | Built-in module for CSV file reading               |
| XLSX Extraction      | openpyxl              | 3.x                                    | Lightweight, Lambda-compatible Excel file reading  |
| PPTX Extraction      | python-pptx           | 1.x                                    | Standard library for PowerPoint text extraction    |
| Image Processing     | base64 (built-in)     | N/A                                    | Base64 encoding for Bedrock API                    |
| Bedrock Vision Model | Claude 3 Haiku/Sonnet | anthropic.claude-3-haiku-20240307-v1:0 | Vision-capable models for image analysis           |
| Slack File Access    | files:read scope      | N/A                                    | Required scope for file downloads                  |

## Open Questions for Implementation Phase

The following questions remain but do not block Phase 1 design:

1. **Claude 3 model selection**: Choose Haiku (faster/cheaper) vs Sonnet (better vision) based on testing
2. **PDF extraction quality**: Evaluate PyPDF2 quality; consider pdfplumber if insufficient
3. **Large file handling**: Determine if streaming downloads needed for very large files
4. **Attachment caching**: Consider caching downloaded files in S3 if frequently accessed (deferred per spec)

These will be resolved during implementation (`/speckit.tasks` phase).

## References

- [Slack Files API Documentation](https://api.slack.com/methods/files.info)
- [Slack Event API - Files](https://api.slack.com/events/message#file_share)
- [AWS Bedrock Claude 3 Vision](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-claude.html)
- [PyPDF2 Documentation](https://pypdf2.readthedocs.io/)
- [python-docx Documentation](https://python-docx.readthedocs.io/)
- [Slack OAuth Scopes](https://api.slack.com/scopes)
