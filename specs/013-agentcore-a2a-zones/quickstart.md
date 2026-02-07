# Quickstart: AgentCore A2A ゾーン間通信

**Branch**: `013-agentcore-a2a-zones` | **Date**: 2026-02-07

---

## 前提条件

- AWS CLI v2 + 適切なプロファイル設定
- Node.js 18+ / npm
- Python 3.11+
- Docker（ARM64 ビルド対応）
- AWS CDK CLI v2.215.0+

---

## Phase 1: Execution Agent のデプロイ

### Step 1: Execution Agent コンテナの作成

```bash
# Execution Agent ディレクトリに移動
cd cdk/lib/execution/agent/execution-agent/

# requirements.txt に依存関係を追加
cat > requirements.txt << 'EOF'
bedrock-agentcore>=1.0.0
strands-agents[a2a]>=0.1.0
uvicorn>=0.30.0
fastapi>=0.115.0
boto3>=1.34.0
requests>=2.31.0
PyPDF2>=3.0.0
openpyxl>=3.1.0
EOF

# Dockerfile を作成
cat > Dockerfile << 'EOF'
FROM --platform=linux/arm64 python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

EXPOSE 9000
CMD ["python", "main.py"]
EOF
```

### Step 2: Execution Agent A2A サーバーの実装

```python
# main.py
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent, tool
import threading
import json

app = BedrockAgentCoreApp()

@app.entrypoint
def main(payload):
    """A2A メッセージを受信し、Bedrock 処理を非同期で開始する"""
    task_payload = json.loads(payload.get("prompt", "{}"))
    
    # 非同期タスクを開始
    task_id = app.add_async_task("bedrock_processing", {
        "correlation_id": task_payload.get("correlation_id")
    })
    
    def background_work():
        try:
            result = process_bedrock_request(task_payload)
            return result
        finally:
            app.complete_async_task(task_id)
    
    thread = threading.Thread(target=background_work, daemon=True)
    thread.start()
    
    return {"status": "accepted", "task_id": task_id}

if __name__ == "__main__":
    app.run()
```

### Step 3: CDK スタックの更新

```bash
# CDK ディレクトリに移動
cd cdk/

# 依存関係のインストール
npm install

# Execution Stack のデプロイ（AgentCore Runtime 追加）
DEPLOYMENT_ENV=dev npx cdk deploy SlackAI-Execution-Dev
```

### Step 4: Execution Agent Runtime の確認

```bash
# AgentCore Runtime のステータス確認
aws bedrock-agentcore-control get-agent-runtime \
  --agent-runtime-name SlackAI-ExecutionAgent \
  --region ap-northeast-1

# Agent Card の確認
curl -X GET "https://bedrock-agentcore.ap-northeast-1.amazonaws.com/runtimes/{RUNTIME_ARN}/invocations/.well-known/agent-card.json" \
  --aws-sigv4 "aws:amz:ap-northeast-1:bedrock-agentcore"
```

---

## Phase 2: Verification Agent のデプロイ

### Step 1: Verification Agent コンテナの作成

```bash
cd cdk/lib/verification/agent/verification-agent/

# 同様に requirements.txt, Dockerfile, main.py を作成
# （既存の slack_verifier.py, existence_check.py 等のロジックを移植）
```

### Step 2: クロスアカウント設定（必要な場合）

```bash
# Execution Agent にリソースベースポリシーを設定
aws bedrock-agentcore-control put-resource-policy \
  --resource-arn "arn:aws:bedrock-agentcore:ap-northeast-1:<EXECUTION_ACCOUNT>:runtime/SlackAI-ExecutionAgent" \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::<VERIFICATION_ACCOUNT>:role/VerificationAgentExecutionRole"
      },
      "Action": "bedrock-agentcore:InvokeAgentRuntime",
      "Resource": "*"
    }]
  }'

# Endpoint にも同じポリシーを設定
aws bedrock-agentcore-control put-resource-policy \
  --resource-arn "arn:aws:bedrock-agentcore:ap-northeast-1:<EXECUTION_ACCOUNT>:runtime-endpoint/SlackAI-ExecutionAgent/DEFAULT" \
  --policy '...(同上)...'
```

### Step 3: Verification Stack のデプロイ

```bash
DEPLOYMENT_ENV=dev npx cdk deploy SlackAI-Verification-Dev
```

---

## Phase 3: 動作確認

### Step 1: Feature Flag の有効化

```bash
# SlackEventHandler Lambda の環境変数を更新
aws lambda update-function-configuration \
  --function-name SlackAI-Verification-Dev-SlackEventHandler \
  --environment "Variables={USE_AGENTCORE=true,EXECUTION_AGENT_ARN=arn:aws:bedrock-agentcore:ap-northeast-1:<ACCOUNT>:runtime/SlackAI-ExecutionAgent}" \
  --region ap-northeast-1
```

### Step 2: エンドツーエンドテスト

1. Slack で `@AI テストの質問` を投稿
2. リアクション（👀）が即座に表示されることを確認
3. 数秒後に AI の回答がスレッドに投稿されることを確認
4. CloudWatch Logs で A2A 通信のログを確認

### Step 3: ロールバック（問題発生時）

```bash
# Feature Flag を無効化して既存フローに戻す
aws lambda update-function-configuration \
  --function-name SlackAI-Verification-Dev-SlackEventHandler \
  --environment "Variables={USE_AGENTCORE=false}" \
  --region ap-northeast-1
```

---

## 設定ファイル更新

### cdk.config.dev.json

```json
{
  "awsRegion": "ap-northeast-1",
  "bedrockModelId": "amazon.nova-pro-v1:0",
  "executionAgentName": "SlackAI-ExecutionAgent",
  "verificationAgentName": "SlackAI-VerificationAgent",
  "useAgentCore": true,
  "executionAgentArn": "arn:aws:bedrock-agentcore:ap-northeast-1:<ACCOUNT>:runtime/SlackAI-ExecutionAgent"
}
```

---

## トラブルシューティング

| 問題 | 確認ポイント | 対処法 |
|------|-------------|--------|
| AgentCore Runtime がACTIVE にならない | `FailureReason` フィールド確認 | コンテナイメージの ARM64 ビルド、ポート 9000 のリッスンを確認 |
| A2A 通信でタイムアウト | CloudWatch Logs でエラー確認 | `/ping` エンドポイントの応答、セッション ID の管理を確認 |
| クロスアカウント認証エラー | CloudTrail で InvokeAgentRuntime イベント確認 | Runtime と Endpoint の両方にリソースベースポリシーが設定されているか確認 |
| セッションが 15 分で終了 | `/ping` の HealthyBusy 状態確認 | `@app.entrypoint` でブロッキングしていないか確認 |
| Bedrock エラー | Execution Agent の CloudWatch Logs | IAM 実行ロールに `bedrock:InvokeModel` 権限があるか確認 |
