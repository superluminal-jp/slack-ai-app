# ベストプラクティス適用チェックリスト

**Feature Branch**: `026-best-practices-alignment`
**用途**: デプロイ前・PR レビュー時の検証

---

## Bedrock セキュリティ

| # | 項目 | 確認方法 | 合格基準 | 026 検証 |
|---|------|----------|----------|----------|
| B1 | HTTPS 使用 | 通信経路の確認 | 全 Bedrock 呼び出しが AWS SDK 経由（デフォルト HTTPS） | ✓ PASS |
| B2 | 最小権限 | IAM ポリシーのレビュー | Bedrock / AgentCore に必要な権限のみ付与 | ✓ PASS |
| B3 | PII 非含有 | エージェントリソースの確認 | アクション名・知識ベース名等に PII が含まれない | ✓ PASS |
| B4 | CMK（オプション） | 規制要件の確認 | 必要に応じて CMK を検討 | ドキュメント化済み |

**PII 検証詳細（B3）**: エージェント名は `SlackAI_VerificationAgent`, `SlackAI_ExecutionAgent`（一般名のみ）。Bedrock Agents のアクショングループ／知識ベースは未使用。AgentCore Runtime はコンテナベースでリソース名にユーザーデータを含めない。

---

## AgentCore Runtime

| # | 項目 | 確認方法 | 合格基準 | 026 検証 |
|---|------|----------|----------|----------|
| A1 | エラーハンドリング | agent-invoker のコード確認 | ValidationException, ResourceNotFoundException, AccessDeniedException, ThrottlingException を適切に処理 | ✓ PASS |
| A2 | Throttling リトライ | 実装確認 | 指数バックオフによるリトライが実装されている | ✓ PASS |
| A3 | セッション管理 | ユースケースに応じて | スレッド単位でコンテキストが必要な場合、runtimeSessionId を使用 | ✓ PASS |
| A4 | ペイロードサイズ | 設計・監視 | 100 MB 上限を超えない（マルチモーダル含む） | ドキュメント化済み |
| A5 | ライフサイクル（オプション） | CDK 設定確認 | ユースケースに応じて idleTimeout / maxLifetime を最適化 | オプション対応済み |

---

## Strands Agent

| # | 項目 | 確認方法 | 合格基準 | 026 検証 |
|---|------|----------|----------|----------|
| S1 | ツール定義の明確化 | 各 @tool の docstring 確認 | purpose、パラメータ、戻り値が明確に記述されている | ✓ PASS (T014: handle_message_tool docstring 適用) |
| S2 | 型付きパラメータ | ツールのシグネチャ確認 | 型ヒントが付与されている | ✓ PASS |
| S3 | 可観測性（オプション） | トレース設定確認 | OpenTelemetry または AgentCore トレースが有効 | ✓ PASS (T016: strands OTEL は N/A、structured ログ + AgentCore X-Ray で担保) |
| S4 | モデルファースト | アーキテクチャ確認 | モデルが推論・ツール選択を主導している | ✓ PASS |
| S5 | ContentBlock マルチモーダル | 024 ファイル添付フロー確認 | テキスト・画像・ドキュメントを Bedrock Converse 形式で渡す | ✓ PASS (T015: bedrock_client_converse の content block 形式検証済み) |

---

## エンタープライズ

| # | 項目 | 確認方法 | 合格基準 | 026 検証 |
|---|------|----------|----------|----------|
| E1 | スコープ定義 | ドキュメント確認 | エージェントの担当・非担当範囲が明記されている | ✓ PASS (T017: verification-agent/README.md, execution-agent/README.md) |
| E2 | 計装 | 初日からの計装 | トレース・メトリクス・ログが有効 | ✓ PASS (T018: 下記) |
| E3 | ツール戦略 | ツール定義の一貫性 | 目的・パラメータ・知識ソースが曖昧でない | ✓ PASS (T014 docstring, S1) |
| E4 | 評価（将来） | 自動評価の有無 | ゴールドデータセットまたは自動評価パイプラインの検討 | ドキュメント化済み (T019) |

**計装検証詳細（E2）**:
- **ログ**: 両エージェントで structured JSON ログ（level, event_type, service, component, timestamp, correlation_id）を CloudWatch Logs に出力
- **メトリクス**: CloudWatch `emit_metric()` でカスタムメトリクス（ExistenceCheckFailed, BedrockApiError 等）を送信
- **トレース**: AgentCore InvokeAgentRuntime 経由の A2A 呼び出しで AWS X-Ray が有効（Lambda → Verification Agent → Execution Agent）

---

## CDK / IaC

| # | 項目 | 確認方法 | 合格基準 | 026 検証 |
|---|------|----------|----------|----------|
| C1 | grant メソッド | スタック定義の確認 | 手動 IAM の代わりに grant*() を使用 | ✓ PASS (T020: 下記) |
| C2 | 暗号化 | S3 / DynamoDB の設定 | デフォルトで暗号化が有効 | ✓ PASS (T021: 下記) |
| C3 | リソース名 | 物理名のハードコード | 自動生成に任せている | ✓ PASS (T023: 下記) |
| C4 | removal policy | ステートフルリソース | 本番スタックでは RETAIN を検討 | ✓ PASS (T022: 下記) |
| C5 | cdk-nag（オプション） | ユーザー同意後 | AwsSolutionsChecks を適用し、違反を修正 | 未実施（T024: ユーザー同意必要） |

**C1 grant メソッド検証詳細（T020）**:
- **grant*() 使用箇所**: DynamoDB (grantReadWriteData, grantReadData), S3 (grantReadWrite, grantDelete), SQS (grantSendMessages, grantConsumeMessages), Secrets (grantRead), LogGroup (grantWrite)
- **addToPolicy 使用箇所**: ECR プル（ECS 用・リポジトリ参照なし）, CloudWatch Logs/X-Ray/Metrics, Bedrock InvokeModel, AgentCore InvokeAgentRuntime, Secrets Manager whitelist（カスタム ARN パターン）— grant が存在しない API のため addToPolicy が適切

**C2 暗号化検証詳細（T021）**:
- **S3**: file-exchange-bucket に `encryption: s3.BucketEncryption.S3_MANAGED`, `enforceSSL: true` ✓
- **DynamoDB**: 全 5 テーブル（token-storage, event-dedupe, existence-check-cache, whitelist-config, rate-limit）に `encryption: dynamodb.TableEncryption.AWS_MANAGED` ✓

**C3 リソース名検証詳細（T023）**:
- bucketName / tableName は `${stackName}-*` 形式でスタック名から導出。リテラル定数によるハードコードなし ✓

**C4 removal policy 検証詳細（T022）**:
- 全 DynamoDB テーブル・S3 バケットに `removalPolicy: cdk.RemovalPolicy.DESTROY` を明示（dev 向け）。本番環境では RETAIN を検討する旨を research.md に記載済み。

---

## リグレッション

| # | 項目 | 確認方法 | 合格基準 | 026 検証 |
|---|------|----------|----------|----------|
| R1 | 単体テスト | `pytest` 実行 | 全件パス | ✓ PASS (T025: execution-agent 110, verification-agent 93, agent-invoker 4, slack-event-handler 138) |
| R2 | CDK テスト | `npm test` 実行 | 全件パス | cdk.test.ts PASS。 execution-stack/cross-account/lifecycle は ENOSPC 等環境要因で要再実行 |
| R3 | E2E テスト | 存在する場合 | 全フローが検証される | 存在時は検証 |
