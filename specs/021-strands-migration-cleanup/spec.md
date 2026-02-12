# Feature Specification: strands-agents 移行とインフラ整備

**Feature Branch**: `021-strands-migration-cleanup`
**Created**: 2026-02-08
**Status**: Draft
**Input**: strands-agents 移行、CloudWatch Metrics 名前空間修正、requirements.txt バージョン固定、エコーモード設定、CDK インフラ更新、E2E テスト自動化

## User Scenarios & Testing *(mandatory)*

### User Story 1 - CloudWatch Metrics が正常に記録される (Priority: P1)

運用担当者として、エージェントが送信するカスタムメトリクスが CloudWatch に正常に記録されるようにしたい。現在、IAM ポリシーが名前空間 `bedrock-agentcore` のみを許可しているが、エージェントコードは `SlackAIApp/Verification` や `SlackAIApp/Execution` の名前空間で送信しており、AccessDenied エラーが静かに発生している。

**Why this priority**: メトリクスが記録されていないことは、運用監視の盲点を意味する。障害検知やパフォーマンス分析ができず、問題の早期発見が不可能。修正自体は小さい（IAM ポリシー条件の更新）が、影響は大きい。

**Independent Test**: デプロイ後に CloudWatch コンソールでエージェントのカスタムメトリクスが記録されていることを確認できる。

**Acceptance Scenarios**:

1. **Given** Verification Agent がメトリクスを送信する, **When** `PutMetricData` が呼ばれる, **Then** CloudWatch にメトリクスが記録され AccessDenied エラーが発生しない
2. **Given** Execution Agent がメトリクスを送信する, **When** `PutMetricData` が呼ばれる, **Then** CloudWatch にメトリクスが記録され AccessDenied エラーが発生しない
3. **Given** IAM ポリシーが更新されている, **When** エージェントの名前空間でメトリクスを送信する, **Then** ポリシー条件がエージェントの名前空間と一致する

---

### User Story 2 - strands-agents A2A サーバーへの移行 (Priority: P2)

開発者として、private API（`_handle_invocation`）への依存を解消し、公式推奨の strands-agents A2AServer パターンに移行したい。SDK アップデートによる破壊リスクを排除し、保守性の高いコードベースにする。

**Why this priority**: `_handle_invocation` は BedrockAgentCoreApp SDK の非公開メソッドであり、SDK 更新時に予告なく変更・削除される可能性がある。strands-agents は AWS 公式推奨パターンであり、移行により長期的な安定性を確保できる。

**Independent Test**: 移行後にエコーモードでデプロイし、Slack からメンションして `[Echo] {テキスト}` が返ることを確認する。既存の単体テストが全件パスする。

**Acceptance Scenarios**:

1. **Given** Verification Agent が strands-agents A2AServer で動作している, **When** InvokeAgentRuntime が呼ばれる, **Then** 正常なレスポンスが返る（424 エラーなし）
2. **Given** Execution Agent が strands-agents A2AServer で動作している, **When** A2A メッセージを受信する, **Then** Bedrock 処理が正常に完了しレスポンスが返る
3. **Given** 移行後のコード, **When** private API（`_handle_invocation`）の利用箇所を検索する, **Then** 一件も見つからない
4. **Given** strands-agents A2AServer を使用している, **When** ポート 9000 で POST `/` リクエストを受信する, **Then** A2A プロトコル仕様に準拠して処理される

---

### User Story 3 - 依存パッケージのバージョンが固定されている (Priority: P3)

開発者として、requirements.txt の全依存パッケージのバージョンが適切に固定されていて、ビルドの再現性が保証されるようにしたい。また、使用していない依存パッケージが削除されている。

**Why this priority**: ルーズなバージョン指定（`>=`）ではビルドの再現性が保証されない。特に `bedrock-agentcore` は private API を使用しているため、予期しないバージョン変更が破壊を引き起こす。strands-agents 移行後は bedrock-agentcore 自体が不要になる可能性があり、不要な依存は削除する。

