# Quickstart Guide: Slack Message Attachments Support

**Feature**: 004-slack-attachments  
**Date**: 2025-01-27  
**Purpose**: Quick reference guide for implementing and testing attachment processing functionality

## Overview

This feature enables the Slack bot to process file attachments (images and documents) alongside text messages. The bot can analyze images using AWS Bedrock vision capabilities and extract text from documents (PDF, DOCX, TXT) for AI processing.

## Prerequisites

- Existing Slack Bedrock MVP deployed and working (001-slack-bedrock-mvp)
- Thread reply functionality implemented (003-thread-reply)
- Slack app with `files:read` scope added to manifest
- AWS Bedrock access with Claude 3 Haiku or Sonnet (vision-capable models)

## Implementation Checklist

### 1. Update Slack App Manifest

**File**: `docs/slack-app-manifest.yaml`

Add `files:read` scope to bot permissions:

```yaml
oauth_config:
  scopes:
    bot:
      - chat:write
      - im:history
      - app_mentions:read
      - files:read # NEW: Required for file downloads
```

**Action**: Update manifest and reinstall Slack app to workspace (or update existing installation).

---

### 2. Update Lambda Dependencies

**File**: `lambda/execution-stack/bedrock-processor/requirements.txt`

Add new dependencies:

```txt
# Existing dependencies
boto3>=1.28.0
slack-sdk>=3.23.0

# NEW: Attachment processing dependencies
requests>=2.31.0          # File downloads from Slack CDN
PyPDF2>=3.0.0             # PDF text extraction
python-docx>=1.1.0        # DOCX text extraction
openpyxl>=3.1.0           # XLSX text extraction
python-pptx>=0.6.21       # PPTX text extraction
# CSV: built-in csv module (no installation needed)
# LibreOffice: Required for PPTX to image conversion (via Lambda Layer)
```

**Action**: Run `pip install -r requirements.txt` locally, then deploy Lambda.

---

### 3. Modify Slack Event Handler

**File**: `lambda/verification-stack/slack-event-handler/handler.py`

**Change**: Extract `event.files` array and include in payload to Bedrock Processor.

```python
# Extract files from event
files = slack_event.get("files", [])

# Build attachment metadata
attachments = []
for file_info in files:
    attachments.append({
        "id": file_info.get("id"),
        "name": file_info.get("name"),
        "mimetype": file_info.get("mimetype"),
        "size": file_info.get("size"),
        "url_private_download": file_info.get("url_private_download")
    })

# Include in payload
payload = {
    "channel": channel,
    "text": user_text,
    "bot_token": bot_token,
    "thread_ts": message_timestamp,
    "attachments": attachments  # NEW
}
```

**Action**: Modify handler, test locally, deploy.

---

### 4. Create File Downloader Module

**File**: `lambda/execution-stack/bedrock-processor/file_downloader.py` (NEW)

```python
import requests
from typing import Optional

def download_file(download_url: str, bot_token: str, timeout: int = 30) -> Optional[bytes]:
    """
    Download file from Slack CDN using bot token authentication.

    Args:
        download_url: URL from file_info["url_private_download"]
        bot_token: Slack bot OAuth token (xoxb-*)
        timeout: Request timeout in seconds

    Returns:
        bytes: File content, or None if download fails
    """
    try:
        headers = {"Authorization": f"Bearer {bot_token}"}
        response = requests.get(download_url, headers=headers, timeout=timeout)
        response.raise_for_status()
        return response.content
    except requests.RequestException as e:
        print(f"ERROR: File download failed: {e}")
        return None
```

**Action**: Create new file, add to Lambda package.

---

### 5. Create Document Extractor Module

**File**: `lambda/execution-stack/bedrock-processor/document_extractor.py` (NEW)

