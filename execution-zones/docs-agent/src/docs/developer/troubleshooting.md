# トラブルシューティング

**目的**: エラー診断、無応答時のチェックリスト、処理フロー検証の手順を提供する。
**対象読者**: 開発者、運用担当者
**最終更新日**: 2026-03-30

---

## 目次

- [クイックリファレンス（症状と次の一手）](#クイックリファレンス症状と次の一手)
- [一般的なエラーと対処](#一般的なエラーと対処)
- [返信なし診断チェックリスト](#返信なし診断チェックリスト)
- [処理フロー検証](#処理フロー検証)

---

## クイックリファレンス（症状と次の一手）

| 症状 | まず疑うこと | 次のセクション |
|------|----------------|----------------|
| ボットが一切応答しない | Slack Event Subscriptions、Lambda/Runtime、ホワイトリスト | [返信なし診断チェックリスト](#返信なし診断チェックリスト)、下記「接続エラー」 |
| "Invalid signature" | Signing Secret の不一致、時刻ずれ | [認証エラー](#認証エラー) |
| 「処理中」のまま終わらない | Bedrock/Execution の遅延・タイムアウト、入力が長すぎる | [タイムアウトエラー](#タイムアウトエラー) |
| ユーザーが拒否される | ホワイトリスト外 | [認証エラー](#認証エラー) の "User not authorized" |

---

## 一般的なエラーと対処

このセクションでは、Slack AI App の運用中に発生する可能性のある一般的な問題と、その解決方法を説明します。現行の AgentCore A2A パスを対象にしています。

### 接続エラー

#### 症状: ボットが応答しない

**考えられる原因**:

1. Lambda 関数がデプロイされていない
2. Verification / Execution Runtime の設定が正しくない
3. Slack App の Event Subscriptions が無効

**解決手順**:

```bash
# Lambda 関数の状態を確認
aws lambda get-function --function-name slack-event-handler

# Verification Runtime の状態を確認
aws bedrock-agentcore-control get-agent-runtime \
  --agent-runtime-id <verification-runtime-id>

# CloudWatch ログを確認
aws logs tail /aws/lambda/SlackAI-Verification-Dev-SlackEventHandler --follow
```

---

### 認証エラー

#### 症状: "Invalid signature" エラー

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

#### 症状: "User not authorized" エラー

**考えられる原因**:

1. ユーザーがホワイトリストに含まれていない
2. チャンネルがホワイトリストに含まれていない

**解決手順**:

1. DynamoDB のホワイトリストテーブルを確認
2. 必要に応じてユーザー/チャンネルを追加

---

### API キー関連（レガシー）

現行の AgentCore A2A 構成では、Execution 呼び出しに API Gateway / API キーを使用しません。  
`execution_api_invocation_failed` の代わりに、`invoke_execution_agent_failed` / `access_denied` など AgentCore 呼び出しログを確認してください。

---

### タイムアウトエラー

#### 症状: "処理中です..." メッセージの後、応答がない

**考えられる原因**:

1. Bedrock の処理が予想より長い
2. Execution Agent（AgentCore Runtime）のセッションタイムアウトやネットワーク問題
3. Verification Agent から Execution Agent への A2A 呼び出しの遅延

**解決手順**:

1. Execution Agent はコンテナ（AgentCore Runtime）で動作する。タイムアウトは AgentCore のライフサイクル設定（idleRuntimeSessionTimeoutSeconds 等）や Bedrock の応答時間を確認する。
2. Bedrock のレスポンス時間を CloudWatch で確認する。
3. 長時間処理が必要な場合は、非同期タスク（ポーリング）経路が使われているか確認する。

---

### A2A / Execution Agent 呼び出しエラー

#### 症状: 「AIサービスへのアクセスが拒否されました。管理者にお問い合わせください。」

このメッセージは、Verification Agent が Execution Agent を **InvokeAgentRuntime** で呼び出す際に、AWS から **AccessDeniedException** が返ったときに表示されます。

**考えられる原因**:

1. **Execution Agent のリソースポリシー未適用・不整合**  
   デプロイスクリプトの `apply_execution_agent_resource_policy` が実行されていない、または失敗している。または、リソースポリシーに記載されている **Principal（IAM ロール ARN）** が、実際に InvokeAgentRuntime を呼んでいる **Verification Agent Runtime の実行ロール** と一致していない。
2. **ロール名の不一致（よくある原因）**  
   リソースポリシーで許可するロール名が誤っている。正しいロール名は **`${VerificationStack名}-ExecutionRole`**（例: `SlackAI-Verification-Dev-ExecutionRole`）。古いスクリプトで `SlackAI_VerificationAgent-ExecutionRole` のように固定名を使っていると拒否される。
3. **Verification に EXECUTION_AGENT_ARNS が渡っていない**  
   Verification Stack の環境変数 `EXECUTION_AGENT_ARNS` が未設定または誤っていると、別 Runtime を呼ぼうとするか呼び出しに失敗する。

**解決手順**:

1. **呼び出し元 IAM に Runtime と Endpoint の両方を許可する**  
   AWS の評価では、呼び出し元の **identity-based ポリシー** が `bedrock-agentcore:InvokeAgentRuntime` を **Runtime と Endpoint の両方**のリソースに対して許可している必要がある。CDK の Verification Agent Runtime 構築では、`executionAgentArns` の各 ARN から DEFAULT エンドポイント ARN（`...:runtime-endpoint/<Name>/DEFAULT`）を導出し、両方を IAM の `resources` に含めている。再デプロイでこの変更が入っていることを確認する。
2. **デプロイスクリプトでリソースポリシーを適用**  
   `scripts/deploy.sh` を実行し、Phase 2.5 の「Apply Execution Agent resource policy」が成功していることを確認する。ログに表示される Principal（`SlackAI-Verification-Dev-ExecutionRole` など）が、実際の Verification 実行ロール名と一致しているか確認する。失敗している場合は、実行している IAM ユーザー/ロールに `bedrock-agentcore-control:PutResourcePolicy` 権限があるか確認する。あるいは `./scripts/deploy.sh policy` でリソースポリシーのみ適用することも可能。
3. **リソースポリシーの Principal を確認**  
   Execution Agent Runtime に設定されているリソースポリシーの Principal が、Verification Agent の **実行ロール ARN**（`arn:aws:iam::<account>:role/<VerificationStack名>-ExecutionRole`）と一致しているか確認する。スタック名は例: `SlackAI-Verification-Dev`。
4. **CloudWatch ログでエラーを確認**  
   Verification Agent（AgentCore Runtime）のログで `invoke_execution_agent_failed` と `error_code: AccessDeniedException` が出ていないか確認する。

---

### Bedrock エラー

#### 症状: "Model access denied" エラー

**考えられる原因**:

1. Bedrock モデルへのアクセスが有効化されていない
2. IAM ロールの権限が不足

**解決手順**:

1. AWS Console で Bedrock Model Access を確認
2. 使用するモデル（Claude 4.5 Sonnet など）を有効化
3. Lambda の IAM ロールに `bedrock:InvokeModel` 権限を追加

#### 症状: "Token limit exceeded" エラー

**考えられる原因**:

1. 入力テキストが長すぎる
2. スレッド履歴が長すぎる

**解決手順**:

1. 環境変数 `MAX_TOKENS` を調整
2. スレッド履歴の取得数を制限
3. 入力テキストのトリミングを実装

---

### JSON シリアライゼーションエラー

#### 症状: `TypeError: Object of type Decimal is not JSON serializable`

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

### AgentCore A2A エラー

**参照（AWS 公式）**: [Invoke an AgentCore Runtime agent](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-invoke-agent.html) | [Troubleshoot AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-troubleshooting.html) | [A2A protocol contract](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a-protocol-contract.html) | [CreateAgentRuntime API](https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_CreateAgentRuntime.html)。InvokeAgentRuntime 利用時は boto3 1.39.8+ / botocore 1.33.8+ を推奨（[runtime-troubleshooting](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-troubleshooting.html)）。

#### runtimeSessionId とペイロードサイズ制限

InvokeAgentRuntime 利用時は以下の制限を遵守してください。

| 項目                 | 制限             | 本プロジェクトの実装                                                                      |
| -------------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| **runtimeSessionId** | 長さ 33–256 文字 | `str(uuid.uuid4())` を使用（36 文字）。API 要件を満たす                                   |
| **ペイロードサイズ** | 最大 100 MB      | テキスト・添付ファイル（024）を含めても通常は遠く下回る。マルチモーダル拡張時は監視を推奨 |

スレッド単位でコンテキストを維持するユースケースでは、同一スレッドで同じ `runtimeSessionId` を再利用可能。本アプリはリクエスト毎に新しいセッション ID を使用（非同期 SQS 経由のため）。

#### 症状: AgentCore Agent が起動しない

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

#### 症状: A2A 通信で `InvokeAgentRuntime` が失敗

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

#### 症状: A2A デプロイで `Unrecognized resource types: [AWS::BedrockAgentCore::RuntimeResourcePolicy]`

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

スタックの Output に `FileCreatorRuntimeArn` / `TimeRuntimeArn` / `DocsRuntimeArn` / `WebFetchRuntimeArn`（および各 `*EndpointArn`）が出ている場合は、その ARN をそのまま `--resource-arn` に指定できます。詳細は [013 クイックスタート（クロスアカウント）](../../specs/013-agentcore-a2a-zones/quickstart.md) を参照してください。

**参考**:

- [Resource-based policies for Amazon Bedrock AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/resource-based-policies.html)
- [PutResourcePolicy - Control Plane API](https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_PutResourcePolicy.html)

---

### ファイルがスレッドに表示されない（014）

AI 生成ファイル（CSV/JSON 等）をスレッドに投稿する機能（014）で、ファイルが表示されない場合の確認ポイントです。

#### 症状

- テキストはスレッドに表示されるが、ファイルが表示されない
- スレッドに「ファイルの投稿に失敗しました」というメッセージが表示される

#### 確認手順

1. **Bot Token スコープ**
   Slack App の **OAuth & Permissions** → **Bot Token Scopes** に **`files:write`** が含まれているか確認。含まれていない場合は追加し、ワークスペースに再インストールする。

2. **Verification Agent のログ**
   CloudWatch で Verification Agent のログを確認し、`slack_file_posted`（成功）または `slack_post_file_failed` / `slack_file_post_unexpected_error`（失敗）が出ているか確認する。失敗時は `error` フィールドで Slack API のエラー内容を確認。

3. **Execution の file_artifact**
   Execution Agent が `file_artifact` を返しているか確認。返していない場合は、ファイルサイズ（最大 5 MB）や MIME タイプ（`text/csv`, `application/json`, `text/plain` のみ許可）が制限内か確認する。

4. **関連ドキュメント**
   [014 クイックスタート](../../specs/014-a2a-file-to-slack/quickstart.md)、[ゾーン間通信 §6.5](./architecture.md)、[Slack 設定（files:write）](./runbook.md)。

---

### 添付ファイル処理エラー（024）

ユーザーがメッセージに添付した画像・ドキュメントの処理でエラーが発生する場合の確認ポイントです。

#### 症状

- 添付ファイル付きメッセージでエラーが返る
- 「添付ファイルのダウンロードに失敗しました」等のメッセージが表示される
- 「サポートされていないファイル形式です」と表示される

#### 確認手順

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
   [024 クイックスタート](../../specs/024-slack-file-attachment/quickstart.md)、[Slack 設定（files:read）](./runbook.md)。

---

### 016 非同期起動（SQS / Agent Invoker / DLQ）

016 ではメンション受信後に SlackEventHandler が SQS へ実行リクエストを送り即 200 を返し、Agent Invoker Lambda がキューを消費して Verification Agent を呼びます。以下はその経路で起きる問題の確認方法です。

#### 症状: メンションにリアクションだけ付き、返信が来ない

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

#### フロー別の切り分け（Slack → Verification → Execution/Docs/Time → Verification → Slack）

「目のスタンプだけ付いて返信がこない」場合、次の順でログを確認すると、**どこで止まっているか**を特定できます。

| 確認箇所                               | ロググループ（例: dev）                                               | 成功時に見えるログ                                                                      | 止まっている場合の目安                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **1. Slack → Verification（Lambda）**  | `/aws/lambda/SlackAI-Verification-Dev-SlackEventHandler898FE80E-*`    | `reaction_added` → `sqs_enqueue_success`                                                | `reaction_added` のあと `sqs_enqueue_success` が無い → 署名/認可/レート制限/SQS 送信失敗                              |
| **2. SQS → Agent Invoker**             | `/aws/lambda/SlackAI-Verification-Dev-AgentInvokerHandler544912-*`    | `agent_invocation_success`                                                              | `agent_invocation_failed` → **InvokeAgentRuntime 失敗**（下記 424 を参照）                                            |
| **3. Verification Agent（AgentCore）** | `/aws/bedrock-agentcore/runtimes/SlackAI_VerificationAgent-*-DEFAULT` | `delegating_to_execution_agent` → `execution_result_received` → `slack_response_posted` | ログが無い → Agent Invoker の呼び出しが届いていない（424 等）                                                         |
| **4. Target Agent（AgentCore）**       | `/aws/bedrock-agentcore/runtimes/SlackAI_ExecutionAgent-*-DEFAULT`（または `...DocsAgent...` / `...TimeAgent...`） | 推論・応答のログ                                                                        | Verification のログに委譲ログがあるのに対象 Runtime にログが無い → A2A または対象 Agent 側の不調 |
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

#### InvokeAgentRuntime が 424 で失敗する（Agent Invoker → Verification Agent）

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

#### Verification Agent の CloudWatch ログストリームが空で error rate 100%（テンプレートに EnvironmentVariables あり）

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

#### Runtime error rate が 100% になる（Verification Agent の環境変数不足）

**症状**: コンソールで SlackAI_VerificationAgent の状態は Ready、runtime invocations は増えるが、**runtime error rate が 100%** で返信が届かない。

**原因**: Verification Agent は AgentCore の**コンテナ**として動いており、DynamoDB テーブル名・Execution Agent ARN マップ・リージョンなどを**環境変数**で参照しています。CDK で `AWS::BedrockAgentCore::Runtime` に `EnvironmentVariables` を渡していないと、コンテナ内で `EXECUTION_AGENT_ARNS` や `WHITELIST_TABLE_NAME` などが未設定となり、ほぼすべてのリクエストで例外が発生し、runtime error rate が 100% になります。

**対処**:

1. **CDK で環境変数を渡しているか確認**
   `verification-zones/verification-agent/cdk/lib/constructs/verification-agent-runtime.ts` の `AWS::BedrockAgentCore::Runtime` に、少なくとも次の環境変数が設定されているか確認する。
   - `EXECUTION_AGENT_ARNS`（Execution Agent の ARN マップ）
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
   - **環境変数の中身**: 同じテンプレート内で `EXECUTION_AGENT_ARNS`、`DEDUPE_TABLE_NAME`、`WHITELIST_TABLE_NAME`、`AWS_REGION_NAME` などが正しく設定されているか確認する。
   - **コンテナの入れ替え**: 環境変数の変更は **新しいコンテナインスタンス** にのみ反映されます。数分待ってから再度メンションするか、必要に応じて Runtime を再デプロイし、新しいインスタンスが起動するのを待つ。
   - **ログで原因を特定**: CloudWatch の `/aws/bedrock-agentcore/runtimes/SlackAI_VerificationAgent-*-DEFAULT` で `level: ERROR` や `event_type: unhandled_exception` を検索し、`error` フィールド（未設定の環境変数名・DynamoDB/Secrets Manager のエラー・Execution Agent 呼び出し失敗など）を確認する。

**関連ドキュメント**: [ゾーン間通信 §6.6（016 非同期フロー）](./architecture.md)、[016 spec](../../specs/016-async-agentcore-invocation/spec.md)。

---

### ログの確認方法

#### 各段階のログを一括取得（deploy.sh logs）

Slack からのリクエストについて、**各段階（Slack Event Handler → Agent Invoker → Verification Agent → Execution/Docs/Time Agent → Slack Poster）の AWS CloudWatch ログを取得し一覧**するサブコマンドがあります。

```bash
# 最新のリクエストのログを取得（過去1時間以内）
./scripts/deploy.sh logs --latest

# 特定の correlation_id でログを取得
./scripts/deploy.sh logs --correlation-id "abc-123-def"

# 過去2時間の範囲で最新リクエストを取得
./scripts/deploy.sh logs --latest --since 2h

# ロググループ一覧を表示（探索モード）
./scripts/deploy.sh logs --list-log-groups
```

**前提条件**: AWS CLI が設定済み、jq がインストール済み（`brew install jq`）。

#### CloudWatch ログの確認

```bash
# 最新のログを表示
aws logs tail /aws/lambda/SlackAI-Verification-Dev-SlackEventHandler --follow

# 特定の時間範囲のログを検索
aws logs filter-log-events \
  --log-group-name /aws/lambda/SlackAI-Verification-Dev-SlackEventHandler \
  --start-time $(date -v-1H +%s000) \
  --filter-pattern "ERROR"
```

#### 重要なログパターン

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

## 返信なし診断チェックリスト

エコーモード有効（018）で dev にデプロイしたあと、Slack でメンションしても返信がこない場合のチェックリストです。

### 1. Slack Event Subscriptions の確認（最優先）

1. **Request URL** が **いまの Lambda Function URL** と一致しているか確認する。
   - デプロイ時に出力された URL を使う。例（dev）:
     ```
     https://gzqk7e3d5nxyzy5k2cinwjzjrm0icnak.lambda-url.ap-northeast-1.on.aws/
     ```
   - Slack App 設定 → **Event Subscriptions** → **Request URL** に上記を入力し、**Verified ✓** になること。

2. **Enable Events** が **ON** になっているか確認する。

3. **Subscribe to bot events** に **`app_mentions`** が含まれているか確認する。

4. Bot を**チャンネルに招待**しているか確認する（`/invite @あなたのBot名`）。

5. 変更した場合は **アプリの再インストール** が必要なことがある（Slack の案内に従う）。

---

### 2. Lambda にリクエストが届いているか（CloudWatch）

リクエストが Lambda に届いていれば、ログに `event_callback_received` や `event_received` が出ます。

```bash
# dev の SlackEventHandler のログストリームを特定して直近ログを表示
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/SlackAI-Verification-Dev" --query 'logGroups[*].logGroupName' --output text
```

上記で出たロググループのうち、`SlackEventHandler` を含むものを指定して tail する：

```bash
# dev の SlackEventHandler のログ（実際のロググループ名で tail）
aws logs tail /aws/lambda/SlackAI-Verification-Dev-SlackEventHandler898FE80E-eZpefJLA6NWi --since 10m --format short
```

- **何も出ない** → Slack から Lambda に届いていない。Request URL・Enable Events・app_mentions・チャンネル招待を再確認。
- **`event_received` はあるがそのあとエラー** → 次のステップでログ内容を確認。

---

### 3. どこまで処理が進んでいるか（ログパターン）

| ログに含まれるキーワード | 意味 |
|---------------------------|------|
| `event_callback_received` | Lambda がメンションイベントを受信した |
| `sqs_enqueue_success`     | Lambda が SQS にメッセージを送れた（018 では常にここを通る） |
| `existence_check_failed`  | 実在性チェックで失敗（403 になる） |
| `whitelist_authorization_failed` | ホワイトリスト認可で拒否 |
| `rate_limit_exceeded`     | レート制限で拒否 |

**Agent Invoker**（SQS を消費して Runtime を呼ぶ Lambda）のログ：

```bash
# Agent Invoker のログ（dev）
aws logs tail /aws/lambda/SlackAI-Verification-Dev-AgentInvokerHandler544912-08wKPdINAP3K --since 10m --format short
```

- `agent_invocation_success` が出ていれば、Verification Agent (Runtime) まで届いている。

**Verification Agent (Runtime)** のログ：

- ロググループは `/aws/bedrock-agentcore/` 以下。マネジメントコンソールの **CloudWatch → ロググループ** で `SlackAI_VerificationAgent` や `VerificationAgent` を含むものを開く。

---

### 4. よくある原因のまとめ

| 症状 | 確認すること |
|------|----------------|
| ログに何も出ない | Event Subscriptions の Request URL がデプロイ後の Function URL と一致しているか |
| Request URL が Verified にならない | Signing Secret が CDK/Secrets Manager と Slack アプリの「Signing Secret」が一致しているか |
| `existence_check_failed` | Slack Bot Token のスコープ（`users:read`, `conversations:read` 等）と実在する channel/user/team か |
| `whitelist_authorization_failed` | 使用している team_id / channel_id / user_id がホワイトリストに含まれているか |
| `sqs_enqueue_success` は出るが返信がない | Agent Invoker のログで `agent_invocation_success` の有無、Runtime のログで `delegating_to_execution_agent` 等の有無を確認 |

---

### 5. Agent Invoker が 424 で失敗する場合（InvokeAgentRuntime）

**症状**: Lambda ログに `sqs_enqueue_success` が出ているが、返信がこない。

**Agent Invoker のログ**に `agent_invocation_failed` と **HTTP 424** が出ている場合：

- **424 (Failed Dependency)** は、Verification Agent の AgentCore Runtime がまだ起動中・未準備のときに起こりやすいです。
- デプロイ直後は **5〜10 分ほど待ってから** 再度メンションを試してください。Runtime のコンテナが ACTIVE になるまで時間がかかることがあります。
- それでも 424 が出る場合は、CloudWatch で **Verification Agent Runtime** のログ（`/aws/bedrock-agentcore/` 以下）を確認し、コンテナの起動エラーや A2A のエラーが出ていないか確認してください。

```bash
# Agent Invoker のログで 424 を確認
aws logs tail /aws/lambda/SlackAI-Verification-Dev-AgentInvokerHandler544912-08wKPdINAP3K --since 30m --format short --filter-pattern "424"
```

---

### 6. 今回の dev デプロイで使った URL（ハードコード参照値）

エコーモード有効でデプロイした直後の **Slack Event Handler (Lambda) の Function URL** は以下です。Slack の Request URL は必ずこれに合わせてください。

```
https://gzqk7e3d5nxyzy5k2cinwjzjrm0icnak.lambda-url.ap-northeast-1.on.aws/
```

再デプロイすると URL が変わる場合があるので、その都度デプロイ出力の `SlackEventHandlerUrl` を確認してください。

---

### まとめ（メンションに返信がこないとき）

1. **Slack** → Request URL が正しいか・`app_mentions` 購読・Bot をチャンネルに招待。
2. **Lambda** → ログに `event_callback_received` と `sqs_enqueue_success` が出ていれば、Lambda は正常に SQS まで送れている。
3. **Agent Invoker** → ログに `agent_invocation_failed` と **424** が出ている場合は、**Verification Agent Runtime の起動待ち**の可能性が高い。数分待ってから再試行する。
4. **Runtime** → ログに `delegating_to_execution_agent` 等が出ていれば、Runtime はリクエストを受け付けている。出ていなければ Runtime がまだ受け付けていないか、ペイロードの不備を疑う。

---

### 各段階のログ確認（スクリプト）

メンションから返信までの**各段階**でログをまとめて確認するには、次のスクリプトを実行します。どこで処理が止まっているか・どのエラーが出ているかを切り分けできます。

```bash
# 最新のリクエストログを各段階で表示（dev・ap-northeast-1）
./scripts/deploy.sh logs --latest

# 過去1時間・prod
DEPLOYMENT_ENV=prod ./scripts/deploy.sh logs --latest --since 1h
```

| 段階 | ログの場所 | 見るイベント | 意味 |
|------|------------|--------------|------|
| **[A] Slack Event Handler** | `/aws/lambda/SlackAI-Verification-Dev-SlackEventHandler*` | `event_received`, `event_callback_received`, `sqs_enqueue_success` | メンション受信・署名 OK・SQS 送信まで成功 |
| | | `whitelist_authorization_failed`, `existence_check_failed` | 認可または実在性チェックで拒否 |
| **[B] Agent Invoker** | `/aws/lambda/SlackAI-Verification-Dev-AgentInvoker*` | `agent_invocation_success` | Verification Agent Runtime の呼び出し成功 |
| | | `agent_invocation_failed` | Runtime 呼び出し失敗（424 等） |
| **[C] Verification Agent Runtime** | `/aws/bedrock-agentcore/runtimes/SlackAI_VerificationAgent_Dev-*-DEFAULT`（本体）<br>`/aws/bedrock-agentcore/SlackAI-Verification-Dev-verification-agent-errors`（エラー要約） | `delegating_to_execution_agent` | Execution 呼び出しを開始した |
| | | `invoke_execution_agent_started` | Execution 側 API を呼び出し開始 |
| | | **`invoke_execution_agent_failed`** + **`error_code: AccessDeniedException`** | **Execution 側でアクセス拒否（「AIサービスへのアクセスが拒否されました」の原因）。本体 Runtime ログに AWS の error_message が出る** |
| | | `execution_agent_error_response`（errors ログ） | Execution が返したエラーをユーザー向けに記録（access_denied 等） |
| | | `execution_result_received` | Execution から正常応答を受信 |
| | | `execution_agent_error` | Execution 呼び出し前後の予期しない例外 |
| **[D] Slack Poster** | `/aws/lambda/SlackAI-Verification-Dev-SlackPoster*` | `slack_post_success` | Slack 投稿まで完了 |

**「アクセスが拒否されました」のとき**: [C] のログで `invoke_execution_agent_failed` を探し、`error_code` が `AccessDeniedException` か確認する。同じログ行に `error_message` や `execution_agent_arn` が出ていれば、Execution のリソースポリシー・IAM（Runtime/Endpoint 両方の許可）を再確認する。

**Execution 側の設定をまとめて確認する場合**は、次のスクリプトを実行する（リソースポリシーの Principal・Verification の IAM・Runtime ログの生エラーを順に表示）。

```bash
./scripts/deploy.sh check-access
```

### 「access_denied」の原因と次の確認手順

**現象**: `deploy.sh logs` の [3] Verification Agent で `execution_agent_error_response` に `error_code: "access_denied"` が出ており、`deploy.sh check-access` では [1] リソースポリシーと [2] IAM がどちらも OK と表示される。

**原因**: エラーは **Verification Agent が Execution Agent を呼ぶとき**、AWS の `InvokeAgentRuntime` API が **AccessDeniedException** を返した結果です。Verification 側の `a2a_client.py` がこれを捕捉し、ユーザー向けに `access_denied` /「AI サービスへのアクセスが拒否されました」にマッピングして errors ログと Slack に出力しています。

**考えられる要因**（スクリプトで OK でも発生しうるもの）:

1. **呼び出し先 ARN の不一致**  
   Verification Runtime の環境変数 `EXECUTION_AGENT_ARNS` が、リソースポリシーを付与した Execution Runtime と **異なる** ARN（例: 別スタック・旧ランタイム）を指している。その別ランタイムには Principal が設定されていないため AccessDenied になる。
2. **リソースポリシー未適用・上書き**  
   デプロイスクリプトの **Phase 2.5**（`apply_execution_agent_resource_policy`）を実行していない、または失敗している。CloudFormation ではリソースポリシーを管理しないため、手動またはスクリプトで毎回適用する必要がある。
3. **Condition `aws:SourceAccount` の不一致**  
   リソースポリシーの `Condition` で `verificationAccountId` を使っている場合、実際に Verification が動いている AWS アカウントと一致しているか確認する。

**推奨する確認手順**:

1. **Execution の ARN 一致確認**  
   - 例（file-creator）: `aws cloudformation describe-stacks --stack-name SlackAI-FileCreator-Dev --query 'Stacks[0].Outputs[?OutputKey==\`FileCreatorAgentRuntimeArn\`].OutputValue' --output text`  
   - Verification デプロイ時に渡している `executionAgentArns`（`cdk.config.*.json` や `--context`）および、実行中の Verification Runtime に渡っている `EXECUTION_AGENT_ARNS` が上記と **同一** か確認する。
2. **Phase 2.5 の再実行**  
   `./scripts/deploy.sh policy` を実行し、Execution Agent Runtime にリソースポリシーが適用されることを確認する。失敗する場合は `bedrock-agentcore-control:PutResourcePolicy` の権限を確認する。
3. **Verification Runtime の本体ログで AWS エラー確認**  
   ロググループ `/aws/bedrock-agentcore/runtimes/SlackAI_VerificationAgent_Dev-*-DEFAULT` で `invoke_execution_agent_failed` を検索し、同じイベントの `error_message` と `execution_agent_arn` を確認する。ここに AWS が返した生のメッセージと、実際に呼び出している ARN が記録される。

```bash
# 例: Verification Runtime 本体ログで AccessDenied の詳細を確認
aws logs filter-log-events --region ap-northeast-1 \
  --log-group-name "/aws/bedrock-agentcore/runtimes/SlackAI_VerificationAgent_Dev-SvSqoQ4xo8-DEFAULT" \
  --filter-pattern "invoke_execution_agent_failed" \
  --start-time $(($(date +%s) - 3600))000 \
  --query 'events[*].message' --output text
```

### 各要因の調査方法と判定

以下は、上記 3 要因を実際に確認する手順と、調査時の判定例です。

| 要因 | 調査方法 | 判定の目安 |
|------|----------|------------|
| **1. 呼び出し先 ARN の不一致** | (1) 対象 Execution スタックの Runtime ARN 出力値を取得する。<br>(2) `cdk/cdk.config.{dev,prod}.json` の `executionAgentArns.<agent-key>` と比較する。<br>(3) 同一アカウントの場合、Verification デプロイ時にこの値が Runtime の `EXECUTION_AGENT_ARNS` に反映される。 | **一致**: 両者が同じ Runtime ARN（例: `.../runtime/SlackAI_FileCreatorAgent_Dev-xxxxx`）を指していれば、この要因は否定的。<br>**不一致**: 設定が別のランタイム（旧スタック・別環境）を指していると、そのランタイムにリソースポリシーが無く AccessDenied になり得る。 |
| **2. Phase 2.5 未実行・失敗** | (1) Execution Runtime の現在のリソースポリシーを取得する。<br><br>`EXEC_ARN="arn:aws:bedrock-agentcore:ap-northeast-1:ACCOUNT:runtime/SlackAI_ExecutionAgent_Dev-xxxxx"`<br>`aws bedrock-agentcore-control get-resource-policy --region ap-northeast-1 --resource-arn "$EXEC_ARN"`<br><br>(2) `Sid: AllowVerificationAgentInvoke`、`Principal.AWS` に Verification の Execution ロール、`Action: bedrock-agentcore:InvokeAgentRuntime`、`Resource` が上記 ARN と一致するか確認する。 | **適用済み**: 上記の内容でポリシーが存在し、Principal が `SlackAI-Verification-{Env}-ExecutionRole` なら、Phase 2.5 は少なくとも一度は成功している。<br>**未適用**: ポリシーが無い・取得できない場合は Phase 2.5 を再実行する。 |
| **3. Condition（aws:SourceAccount）の不一致** | (1) 上記で取得したリソースポリシーの `Condition.StringEquals.aws:SourceAccount` の値を確認する。<br>(2) Verification が動いている AWS アカウント（`aws sts get-caller-identity --query Account` でデプロイに使うアカウント、または Runtime が稼働するアカウント）と一致するか確認する。<br>(3) Phase 2.5 では `verificationAccountId`（`cdk.config.*.json`）が未設定の場合は `get-caller-identity` の Account が使われる。 | **一致**: `aws:SourceAccount` が Verification のアカウント ID と同一なら、この要因は否定的。<br>**不一致**: クロスアカウント構成で設定を誤っていると、Condition で拒否され得る。 |

**補足（AWS ドキュメント）**: InvokeAgentRuntime の認可では、**ランタイム**と**エンドポイント**の両方のリソースポリシーが評価される。現状、`PutResourcePolicy` は Runtime にのみ対応しているため、本プロジェクトでは Runtime 側のポリシーのみを適用している。同一アカウントでは、エンドポイントにポリシーが無い場合は「ポリシーが存在する場合のみ」評価されるため、Runtime 側のみの設定で許可される運用を想定している。

#### 調査結果サマリ（実施例）

ある時点で上記 3 要因を確認した結果の例は以下のとおり。

- **要因 1（ARN 一致）**  
  - Execution スタック出力（file-creator）: `arn:aws:bedrock-agentcore:ap-northeast-1:471112852670:runtime/SlackAI_FileCreatorAgent_Dev-xxxxx`  
  - `cdk.config.dev.json` の `executionAgentArns.file-creator`: 上記と同一。  
  - **判定**: 不一致なし（dev では同一 ARN を参照）。

- **要因 2（Phase 2.5）**  
  - 上記 Runtime ARN で `get-resource-policy` を実行したところ、`AllowVerificationAgentInvoke` が存在し、Principal が `SlackAI-Verification-Dev-ExecutionRole`、Resource が当該 Runtime ARN と一致。  
  - **判定**: リソースポリシーは適用済み。

- **要因 3（Condition）**  
  - リソースポリシーの `aws:SourceAccount`: `"471112852670"`。  
  - `aws sts get-caller-identity` の Account: `471112852670`。  
  - **判定**: 一致。

3 要因いずれも問題なしと判断できる場合、AccessDenied の原因は別にある可能性がある（呼び出し時の Principal の相違、組織ポリシー・SCP、一時的な伝播遅延など）。その場合は Verification Runtime の本体ログの `invoke_execution_agent_failed` で AWS が返した `error_message` を確認し、必要に応じて AWS サポートまたはドキュメントの [Troubleshooting - Access denied errors](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/resource-based-policies.html#resource-based-policies-troubleshooting) を参照する。

#### 推奨アクション実施結果（実施例）

1. **Verification Runtime の本体ログ**  
   `/aws/bedrock-agentcore/runtimes/SlackAI_VerificationAgent_Dev-*-DEFAULT` で `invoke_execution_agent_failed` を検索したが、直近では該当イベントが取得できなかった（ログストリーム・保持期間の影響の可能性あり）。

2. **errors ログの確認**  
   `/aws/bedrock-agentcore/SlackAI-Verification-Dev-verification-agent-errors` を確認したところ、過去ログに **別環境 Runtime ARN（prod）を参照した呼び出し** の記録があった。  
   → **Dev の Verification が誤って prod 用 ARN を参照していた可能性**がある。その場合、dev 側で付与したリソースポリシーとは不一致になり AccessDenied になる。

3. **対応**  
   - **Verification-Dev の再デプロイ**: `cdk.config.dev.json` の `executionAgentArns`（`file-creator/docs/time/fetch-url`）が dev 用 ARN を指していることを確認したうえで、Verification スタック（Dev）を再デプロイし、Runtime の環境変数 `EXECUTION_AGENT_ARNS` が正しく設定されるようにする。  
   - **今後の切り分けのため**: `a2a_client` の変更により、AccessDenied 等で返す JSON に `execution_agent_arn` および `aws_error_code` / `aws_error_message` を含めるようにした。errors ログの `raw_response` で「実際に呼び出した ARN」と AWS の生エラーを確認できる。

---

## 処理フロー検証

デプロイ後のエンドツーエンド処理がどこまで正しく進んでいるかを確認する手順です。

### 1. 処理フロー（現行構成）

```
[Slack] メンション/メッセージ
    │
    ▼ [A] HTTPS POST (X-Slack-Signature)
[Slack Event Handler] Lambda (Function URL)
    │ 署名検証・Existence Check・ホワイトリスト・レート制限・重複排除
    │ → リアクション 👀 を付与して 200 返却
    ▼ [B] SQS SendMessage (agent-invocation-request)
[Agent Invoker] Lambda (SQS トリガー)
    │
    ▼ [C] InvokeAgentRuntime (Verification Agent)
[Verification Agent] AgentCore Runtime (コンテナ)
    │ pipeline: 存在確認・認可・レート制限 → エコー or Execution 呼び出し
    │
    ├─ エコーモード時: SQS (slack-post-request) に [Echo] 投稿依頼 → 終了
    │
    └─ 通常時: [D] InvokeAgentRuntime (Execution Agent)
              [Execution Agent] AgentCore Runtime
              → 結果を SQS (slack-post-request) に投稿依頼
    │
    ▼ [E] SQS SendMessage (slack-post-request)
[Slack Poster] Lambda (SQS トリガー)
    │
    ▼ [F] Slack API (chat.postMessage / files.upload_v2)
    │ 投稿成功後: リアクション 👀 を削除して ✅ を付与
    ▼
[Slack] スレッドに返信
```

| 経路 | 起点 | 終点 | 確認方法 |
|------|------|------|----------|
| A | Slack | Slack Event Handler | Slack でメンション → CloudWatch: `event_received`, `signature_verification_success` |
| B | Slack Event Handler | SQS (agent-invocation-request) | Lambda ログに SQS 送信成功、Agent Invoker が起動 |
| C | Agent Invoker | Verification Agent | Agent Invoker ログに `InvokeAgentRuntime` 成功 or エラー (424 等) |
| D | Verification Agent | Execution Agent | Verification Agent の AgentCore ログ |
| E | Verification Agent | SQS (slack-post-request) | Slack Poster Lambda が起動 |
| F | Slack Poster | Slack | Slack スレッドに投稿表示 |

---

### 2. 現状確認結果（デプロイ直後の例）

以下は **2026-02-08 時点** の確認例。環境に合わせてスタック名・リージョンを読み替える。

#### 2.1 スタック・リソース

| 確認項目 | コマンド例 | 結果例 |
|----------|------------|--------|
| Verification Stack 出力 | `aws cloudformation describe-stacks --stack-name SlackAI-Verification-Dev --region ap-northeast-1 --query 'Stacks[0].Outputs'` | SlackEventHandlerUrl, VerificationAgentRuntimeArn が出力される |
| Execution Stack 出力 | `aws cloudformation describe-stacks --stack-name SlackAI-FileCreator-Dev --region ap-northeast-1 --query 'Stacks[0].Outputs'` | FileCreatorAgentRuntimeArn が出力される（他に Time/Docs/WebFetch も同様） |
| Slack Event Handler 環境変数 | `aws lambda get-function-configuration --function-name <SlackEventHandler名> --query 'Environment.Variables'` | `VERIFICATION_AGENT_ARN`, `AGENT_INVOCATION_QUEUE_URL` が設定されている |
| SQS キュー | `aws sqs list-queues --queue-name-prefix SlackAI-Verification-Dev` | agent-invocation-request, slack-post-request, agent-invocation-dlq が存在 |

#### 2.2 ホワイトリスト（必須）

**重要**: ホワイトリストが空のままでは、Slack Event Handler の認可で **すべて 403** になる（fail-closed）。

```bash
# 件数確認（0 の場合は 1 件以上を追加する必要あり）
aws dynamodb scan --table-name SlackAI-Verification-Dev-whitelist-config --select COUNT --region ap-northeast-1
```

- **0 件**: 全リクエストが認可で拒否。`team_id` / `user_id` / `channel_id` を DynamoDB または Secrets Manager で設定する。
- 設定方法: [quickstart.md ステップ 3: ホワイトリストの設定](../quickstart.md#ステップ-3-ホワイトリストの設定必須)

#### 2.3 ログで見る「どこまで進んでいるか」

| 段階 | ロググループ例 | 見るイベント | 意味 |
|------|----------------|-------------|------|
| [A] Slack → Handler | `/aws/lambda/SlackAI-Verification-Dev-SlackEventHandler...` | `event_received`, `signature_verification_success` | Slack からリクエスト受信・署名 OK |
| | | `authorization_failed` / `existence_check_failed` | 認可または存在確認で 403 |
| | | SQS 送信ログ（実装次第） | Handler が SQS にメッセージを送った |
| [B]→[C] SQS → Agent Invoker | `/aws/lambda/SlackAI-Verification-Dev-AgentInvoker...` | `InvokeAgentRuntime` 呼び出し | Verification Agent を呼んでいる |
| | | `agent_invocation_failed` + **424** | Verification Agent が未起動 or 依存失敗 (Failed Dependency) |
| | | 正常時は 200 相当で終了 | Verification Agent が応答した |
| [D] Verification → Execution | AgentCore のログ (`/aws/bedrock-agentcore/...`) | Runtime 内ログ | pipeline 実行・Execution 呼び出し有無 |
| [E]→[F] Slack Poster | `/aws/lambda/SlackAI-Verification-Dev-SlackPoster...` | 起動ログ | slack-post-request キューからメッセージを受信し投稿処理 |

---

### 3. よくある停止ポイントと対処

#### 3.1 403 で返る（Slack に何も返らない / エラー）

- **署名検証失敗**: `SLACK_SIGNING_SECRET` が Slack アプリの Signing Secret と一致しているか確認。
- **ホワイトリスト認可失敗**: 上記のとおりホワイトリストが空だと全拒否。使用する `team_id` / `user_id` / `channel_id` を登録する。
- **Existence Check 失敗**: Bot Token のスコープ（`users:read`, `conversations:read` 等）と、実在するチーム・ユーザー・チャンネルか確認。

#### 3.2 デプロイスクリプトの「Runtime が ACTIVE にならない」

- **原因**: ステータス取得に **Data Plane** (`aws bedrock-agentcore`) を使っていたが、`get-agent-runtime` は **Control Plane** (`aws bedrock-agentcore-control`) にしかない。また Control Plane の状態値は **READY**（コンソールの Ready と一致）であり、**ACTIVE** ではない。
- **対応**: デプロイスクリプトでは `bedrock-agentcore-control get-agent-runtime --agent-runtime-id <ID>` で ARN から取り出した Runtime ID を渡し、ステータスが **READY** になるまで待つように変更済み。コンソールで Ready になっていれば、次回デプロイから検証で正しく READY と判定される。

#### 3.3 Agent Invoker で 424 (Failed Dependency)

- **意味**: InvokeAgentRuntime(Verification Agent) が失敗。Runtime またはその依存リソースが未準備・エラーの可能性。
- **確認**:
  - Verification Agent の AgentCore Runtime が **ACTIVE** になっているか（デプロイ直後は UNKNOWN のまま数分かかることがある）。
  - Runtime の環境変数（`EXECUTION_AGENT_ARNS`, DynamoDB テーブル名、Secrets Manager 名など）が正しいか。
  - AgentCore の CloudWatch ログでランタイム内エラーが出ていないか。
- **対処**: 数分待って再試行。それでも 424 の場合は Runtime のログと IAM/ネットワーク設定を確認。

#### 3.4 424 が出ずに「何も返ってこない」

- Execution Agent の呼び出し失敗や Bedrock モデル権限の可能性。
- Verification Agent の pipeline がエラーで SQS (slack-post-request) に送っていない可能性。
- AgentCore のログと Slack Poster のログの有無を確認。

#### 3.5 Slack Poster まで届いているが Slack に表示されない

- Slack Poster のログで `chat.postMessage` / `files.upload_v2` の成功・失敗を確認。
- Bot Token の `chat:write`, `files:write` 等のスコープと、チャンネルへの参加状況を確認。

---

### 4. クイック確認コマンド一覧

```bash
# リージョン
REGION=ap-northeast-1
STACK=SlackAI-Verification-Dev

# スタック出力（Function URL / Verification Agent ARN）
aws cloudformation describe-stacks --stack-name $STACK --region $REGION --query 'Stacks[0].Outputs'

# ホワイトリスト件数（0 なら要設定）
aws dynamodb scan --table-name ${STACK}-whitelist-config --region $REGION --select COUNT

# 直近の Slack Event Handler ログ（5 件）
aws logs filter-log-events --log-group-name /aws/lambda/${STACK}-SlackEventHandler898FE80E-eZpefJLA6NWi \
  --region $REGION --limit 5

# 直近の Agent Invoker ログ（5 件）
aws logs filter-log-events --log-group-name /aws/lambda/${STACK}-AgentInvokerHandler544912-08wKPdINAP3K \
  --region $REGION --limit 5

# 直近の Slack Poster ログ（5 件）
aws logs filter-log-events --log-group-name /aws/lambda/${STACK}-SlackPosterHandler2B7CB75-2FgtJnyEBcDi \
  --region $REGION --limit 5
```

Lambda の論理 ID は CDK のハッシュで末尾が変わるため、`aws lambda list-functions --query "Functions[?starts_with(FunctionName, '${STACK}')].FunctionName"` で実際の関数名を確認してからロググループを指定する。

---

### 5. まとめ：どこまで正しく進んでいるか

- **Slack → Slack Event Handler**: スタックと Lambda が存在し、ログに `event_received` / `signature_verification_success` が出ていればここまで正常。
- **Slack Event Handler → SQS → Agent Invoker**: Agent Invoker が起動し、ログに SQS 消費と `InvokeAgentRuntime` 呼び出しが出ていれば、Handler から Invocation まで到達している。
- **InvokeAgentRuntime(Verification Agent)**: 200 で返っていれば Verification Agent まで正常。**424** の場合は Runtime または依存の不備。
- **Verification Agent → Execution Agent / SQS**: AgentCore のログと、Slack Poster Lambda の起動有無で判断。
- **Slack Poster → Slack**: Slack Poster のログで投稿 API 成功していれば、処理は最後まで完了している。

ホワイトリスト未設定の場合は認可で 403。AgentCore が UNKNOWN/未起動の場合は 424 が出るため、まずホワイトリスト設定と Runtime の状態確認から行うとよい。

---

## 関連ドキュメント

- [アーキテクチャ](./architecture.md)
- [セキュリティ実装](./security.md)
- [運用 Runbook](./runbook.md)
- [クイックスタート](../quickstart.md)
