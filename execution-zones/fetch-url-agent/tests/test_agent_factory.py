"""
Unit tests for Web Fetch Agent agent_factory.py.

Focus:
- Only fetch_url tool is registered (no file generation tools).
"""

import ast
from pathlib import Path


def _load_agent_factory_ast() -> ast.Module:
    root = Path(__file__).resolve().parent.parent / "src"
    src = (root / "agent_factory.py").read_text(encoding="utf-8")
    return ast.parse(src)


def test_get_tools_returns_only_fetch_url() -> None:
    """Web Fetch Agent tools list must contain exactly fetch_url."""
    tree = _load_agent_factory_ast()

    get_tools_fn = None
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == "get_tools":
            get_tools_fn = node
            break

    assert get_tools_fn is not None, "get_tools() function not found"

    returned_names: list[str] = []
    for node in ast.walk(get_tools_fn):
        if isinstance(node, ast.Return) and isinstance(node.value, ast.List):
            for elt in node.value.elts:
                if isinstance(elt, ast.Name):
                    returned_names.append(elt.id)

    assert "fetch_url" in returned_names, "fetch_url must be in get_tools()"
    assert len(returned_names) == 1, f"Expected exactly 1 tool, got {len(returned_names)}: {returned_names}"
    # No file generation tools
    for forbidden in ("generate_text_file", "generate_excel", "generate_word",
                      "generate_powerpoint", "generate_chart_image",
                      "get_business_document_guidelines", "get_presentation_slide_guidelines",
                      "search_docs", "get_current_time"):
        assert forbidden not in returned_names, f"{forbidden} must NOT be in get_tools()"