```python
import PyPDF2
import docx
import csv
import openpyxl
from pptx import Presentation
from io import BytesIO, StringIO
from typing import Optional

def extract_text_from_pdf(pdf_bytes: bytes) -> Optional[str]:
    """Extract text from PDF file."""
    try:
        pdf_file = BytesIO(pdf_bytes)
        pdf_reader = PyPDF2.PdfReader(pdf_file)
        text_parts = [page.extract_text() for page in pdf_reader.pages]
        return "\n\n".join(text_parts)
    except Exception as e:
        print(f"ERROR: PDF extraction failed: {e}")
        return None

def extract_text_from_docx(docx_bytes: bytes) -> Optional[str]:
    """Extract text from DOCX file."""
    try:
        docx_file = BytesIO(docx_bytes)
        doc = docx.Document(docx_file)
        text_parts = [paragraph.text for paragraph in doc.paragraphs]
        return "\n".join(text_parts)
    except Exception as e:
        print(f"ERROR: DOCX extraction failed: {e}")
        return None

def extract_text_from_csv(csv_bytes: bytes) -> Optional[str]:
    """Extract text from CSV file."""
    try:
        import csv
        from io import StringIO

        csv_string = csv_bytes.decode('utf-8', errors='replace')
        csv_file = StringIO(csv_string)
        reader = csv.reader(csv_file)

        rows = []
        for row in reader:
            rows.append(",".join(row))

        return "\n".join(rows)
    except Exception as e:
        print(f"ERROR: CSV extraction failed: {e}")
        return None

def extract_text_from_xlsx(xlsx_bytes: bytes) -> Optional[str]:
    """Extract text from XLSX file."""
    try:
        import openpyxl
        from io import BytesIO

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
    except Exception as e:
        print(f"ERROR: XLSX extraction failed: {e}")
        return None

def extract_text_from_pptx(pptx_bytes: bytes) -> Optional[str]:
    """Extract text from PPTX file."""
    try:
        from pptx import Presentation
        from io import BytesIO

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
    except Exception as e:
        print(f"ERROR: PPTX extraction failed: {e}")
        return None

def convert_pptx_slides_to_images(pptx_bytes: bytes) -> Optional[List[bytes]]:
    """
    Convert PPTX slides to PNG images.

    Returns list of image bytes (one per slide), or None if conversion fails.
    Requires LibreOffice installed in Lambda Layer.
    """
    try:
        import subprocess
        import tempfile
        import os
        from pathlib import Path
        from typing import List

        # Save PPTX to temporary file
        with tempfile.NamedTemporaryFile(suffix='.pptx', delete=False) as tmp_pptx:
            tmp_pptx.write(pptx_bytes)
            tmp_pptx_path = tmp_pptx.name

        try:
            # Use LibreOffice to convert PPTX to images
            output_dir = tempfile.mkdtemp()

            # Convert PPTX to PNG images (one per slide)
            # LibreOffice converts each slide to a separate PNG file
            subprocess.run([
                'libreoffice',
                '--headless',
                '--convert-to', 'png',
                '--outdir', output_dir,
                tmp_pptx_path
            ], check=True, timeout=60, capture_output=True)

            # Read generated images
            image_files = sorted(Path(output_dir).glob('*.png'))
            images = []
            for img_file in image_files:
                with open(img_file, 'rb') as f:
                    images.append(f.read())

            return images if images else None
        finally:
            # Cleanup temporary files
            os.unlink(tmp_pptx_path)
            import shutil
            shutil.rmtree(output_dir, ignore_errors=True)
    except Exception as e:
        print(f"ERROR: PPTX to image conversion failed: {e}")
        return None

def extract_text_from_txt(txt_bytes: bytes) -> Optional[str]:
    """Extract text from TXT file."""
    try:
        return txt_bytes.decode('utf-8', errors='replace')
    except Exception as e:
        print(f"ERROR: TXT extraction failed: {e}")
        return None
```

**Action**: Create new file, add to Lambda package.

---

### 6. Create Attachment Processor Module

**File**: `lambda/execution-stack/bedrock-processor/attachment_processor.py` (NEW)

