#!/usr/bin/env python3
"""
Verify A2A contract: GET /ping and GET /.well-known/agent-card.json return 200.

Run from the verification-agent directory (parent of scripts/):
  python scripts/verify_a2a_endpoints.py

Do NOT run under pytest (conftest mocks bedrock_agentcore). Use system Python
or: cd cdk/lib/verification/agent/verification-agent && python scripts/verify_a2a_endpoints.py
"""

import sys
from pathlib import Path

# Ensure parent (verification-agent) is on path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from starlette.testclient import TestClient
from main import app


def main() -> int:
    client = TestClient(app)
    ok = True

    r = client.get("/ping")
    if r.status_code != 200:
        print(f"FAIL GET /ping -> {r.status_code}")
        ok = False
    else:
        data = r.json()
        status = data.get("status", "")
        print(f"OK   GET /ping -> 200 (status={status})")

    r = client.get("/.well-known/agent-card.json")
    if r.status_code != 200:
        print(f"FAIL GET /.well-known/agent-card.json -> {r.status_code}")
        ok = False
    else:
        data = r.json()
        name = data.get("name", "")
        print(f"OK   GET /.well-known/agent-card.json -> 200 (name={name})")

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
