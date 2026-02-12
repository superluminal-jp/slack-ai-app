# Research: Fix A2A Protocol Routing

**Date**: 2026-02-08
**Feature**: 020-fix-a2a-routing

## Decision 1: Fix Approach — Route Addition vs Framework Migration

**Decision**: ルートパスに `@app.route("/", methods=["POST"])` を追加して `_handle_invocation` に委譲する。

**Rationale**:
- 最小変更（各 `main.py` に 4 行追加）でルーティング問題を解決
- `BedrockAgentCoreApp` は `Starlette` を継承しており、`@app.route` デコレータでルートを動的追加可能
- `_handle_invocation` は SDK の標準ペイロード処理パイプラインを全て含む（コンテキスト構築、ハンドラ呼び出し、レスポンスシリアライズ）
- 既存の `@app.entrypoint` ハンドラ（ビジネスロジック）は一切変更不要

**Alternatives considered**:
1. **strands-agents[a2a] A2AServer**: AWS 公式推奨パターンだが、FastAPI/uvicorn への移行 + ビジネスロジックの Strands Agent 化が必要。依存関係の大幅変更。
2. **SDK フォーク/パッチ**: `bedrock-agentcore` SDK 自体にルートを追加。メンテナンス負荷大。
3. **カスタム Starlette アプリ**: `BedrockAgentCoreApp` を使わず独自実装。`add_async_task` / `complete_async_task` など SDK 固有機能が使えなくなる。

## Decision 2: Private API (`_handle_invocation`) の使用

**Decision**: `app._handle_invocation(request)` を直接呼び出す。

**Rationale**:
- 公開 API として `@app.entrypoint` があるが、これはビジネスロジックハンドラの登録用であり、ルーティングの問題は解決しない
- `_handle_invocation` は SDK のコア処理パイプライン（コンテキスト構築 → ペイロード解析 → ハンドラ呼び出し → レスポンス）を実装
- SDK バージョンを `requirements.txt` で固定しているため、意図しない破壊変更のリスクは低い
- テストで `_handle_invocation` の呼び出しを検証し、SDK 更新時に早期検出

**Alternatives considered**:
1. **ペイロードを手動解析して `handle_message` を直接呼ぶ**: `request.json()` → `handle_message(payload)` → `Response`。可能だが、SDK のコンテキスト構築（セッション ID、リクエスト ID）がスキップされる。
2. **Starlette の `routes` リストを直接操作**: `app.routes.insert(0, Route("/", ...))` で SDK 初期化後にルートを追加。動作するが `@app.route` デコレータの方が可読性が高い。

## Decision 3: Execution Agent のポート修正

**Decision**: `app.run()` → `app.run(port=9000)` に変更。

**Rationale**:
- AWS A2A Service Contract: A2A は port 9000 必須
- SDK デフォルト: `app.run()` は port 8080（HTTP プロトコル用）
- Verification Agent は既に `app.run(port=9000)` を使用
- Execution Agent の Dockerfile は `EXPOSE 9000` を宣言しているが、アプリケーションが 8080 で起動するため不一致

**Evidence**:
- Service Contract: HTTP=8080, MCP=8000, A2A=9000
- SDK source (`app.py:437`): `def run(self, port: int = 8080, ...)`
- Execution Agent `main.py:408`: `app.run()` — port 引数なし

## AWS 公式ドキュメント参照

### A2A Protocol Contract
- Source: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a-protocol-contract.html
- POST `/` (root) で JSON-RPC 2.0 メッセージを受信
- エラーは JSON-RPC 2.0 エラーレスポンス（HTTP 200）で返す
- -32055 = RuntimeClientError (424)

### Service Contract
- Source: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-service-contract.html
- A2A: POST `/` on port 9000
- HTTP: POST `/invocations` on port 8080
- MCP: POST `/mcp` on port 8000

### Deploy A2A Servers
- Source: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a.html
- 公式例: `strands-agents[a2a]` + FastAPI + uvicorn
- `A2AServer(serve_at_root=True)` でルートパスにマウント
- `app.mount("/", a2a_server.to_fastapi_app())`

### Starter Toolkit
- Source: https://aws.github.io/bedrock-agentcore-starter-toolkit/user-guide/runtime/a2a.html
- 同上のパターンを推奨
- "you can use other ways to build with A2A" — SDK 非依存の実装も可能
