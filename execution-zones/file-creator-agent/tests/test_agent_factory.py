"""
Unit tests for Execution Agent agent_factory.py.

Focus:
- Tool wiring excludes search_docs after docs-agent split.
- fetch_url excluded after web-fetch-agent split (035).
"""

import ast
from pathlib import Path


def _load_agent_factory_ast() -> ast.Module:
    root = Path(__file__).resolve().parent.parent / "src"
    src = (root / "agent_factory.py").read_text(encoding="utf-8")
    return ast.parse(src)


def test_get_tools_does_not_include_search_docs() -> None:
    """Execution Agent tools list must not include search_docs or fetch_url."""
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

    assert "search_docs" not in returned_names
    assert "get_current_time" not in returned_names
    # fetch_url moved to fetch-url-agent (035)
    assert "fetch_url" not in returned_names
    assert "generate_text_file" in returned_names
    assert len(returned_names) == 7, f"Expected 7 tools, got {len(returned_names)}: {returned_names}"
