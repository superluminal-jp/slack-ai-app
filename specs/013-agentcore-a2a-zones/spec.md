# Feature Specification: AgentCore A2A ゾーン間通信

**Feature Branch**: `013-agentcore-a2a-zones`  
**Created**: 2026-02-07  
**Status**: Draft  
**Input**: User description: "Verification zone と execution zone にそれぞれ AWS AgentCore を配置し、A2Aによってやり取りを行うように修正。非同期処理もAgentCoreの機能を使用。セキュリティのベストプラクティスを適用し、アカウント間の通信は安全に。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Slack ユーザーが AI に質問し、AgentCore 経由で回答を受け取る (Priority: P1)

Slack ユーザーが @AI アプリ名でメンションして質問を投稿すると、Verification Zone の AgentCore エージェントがリクエストを受け取り、署名検証・認可を行った後、A2A プロトコルを通じて Execution Zone の AgentCore エージェントにタスクを委任する。Execution Zone のエージェントが Bedrock でAI 処理を実行し、結果を A2A レスポンスとして Verification Zone に返却する。Verification Zone のエージェントが Slack スレッドに回答を投稿する。

**Why this priority**: これがシステムのコアフローであり、全ユーザーが直接体験する機能。A2A 通信による新しいゾーン間連携が正常に動作することを最優先で検証する必要がある。

**Independent Test**: Slack から @AI メンションで質問を投稿し、AI の回答がスレッド内に表示されることを確認する。ゾーン間通信が A2A プロトコルで行われていることをログから検証可能。

**Acceptance Scenarios**:

1. **Given** Slack ユーザーが @AI アプリ名で質問を投稿した, **When** Verification Zone の AgentCore エージェントがリクエストを受信した, **Then** 署名検証・Existence Check・ホワイトリスト認可が実行され、即座にリアクション（👀）が表示される
2. **Given** Verification Zone のエージェントが検証を完了した, **When** A2A プロトコルで Execution Zone のエージェントにタスクを送信する, **Then** JSON-RPC 2.0 メッセージが Execution Zone に正常に到達し、タスクが開始される
3. **Given** Execution Zone のエージェントが Bedrock でAI 処理を完了した, **When** A2A レスポンスを Verification Zone に返却する, **Then** Verification Zone のエージェントが Slack API でスレッド内に回答を投稿する
4. **Given** エンドツーエンドのフローが完了した, **When** ユーザーが Slack スレッドを確認する, **Then** AI の回答が投稿されており、既存の応答品質と同等以上である

---

### User Story 2 - 長時間処理のリクエストが AgentCore の非同期機能で安定動作する (Priority: P1)

ユーザーが複数添付ファイル付きの複雑な質問を投稿した場合、Execution Zone の AgentCore エージェントが非同期タスクとして処理を開始し、バックグラウンドで Bedrock 呼び出し・添付ファイル処理を行う。ユーザーには即座にフィードバックを返し、処理完了後にスレッドへ回答を投稿する。

**Why this priority**: AgentCore の非同期処理機能を活用する主要なユースケース。Slack の 3 秒タイムアウト制約および処理に 30 秒以上かかるケースに対応するため、コアフローと同等に重要。

**Independent Test**: 複数画像添付ファイル付きの質問を投稿し、即座にリアクションが表示された後、数秒〜数十秒後に回答が投稿されることを確認する。AgentCore のヘルスチェックで `HealthyBusy` → `Healthy` の遷移をログから確認可能。

**Acceptance Scenarios**:

1. **Given** ユーザーが複数添付ファイル付きの質問を投稿した, **When** Execution Zone のエージェントが非同期タスクを開始した, **Then** 即座に A2A レスポンスでタスク受付を通知し、ユーザーにはリアクションが表示される
2. **Given** 非同期タスクが進行中である, **When** AgentCore Runtime のヘルスチェックが行われる, **Then** ステータスが `HealthyBusy` を返し、セッションが維持される
3. **Given** 非同期タスクが完了した, **When** 結果が A2A レスポンスとして Verification Zone に送信される, **Then** Slack スレッドに完全な回答が投稿される

---

### User Story 3 - クロスアカウント環境でゾーン間通信が安全に行われる (Priority: P2)

システム管理者が Verification Zone と Execution Zone を異なる AWS アカウントにデプロイした場合、A2A プロトコルによるゾーン間通信が AWS 認証（SigV4）で保護され、安全に動作する。通信経路は暗号化され、認証・認可が適切に行われ、不正アクセスが遮断される。

**Why this priority**: セキュリティ境界の強化はアーキテクチャ設計上の重要な目的であり、クロスアカウントでの安全な運用は本番環境の必須要件。ただし、コアフローが動作した後に検証する方が効率的。

**Independent Test**: 異なる AWS アカウントに各ゾーンをデプロイし、正常なリクエストが通過すること、無効な認証のリクエストが拒否されることを確認する。CloudTrail ログで認証イベントを検証可能。