```python
import base64
from typing import List, Dict, Optional
from file_downloader import download_file
from document_extractor import (
    extract_text_from_pdf,
    extract_text_from_docx,
    extract_text_from_csv,
    extract_text_from_xlsx,
    extract_text_from_pptx,
    extract_text_from_txt,
    convert_pptx_slides_to_images
)

MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB
MAX_DOCUMENT_SIZE = 5 * 1024 * 1024  # 5MB

def process_attachments(attachments: List[Dict], bot_token: str) -> List[Dict]:
    """
    Process attachments: download and extract content.

    Returns list of processed attachment content ready for AI processing.
    """
    processed = []

    for attachment in attachments:
        file_id = attachment.get("id")
        file_name = attachment.get("name")
        mime_type = attachment.get("mimetype", "")
        file_size = attachment.get("size", 0)
        download_url = attachment.get("url_private_download")

        # Validate file size
        if mime_type.startswith("image/"):
            if file_size > MAX_IMAGE_SIZE:
                processed.append({
                    "file_id": file_id,
                    "file_name": file_name,
                    "processing_status": "failed",
                    "error_message": "File too large (max 10MB for images)"
                })
                continue
        elif mime_type in [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text/plain",
            "text/csv",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        ]:
            if file_size > MAX_DOCUMENT_SIZE:
                processed.append({
                    "file_id": file_id,
                    "file_name": file_name,
                    "processing_status": "failed",
                    "error_message": "File too large (max 5MB for documents)"
                })
                continue

        # Download file
        if not download_url:
            processed.append({
                "file_id": file_id,
                "file_name": file_name,
                "processing_status": "failed",
                "error_message": "Download URL not available"
            })
            continue

        file_bytes = download_file(download_url, bot_token)
        if not file_bytes:
            processed.append({
                "file_id": file_id,
                "file_name": file_name,
                "processing_status": "failed",
                "error_message": "Download failed"
            })
            continue

        # Process based on MIME type
        if mime_type.startswith("image/"):
            # Base64 encode for Bedrock
            base64_image = base64.b64encode(file_bytes).decode('utf-8')
            processed.append({
                "file_id": file_id,
                "file_name": file_name,
                "mimetype": mime_type,
                "content_type": "image",
                "content": base64_image,
                "processing_status": "success"
            })
        elif mime_type == "application/pdf":
            text = extract_text_from_pdf(file_bytes)
            if text:
                processed.append({
                    "file_id": file_id,
                    "file_name": file_name,
                    "mimetype": mime_type,
                    "content_type": "document",
                    "content": text,
                    "processing_status": "success"
                })
            else:
                processed.append({
                    "file_id": file_id,
                    "file_name": file_name,
                    "processing_status": "failed",
                    "error_message": "PDF text extraction failed"
                })
        elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            text = extract_text_from_docx(file_bytes)
            if text:
                processed.append({
                    "file_id": file_id,
                    "file_name": file_name,
                    "mimetype": mime_type,
                    "content_type": "document",
                    "content": text,
                    "processing_status": "success"
                })
            else:
                processed.append({
                    "file_id": file_id,
                    "file_name": file_name,
                    "processing_status": "failed",
                    "error_message": "DOCX text extraction failed"
                })
        elif mime_type == "text/csv":
            text = extract_text_from_csv(file_bytes)
            if text:
                processed.append({
                    "file_id": file_id,
                    "file_name": file_name,
                    "mimetype": mime_type,
                    "content_type": "document",
                    "content": text,
                    "processing_status": "success"
                })
            else:
                processed.append({
                    "file_id": file_id,
                    "file_name": file_name,
                    "processing_status": "failed",
                    "error_message": "CSV extraction failed"
                })
        elif mime_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
            text = extract_text_from_xlsx(file_bytes)
            if text:
                processed.append({
                    "file_id": file_id,
                    "file_name": file_name,
                    "mimetype": mime_type,
                    "content_type": "document",
                    "content": text,
                    "processing_status": "success"
                })
            else:
                processed.append({
                    "file_id": file_id,
                    "file_name": file_name,
                    "processing_status": "failed",
                    "error_message": "XLSX extraction failed"
                })
        elif mime_type == "application/vnd.openxmlformats-officedocument.presentationml.presentation":
            # Extract text from PPTX
            text = extract_text_from_pptx(file_bytes)

            # Convert slides to images
            slide_images = convert_pptx_slides_to_images(file_bytes)

            if slide_images:
                # Process each slide image
                for slide_num, image_bytes in enumerate(slide_images, 1):
                    # Base64 encode each slide image
                    base64_image = base64.b64encode(image_bytes).decode('utf-8')
                    processed.append({
                        "file_id": f"{file_id}_slide_{slide_num}",
                        "file_name": f"{file_name} - Slide {slide_num}",
                        "mimetype": "image/png",
                        "content_type": "image",
                        "content": base64_image,
                        "processing_status": "success"
                    })

            # Also include text extraction if available
            if text:
                processed.append({
                    "file_id": f"{file_id}_text",
                    "file_name": f"{file_name} (text)",
                    "mimetype": mime_type,
                    "content_type": "document",
                    "content": text,
                    "processing_status": "success"
                })

            if not slide_images and not text:
                processed.append({
                    "file_id": file_id,
                    "file_name": file_name,
                    "processing_status": "failed",
                    "error_message": "PPTX processing failed (both text and image conversion)"
                })
        elif mime_type == "text/plain":
            text = extract_text_from_txt(file_bytes)
            if text:
                processed.append({
                    "file_id": file_id,
                    "file_name": file_name,
                    "mimetype": mime_type,
                    "content_type": "document",
                    "content": text,
                    "processing_status": "success"
                })
            else:
                processed.append({
                    "file_id": file_id,
                    "file_name": file_name,
                    "processing_status": "failed",
                    "error_message": "TXT extraction failed"
                })
        else:
            processed.append({
                "file_id": file_id,
                "file_name": file_name,
                "processing_status": "skipped",
                "error_message": f"Unsupported file type: {mime_type}"
            })

    return processed
```

