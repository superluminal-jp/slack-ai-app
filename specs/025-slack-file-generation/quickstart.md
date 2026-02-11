# Quickstart: Slack File Generation

**Feature Branch**: `025-slack-file-generation`

## What Changes

The Execution Agent gains the ability to **generate files** (Markdown, CSV, Excel, Word, PowerPoint, chart images) in response to user requests, using the strands-agents @tool pattern with Bedrock Converse API tool use.

## Architecture Overview

```
Slack User: "売上データのExcelファイルを作って"
    ↓
Verification Agent (unchanged)
    ↓
Execution Agent (CHANGED):
    ├── strands Agent with @tool file generation tools
    ├── Model decides to call generate_excel tool
    ├── Tool generates .xlsx in /tmp using openpyxl
    ├── File bytes stored in ToolContext.invocation_state
    └── Returns response_text + file_artifact
    ↓
Verification Agent → SQS → Slack Poster (unchanged)
    ↓
Slack: 📎 quarterly_report.xlsx + "売上データのExcelファイルを作成しました。"
```

## Key Changes

### Execution Agent (`cdk/lib/execution/agent/execution-agent/`)

| File | Change |
|------|--------|
| `main.py` | Replace `invoke_bedrock()` with strands Agent invocation |
| `tools/` (new) | File generation tool modules (@tool functions) |
| `file_config.py` | Add new MIME types for generated files |
| `requirements.txt` | Add python-pptx, python-docx, matplotlib, Pillow |
| `Dockerfile` | Add gcc/g++ for ARM64 compilation of numpy/Pillow |

### No Changes Required

| Component | Why |
|-----------|-----|
| Verification Agent | file_artifact format unchanged |
| Slack Poster Lambda | files_upload_v2 handles all file types |
| SQS message format | file_artifact schema unchanged |
| CDK infrastructure | No new resources needed |

## New Files

```
cdk/lib/execution/agent/execution-agent/
├── tools/                         # NEW directory
│   ├── __init__.py
│   ├── generate_text_file.py      # .md, .csv, .txt generation
│   ├── generate_excel.py          # .xlsx generation (openpyxl)
│   ├── generate_word.py           # .docx generation (python-docx)
│   ├── generate_powerpoint.py     # .pptx generation (python-pptx)
│   └── generate_chart_image.py    # .png chart generation (matplotlib)
├── agent_factory.py               # NEW: strands Agent creation with tools
└── (existing files unchanged)
```

## Testing Locally

```bash
cd cdk/lib/execution/agent/execution-agent/
pip install -r requirements.txt

# Unit tests for each tool
pytest tests/unit/tools/

# Integration test: send file generation request
python -c "
from tools.generate_excel import generate_excel
result = generate_excel(filename='test', sheets=[{'name': 'Sheet1', 'headers': ['A', 'B'], 'rows': [[1, 2]]}])
print(result)
"
```

## Dependencies Added

```
python-pptx~=1.0.0       # PowerPoint generation
python-docx~=1.1.0       # Word generation
matplotlib~=3.9.0         # Chart image generation
Pillow~=11.0.0            # Image manipulation (matplotlib dependency)
```
