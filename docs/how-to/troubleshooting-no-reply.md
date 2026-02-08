# メンションしても返事が返ってこないときの確認手順

エコーモード有効（018）で dev にデプロイしたあと、Slack でメンションしても返信がこない場合のチェックリストです。

## 1. Slack Event Subscriptions の確認（最優先）

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

## 2. Lambda にリクエストが届いているか（CloudWatch）

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

## 3. どこまで処理が進んでいるか（ログパターン）

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

**Verification Agent (Runtime)** のログ（エコーモード時）：

- ロググループは `/aws/bedrock-agentcore/` 以下。マネジメントコンソールの **CloudWatch → ロググループ** で `SlackAI_VerificationAgent` や `VerificationAgent` を含むものを開く。
- `echo_mode_response` が出ていれば、Runtime 側でエコー処理まで実行している。

---

## 4. よくある原因のまとめ

| 症状 | 確認すること |
|------|----------------|
| ログに何も出ない | Event Subscriptions の Request URL がデプロイ後の Function URL と一致しているか |
| Request URL が Verified にならない | Signing Secret が CDK/Secrets Manager と Slack アプリの「Signing Secret」が一致しているか |
| `existence_check_failed` | Slack Bot Token のスコープ（`users:read`, `conversations:read` 等）と実在する channel/user/team か |
| `whitelist_authorization_failed` | 使用している team_id / channel_id / user_id がホワイトリストに含まれているか |
| `sqs_enqueue_success` は出るが返信がない | Agent Invoker のログで `agent_invocation_success` の有無、Runtime のログで `echo_mode_response` の有無を確認 |

---

## 5. Agent Invoker が 424 で失敗する場合（InvokeAgentRuntime）

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

## 6. 今回の dev デプロイで使った URL

エコーモード有効でデプロイした直後の **Slack Event Handler (Lambda) の Function URL** は以下です。Slack の Request URL は必ずこれに合わせてください。

```
https://gzqk7e3d5nxyzy5k2cinwjzjrm0icnak.lambda-url.ap-northeast-1.on.aws/
```

再デプロイすると URL が変わる場合があるので、その都度デプロイ出力の `SlackEventHandlerUrl` を確認してください。

---

## まとめ（メンションに返信がこないとき）

1. **Slack** → Request URL が正しいか・`app_mentions` 購読・Bot をチャンネルに招待。
2. **Lambda** → ログに `event_callback_received` と `sqs_enqueue_success` が出ていれば、Lambda は正常に SQS まで送れている。
3. **Agent Invoker** → ログに `agent_invocation_failed` と **424** が出ている場合は、**Verification Agent Runtime の起動待ち**の可能性が高い。数分待ってから再試行する。
4. **Runtime** → ログに `echo_mode_response` が出ていれば、エコー処理まで到達している。出ていなければ Runtime がまだ受け付けていないか、環境変数・ペイロードの不備を疑う。
