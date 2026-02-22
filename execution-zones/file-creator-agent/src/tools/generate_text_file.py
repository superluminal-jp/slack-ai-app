"""
generate_text_file tool for Execution Agent (027-slack-file-generation-best-practices).

Produces text-based files (.md, .csv, .txt) and stores them in tool_context.invocation_state
for the handler to extract and build file_artifact.
"""

from typing import Any

from strands import tool

import file_config as fc
from file_config import sanitize_filename


# Extension to MIME type mapping for text files (per data-model.md)
_EXT_TO_MIME = {
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".txt": "text/plain",
}


def _get_mime_for_filename(filename: str) -> str:
    """Return MIME type from filename extension."""
    if not filename or "." not in filename:
        return "text/plain"
    ext = "." + filename.rsplit(".", 1)[-1].lower()
    return _EXT_TO_MIME.get(ext, "text/plain")


@tool(context=True)
def generate_text_file(content: str, filename: str, tool_context: Any) -> str:
    """テキストベースのファイルを生成します。Markdown (.md)、CSV (.csv)、プレーンテキスト (.txt) に対応。

    ファイルの全内容をcontentパラメータにそのまま渡してください。
    CSV の場合はカンマ区切り、Markdown の場合は Markdown 記法で記述してください。

    Args:
        content: ファイルの完全な内容テキスト
        filename: 拡張子付きファイル名 (例: report.md, data.csv, notes.txt)
        tool_context: Strands framework context (injected). Contains invocation_state.

    Returns:
        モデルに返す説明文（日本語）。ファイルは invocation_state に格納される。
    """
    if not content or not isinstance(content, str):
        return "エラー: content は空でない文字列を指定してください。"
    if not filename or not isinstance(filename, str) or not filename.strip():
        return "エラー: filename は拡張子付きで指定してください（例: report.md, data.csv）。"

    # T014: Apply sanitize_filename before use (per data-model.md)
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "txt"
    safe_filename = sanitize_filename(filename.strip(), ext)
    if not safe_filename:
        safe_filename = f"generated_file_{filename.strip()[:20]}.txt"

    # Ensure extension
    if "." not in safe_filename:
        safe_filename = f"{safe_filename}.txt"

    mime_type = _get_mime_for_filename(safe_filename)
    file_bytes = content.encode("utf-8")

    # Size check (MAX_TEXT_FILE_BYTES)
    if len(file_bytes) > fc.MAX_TEXT_FILE_BYTES:
        return (
            f"エラー: ファイルサイズが上限（{fc.MAX_TEXT_FILE_BYTES} バイト）を超えています。"
            f"現在 {len(file_bytes)} バイトです。"
        )

    # Store in invocation_state for handler to extract (per data-model.md)
    invocation_state = getattr(tool_context, "invocation_state", {})
    if isinstance(invocation_state, dict):
        invocation_state["generated_file"] = {
            "file_bytes": file_bytes,
            "file_name": safe_filename,
            "mime_type": mime_type,
            "description": f"テキストファイル「{safe_filename}」を生成しました。",
        }

    return f"ファイル「{safe_filename}」を作成しました。Slack にアップロードされます。"
