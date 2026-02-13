# Feature Specification: ベストプラクティス適用（Bedrock / Strands / AgentCore / AWS）

**Feature Branch**: `026-best-practices-alignment`
**Created**: 2026-02-11
**Status**: Draft
**Input**: User description: "Bedrock, Strands Agent, AgentCore, AWSなどの各レイヤーにおいてベストプラクティスを調査して適用。AWS MCPなどを使用"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bedrock セキュリティのベストプラクティス適用 (Priority: P1)

開発者として、Bedrock 関連のセキュリティベストプラクティス（HTTPS、最小権限、PII非含有、CMK暗号化の検討）をプロジェクトに適用し、運用時のセキュリティリスクを低減したい。

**Why this priority**: セキュリティは基盤であり、AWS公式ドキュメントが推奨する措置を採用することで、コンプライアンスと信頼性を確保できる。

**Independent Test**: IAMポリシーを確認し、Bedrock関連リソースに最小権限が適用されていること。HTTPSが全通信で使用されていることを確認する。

**Acceptance Scenarios**:

1. **Given** Bedrock API呼び出しが存在する, **When** 通信経路を確認する, **Then** すべてHTTPSで暗号化されている
2. **Given** IAMロールがBedrockを使用する, **When** 権限をレビューする, **Then** 必要なInvokeModel/InvokeAgentRuntimeのみが付与されている
3. **Given** エージェントリソースにユーザーデータが含まれる, **When** 運用を確認する, **Then** PIIが含まれるフィールドはCMK対応フィールドに限定される

---

### User Story 2 - AgentCore Runtime ベストプラクティス適用 (Priority: P1)

運用担当者として、AgentCore Runtime のセッション管理、リトライ、ライフサイクル設定、ペイロードサイズ制限などのベストプラクティスを適用し、安定した運用を実現したい。

**Why this priority**: InvokeAgentRuntime のエラーハンドリング、ストリーミング応答処理、ライフサイクル最適化は、本番環境の安定性に直結する。

**Independent Test**: Lambda/AgentInvoker が InvokeAgentRuntime を呼ぶ際に、セッションID、エラーハンドリング、リトライが適切に実装されていることを確認する。

**Acceptance Scenarios**:

1. **Given** InvokeAgentRuntime を呼び出す, **When** セッション管理が必要な場合, **Then** 適切な runtimeSessionId が使用される
2. **Given** ThrottlingException が発生する, **When** リトライを行う, **Then** 指数バックオフが適用される
3. **Given** AgentCore Runtime のライフサイクル設定, **When** ユースケースに応じて設定する, **Then** idleRuntimeSessionTimeout と maxLifetime が適切に設定される
4. **Given** ストリーミング応答を受け取る, **When** 処理する, **Then** インクリメンタルに処理され、ユーザーにリアルタイムフィードバックが提供される

---

### User Story 3 - Strands Agent ベストプラクティス適用 (Priority: P2)

開発者として、Strands Agents SDK の公式推奨パターン（モデルファースト設計、ツール定義の明確化、可観測性、MCP統合）を適用し、保守性と拡張性を高めたい。

**Why this priority**: Strands は AWS 公式推奨のエージェント SDK であり、ドキュメントに沿った実装により、SDK アップデートへの追従が容易になる。

**Independent Test**: Execution Agent の strands Agent 実装が、ツール定義の明確化、型付きパラメータ、可観測性（OpenTelemetry）の観点でベストプラクティスに準拠していることを確認する。

**Acceptance Scenarios**:

1. **Given** strands Agent がツールを持つ, **When** ツール定義を確認する, **Then** 各ツール・パラメータに明確な説明が付与されている
2. **Given** エージェントが本番で動作する, **When** トレースを確認する, **Then** OpenTelemetry でモデル呼び出し・ツール呼び出しが記録される
3. **Given** マルチモーダル入力がある, **When** 処理する, **Then** ContentBlock 形式でテキスト・画像・ドキュメントが適切に渡される

---

### User Story 4 - エンタープライズエージェントベストプラクティス適用 (Priority: P2)

プロダクトオーナーとして、AWS ブログ「AI agents in enterprises: Best practices with Amazon Bedrock AgentCore」で示された9つのベストプラクティスをプロジェクトに段階的に適用したい。

**Why this priority**: 本番級エージェントの構築には、明確なスコープ定義、計装、ツール戦略、評価自動化、マルチエージェント分解、セキュアなパーソナライズ、決定論的コードとの組み合わせ、継続的テスト、組織能力の構築が不可欠である。

**Independent Test**: 各ベストプラクティスに対して、適用状況をチェックリストで確認できる。

**Acceptance Scenarios**:

