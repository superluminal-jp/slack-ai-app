#!/usr/bin/env python3
"""
ローカルで Execution Agent を起動し、ファイル生成をテストする。

Usage:
  cd cdk/lib/execution/agent/execution-agent
  python scripts/test_file_generation_local.py [--prompt "カスタムプロンプト"]

  # デフォルトプロンプト（ツール使用を明示）:
  python scripts/test_file_generation_local.py

Prerequisites:
  - AWS credentials configured (aws configure or AWS_PROFILE)
  - BEDROCK_MODEL_ID, AWS_REGION_NAME は cdk.config.dev.json から読み込むか環境変数で指定
"""

import argparse
import json
import os
import subprocess
import sys
import time

import requests

# Add parent to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

HOST = "127.0.0.1"
PORT = 9000
BASE_URL = f"http://{HOST}:{PORT}"


def load_config() -> dict:
    """Load BEDROCK_MODEL_ID and AWS_REGION from cdk.config.dev.json if available."""
    config_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "..", "..", "..", "cdk.config.dev.json"
    )
    if os.path.exists(config_path):
        with open(config_path) as f:
            return json.load(f)
    return {}


def main() -> int:
    parser = argparse.ArgumentParser(description="ローカルでファイル生成をテスト")
    parser.add_argument(
        "--prompt",
        default="generate_text_file ツールを使って、サンプルのMarkdownファイル（sample.md）を作成してください。見出し、リスト、表、コードブロックを含む内容にしてください。",
        help="送信するプロンプト",
    )
    args = parser.parse_args()

    config = load_config()
    env = os.environ.copy()
    env.setdefault("BEDROCK_MODEL_ID", config.get("bedrockModelId", "amazon.nova-pro-v1:0"))
    env.setdefault("AWS_REGION_NAME", config.get("awsRegion", "ap-northeast-1"))

    task_payload = {
        "channel": "C_LOCAL_TEST",
        "text": args.prompt,
        "bot_token": "xoxb-local-test",
        "correlation_id": "local-test-001",
    }
    payload = {"prompt": json.dumps(task_payload)}

    print("Starting Execution Agent...")
    proc = subprocess.Popen(
        [sys.executable, "main.py"],
        cwd=os.path.join(os.path.dirname(__file__), ".."),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    try:
        # Wait for server to be ready
        for i in range(30):
            try:
                r = requests.get(f"{BASE_URL}/ping", timeout=2)
                if r.status_code == 200:
                    print("Server ready.")
                    break
            except requests.exceptions.RequestException:
                pass
            time.sleep(0.5)
        else:
            print("ERROR: Server did not become ready in 15 seconds.")
            return 1

        print(f"\nSending request: {args.prompt}")
        r = requests.post(
            BASE_URL,
            json=payload,
            timeout=120,
        )
        r.raise_for_status()
        result = r.json()

        print("\n--- Response ---")
        print(json.dumps(result, indent=2, ensure_ascii=False, default=str))

        if result.get("status") == "success":
            has_file = "file_artifact" in result and result["file_artifact"]
            if has_file:
                fa = result["file_artifact"]
                print("\n✓ ファイルが作成されました!")
                print(f"  - fileName: {fa.get('fileName', 'N/A')}")
                print(f"  - mimeType: {fa.get('mimeType', 'N/A')}")
                if "contentBase64" in fa:
                    import base64
                    content = base64.b64decode(fa["contentBase64"])
                    print(f"  - size: {len(content)} bytes")
                    print(f"  - content preview:\n{content[:500].decode('utf-8', errors='replace')}...")
            else:
                print("\n⚠ テキストレスポンスは返りましたが、file_artifact は含まれていません。")
                print("  モデルが generate_text_file ツールを呼び出していない可能性があります。")
        else:
            print(f"\n✗ エラー: {result.get('error_code', 'unknown')} - {result.get('error_message', '')}")
            return 1

        return 0
    finally:
        proc.terminate()
        proc.wait(timeout=5)


if __name__ == "__main__":
    sys.exit(main())
