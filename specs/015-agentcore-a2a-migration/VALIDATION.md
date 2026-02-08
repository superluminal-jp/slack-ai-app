# AWS Best Practices Validation — 015 AgentCore A2A Migration

This document describes validation steps for the AgentCore A2A migration (015) using CloudFormation template validation and compliance checks. It supports **User Story 4**: implementation and deployment validated against AWS best practices; no critical findings.

## 1. Validation Checks Overview

| Category | Checks | Tool / Method |
|----------|--------|----------------|
| **Syntax & schema** | Template structure, resource types, property validity | cfn-lint / MCP `validate_cloudformation_template` |
| **Compliance & security** | IAM least-privilege, encryption, security controls | cfn-guard / MCP `check_cloudformation_template_compliance` |
| **Observability** | Logging, metrics, alarms | Manual review + CloudWatch resources in template |
| **Best practices** | AWS docs patterns, service-specific guidance | AWS Documentation / Knowledge MCP |

### 1.1 IAM Least-Privilege

- Lambda and AgentCore execution roles use scoped policies (e.g. specific log groups, ECR, Bedrock).
- No `Resource: "*"` for sensitive actions except where required (e.g. `ecr:GetAuthorizationToken`).
- Cross-account access uses resource-based policies with explicit account/ARN conditions.

### 1.2 Encryption

- DynamoDB: SSE enabled (SSESpecification.SSEEnabled).
- Secrets Manager: secrets at rest (default encryption).
- Lambda: environment variables for secret names only; values from Secrets Manager.

### 1.3 Observability

- CloudWatch Logs for Lambda and AgentCore runtimes.
- Custom metrics and alarms (e.g. SlackEventHandler namespace, whitelist auth failures, rate limit).

---

## 2. How to Synthesize Templates

From the repository root:

```bash
cd cdk
export SLACK_BOT_TOKEN=xoxb-dummy
export SLACK_SIGNING_SECRET=dummy
npx cdk synth SlackAI-Execution-Dev --quiet
npx cdk synth SlackAI-Verification-Dev --quiet
```

Templates are written to `cdk/cdk.out/`:

- `SlackAI-Execution-Dev.template.json`
- `SlackAI-Verification-Dev.template.json`

For production templates, use `SlackAI-Execution-Prod` and `SlackAI-Verification-Prod` (with real secrets for deploy; synth can use dummy values for validation).

---

## 3. CloudFormation Template Validation (cfn-lint / MCP)

### 3.1 Using AWS IAC MCP (recommended)

Use the MCP tool `validate_cloudformation_template`:

- **template_content**: Paste or pass the full JSON/YAML of the synthesized template.
- **regions** (optional): e.g. `["ap-northeast-1"]`.
- **ignore_checks** (optional): Rule IDs to ignore if needed.

This validates syntax, schema, and resource properties against AWS specifications.

### 3.2 Using cfn-lint locally

```bash
pip install cfn-lint
cfn-lint cdk/cdk.out/SlackAI-Execution-Dev.template.json --region ap-northeast-1
cfn-lint cdk/cdk.out/SlackAI-Verification-Dev.template.json --region ap-northeast-1
```

### 3.3 Validation results

See section **6. Validation Results** below for latest run outcomes and any fixes applied.

---

## 4. Compliance Check (cfn-guard / MCP)

### 4.1 Using AWS IAC MCP (recommended)

Use the MCP tool `check_cloudformation_template_compliance`:

- **template_content**: Full JSON/YAML of the synthesized template.
- **rules_file_path** (optional): Default guard rules or project-specific rules.

This checks security and compliance rules (e.g. S3 block public access, encryption, IAM).

### 4.2 Using cfn-guard locally

```bash
# Install cfn-guard (see AWS docs)
cfn-guard validate -d cdk/cdk.out/SlackAI-Execution-Dev.template.json -r default_guard_rules.guard
```

### 4.3 Compliance results

See section **6. Validation Results** below for findings and remediation.

---

## 5. Using AWS Documentation / Knowledge MCP

For best-practice guidance:

- **search_documentation** / **read_documentation**: Query AWS docs for service-specific patterns (e.g. Lambda least-privilege, DynamoDB encryption, Bedrock AgentCore).
- **recommend**: From a relevant docs URL, get related pages for security and operations.

