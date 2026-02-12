# Implementation Plan: AgentCore A2A ゾーン間通信

**Branch**: `013-agentcore-a2a-zones` | **Date**: 2026-02-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-agentcore-a2a-zones/spec.md`

## Summary

現行の **API Gateway + Lambda + SQS** によるゾーン間通信アーキテクチャを、**Amazon Bedrock AgentCore Runtime** と **A2A（Agent-to-Agent）プロトコル** ベースのアーキテクチャに移行する。Verification Zone と Execution Zone にそれぞれ AgentCore エージェントをコンテナとしてデプロイし、JSON-RPC 2.0 over HTTP の A2A プロトコルでゾーン間通信を行う。非同期処理は AgentCore の `add_async_task` / `complete_async_task` 機能で実現し、SQS を不要にする。クロスアカウント通信は SigV4 認証 + リソースベースポリシーで保護する。

## Technical Context

**Language/Version**: Python 3.11（エージェントコード）、TypeScript 5.x（CDK インフラ）  
**Primary Dependencies**:
- `bedrock-agentcore` SDK（Python、AgentCore Runtime 統合）
- `strands-agents[a2a]`（A2A サーバー実装）
- `uvicorn` + `fastapi`（A2A HTTP サーバー）
- `aws-cdk-lib` 2.215.0+（CDK L1: `CfnRuntime`, `CfnRuntimeEndpoint`）
- `boto3>=1.34.0`（AWS SDK）
- `slack-sdk>=3.27.0`（Slack API）

**Storage**: DynamoDB（既存 5 テーブル維持）、Secrets Manager（既存シークレット維持）、ECR（コンテナイメージ）  
**Testing**: pytest（Python ユニット/インテグレーション）、Jest（CDK スナップショット）  
**Target Platform**: AWS AgentCore Runtime（ARM64 microVM、ap-northeast-1）  
**Project Type**: クラウドネイティブ / サーバーレス → AgentCore Runtime（コンテナベース）  
**Performance Goals**: 現行と同等以下の応答時間（±10%）、A2A 通信成功率 99.9%+  
**Constraints**: Slack 3 秒タイムアウト、AgentCore セッション 15 分アイドルタイムアウト、8 時間最大実行時間  
**Scale/Scope**: 同時 10+ リクエスト処理、microVM セッション分離

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution ファイルは未設定（テンプレート状態）のため、明示的なゲート違反はなし。以下のプロジェクト共通原則に基づいて評価:

| Gate | Status | Notes |
|------|--------|-------|
| セキュリティ（多層防御維持） | PASS | 既存の 6 レイヤー防御を AgentCore エージェント内に移植。SigV4 によるゾーン間認証追加 |
| 後方互換性 | PASS | エンドユーザー体験（Slack UI）は不変。内部アーキテクチャのみ変更 |
| オブザーバビリティ | PASS | AgentCore ビルトイントレーシング + CloudWatch 統合。既存メトリクスを維持 |
| 最小権限の原則 | PASS | AgentCore 実行ロールは必要最小限の権限のみ。クロスアカウントはリソースベースポリシーで制御 |
| テスト可能性 | PASS | 各エージェントは独立してテスト可能。A2A プロトコルはモック可能 |

**Post-Design Re-check (2026-02-07)**:

| Gate | Status | Notes |
|------|--------|-------|
| セキュリティ（多層防御維持） | PASS | 全 6 レイヤーを Agent コードに移植。SigV4 + リソースベースポリシーでゾーン間認証。A2A コントラクトに error_code マッピング定義済み |
| 後方互換性 | PASS | SlackEventHandler Lambda 維持 + Feature Flag（`USE_AGENTCORE`）で段階的移行。ロールバック可能 |
| オブザーバビリティ | PASS | AgentCore ビルトイン X-Ray + CloudWatch 統合。correlation_id でエンドツーエンドトレーシング |
| 最小権限の原則 | PASS | Verification / Execution 各エージェント専用 IAM ロール。研究 R-007 で権限設計済み |
| テスト可能性 | PASS | A2A コントラクト（YAML）でモック可能。各エージェントの `/ping` でヘルスチェック |
| クロスアカウント | PASS | Runtime + Endpoint 両方にリソースベースポリシー。研究 R-003 で確認済み |

## Project Structure

### Documentation (this feature)

```text
specs/013-agentcore-a2a-zones/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── a2a-verification-agent.yaml
│   └── a2a-execution-agent.yaml
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
cdk/
├── bin/
│   └── cdk.ts                               # CDK app entry point（更新: AgentCore スタック対応）
├── lib/
│   ├── execution/
│   │   ├── execution-stack.ts                # 更新: AgentCore Runtime + ECR 追加、API Gateway 削除
│   │   ├── constructs/
│   │   │   ├── execution-agent-runtime.ts    # 新規: AgentCore Runtime (A2A) CDK コンストラクト
│   │   │   ├── execution-agent-ecr.ts        # 新規: ECR リポジトリ + イメージビルド
│   │   │   ├── bedrock-processor.ts          # 廃止予定（ロジックをエージェントコードに移行）
│   │   │   └── execution-api.ts              # 廃止予定（API Gateway → AgentCore Runtime）
│   │   └── agent/
│   │       └── execution-agent/              # 新規: Execution Agent コンテナコード
│   │           ├── Dockerfile                # ARM64 コンテナビルド
│   │           ├── requirements.txt          # Python 依存関係
│   │           ├── main.py                   # A2A サーバーエントリポイント（ポート 9000）
│   │           ├── agent_card.py             # Agent Card 定義
│   │           ├── bedrock_client_converse.py# 既存ロジック移植
│   │           ├── attachment_processor.py   # 既存ロジック移植
│   │           ├── document_extractor.py     # 既存ロジック移植
│   │           ├── file_downloader.py        # 既存ロジック移植
│   │           ├── response_formatter.py     # 既存ロジック移植
│   │           └── thread_history.py         # 既存ロジック移植
│   ├── verification/
│   │   ├── verification-stack.ts             # 更新: AgentCore Runtime + ECR 追加、SQS 削除
│   │   ├── constructs/
│   │   │   ├── verification-agent-runtime.ts # 新規: AgentCore Runtime (A2A) CDK コンストラクト
│   │   │   ├── verification-agent-ecr.ts     # 新規: ECR リポジトリ + イメージビルド
│   │   │   ├── slack-event-handler.ts        # 更新: AgentCore Invoke 呼び出しに変更
│   │   │   ├── slack-response-handler.ts     # 廃止予定（ロジックをエージェントに統合）
│   │   │   └── ...（既存 DynamoDB、Secrets 系は維持）
│   │   └── agent/
│   │       └── verification-agent/           # 新規: Verification Agent コンテナコード
│   │           ├── Dockerfile                # ARM64 コンテナビルド
│   │           ├── requirements.txt          # Python 依存関係
│   │           ├── main.py                   # A2A サーバーエントリポイント（ポート 9000）
│   │           ├── agent_card.py             # Agent Card 定義
│   │           ├── slack_verifier.py         # 既存ロジック移植
│   │           ├── existence_check.py        # 既存ロジック移植
│   │           ├── authorization.py          # 既存ロジック移植
│   │           ├── rate_limiter.py           # 既存ロジック移植
│   │           ├── event_dedupe.py           # 既存ロジック移植
│   │           ├── slack_poster.py           # 既存ロジック移植（SlackResponseHandler より）
│   │           └── a2a_client.py             # 新規: Execution Agent への A2A 呼び出し
│   └── types/
│       ├── cdk-config.ts                     # 更新: AgentCore 設定フィールド追加
│       └── stack-config.ts                   # 更新: AgentCore Props 追加
```

**Structure Decision**: 既存の 2 スタック構成（Verification / Execution）を維持しつつ、各スタック内に AgentCore Runtime リソースと ECR リポジトリを追加。Lambda → AgentCore コンテナへの段階的移行。Slack からの Function URL エンドポイントは SlackEventHandler Lambda として維持し、その内部で AgentCore の Verification Agent を A2A 経由で呼び出す。

## Complexity Tracking

> No constitution violations found. No justification required.
