# Feature Specification: PyPDF2 → pypdf Migration

**Feature Branch**: `046-pypdf-migration`
**Created**: 2026-03-19
**Status**: Draft

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Replace deprecated PyPDF2 with pypdf (Priority: P1)

A developer maintaining file-creator-agent no longer depends on the upstream-deprecated `PyPDF2` package. PDF text extraction continues to work identically using the actively maintained `pypdf` successor.

**Why this priority**: `PyPDF2` is deprecated and receives no security patches. The `pypdf` package is the official successor with an identical public API at the usage points in this codebase.

**Independent Test**: Run `python -m pytest execution-zones/file-creator-agent/tests/test_document_extractor.py -v` and confirm all PDF extraction tests pass with `pypdf` imported.

**Acceptance Scenarios**:

1. **Given** a valid PDF as bytes, **When** `extract_text_from_pdf()` is called, **Then** it returns the extracted text string using `pypdf.PdfReader`.
2. **Given** an empty or unreadable PDF as bytes, **When** `extract_text_from_pdf()` is called, **Then** it returns `None` without raising an exception.
3. **Given** `pypdf` is not installed, **When** the module is imported, **Then** `extract_text_from_pdf()` returns `None` gracefully (same fail-open behaviour as before).
4. **Given** the requirements.txt is updated, **When** `pip install -r requirements.txt` runs, **Then** `pypdf` is installed and `PyPDF2` is not present.

---

### Edge Cases

- `pypdf.PdfReader` raises `pypdf.errors.PdfReadError` for corrupt files — must be caught by the existing broad `except Exception` handler.
- `page.extract_text()` returns `None` or `""` for image-only pages; existing filter `if text:` handles this.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `execution-zones/file-creator-agent/src/requirements.txt` MUST replace `PyPDF2~=3.0.0` with `pypdf~=5.0.0`.
- **FR-002**: `document_extractor.py` MUST replace `import PyPDF2` with `import pypdf` and all `PyPDF2.*` references with `pypdf.*`.
- **FR-003**: The module docstring MUST reflect the new library name (`pypdf`, not `PyPDF2`).
- **FR-004**: Runtime behaviour of `extract_text_from_pdf()` MUST be identical to before — same inputs produce same outputs.
- **FR-005**: All existing tests MUST continue to pass; new tests for `extract_text_from_pdf()` MUST be added.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `grep -r "PyPDF2" execution-zones/` returns zero results in `.py` and `requirements.txt` files.
- **SC-002**: `python -m pytest execution-zones/file-creator-agent/tests/ -v` passes with zero failures.
- **SC-003**: `python -m ruff check execution-zones/file-creator-agent/src/` returns zero violations.

## Assumptions

- `pypdf` 5.x public API (`PdfReader`, `.pages`, `.extract_text()`) is identical to `PyPDF2` 3.x at the call sites used in this codebase.
- No other agent (docs-agent, fetch-url-agent, time-agent) uses `PyPDF2`.