**Action**: Create new file, add to Lambda package.

---

### 7. Modify Bedrock Client for Image Support

**File**: `lambda/execution-stack/bedrock-processor/bedrock_client.py`

**Change**: Support image content blocks in Bedrock API requests.

```python
def prepare_image_content(base64_image: str, mime_type: str) -> dict:
    """Prepare image content block for Bedrock API."""
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": mime_type,
            "data": base64_image
        }
    }

def invoke_bedrock(text: str, images: List[str] = None, image_mime_types: List[str] = None) -> str:
    """
    Invoke Bedrock API with text and optional images.

    Args:
        text: Text prompt
        images: List of base64-encoded image strings
        image_mime_types: List of MIME types for each image
    """
    content = [{"type": "text", "text": text}]

    if images:
        for i, base64_image in enumerate(images):
            mime_type = image_mime_types[i] if image_mime_types else "image/png"
            content.append(prepare_image_content(base64_image, mime_type))

    # ... rest of Bedrock API call
```

**Action**: Modify existing file, test locally, deploy.

---

### 8. Modify Bedrock Processor Handler

**File**: `lambda/execution-stack/bedrock-processor/handler.py`

**Change**: Process attachments and include in Bedrock request.

```python
from attachment_processor import process_attachments

def lambda_handler(event, context):
    # ... existing code ...

    attachments = payload.get("attachments", [])

    # Process attachments
    processed_attachments = []
    if attachments:
        processed_attachments = process_attachments(attachments, bot_token)

    # Separate images and documents
    images = []
    image_mime_types = []
    document_texts = []

    for proc_att in processed_attachments:
        if proc_att.get("processing_status") == "success":
            if proc_att.get("content_type") == "image":
                images.append(proc_att["content"])
                image_mime_types.append(proc_att["mimetype"])
            elif proc_att.get("content_type") == "document":
                document_texts.append(proc_att["content"])

    # Build prompt
    prompt_text = text
    if document_texts:
        prompt_text += "\n\nDocument content:\n" + "\n\n---\n\n".join(document_texts)

    # Invoke Bedrock with text and images
    ai_response = bedrock_client.invoke_bedrock(
        text=prompt_text,
        images=images if images else None,
        image_mime_types=image_mime_types if images else None
    )

    # ... rest of handler ...
```

**Action**: Modify existing file, test locally, deploy.

---

## Testing Guide

### Test Case 1: Image Attachment

