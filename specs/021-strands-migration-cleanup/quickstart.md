# Quickstart: strands-agents 移行とインフラ整備

**Date**: 2026-02-08
**Feature**: 021-strands-migration-cleanup

## Prerequisites

- Python 3.11
- AWS CLI configured (`ap-northeast-1`)
- Docker (ARM64 ビルド対応)
- CDK CLI (`npm install -g aws-cdk`)

## Local Development

### 1. strands-agents インストール

```bash
pip install "strands-agents[a2a]~=1.25.0" uvicorn fastapi
```

### 2. Verification Agent ローカル実行

```bash
cd cdk/lib/verification/agent/verification-agent
pip install -r requirements.txt
python main.py
# → http://127.0.0.1:9000/ で A2A サーバー起動
```

### 3. テスト実行

```bash
# Verification Agent
cd cdk/lib/verification/agent/verification-agent
pytest tests/ -v

# Execution Agent
cd cdk/lib/execution/agent/execution-agent
pytest tests/ -v
```

## Deployment

### エコーモードで dev デプロイ

```bash
# Option A: 設定ファイルに追加（推奨）
# cdk.config.dev.json に "validationZoneEchoMode": true を追加

# Option B: 環境変数で指定（後方互換）
VALIDATION_ZONE_ECHO_MODE=true ./scripts/deploy-split-stacks.sh dev
```

### 本番デプロイ

```bash
./scripts/deploy-split-stacks.sh prod
```

## Verification

### CloudWatch Metrics 確認

1. CloudWatch コンソール → Metrics → All metrics
2. `SlackAI/VerificationAgent` と `SlackAI/ExecutionAgent` 名前空間を確認
3. メトリクスデータが記録されていれば IAM 修正成功

### A2A 動作確認

1. Slack でボットをメンション
2. `[Echo] {テキスト}` が返れば A2A ルーティング正常
3. CloudWatch Logs でアプリケーションログを確認

## Key Changes from Previous Architecture

| Before | After |
|--------|-------|
| `BedrockAgentCoreApp` (bedrock-agentcore SDK) | `A2AServer` (strands-agents) + FastAPI |
| `@app.entrypoint` decorator | `Agent` + Tools pattern |
| `app._handle_invocation()` (private API) | A2AServer 自動ルーティング |
| `app.add_async_task()` / `complete_async_task()` | `StrandsA2AExecutor` 自動管理 |
| Port 8080 (SDK default) | Port 9000 (A2A default) |
| IAM: `bedrock-agentcore` namespace only | IAM: `SlackEventHandler` + `SlackAI/*` |