**Acceptance Scenarios**:

1. **Given** Verification Zone と Execution Zone が異なる AWS アカウントにデプロイされている, **When** A2A プロトコルでゾーン間通信が行われる, **Then** AWS SigV4 認証により通信が保護され、リクエストが正常に処理される
2. **Given** 無効な認証情報でゾーン間通信が試みられた, **When** AgentCore Runtime が認証を検証する, **Then** リクエストが拒否され、セキュリティイベントがログに記録される
3. **Given** クロスアカウント環境でシステムが稼働している, **When** 管理者がセキュリティ監査を行う, **Then** 全てのゾーン間通信が暗号化（TLS）され、CloudTrail に記録されている

---

### User Story 4 - AgentCore エージェントの発見と能力広告が適切に機能する (Priority: P3)

各ゾーンの AgentCore エージェントが Agent Card を通じて自身の能力を公開し、他のエージェントが発見・利用できる。これにより、将来的なマルチエージェント拡張の基盤が整う。

**Why this priority**: A2A プロトコルの Agent Discovery 機能は将来の拡張性のために重要だが、現時点では 2 エージェント間の固定的な通信が主なユースケース。

**Independent Test**: 各エージェントの `/.well-known/agent-card.json` エンドポイントにアクセスし、正しいメタデータ（名前、説明、スキル、認証要件）が返されることを確認する。

**Acceptance Scenarios**:

1. **Given** Verification Zone の AgentCore エージェントが起動している, **When** Agent Card エンドポイントにアクセスする, **Then** エージェントの能力（署名検証、認可、タスク委任）が記述された Agent Card が返される
2. **Given** Execution Zone の AgentCore エージェントが起動している, **When** Agent Card エンドポイントにアクセスする, **Then** エージェントの能力（AI 処理、添付ファイル分析、マルチモーダル対応）が記述された Agent Card が返される

---

### Edge Cases

- Execution Zone の AgentCore エージェントがダウンしている場合、Verification Zone はどのようにユーザーに通知するか？→ A2A レスポンスのタイムアウト後、ユーザーフレンドリーなエラーメッセージをスレッドに投稿
- AgentCore セッションが 15 分のアイドルタイムアウトで終了した場合、次のリクエストはどうなるか？→ 新しいセッションが自動的に作成され、リクエストが正常に処理される
- A2A 通信中にネットワーク障害が発生した場合のリトライはどうなるか？→ AgentCore のビルトインリトライ機能 + カスタムリトライロジックで対応
- 同時に複数のリクエストが到着した場合、AgentCore のセッション分離はどう動作するか？→ 各リクエストが独立した microVM セッションで処理される
- SigV4 認証のクレデンシャルが期限切れになった場合はどうなるか？→ AWS SDK の自動クレデンシャルリフレッシュにより再取得される

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: システム MUST Verification Zone に Amazon Bedrock AgentCore Runtime エージェントを配置し、Slack からのリクエスト検証・認可・タスク委任の責務を担わせること
- **FR-002**: システム MUST Execution Zone に Amazon Bedrock AgentCore Runtime エージェントを配置し、Bedrock Converse API 呼び出し・添付ファイル処理・AI レスポンス生成の責務を担わせること
- **FR-003**: システム MUST ゾーン間通信に A2A（Agent-to-Agent）プロトコルを使用し、JSON-RPC 2.0 over HTTP で標準化された形式でメッセージ交換を行うこと
- **FR-004**: Execution Zone のエージェント MUST AgentCore の非同期タスク管理機能（`add_async_task` / `complete_async_task`）を使用して、長時間の AI 処理をバックグラウンドで実行すること
- **FR-005**: 各エージェント MUST Agent Card（`/.well-known/agent-card.json`）を公開し、自身の能力・スキル・認証要件を広告すること
- **FR-006**: ゾーン間の A2A 通信 MUST AWS SigV4 認証で保護されること（クロスアカウント環境を含む）
- **FR-007**: システム MUST 既存のセキュリティ機能（署名検証、Existence Check、ホワイトリスト認可、レート制限、プロンプトインジェクション検出、PII マスキング）を AgentCore エージェント内で維持すること
- **FR-008**: システム MUST AgentCore Runtime のセッション分離機能（microVM）を活用し、各ユーザーリクエストを独立した環境で処理すること
- **FR-009**: システム MUST 既存の SQS ベースの非同期フローを AgentCore の A2A 非同期レスポンスパターンに置き換え、アーキテクチャを簡素化すること
- **FR-010**: システム MUST AgentCore Runtime のビルトインオブザーバビリティ（エージェント推論ステップ、ツール呼び出し、モデルインタラクションのトレーシング）を有効にし、CloudWatch と統合すること
- **FR-011**: システム MUST 既存の API Gateway + Lambda 構成から AgentCore Runtime ベースの構成への移行において、エンドユーザーの体験に影響を与えないこと（後方互換性の維持）

