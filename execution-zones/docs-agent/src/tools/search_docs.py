"""
search_docs tool for Execution Agent (docs access Pattern 1).

Searches the bundled docs/ (project documentation) and returns matching content
so the model can answer questions about the project's specs and developer docs.
"""

import os
from pathlib import Path

from strands import tool

# Default path where docs are copied at build time (deploy script copies repo docs/ here)
_DEFAULT_DOCS_DIR = "/app/docs"
_MAX_RETURN_CHARS = 14_000  # Limit context size; model can still use multiple tool calls if needed
_EXTENSIONS = (".md", ".txt", ".rst")


def _docs_base() -> Path:
    """Return docs directory; allow override via env for local testing."""
    return Path(os.environ.get("DOCS_PATH", _DEFAULT_DOCS_DIR))


def _read_safe(path: Path, max_chars: int) -> str:
    """Read file as UTF-8; truncate to max_chars. Return empty on error."""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
        return text[:max_chars] + ("..." if len(text) > max_chars else "")
    except Exception:
        return ""


@tool
def search_docs(query: str) -> str:
    """プロジェクトのドキュメント（docs/）を検索し、クエリに関連する内容を返します。

    仕様・開発者向けドキュメント・アーキテクチャなどについてユーザーが質問した場合に、
    このツールで該当ドキュメントの内容を取得してから回答してください。

    Args:
        query: 検索したいキーワードやトピック（例: "デプロイ手順", "Execution Agent", "A2A"）

    Returns:
        一致したドキュメントの抜粋をまとめた文字列。見つからない場合はその旨のメッセージ。
    """
    if not query or not isinstance(query, str) or not query.strip():
        return "検索キーワード（query）を指定してください。"

    base = _docs_base()
    if not base.is_dir():
        return "ドキュメント（docs/）が利用できません。コンテナに docs が同梱されていない可能性があります。"

    q = query.strip().lower()
    collected: list[tuple[str, str]] = []  # (relative_path, snippet)
    total_len = 0
    limit = _MAX_RETURN_CHARS

    for path in sorted(base.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in _EXTENSIONS:
            continue
        try:
            rel = path.relative_to(base)
            text = path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        if total_len >= limit:
            break
        # Match if query appears in path or content (case-insensitive)
        if q in str(rel).lower() or q in text.lower():
            snippet = text.strip()[: (limit // 2)].strip()  # cap per-file to leave room for others
            if len(text) > len(snippet):
                snippet += "\n..."
            collected.append((str(rel), snippet))
            total_len += len(snippet) + len(str(rel)) + 10

    if not collected:
        return f"「{query}」に一致するドキュメントは見つかりませんでした。別のキーワードで試すか、ドキュメントの構成を確認してください。"

    parts = []
    for rel_path, snippet in collected:
        parts.append(f"--- {rel_path} ---\n{snippet}\n")
        if len("\n".join(parts)) >= _MAX_RETURN_CHARS:
            break
    result = "\n".join(parts)
    if len(result) > _MAX_RETURN_CHARS:
        result = result[:_MAX_RETURN_CHARS] + "\n...(省略)"
    return result
