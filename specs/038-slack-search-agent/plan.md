# Implementation Plan: Slack Search Agent for Verification Zone

**Branch**: `038-slack-search-agent` | **Date**: 2026-03-15 | **Spec**: [spec.md](./spec.md)

## Summary

verification agent が Slack チャンネルを任意に検索・取得できるよう、Slack Search Agent を `verification-zones/slack-search-agent/` に独立デプロイする。time-agent と同一の A2A パターン（FastAPI + Bedrock AgentCore Runtime）で実装し、verification agent が `SLACK_SEARCH_AGENT_ARN` 経由で A2A 呼び出しできるようにする。チャンネルアクセスは「呼び出し元チャンネル + 公開チャンネル」に制限する。

## Technical Context

**Language/Version**: Python 3.11 (`python:3.11-slim`, ARM64 container)
**Primary Dependencies**: `strands-agents[a2a,otel]~=1.25.0`, `fastapi~=0.115.0`, `uvicorn~=0.34.0`, `boto3~=1.42.0`, `slack-sdk~=3.27.0`
**Storage**: N/A（新規ストレージなし。bot_token は A2A params 経由で受け取る）
**Testing**: `pytest` — `cd verification-zones/slack-search-agent/src && python -m pytest ../tests/ -v`
**Target Platform**: AWS Bedrock AgentCore Runtime（Linux ARM64）
**Project Type**: Single agent zone
**Performance Goals**: 検索結果を 5 秒以内に返す（SC-001, SC-002）
**Constraints**: アクセス対象は呼び出し元チャンネルと公開チャンネルのみ（FR-007）; 最大 20 件/リクエスト（FR-008）
**Scale/Scope**: 1 エージェント、3 ツール（search_messages, get_thread, get_channel_history）

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Spec-First | ✅ Pass | spec.md 完成・受け入れ基準 Given/When/Then 形式あり |
| II. TDD | ✅ Pass | tasks.md でテスト先行タスクを必須化する |
| III. Security-First | ✅ Pass | チャンネルアクセス制御を tool 内で強制（FR-007）; bot_token は params 経由（secrets にコミットなし） |
| IV. Fail-Open/Fail-Closed | ✅ Pass | Slack API エラーは fail-open（graceful response）; アクセス拒否は明示的エラーを返す |
| V. Zone-Isolated | ✅ Pass | 独立 AgentCore Runtime として `verification-zones/` 配下にデプロイ; verification agent との通信は A2A/JSON-RPC 2.0 のみ |

> **Note on V**: Slack Search Agent は execution-zones ではなく verification-zones に置く。理由: bot_token 管理と Slack アクセス制御は verification 層の責務であり、「情報収集」は「execution（ファイル生成など）」と性質が異なるため。本エージェントは verification agent の内部ロジックではなく独立エージェントとして切り出しており、Constitution V の「not as logic inside the verification agent」を満たす。

## Project Structure

### Documentation (this feature)

```text
specs/038-slack-search-agent/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── a2a-execute-task.json
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code

```text
verification-zones/slack-search-agent/
├── src/
│   ├── main.py                   # FastAPI app, JSON-RPC 2.0 handler
│   ├── agent_card.py             # A2A agent card
│   ├── agent_factory.py          # Strands Agent factory
│   ├── system_prompt.py          # System prompt
│   ├── channel_access.py         # チャンネルアクセス制御（public/calling 判定）
│   ├── slack_client.py           # Slack WebClient ラッパー
│   ├── response_formatter.py     # ExecutionResponse フォーマット
│   ├── logger_util.py            # 構造化 JSON ログ
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .dockerignore
│   └── tools/
│       ├── __init__.py
│       ├── search_messages.py    # @tool: Slack メッセージ検索
│       ├── get_thread.py         # @tool: URL からスレッド取得
│       └── get_channel_history.py # @tool: チャンネル履歴取得
├── tests/
│   ├── conftest.py
│   ├── test_agent_card.py
│   ├── test_main.py
│   ├── test_channel_access.py
│   ├── test_search_messages.py
│   ├── test_get_thread.py
│   └── test_get_channel_history.py
├── cdk/
│   ├── bin/
│   │   └── cdk.ts
│   ├── lib/
│   │   ├── slack-search-agent-stack.ts
│   │   └── constructs/
│   │       ├── slack-search-agent-ecr.ts
│   │       └── slack-search-agent-runtime.ts
│   ├── test/
│   │   └── slack-search-agent-stack.test.ts
│   ├── cdk.config.dev.json
│   ├── cdk.json
│   └── package.json
├── scripts/
│   └── deploy.sh
└── README.md

# verification agent 側の変更
verification-zones/verification-agent/
├── agent/verification-agent/src/
│   └── slack_search_client.py    # (新規) Slack Search Agent A2A クライアント
└── cdk/
    ├── lib/constructs/
    │   └── verification-agent-runtime.ts  # (変更) SLACK_SEARCH_AGENT_ARN env 追加
    ├── bin/
    │   └── cdk.ts                         # (変更) slackSearchAgentArn 読み込み追加
    └── cdk.config.dev.json                # (変更) slackSearchAgentArn フィールド追加
```

**Structure Decision**: 独立 CDK スタック（`verification-zones/slack-search-agent/`）+ verification-agent への最小変更。既存の execution zone パターンをほぼそのまま踏襲しつつ、デプロイ先を verification-zones に配置する。

## Design Decisions

### 1. `search.messages` vs `conversations.history`

| API | 用途 | 必要スコープ | 制約 |
|-----|------|------------|------|
| `search.messages` | ワークスペース全体の全文検索 | `search:read` （user token `xoxp-` 推奨） | Bot token では workspace 全体検索不可の場合あり |
| `conversations.history` | 特定チャンネルの時系列履歴取得 | `channels:history` （bot token 可） | チャンネル指定が必須; bot が参加していること |

**決定**: `conversations.history` を主軸とし、チャンネル内の全文検索はクライアントサイドフィルタリングで補完する。`search.messages` は bot token で利用可能な場合のみオプションとして使用。理由: 既存の bot token で確実に動作し、スコープ追加なしで実装できる。

> **設計上の考慮点**: ワークスペース横断の高度な全文検索が必要になった場合は、`search.messages` 対応の User token を別途用意する。この判断は `/speckit.clarify` で解決済み（スコープは呼び出し元チャンネル + 公開チャンネルに限定）。

### 2. チャンネルアクセス制御の実装

`channel_access.py` が以下のロジックで判定:

```
is_accessible(channel_id, calling_channel, bot_token) -> bool:
  if channel_id == calling_channel:
    return True   # 呼び出し元チャンネルは常に許可
  info = conversations.info(channel=channel_id)
  if info.channel.is_private == False:
    return True   # 公開チャンネルは許可
  return False    # プライベートチャンネル（呼び出し元以外）は拒否
```

### 3. verification agent への統合

- 専用環境変数 `SLACK_SEARCH_AGENT_ARN` を使用（`EXECUTION_AGENT_ARNS` とは分離）
- `slack_search_client.py` が A2A 呼び出しを担当（既存 `a2a_client.py` を内部で使用）
- verification agent の system prompt に Slack Search Agent のスキル情報を追記
- pipeline.py には変更なし（オーケストレーターが必要に応じてツールを呼ぶ）

### 4. bot_token の受け渡し

既存パターンと同じ: verification agent が A2A params の `bot_token` フィールドで Slack Search Agent に渡す。Slack Search Agent は受け取った bot_token で Slack API を呼ぶ。

## Complexity Tracking

*Constitution Check に違反なし — このセクションは空*

