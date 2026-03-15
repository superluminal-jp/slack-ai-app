"""Conftest for Slack Poster Lambda tests — add parent dir to sys.path."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
