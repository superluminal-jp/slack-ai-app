# Research: ベストプラクティス適用（Bedrock / Strands / AgentCore / AWS）

**Feature Branch**: `026-best-practices-alignment`
**Date**: 2026-02-11
**Source**: AWS MCP (aws-knowledge-mcp-server, aws-documentation-mcp-server, aws-iac-mcp-server)

---

## 1. Amazon Bedrock セキュリティベストプラクティス

### 参照
- [Preventative security best practice for agents](https://docs.aws.amazon.com/bedrock/latest/userguide/security-best-practice-agents.html)
- [Security, privacy, and responsible AI](https://aws.amazon.com/bedrock/security-privacy-responsible-ai/)

### Decision

以下の4項目を必須として適用する：

| 項目 | 推奨内容 | 現状 | 適用アクション |
|------|----------|------|----------------|
| セキュア接続 | HTTPS のみ使用 | AWS SDK はデフォルト HTTPS | 確認のみ。VPC Endpoint や PrivateLink の利用を検討 |

**HTTPS 検証結果（026 Phase 3）**: 全 Bedrock/AgentCore 呼び出し（agent-invoker, slack-event-handler, a2a_client, bedrock_client_converse）は boto3 経由。boto3 はデフォルトで HTTPS（TLS）を使用。`endpoint_url` や `use_ssl=False` の指定なし。✓ PASS
| 最小権限 | 必要な権限のみ付与 | IAM ロールは既存 | Bedrock / AgentCore の権限を最小化する IAM ポリシーレビュー |

**IAM レビュー結果（026 Phase 3）**: audit-iam-bedrock.md にて agent-invoker, slack-event-handler, verification-agent-runtime, execution-agent-runtime をレビュー。各ロールは必要なアクション（InvokeAgentRuntime, InvokeModel, GetAsyncTaskResult）のみを付与し、リソースは可能な限り ARN で限定。変更不要。✓ PASS
| PII 非含有 | エージェントリソースに PII を含めない | 不明 | アクション名・知識ベース名等に PII が含まれないよう確認 |
| CMK 暗号化 | エージェントセッション・リソースを CMK で暗号化 | デフォルト | 規制要件に応じて CMK 検討（オプション） |

**026 Phase 3 適用**: Execution Agent の Bedrock InvokeModel について、AWS ドキュメントでは `arn:aws:bedrock:region::foundation-model/model-id` によるリソーススコープが可能。CDK の `role.addToPolicy` で指定した場合、合成時に `*` に変換される挙動を確認。raw CloudFormation 利用時は上記 ARN でスコープ可能。現状は `*` のまま（必要な 2 アクションのみに限定）。

### Rationale

AWS 公式ドキュメントが明示する予防的セキュリティ対策であり、コンプライアンスとインシデントリスク低減に直結する。

### Alternatives Considered

| Alternative | Rejected Because |
|-------------|------------------|
| セキュリティ強化を後回し | 本番運用前に適用すべき必須項目 |
| 全項目を CMK 化 | 規制要件がなければ AWS 管理キーで十分な場合がある |

---

## 2. Amazon Bedrock AgentCore Runtime ベストプラクティス

### 参照
- [Invoke an AgentCore Runtime agent](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-invoke-agent.html)
- [Configure lifecycle settings](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-lifecycle-settings.html)
- [Host agent or tools with AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agents-tools-runtime.html)

### Decision

InvokeAgentRuntime の利用において、以下を適用する：

| 項目 | 推奨内容 | 現状 | 適用アクション |
|------|----------|------|----------------|
| セッション管理 | runtimeSessionId で会話コンテキスト維持 | 非同期呼び出しのためセッション不使用 | スレッド単位でセッション維持が必要なユースケースがあれば検討 |
| ストリーミング | インクリメンタルに処理 | 同期/非同期どちらか | 応答が長い場合はストリーミング検討 |
| エラーハンドリング | ValidationException, ResourceNotFoundException, AccessDeniedException, ThrottlingException を適切に処理 | 部分実装 | 指数バックオフによるリトライを ThrottlingException に追加 |
| ペイロードサイズ | 100 MB 上限を考慮 | 既存制限内 | マルチモーダル（画像・ファイル）で超過しないよう監視 |
| ライフサイクル | idleRuntimeSessionTimeout, maxLifetime をユースケースに応じて設定 | デフォルト | インタラクティブ・バッチ・ dev などで最適化検討 |

### Lifecycle Configuration 推奨値（AgentCore ドキュメント）

| ユースケース | idleRuntimeSessionTimeout | maxLifetime | 備考 |
|--------------|---------------------------|-------------|------|
| インタラクティブチャット | 300–600 sec | 3600–7200 sec | 短いアイドルでコスト削減 |
| バッチ処理 | 900 sec | 28800 sec | デフォルト |
| 開発環境 | 60–120 sec | 600–900 sec | 早めのクリーンアップ |
| 本番 API | 300–600 sec | 3600 sec | バランス |

**026 Phase 4 適用**: `VerificationAgentRuntime` と `ExecutionAgentRuntime` にオプションの `lifecycleConfiguration` プロパティを追加。指定しない場合はプラットフォームデフォルト（idle 900 sec, max 28800 sec）を使用。Slack のリクエスト・レスポンス型フローではデフォルトで十分なため、現時点ではオプション指定不要。

### Rationale

InvokeAgentRuntime の公式ベストプラクティスに準拠することで、スロットリング・ネットワーク障害時の耐障害性が向上する。

---

## 3. Strands Agents ベストプラクティス

### 参照
- [Strands Agents - AWS Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-frameworks/strands-agents.html)
- [Introducing Strands Agents](https://aws.amazon.com/blogs/opensource/introducing-strands-agents-an-open-source-ai-agents-sdk/)
- [Strands Agents SDK: Technical deep dive](https://aws.amazon.com/blogs/machine-learning/strands-agents-sdk-a-technical-deep-dive-into-agent-architectures-and-observability/)

### Decision

Strands 利用において、以下を適用する：

| 項目 | 推奨内容 | 現状 | 適用アクション |
|------|----------|------|----------------|
| モデルファースト | モデルが推論・計画・ツール選択を主導 | strands Agent 使用中 | 025 で @tool パターン導入予定。維持 |
| ツール定義の明確化 | 各ツール・パラメータに曖昧でない説明 | 025 でツール追加予定 | ツール docstring とパラメータ説明を日本語で明確化 |
| マルチモーダル | ContentBlock でテキスト・画像・ドキュメントを渡す | 024 で実装済み | 025 の file generation でも同様に維持 |
| 可観測性 | OpenTelemetry トレース | 要確認 | strands の OTEL 統合を有効化（T016 調査結果を参照） |
| MCP 統合 | リモート MCP サーバー利用 | 現状なし | 将来の拡張候補 |
| AWS サービス統合 | Bedrock, Lambda, Step Functions 等 | Bedrock 使用中 | 継続 |

**026 Phase 5 T015: ContentBlock フォーマット検証結果**

Execution Agent は strands Agent クラスを用いず、Bedrock Converse API を直接呼び出している。024 ファイル添付フローでは `bedrock_client_converse.py` が以下の ContentBlock 形式を使用：

| 種別 | Converse API 形式 | 実装箇所 |
|------|-------------------|----------|
| テキスト | `{"text": "..."}` | `invoke_bedrock()` の `content` 配列 |
| ドキュメント | `{"document": {"name", "format", "source": {"bytes"}}}` | `prepare_document_content_converse()` |
| 画像 | `{"image": {"format", "source": {"bytes"}}}` | `prepare_image_content_converse()` |

Strands の ContentBlock と Bedrock Converse API の content block は同一概念。本プロジェクトでは Converse API を直接利用しているため、Strands SDK の ContentBlock ではなく Bedrock の仕様に準拠しており、024 マルチモーダルフローは適切に実装済み。✓ PASS

**026 Phase 5 T016: OpenTelemetry 調査結果**

Strands Agents SDK は OpenTelemetry をサポート（`pip install 'strands-agents[otel]'`）。`StrandsTelemetry().setup_otlp_exporter()` / `setup_console_exporter()` でトレースを有効化可能。ただし、**Execution Agent は strands Agent クラスを使用していない**（FastAPI + Bedrock Converse API 直接呼び出し）。このため strands の OTEL 自動計装は適用されない。

| 選択肢 | 内容 | 現状 |
|--------|------|------|
| strands OTEL | strands Agent クラス利用時に自動計装 | Execution Agent は strands Agent 非使用のため N/A |
| 手動 OTEL | opentelemetry-sdk で spans を手動計装 | 将来的な検討候補 |
| AgentCore トレース | InvokeAgentRuntime 経由時の X-Ray トレース | 既存（Verification Agent → Execution Agent A2A 経路） |

**推奨**: 現時点では strands OTEL は「strands Agent クラスに移行した場合」の対応としてドキュメント化。Execution Agent の可観測性は既存の structured JSON ログ（correlation_id, event_type）および AgentCore 経由時の X-Ray で担保。本番でより詳細なトレースが必要になった場合、opentelemetry-sdk の手動計装または strands Agent クラスへの移行を検討。

### Rationale

Strands は AWS 公式推奨のエージェント SDK であり、Prescriptive Guidance に沿った実装により、SDK アップデートや AWS サポートとの整合が取りやすくなる。

---

## 4. エンタープライズ AI エージェントベストプラクティス（AWS ブログ）

### 参照
- [AI agents in enterprises: Best practices with Amazon Bedrock AgentCore](https://aws.amazon.com/blogs/machine-learning/ai-agents-in-enterprises-best-practices-with-amazon-bedrock-agentcore/) (2026-02-03)

### Decision

ブログで示された9つのベストプラクティスを、プロジェクトに段階的に適用する：

| # | ベストプラクティス | 適用状況 | 優先アクション |
|---|-------------------|----------|----------------|
| 1 | Start small and define success clearly | 部分的 | エージェントスコープ・非スコープを spec / README に明記 |
| 2 | Instrument everything from day one | 要確認 | OpenTelemetry の有効化。AgentCore のトレースを確認 |
| 3 | Build a deliberate tooling strategy | 025 で対応 | ツールの目的・パラメータ・知識ソースを明確化 |
| 4 | Automate evaluation from the start | 未実施 | ゴールドデータセットまたは自動評価パイプラインの検討 |
| 5 | Decompose complexity with multi-agent systems | 実装済み | Verification / Execution の分離は維持 |
| 6 | Scale securely with personalization | 将来 | パーソナライズ要件が出た時点で検討 |
| 7 | Combine agents with deterministic code | 実装済み | ツール内の決定論的ロジック（ファイル生成等）は維持 |
| 8 | Establish continuous testing practices | 部分的 | E2E テストの自動化（021 で言及）を推進 |
| 9 | Build organizational capability | ドキュメント | 本 research.md と plan.md を知識ベースとして活用 |

### Rationale

AWS のエンタープライズ顧客向け知見に基づく実践であり、プロトタイプから本番級エージェントへの移行に必要な要素を網羅している。

---

## 5. AWS CDK ベストプラクティス

### 参照
- [AWS IaC MCP: cdk_best_practices](mcp_aws-iac-mcp-server)

### Decision

CDK 開発において、以下を適用する：

| 項目 | 推奨内容 | 適用アクション |
|------|----------|----------------|
| コンストラクト選択 | L2 を優先、L1 は避ける | 既存スタックを L2 中心で確認 |
| 権限付与 | grant*() メソッドを使用 | 手動 IAM ポリシー作成を grant に置き換え |
| リソース名 | 自動生成に任せる | 物理名のハードコードを排除 |
| 暗号化 | デフォルトで有効化 | S3, DynamoDB 等の暗号化設定を確認 |
| 設定 | プロパティで渡す | 環境変数への過度な依存を避ける |
| ステートフル/ステートレス | 分離してスタック化 | 継続保護の検討 |
|  removal policy | 明示的に設定 | 本番では RETAIN、dev では DESTROY 等 |
| テスト | インフラのユニットテスト | Template.fromStack でアサーション |
| cdk.context.json | コミットする | 決定論的デプロイのため |

### Rationale

CDK 公式ベストプラクティスに準拠することで、インフラの保守性・監査対応が向上する。

---

## 6. ギャップ分析サマリ

### 適用優先度マトリクス

| レイヤー | P1（必須） | P2（推奨） | P3（検討） |
|----------|------------|------------|------------|
| Bedrock | HTTPS確認、最小権限、PII非含有 | CMK 検討 | Guardrails |
| AgentCore | エラーハンドリング、Throttling リトライ | セッション管理、ライフサイクル最適化 | ストリーミング最適化 |
| Strands | ツール定義明確化（025 と併せて） | OpenTelemetry、モデルファースト維持 | MCP 統合 |
| エンタープライズ | スコープ定義、計装 | 評価自動化、継続的テスト | 組織能力 |
| CDK | grant メソッド、暗号化確認 | リソース名、removal policy | cdk-nag |

### 参照 URL 一覧

- Bedrock セキュリティ: https://docs.aws.amazon.com/bedrock/latest/userguide/security-best-practice-agents.html
- AgentCore InvokeAgentRuntime: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-invoke-agent.html
- AgentCore ライフサイクル: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-lifecycle-settings.html
- Strands Prescriptive Guidance: https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-frameworks/strands-agents.html
- エンタープライズ BP: https://aws.amazon.com/blogs/machine-learning/ai-agents-in-enterprises-best-practices-with-amazon-bedrock-agentcore/
