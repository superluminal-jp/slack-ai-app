# トラブルシューティングガイド

---

title: トラブルシューティング
type: How-to
audience: [Developer, Operations]
status: Published
created: 2025-12-27
updated: 2026-02-11

---

## 概要

このガイドでは、Slack AI App の運用中に発生する可能性のある一般的な問題と、その解決方法を説明します。レガシーパス（API Gateway + SQS）と AgentCore A2A パスの両方をカバーします。

## 目次

- [接続エラー](#接続エラー)
- [認証エラー](#認証エラー)
- [API キー / シークレット関連](#api-キー--シークレット関連)
- [タイムアウトエラー](#タイムアウトエラー)
- [Bedrock エラー](#bedrock-エラー)
- [JSON シリアライゼーションエラー](#json-シリアライゼーションエラー)
- [AgentCore A2A エラー](#agentcore-a2a-エラー)
- [ファイルがスレッドに表示されない（014）](#ファイルがスレッドに表示されない014)
- [添付ファイル処理エラー（024）](#添付ファイル処理エラー024)
- [016 非同期起動（SQS / Agent Invoker / DLQ）](#016-非同期起動sqs--agent-invoker--dlq)
- [ログの確認方法](#ログの確認方法)

---

## 接続エラー

### 症状: ボットが応答しない

**考えられる原因**:

1. Lambda 関数がデプロイされていない
2. API Gateway の設定が正しくない
3. Slack App の Event Subscriptions が無効

**解決手順**:

```bash
# Lambda 関数の状態を確認
aws lambda get-function --function-name slack-event-handler

# API Gateway のエンドポイントを確認
aws apigateway get-rest-apis

# CloudWatch ログを確認
aws logs tail /aws/cdk/lib/verification/lambda/slack-event-handler --follow
```

---

## 認証エラー

### 症状: "Invalid signature" エラー

**考えられる原因**:

1. Slack Signing Secret が正しく設定されていない
2. リクエストのタイムスタンプが古い（リプレイアタック防止）

**解決手順**:

1. Secrets Manager で Signing Secret を確認:

```bash
aws secretsmanager get-secret-value --secret-id slack-credentials
```

2. Slack App の設定ページで Signing Secret を再確認

3. サーバーの時刻同期を確認:

```bash
timedatectl status
```

### 症状: "User not authorized" エラー

**考えられる原因**:

1. ユーザーがホワイトリストに含まれていない
2. チャンネルがホワイトリストに含まれていない

**解決手順**:

1. DynamoDB のホワイトリストテーブルを確認
2. 必要に応じてユーザー/チャンネルを追加

---

## API キー / シークレット関連

### 症状: `execution_api_invocation_failed` ログエラー

**考えられる原因**:

1. `execution-api-key-{env}` シークレットが Secrets Manager に存在しない
2. シークレットの値が正しくない

**解決手順**:

1. Secrets Manager でシークレットの存在を確認:

```bash
# 開発環境
aws secretsmanager describe-secret --secret-id execution-api-key-dev

# シークレットが存在しない場合は作成
API_KEY_ID=$(aws cloudformation describe-stacks \
  --stack-name SlackAI-Execution-Dev \
  --query 'Stacks[0].Outputs[?OutputKey==`ExecutionApiKeyId`].OutputValue' \
  --output text)

API_KEY_VALUE=$(aws apigateway get-api-key \
  --api-key $API_KEY_ID \
  --include-value \
  --query 'value' \
  --output text)

aws secretsmanager create-secret \
  --name execution-api-key-dev \
  --secret-string "$API_KEY_VALUE"
```

2. Lambda 環境変数 `EXECUTION_API_KEY_SECRET_NAME` が正しいシークレット名を指しているか確認

---

## タイムアウトエラー

### 症状: "処理中です..." メッセージの後、応答がない

**考えられる原因**:

1. Bedrock の処理が予想より長い
2. Lambda のタイムアウト設定が短い
3. ネットワーク接続の問題

**解決手順**:

1. Lambda のタイムアウト設定を確認（推奨: 60 秒以上）:

```bash
aws lambda get-function-configuration --function-name bedrock-processor
```

2. Bedrock のレスポンス時間を CloudWatch で確認

3. 必要に応じてタイムアウトを延長:

```bash
aws lambda update-function-configuration \
  --function-name bedrock-processor \
  --timeout 120
```

---

## Bedrock エラー

### 症状: "Model access denied" エラー

**考えられる原因**:

1. Bedrock モデルへのアクセスが有効化されていない
2. IAM ロールの権限が不足

**解決手順**:

1. AWS Console で Bedrock Model Access を確認
2. 使用するモデル（Claude 4.5 Sonnet など）を有効化
3. Lambda の IAM ロールに `bedrock:InvokeModel` 権限を追加

### 症状: "Token limit exceeded" エラー

**考えられる原因**:

1. 入力テキストが長すぎる
2. スレッド履歴が長すぎる

**解決手順**:

1. 環境変数 `MAX_TOKENS` を調整
2. スレッド履歴の取得数を制限
3. 入力テキストのトリミングを実装

---

## JSON シリアライゼーションエラー

### 症状: `TypeError: Object of type Decimal is not JSON serializable`

**考えられる原因**:

DynamoDB から取得した値に `Decimal` 型が含まれており、標準の `json.dumps` ではシリアライズできない。

**解決手順**:

1. `logger.py` でカスタム JSON エンコーダーを使用しているか確認:

```python
from decimal import Decimal

class _DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj == int(obj) else float(obj)
        return super().default(obj)

# json.dumps 呼び出し時に cls=_DecimalEncoder を指定
print(json.dumps(log_entry, cls=_DecimalEncoder))
```

2. DynamoDB クエリ結果をログに記録する箇所をすべて確認

---

## AgentCore A2A エラー

**参照（AWS 公式）**: [Invoke an AgentCore Runtime agent](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-invoke-agent.html) | [Troubleshoot AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-troubleshooting.html) | [A2A protocol contract](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a-protocol-contract.html) | [CreateAgentRuntime API](https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_CreateAgentRuntime.html)。InvokeAgentRuntime 利用時は boto3 1.39.8+ / botocore 1.33.8+ を推奨（[runtime-troubleshooting](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-troubleshooting.html)）。

### runtimeSessionId とペイロードサイズ制限

InvokeAgentRuntime 利用時は以下の制限を遵守してください。

| 項目                 | 制限             | 本プロジェクトの実装                                                                      |
| -------------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| **runtimeSessionId** | 長さ 33–256 文字 | `str(uuid.uuid4())` を使用（36 文字）。API 要件を満たす                                   |
| **ペイロードサイズ** | 最大 100 MB      | テキスト・添付ファイル（024）を含めても通常は遠く下回る。マルチモーダル拡張時は監視を推奨 |

スレッド単位でコンテキストを維持するユースケースでは、同一スレッドで同じ `runtimeSessionId` を再利用可能。本アプリはリクエスト毎に新しいセッション ID を使用（非同期 SQS 経由のため）。

### 症状: AgentCore Agent が起動しない

**考えられる原因**:

1. Docker イメージのビルド失敗（ARM64 アーキテクチャの不一致）
2. ECR へのプッシュ権限不足
3. AgentCore Runtime のプロビジョニング失敗

**解決手順**:

```bash
# Docker が ARM64 ビルドに対応しているか確認
docker buildx inspect

# ECR リポジトリの確認
aws ecr describe-repositories --repository-names "*agent*"

# AgentCore Runtime のステータス確認
aws bedrock-agentcore list-agent-runtimes
```

### 症状: A2A 通信で `InvokeAgentRuntime` が失敗

**考えられる原因**:

1. Execution Agent の Alias ARN が正しく設定されていない
2. クロスアカウント時の リソースベースポリシー が未設定
3. SigV4 署名の認証エラー

**解決手順**:

1. 環境変数 `EXECUTION_AGENT_ALIAS_ARN` を確認
2. CloudWatch ログで A2A 呼び出しエラーを確認:

```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/SlackAI-Verification-Dev-SlackEventHandler \
  --filter-pattern "a2a"
```

### 症状: A2A デプロイで `Unrecognized resource types: [AWS::BedrockAgentCore::RuntimeResourcePolicy]`

**原因**:  
`AWS::BedrockAgentCore::RuntimeResourcePolicy` は **CloudFormation のリソースタイプとして提供されていません**。  
[AWS CloudFormation Template Reference（Bedrock AgentCore）](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/AWS_BedrockAgentCore.html) で公開されているのは `Runtime`, `RuntimeEndpoint`, `Gateway`, `Memory` 等のみです。リソースベースポリシーは **Control Plane API**（`PutResourcePolicy`）または **AWS CLI** で設定します。

**対応**:  
本プロジェクトの CDK では該当 CFn リソースを使わないようにしてあります。クロスアカウントで Verification から Execution を呼ぶ場合は、デプロイ後に **Runtime と Runtime Endpoint の両方** にポリシーを設定してください。

```bash
# Runtime にポリシーを設定
aws bedrock-agentcore-control put-resource-policy \
  --resource-arn "arn:aws:bedrock-agentcore:<REGION>:<EXECUTION_ACCOUNT>:runtime/<RUNTIME_NAME>" \
  --policy '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":"arn:aws:iam::<VERIFICATION_ACCOUNT>:root"},"Action":"bedrock-agentcore:InvokeAgentRuntime","Resource":"*"}]}'

# Endpoint にも同じポリシーを設定（クロスアカウントでは両方必要）
aws bedrock-agentcore-control put-resource-policy \
  --resource-arn "arn:aws:bedrock-agentcore:<REGION>:<EXECUTION_ACCOUNT>:runtime-endpoint/<RUNTIME_NAME>/DEFAULT" \
  --policy '...(上と同じ)...'
```

スタックの Output に `ExecutionRuntimeArn` / `ExecutionEndpointArn` が出ている場合はその ARN をそのまま `--resource-arn` に指定できます。詳細は [013 クイックスタート（クロスアカウント）](../../specs/013-agentcore-a2a-zones/quickstart.md) を参照してください。

**参考**:

- [Resource-based policies for Amazon Bedrock AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/resource-based-policies.html)
- [PutResourcePolicy - Control Plane API](https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_PutResourcePolicy.html)

---

## ファイルがスレッドに表示されない（014）

AI 生成ファイル（CSV/JSON 等）をスレッドに投稿する機能（014）で、ファイルが表示されない場合の確認ポイントです。

### 症状

- テキストはスレッドに表示されるが、ファイルが表示されない
- スレッドに「ファイルの投稿に失敗しました」というメッセージが表示される

### 確認手順

1. **Bot Token スコープ**  
   Slack App の **OAuth & Permissions** → **Bot Token Scopes** に **`files:write`** が含まれているか確認。含まれていない場合は追加し、ワークスペースに再インストールする。

2. **Verification Agent のログ**  
   CloudWatch で Verification Agent のログを確認し、`slack_file_posted`（成功）または `slack_post_file_failed` / `slack_file_post_unexpected_error`（失敗）が出ているか確認する。失敗時は `error` フィールドで Slack API のエラー内容を確認。

3. **Execution の file_artifact**  
   Execution Agent が `file_artifact` を返しているか確認。返していない場合は、ファイルサイズ（最大 5 MB）や MIME タイプ（`text/csv`, `application/json`, `text/plain` のみ許可）が制限内か確認する。

4. **関連ドキュメント**  
   [014 クイックスタート](../../specs/014-a2a-file-to-slack/quickstart.md)、[ゾーン間通信 §6.5](../reference/architecture/zone-communication.md)、[Slack 設定（files:write）](../reference/operations/slack-setup.md)。

---

## 添付ファイル処理エラー（024）

ユーザーがメッセージに添付した画像・ドキュメントの処理でエラーが発生する場合の確認ポイントです。

### 症状

- 添付ファイル付きメッセージでエラーが返る
- 「添付ファイルのダウンロードに失敗しました」等のメッセージが表示される
- 「サポートされていないファイル形式です」と表示される

### 確認手順

1. **Bot Token スコープ**  
   Slack App の **OAuth & Permissions** → **Bot Token Scopes** に **`files:read`** が含まれているか確認。含まれていない場合は追加し、ワークスペースに再インストールする。

2. **サポート形式**
   - 画像: PNG, JPEG, GIF, WebP（最大 10 MB）
   - ドキュメント: PDF, DOCX, XLSX, CSV, TXT, PPTX（最大 5 MB）
   - 1 メッセージあたり最大 5 ファイル

3. **Verification Agent のログ**  
   CloudWatch で `attachment_slack_download_failed`、`attachment_s3_upload_failed`、`attachments_exceed_limit` が出ていないか確認。

4. **Execution Agent のログ**  
   `attachment_download_failed`、`attachment_size_exceeded`、`unsupported_image_type`、`extraction_failed` が出ていないか確認。

5. **関連ドキュメント**  
   [024 クイックスタート](../../specs/024-slack-file-attachment/quickstart.md)、[Slack 設定（files:read）](../reference/operations/slack-setup.md)。

---

## 016 非同期起動（SQS / Agent Invoker / DLQ）

016 ではメンション受信後に SlackEventHandler が SQS へ実行リクエストを送り即 200 を返し、Agent Invoker Lambda がキューを消費して Verification Agent を呼びます。以下はその経路で起きる問題の確認方法です。

### 症状: メンションにリアクションだけ付き、返信が来ない

**考えられる原因**:

1. SQS のバックログ（Agent Invoker の処理が追いついていない）
2. Agent Invoker Lambda の InvokeAgentRuntime 失敗（権限・ネットワーク・Agent 停止）
3. メッセージが最大受信回数超過で DLQ に移動している

**確認手順**:

1. **SQS キュー残数**  
   AWS コンソールの SQS → `*-agent-invocation-request` の「メッセージの概要」で「利用可能」メッセージ数を確認。増え続ける場合は Agent Invoker の同時実行数やエラー率を確認する。

2. **Agent Invoker Lambda のログ**  
   CloudWatch で Agent Invoker のロググループ（`/aws/lambda/<StackName>-AgentInvoker...`）を開き、`agent_invocation_success` または `agent_invocation_failed` を検索。`agent_invocation_failed` の場合は `error` フィールドで原因を確認。

3. **DLQ のメッセージ**  
   `*-agent-invocation-dlq` にメッセージが溜まっている場合は、メインキューで最大 3 回受信後に移動したメッセージ。DLQ のメッセージ本文（AgentInvocationRequest）と Agent Invoker のエラーログを突き合わせて原因を特定する。

4. **InvokeAgentRuntime 権限**  
   Agent Invoker の IAM ロールに `bedrock-agentcore:InvokeAgentRuntime` が付与されているか、および Verification Agent の Runtime / Runtime Endpoint のリソースベースポリシーで当該ロール（または検証アカウント）が許可されているか確認する。

### フロー別の切り分け（Slack → Verification → Execution → Verification → Slack）

「目のスタンプだけ付いて返信がこない」場合、次の順でログを確認すると、**どこで止まっているか**を特定できます。

| 確認箇所                               | ロググループ（例: dev）                                               | 成功時に見えるログ                                                                      | 止まっている場合の目安                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **1. Slack → Verification（Lambda）**  | `/aws/lambda/SlackAI-Verification-Dev-SlackEventHandler898FE80E-*`    | `reaction_added` → `sqs_enqueue_success`                                                | `reaction_added` のあと `sqs_enqueue_success` が無い → 署名/認可/レート制限/SQS 送信失敗                              |
| **2. SQS → Agent Invoker**             | `/aws/lambda/SlackAI-Verification-Dev-AgentInvokerHandler544912-*`    | `agent_invocation_success`                                                              | `agent_invocation_failed` → **InvokeAgentRuntime 失敗**（下記 424 を参照）                                            |
| **3. Verification Agent（AgentCore）** | `/aws/bedrock-agentcore/runtimes/SlackAI_VerificationAgent-*-DEFAULT` | `delegating_to_execution_agent` → `execution_result_received` → `slack_response_posted` | ログが無い → Agent Invoker の呼び出しが届いていない（424 等）                                                         |
| **4. Execution Agent（AgentCore）**    | `/aws/bedrock-agentcore/runtimes/SlackAI_ExecutionAgent-*-DEFAULT`    | 推論・応答のログ                                                                        | Verification のログに `delegating_to_execution_agent` はあるが Execution にログが無い → A2A または Execution 側の不調 |
| **5. Slack Poster → Slack**            | `/aws/lambda/SlackAI-Verification-Dev-SlackPoster...`                 | `slack_post_success` → リアクション 👀→✅ 差し替え                                      | 投稿成功時は元メッセージのリアクションが 👀 から ✅ に変わる。返信が来ない場合は Poster のログを確認                  |

**CLI で直近ログを確認する例**（リージョン・ロググループ名は環境に合わせて変更）:

```bash
# SlackEventHandler: リアクションと SQS 送信
aws logs filter-log-events --region ap-northeast-1 \
  --log-group-name "/aws/lambda/SlackAI-Verification-Dev-SlackEventHandler898FE80E-eZpefJLA6NWi" \
  --start-time $(($(date +%s) - 7200))000 \
  --filter-pattern "?sqs_enqueue_success ?reaction_added ?ERROR" --limit 20

# Agent Invoker: 成功/失敗（失敗時は error_code, http_status, correlation_id も出力）
aws logs filter-log-events --region ap-northeast-1 \
  --log-group-name "/aws/lambda/SlackAI-Verification-Dev-AgentInvokerHandler544912-08wKPdINAP3K" \
  --start-time $(($(date +%s) - 7200))000 \
  --filter-pattern "?agent_invocation_success ?agent_invocation_failed ?payload_parse_error ?invoke_retry_throttling" --limit 20
```

**Agent Invoker のログ仕様**: `agent_invocation_failed` 時は `error_code`（例: 424 相当のコード）・`error_message`・`http_status`（存在する場合）・`correlation_id` が含まれる。SQS 本文が不正 JSON の場合は `payload_parse_error`、ThrottlingException のリトライ時は `invoke_retry_throttling` が出力される。

### InvokeAgentRuntime が 424 で失敗する（Agent Invoker → Verification Agent）

**症状**: Agent Invoker のログに `agent_invocation_failed` が出て、`error` に「An error occurred (424) when calling the InvokeAgentRuntime operation」とある。

**意味**: HTTP 424 (Failed Dependency) は、呼び出し先の Verification Agent ランタイムが応答できなかった、または依存処理が失敗したことを示します。**止まっている場所は「Verification Zone（Agent Invoker）→ Verification Agent（AgentCore）」です。** Execution Zone には到達していません。

**確認と対処**:

1. **Verification Agent ランタイムの状態**  
   AWS コンソールの **Amazon Bedrock → AgentCore → Runtimes** で、該当 Verification Agent のステータスが **Ready**（Control Plane API では `READY`）になっているか確認。デプロイ直後は数分かかることがある。ステータス確認は `aws bedrock-agentcore-control get-agent-runtime --agent-runtime-id <ID>`（ARN の `runtime/` 以降が ID）。

2. **Verification Agent の CloudWatch ログ**  
   ロググループ `/aws/bedrock-agentcore/runtimes/SlackAI_VerificationAgent-*-DEFAULT` に、起動エラーやペイロード検証エラー（422 に相当）が出ていないか確認。**ログが 1 件も無い**場合は、**リクエストがコンテナに届いていない**（プラットフォーム側で 424 を返している）か、**コンテナが起動直後にクラッシュしている**可能性が高い。A2A ではポート 9000 必須。[Runtime サービス契約](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-service-contract.html)・[A2A プロトコル契約](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a-protocol-contract.html)参照。

3. **ペイロード形式**  
   Agent Invoker は `{"prompt": json.dumps(task_data)}` を送信。Verification Agent のエントリポイントが期待する形式（`prompt` をパースして `channel`, `text`, `bot_token` 等を取り出す）と一致しているか、[payload format](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-troubleshooting.html#payload-format-issues) を参照して確認。

4. **長時間待機後の 424**  
   呼び出しが 60 秒以上かかってから 424 になる場合、ランタイムのコールドスタートやコンテナの初期化タイムアウトの可能性。Lambda のタイムアウト（例: 2 分）を十分に取り、AgentCore ランタイムのヘルス・再デプロイを検討する。

5. **再デプロイしても 424 が続き、ランタイムにログが 1 件も出ない場合**  
   コンソールでは Runtime が Ready なのに InvokeAgentRuntime だけ 424 で、Verification Agent のロググループにアプリログが無い場合は、**コンテナにトラフィックが届いていない**か**コンテナ起動失敗**が疑われる。
   - **コンテナのローカル確認**: 同じ Docker イメージを `docker run -p 9000:9000 <image>` で起動し、`GET /ping` や `POST /` で応答するか確認。
   - **Execution Role**: Runtime の実行ロールが ECR の GetAuthorizationToken / BatchGetImage と CloudWatch Logs の PutLogEvents を持っているか確認。
   - **イメージ・プラットフォーム**: Dockerfile が `EXPOSE 9000` かつ ARM64（`--platform=linux/arm64`）でビルドされているか確認。
   - 上記で問題なさそうな場合は [Troubleshoot AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-troubleshooting.html) の「missing or empty CloudWatch Logs」「debugging container issues」を参照するか、AWS サポート／サービスヘルスを確認する。

**関連（公式）**: [Troubleshoot AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-troubleshooting.html)（504 / 422 / 403 / 500 / 424 の説明）、[Invoke an AgentCore Runtime agent](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-invoke-agent.html)、[InvokeAgentRuntime API](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_InvokeAgentRuntime.html)。Agent Invoker は boto3 1.39.8+ を利用（bedrock-agentcore クライアントに必要）。

### Verification Agent の CloudWatch ログストリームが空で error rate 100%（テンプレートに EnvironmentVariables あり）

**症状**: デプロイ済み CloudFormation テンプレートの `VerificationAgentRuntime` に **EnvironmentVariables が含まれている**のに、Verification Agent 用の CloudWatch ログストリームに何も入らず、**runtime error rate が 100%** のまま。

**考えられる原因**:

- **InvokeAgentRuntime がコンテナに届く前に失敗している**（424 / 500 等）→ コンテナが起動しない、またはリクエストを受け付ける前に失敗するため、ランタイム側のログが一切出ない。
- **ログの見ている場所が違う** → AgentCore の標準ログはロググループ `/aws/bedrock-agentcore/runtimes/<agent_id>-<endpoint_name>` の下に、ストリームは **UUID** で作成される。初回 invocation がコンテナに届いた後にストリームができる。

**対処（順に実施）**:

1. **Agent Invoker Lambda のログを確認する**  
   CloudWatch のロググループ `/aws/lambda/<StackName>-AgentInvokerHandler...`（例: `SlackAI-Verification-Dev-AgentInvokerHandler544912D9-...`）を開き、`agent_invocation_failed` を検索する。
   - **`error` に 424 が出ている** → 上記「[InvokeAgentRuntime が 424 で失敗する](#invokeagentruntime-が-424-で失敗するagent-invoker--verification-agent)」に従い、ランタイム状態・ペイロード・コールドスタートを確認する。
   - **500 / ThrottlingException / その他** → そのメッセージ内容で [Runtime トラブルシューティング](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-troubleshooting.html) や IAM 権限を確認する。
   - **`agent_invocation_success` しか出ていない** → 呼び出しは API としては成功しているが、ランタイム内で処理が失敗している。次のステップへ。

2. **Verification Agent のロググループ・ストリームを確認する**
   - ロググループ: `/aws/bedrock-agentcore/runtimes/<agent_id>-DEFAULT`（`<agent_id>` は Bedrock AgentCore コンソールの Runtime 詳細に表示される ID。例: `SlackAI_VerificationAgent-199F5923` のような形式）。
   - 標準ログは「ストリーム名 = UUID」のログストリームに出力される。ストリームが存在しない、またはあっても空の場合は、**リクエストがコンテナに届いていない**か、**コンテナが起動直後にクラッシュしている**可能性がある。
   - OTEL 構造化ログは同じロググループ内の `otel-rt-logs` ストリームに出る場合がある（[View observability data](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-view.html) 参照）。

3. **ランタイム状態と再デプロイ**  
   Amazon Bedrock → AgentCore → Runtimes で該当 Runtime が **ACTIVE / Ready** か確認する。環境変数を変えた直後は、**新しいコンテナインスタンス**にのみ反映されるため、数分待つか、必要に応じてスタックを再デプロイしてから再度メンションしてログの有無を確認する。

4. **テンプレートに EnvironmentVariables がある場合の追加確認**  
   テンプレートに `EnvironmentVariables` があるのに error rate 100% かつログが空の場合は、上記 1 の **Agent Invoker の `agent_invocation_failed` の `error` 内容**が最も手がかりになる。ここに 424 や API エラーが出ていれば、Runtime 内のログが空でも原因切り分けが進む。

### Runtime error rate が 100% になる（Verification Agent の環境変数不足）

**症状**: コンソールで SlackAI_VerificationAgent の状態は Ready、runtime invocations は増えるが、**runtime error rate が 100%** で返信が届かない。

**原因**: Verification Agent は AgentCore の**コンテナ**として動いており、DynamoDB テーブル名・Execution Agent ARN・リージョンなどを**環境変数**で参照しています。CDK で `AWS::BedrockAgentCore::Runtime` に `EnvironmentVariables` を渡していないと、コンテナ内で `EXECUTION_AGENT_ARN` や `WHITELIST_TABLE_NAME` などが未設定となり、ほぼすべてのリクエストで例外が発生し、runtime error rate が 100% になります。

**対処**:

1. **CDK で環境変数を渡しているか確認**  
   `cdk/lib/verification/constructs/verification-agent-runtime.ts` の `AWS::BedrockAgentCore::Runtime` に、少なくとも次の環境変数が設定されているか確認する。
   - `EXECUTION_AGENT_ARN`（Execution Agent の ARN）
   - `AWS_REGION_NAME`
   - `DEDUPE_TABLE_NAME`
   - `WHITELIST_TABLE_NAME`
   - `WHITELIST_SECRET_NAME`（例: `<StackName>/slack/whitelist-config`）
   - `RATE_LIMIT_TABLE_NAME`
   - `EXISTENCE_CHECK_CACHE_TABLE`
   - `RATE_LIMIT_PER_MINUTE`（任意、既定値 10）

2. **修正後は再デプロイ**  
   上記を追加・修正したうえで Verification スタックを再デプロイする。Runtime の `EnvironmentVariables` は No interruption で更新可能。

3. **Verification Agent のログ確認**  
   CloudWatch の `/aws/bedrock-agentcore/runtimes/SlackAI_VerificationAgent-*-DEFAULT` に、`unhandled_exception` や `execution_agent_error`、`WHITELIST_TABLE_NAME environment variable not set` などのメッセージが出ていないか確認する。

4. **再デプロイ後も error rate が 100% のとき**
   - **デプロイ済みテンプレートの確認**: AWS コンソールの **CloudFormation** → **SlackAI-Verification-Dev** → 「テンプレート」タブ → テンプレートを表示し、`VerificationAgentRuntime`（または `Runtime`）リソースの **Properties** に **EnvironmentVariables** があるか確認する。含まれていない場合は、CDK の `verification-agent-runtime.ts` で `addPropertyOverride("EnvironmentVariables", ...)` が効くように再デプロイする。
   - **環境変数の中身**: 同じテンプレート内で `EXECUTION_AGENT_ARN`、`DEDUPE_TABLE_NAME`、`WHITELIST_TABLE_NAME`、`AWS_REGION_NAME` などが正しく設定されているか確認する。
   - **コンテナの入れ替え**: 環境変数の変更は **新しいコンテナインスタンス** にのみ反映されます。数分待ってから再度メンションするか、必要に応じて Runtime を再デプロイし、新しいインスタンスが起動するのを待つ。
   - **ログで原因を特定**: CloudWatch の `/aws/bedrock-agentcore/runtimes/SlackAI_VerificationAgent-*-DEFAULT` で `level: ERROR` や `event_type: unhandled_exception` を検索し、`error` フィールド（未設定の環境変数名・DynamoDB/Secrets Manager のエラー・Execution Agent 呼び出し失敗など）を確認する。

**関連ドキュメント**: [ゾーン間通信 §6.6（016 非同期フロー）](../reference/architecture/zone-communication.md)、[016 spec](../../specs/016-async-agentcore-invocation/spec.md)。

---

## ログの確認方法

### 各段階のログを一括取得（trace-slack-request-logs.sh）

Slack からのリクエストについて、**各段階（Slack Event Handler → Agent Invoker → Verification Agent → Execution Agent → Slack Poster）の AWS CloudWatch ログを取得し一覧**するスクリプトがあります。

```bash
# 最新のリクエストのログを取得（過去1時間以内）
./scripts/trace-slack-request-logs.sh --latest

# 特定の correlation_id でログを取得
./scripts/trace-slack-request-logs.sh --correlation-id "abc-123-def"

# 過去2時間の範囲で最新リクエストを取得
./scripts/trace-slack-request-logs.sh --latest --since 2h

# ロググループ一覧を表示（探索モード）
./scripts/trace-slack-request-logs.sh --list-log-groups
```

**前提条件**: AWS CLI が設定済み、jq がインストール済み（`brew install jq`）。

### CloudWatch ログの確認

```bash
# 最新のログを表示
aws logs tail /aws/cdk/lib/verification/lambda/slack-event-handler --follow

# 特定の時間範囲のログを検索
aws logs filter-log-events \
  --log-group-name /aws/cdk/lib/verification/lambda/slack-event-handler \
  --start-time $(date -v-1H +%s000) \
  --filter-pattern "ERROR"
```

### 重要なログパターン

| パターン                          | 意味                                          |
| --------------------------------- | --------------------------------------------- |
| `signature_valid=false`           | 署名検証失敗                                  |
| `existence_check_failed`          | Slack API 実在性確認失敗                      |
| `bedrock_error`                   | Bedrock API エラー                            |
| `timeout`                         | 処理タイムアウト                              |
| `execution_api_invocation_failed` | Execution API 呼び出し失敗                    |
| `rate_limit_unexpected_error`     | レート制限の予期しないエラー                  |
| `whitelist_authorization_failed`  | ホワイトリスト認可失敗                        |
| `a2a_invocation_failed`           | AgentCore A2A 呼び出し失敗                    |
| `slack_post_file_failed`          | 014: ファイルの Slack 投稿失敗                |
| `agent_invocation_failed`         | 016: Agent Invoker の InvokeAgentRuntime 失敗 |
| `agent_invocation_success`        | 016: Agent Invoker の InvokeAgentRuntime 成功 |

---

## 関連ドキュメント

- [モニタリングガイド](../reference/operations/monitoring.md)
- [セキュリティ実装](../reference/security/implementation.md)
- [クイックスタート](../quickstart.md)
