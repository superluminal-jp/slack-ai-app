"""Tests for FULL_SYSTEM_PROMPT content in docs-agent.

Validates that the system prompt contains required guidance elements
for effective document search and response quality.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../src"))

from system_prompt import FULL_SYSTEM_PROMPT


class TestSystemPromptContent:
    """FULL_SYSTEM_PROMPT must contain required guidance elements."""

    def test_contains_search_docs_instruction(self):
        """Prompt must instruct use of the search_docs tool."""
        assert "search_docs" in FULL_SYSTEM_PROMPT

    def test_contains_keyword_guidance(self):
        """Prompt must mention concrete searchable topics."""
        keywords = ["architecture", "deploy", "quickstart"]
        assert any(k in FULL_SYSTEM_PROMPT.lower() for k in keywords), (
            "Expected at least one of 'architecture', 'deploy', 'quickstart' "
            f"in system prompt, but got: {FULL_SYSTEM_PROMPT[:200]}"
        )

    def test_contains_source_citation_instruction(self):
        """Prompt must instruct citing the source document in responses."""
        citation_words = ["source", "参照", "ファイル", "file", "reference", "citing", "cite"]
        assert any(w in FULL_SYSTEM_PROMPT.lower() for w in citation_words), (
            "Expected source citation instruction in system prompt, "
            f"but got: {FULL_SYSTEM_PROMPT[:200]}"
        )

    def test_contains_out_of_scope_instruction(self):
        """Prompt must handle out-of-scope questions explicitly."""
        scope_words = ["scope", "specialize", "特化", "スコープ", "outside", "beyond", "only"]
        assert any(w in FULL_SYSTEM_PROMPT.lower() for w in scope_words), (
            "Expected out-of-scope handling instruction in system prompt, "
            f"but got: {FULL_SYSTEM_PROMPT[:200]}"
        )