1. Send message to bot with PNG image attachment
2. **Expected**: Bot analyzes image and responds with image description
3. **Verify**: Response mentions image content

### Test Case 2: Document Attachment (PDF/DOCX/CSV/XLSX/PPTX)

1. Send message with document attachment (PDF, DOCX, CSV, XLSX, or PPTX)
2. **Expected**: Bot extracts text and includes in response
3. **Verify**: Response references document content
4. **Test each format**:
   - PDF: Verify text extraction from PDF pages
   - DOCX: Verify text extraction from Word document
   - CSV: Verify CSV data is readable
   - XLSX: Verify Excel sheet data is extracted
   - PPTX: Verify PowerPoint slide text is extracted

### Test Case 3: Multiple Attachments

1. Send message with image + document
2. **Expected**: Bot processes both and provides unified response
3. **Verify**: Response addresses both attachments

### Test Case 4: Text-Only Message (Backward Compatibility)

1. Send text-only message (no attachments)
2. **Expected**: Bot responds as before (no regression)
3. **Verify**: Response time and quality unchanged

### Test Case 5: Large File Rejection

1. Send message with file >10MB (image) or >5MB (document)
2. **Expected**: Bot responds with error message about file size
3. **Verify**: Error message is user-friendly

### Test Case 6: Unsupported File Type

1. Send message with unsupported file (e.g., video)
2. **Expected**: Bot processes text, skips file, mentions unsupported type
3. **Verify**: Text processing still works

---

## Deployment Steps

1. **Update Slack App Manifest**: Add `files:read` scope, reinstall app
2. **Create LibreOffice Lambda Layer** (for PPTX image conversion):
   - Build LibreOffice headless in Docker container compatible with Lambda runtime
   - Package as Lambda Layer (zip file with `/opt/libreoffice` structure)
   - Upload Layer to AWS and note Layer ARN
   - Alternative: Use pre-built LibreOffice Lambda Layer from AWS Marketplace or community
3. **Update Lambda Dependencies**: Add requests, PyPDF2, python-docx, openpyxl, python-pptx
4. **Update CDK Stack**: Add LibreOffice Lambda Layer to bedrock-processor Lambda function
5. **Deploy Code Changes**: Deploy modified handlers and new modules
6. **Test**: Run test cases above
7. **Monitor**: Check CloudWatch logs for attachment processing

### LibreOffice Lambda Layer Setup

**Option 1: Use Pre-built Layer**

- Search AWS Marketplace or community repositories for LibreOffice Lambda Layer
- Use Layer ARN in CDK stack configuration

**Option 2: Build Custom Layer**

```bash
# Build LibreOffice in Docker (Amazon Linux 2)
docker run -it amazonlinux:2 bash
yum update -y
yum install -y libreoffice-headless
# Package /opt/libreoffice into Lambda Layer zip
```

**CDK Configuration**:

```typescript
// In cdk/lib/constructs/bedrock-processor.ts
const libreOfficeLayer = lambda.LayerVersion.fromLayerVersionArn(
  this,
  "LibreOfficeLayer",
  "arn:aws:lambda:region:account:layer:libreoffice:1"
);

const bedrockProcessor = new lambda.Function(this, "BedrockProcessor", {
  // ... existing config
  layers: [libreOfficeLayer],
  memorySize: 512, // Increase memory for LibreOffice
});
```

---

## Troubleshooting

### Issue: File downloads fail with 403 Forbidden

**Solution**: Verify `files:read` scope is granted in Slack app installation.

### Issue: PDF extraction returns empty text

**Solution**: Check if PDF is encrypted or image-only (no text). PyPDF2 cannot extract from scanned PDFs.

### Issue: Bedrock API rejects image

**Solution**: Verify base64 encoding and image size (must be <5MB base64-encoded).

### Issue: Lambda timeout on large files

**Solution**: Increase Lambda timeout or enforce stricter file size limits.

---

## References

- [Data Model](./data-model.md) - Entity definitions
- [Research](./research.md) - Technical decisions
- [Specification](./spec.md) - Feature requirements
- [API Contract](./contracts/slack-attachments-api.yaml) - Payload structures
