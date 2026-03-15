# Quickstart: Slack Search Agent

**Branch**: `038-slack-search-agent`

## ローカル開発

### 前提条件

- Python 3.11
- Slack bot token (`xoxb-`) — `channels:history`, `channels:read`, `groups:read` スコープ付き

### セットアップ

```bash
cd verification-zones/slack-search-agent/src
pip install -r requirements.txt
```

### テスト実行

```bash
cd verification-zones/slack-search-agent/src
python -m pytest ../tests/ -v
```

### ローカル起動

```bash
cd verification-zones/slack-search-agent/src
export BEDROCK_MODEL_ID="jp.anthropic.claude-sonnet-4-5-20250929-v1:0"
export AWS_REGION_NAME="ap-northeast-1"
python main.py
# → http://localhost:9000
```

### 動作確認

```bash
# ヘルスチェック
curl http://localhost:9000/ping

# Agent Card
curl http://localhost:9000/.well-known/agent-card.json

# メッセージ検索（JSON-RPC）
curl -X POST http://localhost:9000/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "execute_task",
    "id": "test-1",
    "params": {
      "text": "#general のメッセージを検索して: リリース計画",
      "channel": "C1234567890",
      "bot_token": "xoxb-your-token",
      "correlation_id": "local-test"
    }
  }'
```

## デプロイ

```bash
# 1. Slack Search Agent をデプロイ（verification zone 内）
export DEPLOYMENT_ENV=dev
./verification-zones/slack-search-agent/scripts/deploy.sh

# → デプロイ完了後、ARN が出力される
# SlackAI-SlackSearch-Dev.SlackSearchAgentRuntimeArn = arn:aws:bedrock-agentcore:...

# 2. ARN を verification-agent の CDK config に追加
# verification-zones/verification-agent/cdk/cdk.config.dev.json:
# {
#   "slackSearchAgentArn": "arn:aws:bedrock-agentcore:..."
# }

# 3. verification-agent を再デプロイ
./verification-zones/verification-agent/scripts/deploy.sh
```

## 必要な Slack OAuth スコープ

| スコープ | 用途 |
|---------|------|
| `channels:history` | 公開チャンネルのメッセージ履歴取得 |
| `channels:read` | 公開チャンネル情報取得（`conversations.info`） |
| `groups:history` | 呼び出し元がプライベートチャンネルの場合の履歴取得 |
| `groups:read` | プライベートチャンネル情報取得 |

> 既存の bot token でこれらのスコープが有効であることを確認してください。