**Independent Test**: `pip install -r requirements.txt` で同一バージョンが再現的にインストールされることを確認する。

**Acceptance Scenarios**:

1. **Given** requirements.txt が更新されている, **When** 依存パッケージをインストールする, **Then** 全パッケージが指定されたバージョンでインストールされる
2. **Given** strands-agents 移行が完了している, **When** requirements.txt を確認する, **Then** 未使用の依存パッケージ（bedrock-agentcore など）が含まれていない
3. **Given** requirements.txt が固定されている, **When** 異なる環境でビルドする, **Then** 同一のパッケージバージョンが再現される

---

### User Story 4 - エコーモードがデプロイ設定から直接制御できる (Priority: P4)

開発者として、エコーモードのオン・オフをデプロイ設定ファイル（cdk.config.*.json）から直接制御したい。現在は環境変数を手動で指定する必要があり、設定の型安全性がない。

**Why this priority**: 現在の手動指定は忘れやすく、型チェックもされない。設定ファイルに含めることで設定の一元管理と型安全性を実現する。機能的な影響は小さいが、運用効率の改善になる。

**Independent Test**: `cdk.config.dev.json` に `validationZoneEchoMode: true` を設定してデプロイし、エコーモードが有効になることを確認する。

**Acceptance Scenarios**:

1. **Given** cdk.config.dev.json に `validationZoneEchoMode: true` が設定されている, **When** デプロイスクリプトを実行する, **Then** エコーモードが有効でデプロイされる
2. **Given** cdk.config.dev.json に `validationZoneEchoMode` が未設定, **When** デプロイスクリプトを実行する, **Then** エコーモードが無効（デフォルト）でデプロイされる
3. **Given** CdkConfig 型定義, **When** `validationZoneEchoMode` プロパティを参照する, **Then** 型チェックが正常に通る

---

### User Story 5 - 自動化されたE2Eテストでフロー全体を検証できる (Priority: P5)

開発者として、Slack → Lambda → Verification Agent → Execution Agent → Slack の全フローを自動テストで検証したい。現在は手動検証のみで、リグレッションの早期検出ができない。

**Why this priority**: E2E テストは重要だが、他のストーリー（US1-US4）の修正が先行する必要がある。全フローが安定してから自動テストを構築する方が効率的。

**Independent Test**: テストスクリプトを実行し、全フローのレスポンスが期待通りであることを自動判定できる。

**Acceptance Scenarios**:

1. **Given** 全コンポーネントがデプロイ済み, **When** E2E テストを実行する, **Then** Slack メンションからエージェントレスポンスまでの全フローが検証される
2. **Given** E2E テストが実行される, **When** いずれかのコンポーネントにリグレッションがある, **Then** テストが失敗して問題箇所を特定できる
3. **Given** E2E テスト結果, **When** テストレポートを確認する, **Then** 各ステップの成功・失敗とレイテンシが記録されている

---

### Edge Cases

- CloudWatch メトリクス送信がスロットリングされた場合、エージェント処理に影響を与えない（fire-and-forget パターンの維持）
- strands-agents A2AServer がポート 9000 で起動できない場合（ポート競合）、明確なエラーメッセージが出力される
- requirements.txt のバージョン固定後に依存パッケージ間の互換性問題が発生した場合、ビルド時にエラーとして検出される
- E2E テストで外部サービス（Slack API）が一時的に利用不可の場合、タイムアウトとリトライが適切に処理される

## Requirements *(mandatory)*

### Functional Requirements

**CloudWatch Metrics（US1）**

- **FR-001**: IAM ポリシーの CloudWatch 名前空間条件は、エージェントコードが実際に使用する名前空間と一致しなければならない
- **FR-002**: メトリクス送信の失敗はエージェントのメイン処理をブロックしてはならない（既存の fire-and-forget パターンを維持）

**strands-agents 移行（US2）**