### Key Entities

- **Verification Agent**: Verification Zone に配置される AgentCore エージェント。Slack リクエストの受信、多層セキュリティ検証（署名、Existence Check、ホワイトリスト、レート制限）、A2A 経由でのタスク委任、Slack への回答投稿を担う
- **Execution Agent**: Execution Zone に配置される AgentCore エージェント。A2A 経由でタスクを受信し、Bedrock Converse API 呼び出し、添付ファイル処理、スレッド履歴取得、AI レスポンス生成を担う
- **Agent Card**: A2A プロトコルの Agent Discovery メカニズム。各エージェントの名前、説明、バージョン、スキル、認証要件を記述した JSON メタデータ
- **A2A Task**: JSON-RPC 2.0 形式のメッセージで表現される、エージェント間のタスク委任単位。リクエストの送信、非同期処理、結果の返却を含む
- **AgentCore Session**: microVM で隔離された個別のエージェント実行環境。CPU、メモリ、ファイルシステムが独立し、セッション間のデータ汚染を防止する

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Slack ユーザーが質問を投稿してから AI の回答がスレッドに表示されるまでの平均応答時間が、現行システムと同等以下（変動幅 ±10% 以内）であること
- **SC-002**: ゾーン間の A2A 通信の成功率が 99.9% 以上であること（正常な認証を持つリクエストに対して）
- **SC-003**: 無効な認証情報によるゾーン間通信の試行が 100% 拒否され、セキュリティログに記録されること
- **SC-004**: AgentCore の非同期処理により、30 秒以上かかる AI 処理（複数添付ファイル、複雑な推論）においてもユーザーに 3 秒以内にフィードバック（リアクション）が返されること
- **SC-005**: クロスアカウント環境での全ゾーン間通信が TLS で暗号化され、CloudTrail に監査ログとして記録されること
- **SC-006**: 既存の全セキュリティ機能（署名検証、Existence Check、ホワイトリスト、レート制限、プロンプトインジェクション検出、PII マスキング）が AgentCore 移行後も 100% 動作し続けること
- **SC-007**: 同時に 10 件以上のリクエストが到着した場合、AgentCore のセッション分離により各リクエストが独立して処理され、クロスセッションのデータ漏洩が発生しないこと

## Assumptions

- Amazon Bedrock AgentCore Runtime は対象 AWS リージョン（現行システムのデプロイ先リージョン）で利用可能であること
- A2A プロトコルのクロスアカウント通信は AgentCore Runtime の SigV4 認証でサポートされていること
- 既存の DynamoDB テーブル（5 テーブル）、Secrets Manager シークレットは引き続き使用し、AgentCore エージェントからアクセスすること
- AgentCore Runtime のセッション分離（microVM）は、Lambda の同時実行モデルと同等以上のスケーラビリティを提供すること
- AgentCore Runtime は Python ベースのエージェントコードと互換性があり、既存のビジネスロジック（署名検証、Existence Check 等）を移植可能であること
- Slack からの Function URL エンドポイントは維持し、AgentCore Runtime エージェントへのルーティングに使用するか、AgentCore の Inbound Auth で Slack 署名検証を代替すること
- 非同期処理の結果通知は、現行の SQS ベースのパターンから A2A プロトコルのレスポンスパターンに移行すること
- AgentCore のコンサンプションベース料金は、現行の Lambda + API Gateway + SQS の合計コストと比較して許容範囲であること

## Scope & Boundaries

### In Scope

- Verification Zone への AgentCore Runtime エージェントの配置と設定
- Execution Zone への AgentCore Runtime エージェントの配置と設定
- ゾーン間 A2A プロトコル通信の実装
- AgentCore の非同期タスク管理機能の統合
- 既存セキュリティ機能の AgentCore エージェントへの移植
- クロスアカウント環境での SigV4 認証設定
- Agent Card の設計と公開
- AgentCore オブザーバビリティ（CloudWatch 統合）の設定
- 既存の API Gateway + SQS パターンから A2A パターンへの移行

### Out of Scope

- Slack API やスラッシュコマンドの変更（エンドユーザーインターフェースは不変）
- Bedrock モデルの変更やプロンプトエンジニアリングの修正
- 新しいセキュリティ機能の追加（既存機能の移植のみ）
- 3 つ以上のゾーン / エージェントへの拡張（将来の検討事項）
- AgentCore Gateway や AgentCore Identity の OAuth 連携（現時点では SigV4 のみ）
- UI / Slack アプリの設定変更

## Dependencies

- Amazon Bedrock AgentCore Runtime GA（利用可能であること）
- A2A プロトコルのクロスアカウント SigV4 認証サポート
- 現行の CDK スタック構成（VerificationStack / ExecutionStack）
- 既存の DynamoDB テーブル、Secrets Manager シークレット
- Python 3.11 ランタイム互換性