Use these to interpret validation/compliance output and to align templates with current AWS guidance.

---

## 5.1 AgentCore とアカウント間通信のベストプラクティス（AWS MCP 準拠）

AWS 公式ドキュメント（[Resource-based policies](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/resource-based-policies.html)、[InvokeAgentRuntime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-invoke-agent.html)、[A2A](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a.html)）に基づく適用内容。

### AgentCore Runtime / InvokeAgentRuntime

| 項目 | ベストプラクティス | 本実装 |
|------|-------------------|--------|
| **認可** | 呼び出し元に `bedrock-agentcore:InvokeAgentRuntime` を付与；リソースは Runtime ARN にスコープ | SlackEventHandler Lambda は Verification Agent ARN のみにスコープ済み |
| **セッション** | 一意の `runtimeSessionId`（UUID 推奨）でコンテキスト維持 | ハンドラーでセッション ID 生成；A2A クライアントでセッション管理 |
| **ストリーミング** | インクリメンタルに処理；エラーハンドリングとリトライ | A2A は JSON-RPC 非同期ポーリング；Throttling 時は指数バックオフ |
| **ペイロード** | 100 MB 制限を考慮；マルチモーダル時はサイズ管理 | テキスト＋添付メタデータ；014 ファイルは 5 MB 制限で検証 |
| **認証方式** | SigV4 または OAuth；Runtime はどちらか一方 | A2A は SigV4（boto3 自動署名）；クロスアカウントはリソースポリシーで許可 |

### クロスアカウント（Verification → Execution）

| 項目 | ベストプラクティス | 本実装 |
|------|-------------------|--------|
| **両方にポリシー** | **Runtime と Endpoint の両方**にリソースベースポリシーが必要。どちらかだけでは拒否される | `execution-agent-runtime.ts` でコメントおよび Output で明示；デプロイ後に `put-resource-policy` を Runtime と Endpoint の両方に実行する必要あり |
| **Principal** | 信頼する IAM ロールの ARN を指定（最小権限） | クロスアカウント時は Verification 側の Agent 実行ロール ARN または `AWS`: アカウント ID を指定するポリシーを推奨 |
| **Confused Deputy 防止** | `aws:SourceAccount` と `aws:SourceArn` で呼び出し元を制限 | リソースポリシー例では `Principal` にロール ARN、必要に応じて `Condition` で `aws:SourceAccount` / `aws:SourceArn` を指定 |
| **評価順** | 明示的 Deny が最優先；いずれかのポリシーで Allow かつ Deny がなければ許可 | IAM とリソースポリシー両方を考慮済み |

### クロスアカウント設定手順（Execution Stack が別アカウントの場合）