- **FR-003**: 両エージェントは strands-agents A2AServer を使用して A2A プロトコルリクエストを処理しなければならない
- **FR-004**: BedrockAgentCoreApp SDK の private API（`_handle_invocation`）への依存を完全に除去しなければならない
- **FR-005**: A2A プロトコル仕様に準拠し、ポート 9000 で POST `/` リクエストを受け付けなければならない
- **FR-006**: 既存のエントリポイント機能（メッセージ受信、Bedrock 処理、非同期タスク管理）を維持しなければならない
- **FR-007**: エージェントカード（`/.well-known/agent-card.json`）とヘルスチェック（`/ping`）エンドポイントを維持しなければならない

**依存パッケージ管理（US3）**

- **FR-008**: requirements.txt の全依存パッケージは互換バージョン指定（`~=`）または完全固定（`==`）で指定しなければならない
- **FR-009**: コードで使用されていない依存パッケージは requirements.txt から除去しなければならない

**エコーモード設定（US4）**

- **FR-010**: `validationZoneEchoMode` を CDK 設定ファイルのプロパティとして定義し、型安全にアクセスできなければならない
- **FR-011**: 設定ファイルに `validationZoneEchoMode` が未指定の場合、デフォルトで `false`（無効）としなければならない
- **FR-012**: 既存の環境変数・コンテキスト変数による指定方法も後方互換として維持しなければならない

**E2E テスト（US5）**

- **FR-013**: E2E テストは Slack メンションから最終レスポンスまでの全フローを検証しなければならない
- **FR-014**: E2E テスト結果には各ステップのステータスとレイテンシが含まれなければならない
- **FR-015**: E2E テストは外部サービスの一時的な障害に対してリトライ機構を持たなければならない

### Key Entities

- **Agent Runtime**: A2A プロトコルで動作するコンテナ化されたエージェント。Verification と Execution の2種類が存在
- **A2A Server**: strands-agents が提供する A2A プロトコル準拠のサーバー実装。エントリポイント登録、リクエストルーティング、レスポンスシリアライズを担当
- **Deploy Configuration**: CDK デプロイに使用する設定ファイル（cdk.config.*.json）。環境ごとのパラメータを型安全に管理

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: デプロイ後、CloudWatch コンソールでエージェントのカスタムメトリクスが 100% 記録される（AccessDenied エラーが 0 件）
- **SC-002**: private API（`_handle_invocation`）の使用箇所がコードベースから完全に除去される（grep で 0 件）
- **SC-003**: `pip install -r requirements.txt` が異なる環境で同一バージョンを再現的にインストールする
- **SC-004**: エコーモード設定が設定ファイルから型安全に読み込め、デプロイ後に正常動作する
- **SC-005**: E2E テストが全フロー（Slack → Agent → Slack）を 60 秒以内に検証完了する
- **SC-006**: 全単体テストが移行後もパスする（既存テストのリグレッションゼロ）

## Assumptions

- CloudWatch 名前空間は、エージェントコードが使用する名前空間（`SlackAIApp/Verification`, `SlackAIApp/Execution` など）に合わせて IAM ポリシーを修正する（IAM 側を変更）
- strands-agents A2AServer は `bedrock-agentcore` SDK の `BedrockAgentCoreApp` と同等の機能（A2A ルーティング、ペイロードパース、レスポンスシリアライズ）を提供する
- strands-agents 移行後、`bedrock-agentcore` パッケージへの依存は不要になる（async task 管理も strands-agents で対応可能）
- E2E テストは実際の Slack ワークスペースとデプロイ済み環境に対して実行する（モックではなく実環境テスト）
- バージョン固定は互換バージョン指定（`~=`）を基本とし、パッチアップデートの自動取得を許容する

## Out of Scope

- Slack Bot Token や Signing Secret のローテーション自動化
- マルチリージョン・マルチアカウントのデプロイ対応
- strands-agents のマルチターン会話機能やツール使用機能の導入（A2A サーバーとしての利用に限定）
- パフォーマンスチューニングやスケーリング設定の最適化
- CI/CD パイプラインへの E2E テスト自動実行の組み込み（テストスクリプトの作成のみ）
