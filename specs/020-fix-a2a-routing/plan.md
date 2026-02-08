# Implementation Plan: Fix A2A Protocol Routing

**Branch**: `020-fix-a2a-routing` | **Date**: 2026-02-08 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/020-fix-a2a-routing/spec.md`

## Summary

AgentCore Runtime の InvokeAgentRuntime API が 424 `RuntimeClientError` を返す根本原因は、A2A プロトコルが要求する POST `/`（ルートパス）にハンドラが未登録であること。`BedrockAgentCoreApp` SDK は POST `/invocations` のみを登録するが、A2A サービス契約では POST `/` にリクエストが送信される。Verification Agent と Execution Agent の両方で、ルートパスに `_handle_invocation` を委譲するルートを追加し、Execution Agent のポートも 9000 に修正する。

## Technical Context

**Language/Version**: Python 3.11 (コンテナ: `python:3.11-slim`, ARM64)
**Primary Dependencies**: `bedrock-agentcore` v1.2.0 (Starlette ベース), `starlette`, `uvicorn`
**Storage**: N/A（ステートレスエージェント）
**Testing**: pytest + unittest.mock
**Target Platform**: AWS AgentCore Runtime (ARM64 Linux コンテナ)
**Project Type**: CDK ベースのマルチスタック IaC + コンテナ化エージェント
**Performance Goals**: InvokeAgentRuntime 成功率 95%+, レスポンス < 30 秒
**Constraints**: `BedrockAgentCoreApp` SDK を直接変更不可（pip パッケージ）、既存ビジネスロジック改変不可
**Scale/Scope**: 2 エージェント（Verification + Execution）の `main.py` 修正、各テストファイル更新

## Constitution Check

*GATE: Constitution テンプレート未カスタマイズのため、プロジェクト固有のゲートなし。一般的な品質基準を適用。*

- [x] テスト駆動: 既存テストとの互換性を維持し、新規テストを追加
- [x] 最小変更: SDK を変更せず、ルーティングルートの追加のみ
- [x] 公式契約準拠: AWS A2A Service Contract に従う

## Project Structure

### Documentation (this feature)

```text
specs/020-fix-a2a-routing/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 research output
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
cdk/lib/verification/agent/verification-agent/
├── main.py                    # ← POST "/" ルート追加
└── tests/
    └── test_main.py           # ← ルーティングテスト追加

cdk/lib/execution/agent/execution-agent/
├── main.py                    # ← POST "/" ルート追加 + port=9000
└── tests/
    └── test_main.py           # ← ルーティングテスト追加
```

**Structure Decision**: 既存のプロジェクト構成を維持。各エージェントの `main.py` に最小限のルート追加のみ。

## Design: Fix Approach

### 選定: 方針 1 — ルートパスにルート追加（最小変更）

**根拠**: `BedrockAgentCoreApp` は `Starlette` を継承しているため、`@app.route("/", methods=["POST"])` で Starlette のルーティングにルートを追加できる。SDK 内部の `_handle_invocation` メソッドをそのまま委譲することで、ペイロード解析・コンテキスト構築・レスポンス処理の全てを SDK に任せられる。

**代替案棄却**:

| 代替案 | 棄却理由 |
|--------|---------|
| 方針 2: strands-agents A2AServer | 依存関係の大幅変更、ビジネスロジックの書き直しが必要 |
| 方針 3: 両パス登録 | 方針 1 と実質同じ（SDK が `/invocations` を登録済み） |

### 技術詳細

#### `_handle_invocation` の仕様（SDK ソース分析）

```python
# bedrock_agentcore/runtime/app.py:356
async def _handle_invocation(self, request):
    # 1. request_context を構築（セッション ID、ヘッダー）
    # 2. request.json() でペイロード解析
    # 3. @app.entrypoint で登録されたハンドラを呼び出し
    # 4. レスポンスをシリアライズして返却
```

- `async` メソッド → `@app.route` は async ハンドラを受け付ける
- 引数: `request` (Starlette Request オブジェクト)
- 戻り値: `Response` / `JSONResponse` / `StreamingResponse`

#### Verification Agent の修正

```python
# POST / → SDK の _handle_invocation に委譲
@app.route("/", methods=["POST"])
async def a2a_root_handler(request):
    """A2A protocol: POST / (root) routes to SDK invocation handler."""
    return await app._handle_invocation(request)
```

- ポート: 既に 9000（修正不要）
- Agent Card / ping: 既存のカスタムルートで動作済み

#### Execution Agent の修正

```python
# POST / → SDK の _handle_invocation に委譲
@app.route("/", methods=["POST"])
async def a2a_root_handler(request):
    """A2A protocol: POST / (root) routes to SDK invocation handler."""
    return await app._handle_invocation(request)

# ポート修正
if __name__ == "__main__":
    app.run(port=9000)  # 8080 → 9000
```

### リスク分析

| リスク | 影響 | 対策 |
|--------|------|------|
| `_handle_invocation` は private API | SDK アップデートで破壊の可能性 | SDK バージョン固定 + テストで検出 |
| ルートの優先順位 | Starlette は最初にマッチしたルートを使用 | `/invocations` も引き続き動作（回帰なし） |
| Docker コンテナ再ビルド必要 | CDK デプロイが必要 | ECR push + Runtime 更新 |

## Complexity Tracking

> 違反なし。単純なルート追加のみ。