1. **Given** エージェントのスコープ, **When** ドキュメントを確認する, **Then** 担当範囲・非担当範囲が明確に定義されている
2. **Given** 本番エージェント, **When** 計装を確認する, **Then** 初日から OpenTelemetry トレースが有効である
3. **Given** ツールセット, **When** 戦略を確認する, **Then** ツールの目的・パラメータ・知識ソースが曖昧でない
4. **Given** リリース前, **When** 評価を確認する, **Then** 自動評価パイプラインまたはゴールドデータセットが存在する

---

### User Story 5 - AWS CDK / IaC ベストプラクティス適用 (Priority: P3)

インフラ担当者として、CDK のベストプラクティス（L2 コンストラクト、grant メソッド、暗号化デフォルト、リソース名の自動生成、状態管理とステートレス分離）を適用し、インフラの保守性を高めたい。

**Why this priority**: CDK は既に使用しているが、公式ベストプラクティスとの整合を取ることで、将来の拡張や監査に対応しやすくなる。

**Independent Test**: CDK スタックに対して cdk-nag や CDK ベストプラクティスチェックを実行し、違反がゼロまたは許容できる範囲であることを確認する。

**Acceptance Scenarios**:

1. **Given** CDK スタック, **When** コンストラクトを確認する, **Then** L2 コンストラクトを優先し、grant メソッドで権限を付与している
2. **Given** S3 / DynamoDB 等の stateful リソース, **When** 暗号化を確認する, **Then** デフォルトで暗号化が有効である
3. **Given** ロジカルID, **When** 変更履歴を確認する, **Then** ステートフルリソースのロジカルIDが変更されていない

---

### Edge Cases

- 複数 AWS リージョンへのデプロイ時、各リージョンの Bedrock モデル可用性を確認する必要がある
- Strands のバージョンアップ時に、破壊的変更がないかリリースノートを確認する
- AgentCore の新機能（例: 非同期タスク管理）は、既存の設計と整合するか評価してから採用する

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 全 Bedrock 通信は HTTPS を使用し、暗号化トランスポートを保証する
- **FR-002**: Bedrock / AgentCore 関連 IAM ポリシーは最小権限を適用する
- **FR-003**: エージェントリソースに PII を含める場合、CMK 対応フィールドに限定する
- **FR-004**: InvokeAgentRuntime 呼び出しに、セッション管理、エラーハンドリング、指数バックオフリトライを実装する
- **FR-005**: AgentCore Runtime のライフサイクル設定をユースケースに応じて最適化する（オプション）
- **FR-006**: Strands Agent のツール定義に、明確な説明と型付きパラメータを付与する
- **FR-007**: 本番エージェントに OpenTelemetry 等の可観測性を初日から組み込む
- **FR-008**: エージェントのスコープ・非スコープをドキュメント化する
- **FR-009**: CDK スタックは L2 コンストラクトと grant メソッドを優先する
- **FR-010**: ベストプラクティス適用のギャップ分析結果を research.md に記録する

### Key Entities

- **Best Practice Gap**: 推奨事項と現状実装の差分。対象レイヤー（Bedrock / Strands / AgentCore / CDK）、推奨内容、適用状況、優先度を持つ
- **Security Posture**: Bedrock / AgentCore のセキュリティ設定状態。HTTPS、IAM、PII、CMK の各項目の充足状況
- **Observability Configuration**: トレース、メトリクス、ログの設定状態

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: research.md に Bedrock / Strands / AgentCore / AWS の各レイヤーにおけるベストプラクティス調査結果が記録されている
- **SC-002**: P1 ベストプラクティス（セキュリティ、InvokeAgentRuntime）の 100% が適用されている
- **SC-003**: P2 ベストプラクティス（Strands、エンタープライズ）の 80% 以上が適用されている
- **SC-004**: 適用したベストプラクティスに対するチェックリストが存在し、デプロイ前検証に利用できる
- **SC-005**: 既存機能のリグレッションがゼロである

## Assumptions

- AWS MCP（aws-knowledge-mcp-server、aws-documentation-mcp-server、aws-iac-mcp-server）を利用して公式ドキュメントを調査する
- 既存のアーキテクチャ（Verification Zone / Execution Zone、strands A2AServer、Bedrock Converse）を維持する
- 025-slack-file-generation で導入予定の strands @tool パターンは、本 spec の Strands ベストプラクティスに含まれる
- ベストプラクティス適用は段階的に行い、既存動作を壊さない範囲で実施する

## Out of Scope

- Bedrock Guardrails の新規導入（既存の範囲を超える機能追加）
- マルチリージョン・マルチアカウントの拡張
- 新規 AWS サービスの追加（既存スタックの最適化に限定）
