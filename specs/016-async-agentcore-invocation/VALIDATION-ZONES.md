# Validation Zone / Execution Zone 検証レポート

**実施日**: 2026-02-08  
**目的**: AWS MCP および AWS ドキュメントに基づき、Validation Zone（Verification Stack）と Execution Zone（Execution Stack）の構成がベストプラクティスに従い、動作可能な状態であることを確認する。

---

## 1. 状況確認サマリ

| 項目 | Verification Zone | Execution Zone |
|------|-------------------|----------------|
| スタック | SlackAI-Verification-Dev | SlackAI-Execution-Dev |
| リージョン | ap-northeast-1 | ap-northeast-1 |
| 主要リソース | Lambda (SlackEventHandler, Agent Invoker), SQS, DynamoDB x5, Secrets Manager, AgentCore Runtime (Verification Agent) | AgentCore Runtime (Execution Agent), IAM Role |
| ゾーン間通信 | A2A のみ（Execution Agent を InvokeAgentRuntime で呼び出し） | 受信のみ（Verification Agent からの A2A） |

- **CDK synth**: 成功（`cdk synth` で両スタックの CloudFormation テンプレートを生成済み）。
- **リージョン提供状況**: ap-northeast-1 で **Amazon Bedrock AgentCore** および **Amazon Bedrock** は利用可能（AWS Knowledge MCP で確認）。

---

## 2. Verification Zone（検証ゾーン）の精査

### 2.1 構成とベストプラクティス

- **SlackEventHandler Lambda**
  - Function URL: `AuthType: NONE`（署名検証は Lambda 内で実施）— ドキュメント通り。
  - タイムアウト: 120 秒（A2A/非同期応答待ちを考慮）。
  - シークレット: Secrets Manager 参照（名前のみ環境変数、値はランタイムで取得）— ベストプラクティス準拠。
- **Agent Invoker Lambda**
  - SQS `agent-invocation-request` をトリガーに InvokeAgentRuntime(Verification Agent) を実行。
  - タイムアウト: 900 秒（長時間エージェント実行に対応）。
- **SQS (agent-invocation-request)**
  - **修正実施**: visibility timeout を 900 秒 → **5400 秒** に変更。
  - 理由: [AWS SQS + Lambda ベストプラクティス](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-configure-lambda-function-trigger.html) では、キューの visibility timeout を **Lambda のタイムアウトの 6 倍以上**に設定することが推奨されている。Agent Invoker が 900 秒のため、5400 秒（6 × 900）に合わせた。
  - DLQ あり、`maxReceiveCount: 3`、メッセージ保持 14 日 — 問題なし。
- **DynamoDB**
  - 全テーブルで SSE 有効。TTL は event-dedupe / existence-check-cache / rate-limit で設定 — 問題なし。
- **CloudWatch Alarms**
  - WhitelistAuthorizationFailure, WhitelistConfigLoadError, ExistenceCheckFailed, RateLimitExceeded — 検証層の監視として妥当。
- **AgentCore Runtime (Verification Agent)**
  - `AWS::BedrockAgentCore::Runtime`: ProtocolConfiguration A2A、NetworkMode PUBLIC、ContainerConfiguration — CloudFormation リファレンスと一致。
  - IAM: ECR / CloudWatch Logs / X-Ray / CloudWatch Metrics（namespace 制限）/ DynamoDB（5 テーブル）/ Secrets Manager / bedrock-agentcore:InvokeAgentRuntime, GetAsyncTaskResult — 最小権限の範囲で妥当。

### 2.2 コンプライアンス（cfn-guard）

- テンプレートを cfn-guard（aws-security）でチェックした際、**IAM ポリシーの `Resource: "*"`** に起因するルール違反が検出される場合がある。
- ECR の `GetAuthorizationToken`、Bedrock の `InvokeModel` 等は AWS の仕様上リソース ARN を特定できないため `*` が一般的。本構成では意図的な設計として許容し、必要に応じてルールの例外設定を検討する。

---

## 3. Execution Zone（実行ゾーン）の精査

### 3.1 構成とベストプラクティス

- **AgentCore Runtime (Execution Agent)**
  - `AWS::BedrockAgentCore::Runtime`: AgentRuntimeName, RoleArn, ProtocolConfiguration A2A, AgentRuntimeArtifact.ContainerConfiguration, NetworkConfiguration.NetworkMode PUBLIC — [CloudFormation リファレンス](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-bedrockagentcore-runtime.html) および [A2A デプロイガイド](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a.html)（port 9000、SigV4）と整合。
- **IAM Execution Role**
  - ECR（イメージ取得）、CloudWatch Logs、X-Ray、CloudWatch Metrics（namespace: bedrock-agentcore）、Bedrock InvokeModel / InvokeModelWithResponseStream — 実行ゾーンに必要な権限に限定。
- **クロスアカウント**
  - `verificationAccountId` を指定した場合、Execution Runtime および Endpoint の ARN を Output し、デプロイ後に `put-resource-policy` で検証アカウントを許可する手順がコメントおよびドキュメントで明示されている — ベストプラクティス通り。

### 3.2 コンプライアンス

- 同上、IAM の `Resource: "*"` による警告がでる可能性があるが、ECR/Bedrock の仕様上許容範囲とする。

---

## 4. CDK ベストプラクティスとの照合

- **リソース名**: 物理名をハードコードせず、CDK の自動生成名を使用（スタック名プレフィックスのみ固定）— 問題なし。
- **設定**: プロパティとコンテキストで注入し、環境変数はアプリトップレベルに限定 — 問題なし。
- **権限**: `grant*()` および必要最小限の `addToRolePolicy` — 問題なし。
- **スタック分離**: 検証ゾーンと実行ゾーンを別スタックに分離し、クロスアカウント対応 — 推奨構成と一致。
- **削除ポリシー**: 機密データを持つ Secrets 等は Delete、ログは Retain など適切に設定 — 問題なし。

---

## 5. 実施した修正

| 対象 | 変更内容 |
|------|----------|
| Verification Stack | SQS `agent-invocation-request` の **visibility timeout** を 900 秒 → **5400 秒** に変更（AWS SQS+Lambda ベストプラクティスに準拠）。 |

---

## 6. 結論

- **Validation Zone** と **Execution Zone** の構成は、AWS ドキュメントおよび CDK ベストプラクティスに沿っており、**動作する状態**であると判断できる。
- 上記のとおり、SQS の visibility timeout を 5400 秒に変更する修正を 1 件実施済み。
- デプロイ前の最終確認には、CloudFormation の変更セットを用いた [Pre-deployment validation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-pre-deploy-validation.html) の利用を推奨する。

---

## 参照

- [Configuring an Amazon SQS queue to trigger an AWS Lambda function](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-configure-lambda-function-trigger.html)
- [Deploy A2A servers in AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a.html)
- [AWS::BedrockAgentCore::Runtime](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-bedrockagentcore-runtime.html)
- プロジェクト: `docs/reference/architecture/overview.md`, `zone-communication.md`
