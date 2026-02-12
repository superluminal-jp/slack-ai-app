# Feature Specification: Fix A2A Protocol Routing for AgentCore Runtime

**Feature Branch**: `020-fix-a2a-routing`
**Created**: 2026-02-08
**Status**: Draft
**Input**: User description: "424エラーについて、troubleshooting-424-agentcore.md を参照して対応を適用。公式推奨の対策を実施。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Slack ユーザーがメッセージを送信し、Verification Agent が応答する (Priority: P1)

Slack ユーザーが Slack チャンネルでボットにメンションすると、メッセージが Verification Zone の AgentCore Runtime に到達し、正常に処理される。現在は AgentCore Runtime への呼び出しが全件 424 エラーで失敗しており、ユーザーには一切の応答が返らない。

**Why this priority**: 全機能がブロックされている根本原因の修正。AgentCore Runtime にリクエストが到達しないため、エコーモード・AI 処理の両方が不能。

**Independent Test**: Slack からボットにメンションし、エコーモードで "[Echo] {テキスト}" が返ることを確認する。

**Acceptance Scenarios**:

1. **Given** Verification Agent Runtime が起動中かつエコーモードが有効, **When** AgentCore の InvokeAgentRuntime API でリクエストを送信する, **Then** 424 エラーではなく正常なレスポンスが返る
2. **Given** Verification Agent Runtime が起動中, **When** Agent Card エンドポイントにアクセスする, **Then** 従来通り 200 OK でエージェントカードが返る（回帰なし）
3. **Given** Verification Agent Runtime が起動中, **When** ヘルスチェックエンドポイントにアクセスする, **Then** 正常なステータスが返る（回帰なし）

---

### User Story 2 - Execution Agent が Verification Agent からのリクエストを受信する (Priority: P2)

Verification Agent がエコーモードを無効にして動作する場合、Execution Agent にリクエストを転送する。Execution Agent も同様の A2A ルーティング問題を抱えており、リクエストが到達しない。

**Why this priority**: エンドツーエンドの AI 処理フローに必要。エコーモードでの P1 検証後に必要となる。

**Independent Test**: Execution Agent の AgentCore Runtime に直接リクエストを送信し、正常なレスポンスが返ることを確認する。

**Acceptance Scenarios**:

1. **Given** Execution Agent Runtime が起動中, **When** InvokeAgentRuntime API でリクエストを送信する, **Then** 正常なレスポンスが返る（424/502 エラーではない）
2. **Given** Execution Agent Runtime が起動中, **When** Agent Card エンドポイントにアクセスする, **Then** 200 OK でエージェントカードが返る（現在は 502 エラー）

---

### User Story 3 - 運用者がコンテナログで処理状況を確認できる (Priority: P3)

運用者が CloudWatch Logs でコンテナのアプリケーションログを確認できる。現在はリクエストがアプリケーションコードに到達しないため、ログが一切出力されない。

**Why this priority**: 運用・トラブルシューティングに必要だが、ルーティング修正の結果として自然に解消される。

**Independent Test**: AgentCore Runtime にリクエストを送信後、CloudWatch Logs でアプリケーションログが出力されていることを確認する。

**Acceptance Scenarios**:

1. **Given** 修正後の Agent Runtime にリクエストが送信される, **When** CloudWatch Logs を確認する, **Then** アプリケーションレベルのログが記録されている

---

### Edge Cases

- Agent Runtime のコールドスタート中にリクエストが到着した場合、ヘルスチェック通過後にリクエストが処理されること
- 不正な JSON ペイロードが送信された場合、424 ではなくアプリケーション側で適切なエラーレスポンスが返ること
- 複数の同時リクエストが到着した場合、全件が正常にルーティングされること

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Verification Agent Runtime は、A2A プロトコルのルートパス（POST `/`）でリクエストを受信できなければならない
- **FR-002**: Verification Agent Runtime は、Agent Card（GET `/.well-known/agent-card.json`）とヘルスチェック（GET `/ping`）の既存エンドポイントが引き続き動作しなければならない
- **FR-003**: Execution Agent Runtime は、A2A プロトコルのルートパス（POST `/`）でリクエストを受信できなければならない
- **FR-004**: Execution Agent Runtime は、A2A プロトコルが要求するポート 9000 でリッスンしなければならない（現在はデフォルトの 8080）
- **FR-005**: Execution Agent Runtime は、Agent Card エンドポイントが正常に動作しなければならない（現在は 502 エラー）
- **FR-006**: 両エージェントのルーティング修正は、AWS 公式の A2A プロトコル契約（Service Contract）に準拠しなければならない
- **FR-007**: 修正は既存のビジネスロジック（パイプライン処理、エコーモード、非同期タスク管理）に影響を与えてはならない

### Key Entities

- **Agent Runtime**: AgentCore 上で動作するコンテナ化されたエージェント。A2A プロトコルに従い、ルートパスでリクエストを受け付ける
- **Service Contract**: AWS が定義するプロトコル別のマウントパスとポートの仕様。A2A は POST `/` on port 9000
- **Agent Card**: A2A エージェント発見メカニズム。`/.well-known/agent-card.json` で提供される

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Verification Agent への InvokeAgentRuntime 呼び出しの成功率が 0%（現在）から 95% 以上に改善する
- **SC-002**: Execution Agent への InvokeAgentRuntime 呼び出しの成功率が 0%（現在）から 95% 以上に改善する
- **SC-003**: Slack ユーザーがメンション後 30 秒以内にエコーモードの応答を受信できる
- **SC-004**: 修正デプロイ後、Agent Card エンドポイントが両エージェントで 100% 正常応答を維持する
- **SC-005**: CloudWatch Logs にアプリケーションレベルのログが出力され、リクエストのトレーサビリティが確保される

## Assumptions

- AWS の A2A プロトコル契約（ルートパス `/`、ポート 9000）は安定しており、近い将来変更されない
- `BedrockAgentCoreApp` SDK の今後のバージョンで A2A ルーティングがネイティブサポートされる可能性があるが、現時点では修正が必要
- エコーモード（`VALIDATION_ZONE_ECHO_MODE=true`）のデプロイ設定は別途対応（本 spec の範囲外）
- CloudWatch Metrics の名前空間不一致（IAM ポリシー `bedrock-agentcore` vs アプリ `SlackEventHandler`）は本 spec の範囲外

## Scope

### In Scope

- Verification Agent の A2A ルーティング修正（POST `/` ハンドラ追加）
- Execution Agent の A2A ルーティング修正（POST `/` ハンドラ追加 + ポート 9000 対応）
- 既存エンドポイント（Agent Card、ヘルスチェック）の回帰テスト
- 単体テストの追加・更新

### Out of Scope

- `VALIDATION_ZONE_ECHO_MODE` のデプロイ設定変更
- CloudWatch Metrics の名前空間修正
- `BedrockAgentCoreApp` SDK のアップグレードや代替（strands-agents への移行）
- CDK インフラストラクチャの変更
- エンドツーエンドの統合テスト（デプロイ後の手動検証で対応）

## Dependencies

- 調査報告書: `docs/how-to/troubleshooting-424-agentcore.md`
- AWS 公式ドキュメント: [A2A protocol contract](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a-protocol-contract.html), [Service contract](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-service-contract.html), [Deploy A2A servers](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a.html)