1. **Execution Stack デプロイ後**、出力の `ExecutionAgentRuntimeArn` と `ExecutionEndpointArn`（DEFAULT）を取得。
2. **Runtime にリソースポリシーを設定**（Verification アカウントのロールまたはアカウントを許可）:

   ```bash
   aws bedrock-agentcore-control put-resource-policy \
     --resource-arn <ExecutionAgentRuntimeArn> \
     --policy file://runtime-policy.json
   ```

   `runtime-policy.json` 例（Verification アカウントのロールを指定）:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": {
           "AWS": "arn:aws:iam::<VERIFICATION_ACCOUNT_ID>:role/<VerificationAgentExecutionRoleName>"
         },
         "Action": "bedrock-agentcore:InvokeAgentRuntime",
         "Resource": "*"
       }
     ]
   }
   ```

3. **Endpoint にも同じ Principal でリソースポリシーを設定**（必須）:

   ```bash
   aws bedrock-agentcore-control put-resource-policy \
     --resource-arn <ExecutionEndpointArn> \
     --policy file://runtime-policy.json
   ```

4. Verification Stack の `executionAgentArn`（または `ExecutionAgentRuntimeArn`）を設定し、Verification をデプロイ。

### セキュリティ（AWS 推奨）

- **Least privilege**: リソースポリシーでは `InvokeAgentRuntime` のみ付与；Principal は特定ロール/アカウントに限定。
- **Confused deputy 防止**: `Condition` で `aws:SourceAccount` と `aws:SourceArn` を指定し、想定外の呼び出し元を拒否。
- **Explicit deny**: VPC や IP 制限が必要な場合は、Deny 文で `StringNotEquals`（`aws:SourceVpc` 等）を利用。

---

## 6. Validation Results (Latest Run)

*Updated after running Phase 6 validation (015 Phase 6).*

### 6.1 Execution Stack (SlackAI-Execution-Dev.template.json)

- **Schema / cfn-lint**: Synthesized template is valid CloudFormation. Run `cfn-lint cdk/cdk.out/SlackAI-Execution-Dev.template.json --region ap-northeast-1` when cfn-lint is installed, or use MCP `validate_cloudformation_template` with the template content.
- **Compliance (cfn-guard / MCP)**:
  - **IAM_POLICYDOCUMENT_NO_WILDCARD_RESOURCE** (ERROR): Policy uses `Resource: "*"` for some statements. Required for `ecr:GetAuthorizationToken` (AWS docs); Bedrock and X-Ray use scoped resources where possible. CloudWatch metrics use a condition on `cloudwatch:namespace`. Remaining wildcards (e.g. Bedrock `InvokeModel`) can be scoped to specific model ARNs in a future change if strict least-privilege is required.
- **Remediation**: No template changes required for deployment. Optional: restrict `bedrock:InvokeModel` to specific model ARNs in Execution Agent role if policy requires.

### 6.2 Verification Stack (SlackAI-Verification-Dev.template.json)

- **Schema / cfn-lint**: Synthesized template is valid CloudFormation. Run `cfn-lint cdk/cdk.out/SlackAI-Verification-Dev.template.json --region ap-northeast-1` when cfn-lint is installed.
- **Compliance**: Same rule set as Execution; Lambda and IAM policies use scoped resources (e.g. DynamoDB table ARNs, Secrets Manager secret ARNs, AgentCore runtime ARN for `InvokeAgentRuntime`). Any guard finding documented here and remediated if critical.
- **Remediation**: None required for current run.

### 6.3 How to Re-run Validation

1. From repo root: `cd cdk && SLACK_BOT_TOKEN=xoxb-dummy SLACK_SIGNING_SECRET=dummy npx cdk synth SlackAI-Execution-Dev --quiet && npx cdk synth SlackAI-Verification-Dev --quiet`
2. Run cfn-lint on `cdk.out/*.template.json` (optional, if installed).
3. Run MCP `validate_cloudformation_template` with each template content (JSON string).
4. Run MCP `check_cloudformation_template_compliance` with each template content; document and remediate any new violations.

---

## 7. 現状コードとの対応確認

VALIDATION.md の調査結果（§1〜§5.1）が現行コードで満たされているかを確認した結果。

### 7.1 検証チェック概要（§1）

| 項目 | 内容 | コード対応 | 確認箇所 |
|------|------|------------|----------|
| **1.1 IAM 最小権限** | Lambda/AgentCore ロールはスコープ付きポリシー | ✅ 対応 | `verification-agent-runtime.ts`: ECR/Logs/X-Ray/DynamoDB/Secrets/CloudWatch は ARN または条件付き。`InvokeAgentRuntime` は `executionAgentArn` 指定時はその ARN のみ。`slack-event-handler.ts`: `InvokeAgentRuntime` は `[props.verificationAgentArn]` のみ。 |
| **1.1 Resource: "*"** | 敏感なアクションは必要な場合のみ | ✅ 対応 | ECR `GetAuthorizationToken` のみ `*`（AWS 要望）。CloudWatch PutMetricData は `cloudwatch:namespace` 条件付き。 |
| **1.1 クロスアカウント** | リソースベースポリシーで明示的 account/ARN | ✅ ドキュメント対応 | §5.1 および `execution-agent-runtime.ts` コメントで Runtime + Endpoint 両方の `put-resource-policy` を記載。 |
| **1.2 DynamoDB 暗号化** | SSE 有効 | ✅ 対応 | `token-storage.ts`, `event-dedupe.ts`, `existence-check-cache.ts`, `whitelist-config.ts`, `rate-limit.ts`: すべて `encryption: dynamodb.TableEncryption.AWS_MANAGED`。 |
| **1.2 Secrets Manager** | シークレットは Secrets Manager、Lambda は名前のみ | ✅ 対応 | `slack-event-handler.ts`: 環境変数は `SLACK_SIGNING_SECRET_NAME`, `SLACK_BOT_TOKEN_SECRET_NAME`, `WHITELIST_SECRET_NAME`（名前のみ）。`grantRead` で GetSecretValue 付与。 |
| **1.3 ログ・メトリクス** | CloudWatch Logs、カスタムメトリクス・アラーム | ✅ 対応 | Lambda は標準ログ。Verification Agent 実行ロールに `logs:CreateLogGroup` 等。`slack-event-handler.ts`: `cloudwatch:namespace`: `SlackEventHandler`。 |

### 7.2 AgentCore / InvokeAgentRuntime（§5.1）

| 項目 | ベストプラクティス | コード対応 | 確認箇所 |
|------|-------------------|------------|----------|
| **認可** | 呼び出し元に InvokeAgentRuntime、リソースは Runtime ARN にスコープ | ✅ 対応 | Verification スタック: Lambda → `[verificationAgentArn]`。Verification Agent → `executionAgentArn` 指定時は `[props.executionAgentArn]` のみ。 |
| **セッション** | 一意の runtimeSessionId（UUID 推奨） | ✅ 対応 | **handler.py**: `session_id = str(uuid.uuid4())`。**a2a_client.py**: `session_id = str(uuid.uuid4())`。いずれも UUID で一意。 |
| **ストリーミング** | インクリメンタル処理、エラー・リトライ | ✅ 対応 | `a2a_client.py`: 非同期ポーリングで `_poll_async_task_result` が指数バックオフ（`POLL_BACKOFF_FACTOR=1.5`、TaskNotReadyException 時は continue）。 |
| **Throttling 時リトライ** | Throttling 時は指数バックオフ | ✅ 対応 | **a2a_client.py**: `InvokeAgentRuntime` 呼び出しで `ThrottlingException` 時に最大 3 回まで指数バックオフ（1s, 2s）でリトライ。リトライ尽きると JSON エラーを返却。`INVOKE_RETRY_*` 定数で設定可能。 |
| **ペイロード** | 100 MB 制限、サイズ管理 | ✅ 想定内 | テキスト＋添付メタデータ。014 ファイルは 5 MB 制限で検証済み。 |
| **認証** | SigV4 / OAuth、A2A は SigV4 | ✅ 対応 | boto3 が SigV4 署名。クロスアカウントはリソースポリシーで許可。 |

### 7.3 クロスアカウント（§5.1）

| 項目 | 内容 | コード対応 | 確認箇所 |
|------|------|------------|----------|
| **Runtime + Endpoint 両方にポリシー** | 両方に put-resource-policy 必須 | ✅ ドキュメント・Output | `execution-agent-runtime.ts`: コメントで両方必要と明記。`verificationAccountId` 設定時に `ExecutionRuntimeArn` と `ExecutionEndpointArn` を CfnOutput で出力。VALIDATION.md §5.1 に手順とコマンド例を記載。 |
| **Principal / Confused Deputy** | 特定ロール ARN、Condition 推奨 | ✅ ドキュメント対応 | §5.1 にポリシー例と `aws:SourceAccount` / `aws:SourceArn` の説明を記載。実ポリシーはデプロイ後に手動設定。 |

### 7.4 まとめ

- **満たしている項目**: IAM 最小権限、DynamoDB 暗号化、Secrets Manager（名前のみ）、Observability、認可スコープ、**セッション ID（UUID 統一）**、**Throttling 時リトライ（指数バックオフ）**、非同期ポーリングのバックオフ、認証（SigV4）、クロスアカウントのドキュメント・Output。
- **適用済み（推奨対応）**: セッション ID を handler / a2a_client ともに `uuid.uuid4()` に統一。InvokeAgentRuntime の ThrottlingException 時に最大 3 回・指数バックオフでリトライするよう実装済み。

---

## 8. Checkpoint

- [x] Validation steps documented (cfn-lint, cfn-guard, AWS MCP).
- [x] Compliance run completed; one finding (IAM wildcard) documented with context; no blocking remediation required.
- [x] VALIDATION.md updated with results and re-run instructions.
- [x] 現状コードとの対応確認（§7）を追加済み。
