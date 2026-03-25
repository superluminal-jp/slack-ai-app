# Feature Specification: S3 Agent Registry

**Feature Branch**: `054-ssm-agent-registry`
**Created**: 2026-03-24
**Status**: Draft
**Input**: Agent Card レジストリを S3 に移行し、VerificationAgent 起動時の invoke_agent_runtime カスケードを排除する

## Background

AgentCore プラットフォームは全エージェントのコンテナを約20~40分間隔で定期的に起動する。VerificationAgent 起動時に `ENABLE_AGENT_CARD_DISCOVERY=true` により `initialize_registry()` が4つの execution agent に対して `invoke_agent_runtime` を発行し、カスケード起動が発生している。これにより execution agent が「プラットフォーム起動 + カスケード起動」で二重にセッション生成され、無リクエスト時でも vCPU/Memory 課金が蓄積する。

Agent Card は静的定義（デプロイ時にのみ変更）であり、毎回ランタイムで取得する必要がない。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - カスケード起動の排除 (Priority: P1)

運用者として、VerificationAgent のコンテナ起動時に execution agent への `invoke_agent_runtime` 呼び出しが発生しないようにしたい。これにより、プラットフォームの定期起動サイクルで不要な課金が蓄積しなくなる。

**Why this priority**: 直接的なコスト削減。現状、4 execution agent が20~40分ごとにカスケード起動され、無リクエスト時でも vCPU/Memory の課金が発生している。これが本機能の根本的な動機である。

**Independent Test**: VerificationAgent をデプロイし、Slack リクエストを送らずに1時間放置した後、execution agent の CloudWatch ログに VerificationAgent からの `invoke_agent_runtime` 起因の起動が記録されていないことを確認する。

**Acceptance Scenarios**:

1. **Given** S3 レジストリにすべての agent card が登録済みで VerificationAgent がデプロイ済み, **When** AgentCore プラットフォームが VerificationAgent コンテナを定期起動する, **Then** VerificationAgent は S3 から agent card を読み取り、execution agent への `invoke_agent_runtime` を発行しない
2. **Given** S3 レジストリにすべての agent card が登録済み, **When** Slack ユーザーがリクエストを送信する, **Then** VerificationAgent は S3 から取得した agent card メタデータを使って LLM ルーティングを行い、選択された execution agent を ARN 直指定で invoke する（既存の動作と同等の応答品質）

---

### User Story 2 - デプロイ時の自動レジストリ登録 (Priority: P2)

開発者として、各 execution agent のデプロイ時に agent card 情報と ARN が自動的にレジストリに書き込まれるようにしたい。手動の登録作業を不要にし、デプロイパイプラインの一部として一貫性を保つ。

**Why this priority**: P1 の前提条件。S3 にデータがなければ VerificationAgent は agent card を取得できない。デプロイスクリプトへの組み込みにより、登録漏れを防ぐ。

**Independent Test**: execution agent を1つデプロイし、S3 に当該エージェントの JSON ファイル（`{agent-id}.json`）が正しい形式で書き込まれていることを AWS CLI で確認する。

**Acceptance Scenarios**:

1. **Given** execution agent の CDK デプロイが成功した, **When** デプロイスクリプトが後続処理を実行する, **Then** S3 の `{env}/agent-registry/{agent-id}.json` に agent card（ARN, description, skills）が JSON として書き込まれる（direct `PutObject`）
2. **Given** 既存の agent ファイルが S3 に存在する, **When** 同じ agent を再デプロイする, **Then** 当該エージェントのファイルが最新の agent card 内容で上書きされる（他のエージェントのファイルに影響なし）

---

### User Story 3 - デプロイ後のアドホック登録 (Priority: P3)

開発者として、デプロイパイプライン外でも AWS CLI で新しい agent をレジストリに追加できるようにしたい。VerificationAgent を再デプロイせずに新 agent をレジストリに追加できる。

**Why this priority**: 運用の柔軟性。新 agent のプロトタイピングや一時的なテスト登録を、VerificationAgent の再デプロイなしで行える。

**Independent Test**: S3 レジストリプレフィックスに新しい agent の JSON ファイルを手動でアップロードした後、VerificationAgent の次回起動（またはレジストリ再読み取り）で新 agent が認識されることを確認する。

**Acceptance Scenarios**:

1. **Given** VerificationAgent が稼働中, **When** 開発者が S3 レジストリプレフィックスに新 agent の JSON ファイルをアップロードする, **Then** VerificationAgent の次回レジストリ再読み取り時に新 agent が利用可能になる
2. **Given** VerificationAgent が稼働中, **When** 開発者が S3 から agent の JSON ファイルを削除する, **Then** VerificationAgent の次回レジストリ再読み取り時にその agent がレジストリから除外される

---

### User Story 4 - SlackSearch agent の統合管理 (Priority: P3)

開発者として、SlackSearch agent も他の execution agent と同じレジストリで管理したい。現在の `SLACK_SEARCH_AGENT_ARN` 環境変数による個別管理を廃止し、一元的な agent レジストリに統合する。

**Why this priority**: 管理の一元化。個別の環境変数管理はスケールしない。新 agent 追加時にも CDK 変更が不要になる。

**Independent Test**: SlackSearch agent をデプロイし、S3 レジストリに登録されていることを確認。VerificationAgent が S3 から SlackSearch の ARN を取得して正常に invoke できることを確認する。

**Acceptance Scenarios**:

1. **Given** SlackSearch agent がデプロイ済み, **When** デプロイスクリプトが実行される, **Then** S3 の `{env}/agent-registry/slack-search.json` に card が他の agent と同じ形式で登録される
2. **Given** S3 レジストリに SlackSearch が登録済み, **When** VerificationAgent がレジストリを読み取る, **Then** SlackSearch が他の execution agent と同列で認識される

---

### Edge Cases

- S3 サービス障害時: VerificationAgent は fail-open で起動し、空のレジストリで継続する（WARN ログ出力）。agent card なしでもフォールバック記述で LLM ルーティングを試みる
- 個別の agent ファイルが不正な場合: 不正なファイルのみスキップ、他の agent は正常に読み取る（ERROR ログ出力）
- S3 の読み取り権限がない場合: fail-open で空レジストリ起動（WARN ログ出力）
- 個別の `GetObject` 失敗（1ファイルだけ読めない場合）: その agent のみスキップ、他は正常にロード（ERROR ログ出力）
- デプロイスクリプトの S3 書き込みが失敗した場合: デプロイ自体は成功扱いとするが、WARN ログで通知する（agent card 未登録でもランタイム invocation は ARN 直指定で動作するため）
- 環境（Prod/Dev）の分離: S3 キープレフィックスにステージ名を含めることで完全分離する
- 並行デプロイ: Per-agent ファイル方式のため、各スクリプトが異なるキーに書き込む。競合リスクなし

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST read agent card information from per-agent S3 JSON files (`ListObjectsV2` + `GetObject` per file) at VerificationAgent startup, replacing the current `invoke_agent_runtime`-based discovery
- **FR-002**: System MUST use the S3 key structure `{env}/agent-registry/{agent-id}.json` where `{env}` is `prod` or `dev`
- **FR-003**: Each per-agent S3 JSON file MUST contain at minimum `arn` (string), `description` (string), and `skills` (array) fields. Agent-id is derived from the filename
- **FR-004**: System MUST use S3 for storage with per-agent files, allowing the registry to scale to 1000+ agents via `ListObjectsV2` pagination
- **FR-005**: Each execution agent's deploy script MUST write its agent card and ARN to its own S3 file via direct `PutObject` (`{env}/agent-registry/{agent-id}.json`) after successful CDK deployment — no read-modify-write needed
- **FR-006**: VerificationAgent CDK MUST replace `EXECUTION_AGENT_ARNS` and `ENABLE_AGENT_CARD_DISCOVERY` and `SLACK_SEARCH_AGENT_ARN` environment variables with `AGENT_REGISTRY_BUCKET` and `AGENT_REGISTRY_KEY_PREFIX` environment variables
- **FR-007**: VerificationAgent IAM role MUST include `s3:GetObject` and `s3:ListBucket` (with prefix condition) permissions scoped to `{bucket}/{env}/agent-registry/`
- **FR-008**: Deploy scripts MUST include `s3:PutObject` permission for writing the agent's own file (no read permission needed — direct write only)
- **FR-009**: SlackSearch agent MUST be registered as its own S3 file (`slack-search.json`) in the same registry prefix, replacing the separate `SLACK_SEARCH_AGENT_ARN` environment variable
- **FR-010**: System MUST fail-open when S3 `ListObjectsV2` fails at startup: log a WARNING and continue with an empty registry
- **FR-011**: System MUST skip individual agent files with JSON parse or Pydantic validation errors, logging an ERROR for each, while still loading valid files
- **FR-012**: The existing `refresh_missing_cards()` lazy discovery MUST be replaced with an S3 prefix re-scan (`ListObjectsV2` + `GetObject`)
- **FR-013**: The existing `invoke_execution_agent()` ARN-based invocation pattern MUST remain unchanged (only the source of the ARN changes from env var to S3 registry)
- **FR-014**: Each execution agent MUST retain its `agent_card.py` definition for A2A protocol `/.well-known/agent-card.json` endpoint compatibility
- **FR-015**: Prod and Dev environments MUST use separate S3 key prefixes to prevent cross-environment contamination

### Key Entities

- **Agent Registry Entry**: An individual S3 JSON file (`{agent-id}.json`) representing one agent. Contains the agent's runtime ARN, human-readable description (used for LLM routing), and a list of skills (used for tool generation). Agent-id is derived from the filename.
- **Agent Registry**: The collection of per-agent S3 JSON files under a common prefix (`{env}/agent-registry/`). Discovered via `ListObjectsV2` and read individually via `GetObject`. Replaces the in-memory registry previously populated by runtime discovery.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: VerificationAgent の定期起動時に execution agent への `invoke_agent_runtime` 呼び出しがゼロになる（CloudWatch ログで検証可能）
- **SC-002**: Execution agent の無リクエスト時 vCPU/Memory 課金が、カスケード起動分（現状の約50%）削減される
- **SC-003**: VerificationAgent のコンテナ起動から agent card 読み取り完了まで 2 秒以内（S3 `ListObjectsV2` + ~6 `GetObject` で完了）
- **SC-004**: 新しい agent の追加が VerificationAgent の再デプロイなしで可能（S3 レジストリ更新 + 次回起動で反映）
- **SC-005**: 既存の Slack リクエスト応答品質が維持される（agent card メタデータが同一内容のため、LLM ルーティング精度に変化なし）

## Assumptions

- AgentCore プラットフォームの定期コンテナ起動（~20-40分間隔）は変更不可能な外部動作であり、本機能はその影響を軽減するが排除はしない
- S3 per-agent ファイルは各エージェント数百バイト程度であり、1000+ エージェントでも `ListObjectsV2` で問題なく列挙可能
- S3 `ListObjectsV2` + ~6 `GetObject` API は VerificationAgent の起動パスでレイテンシ上のボトルネックにならない（合計 2 秒以内）
- デプロイスクリプトの実行環境は S3 への書き込み権限を持つ IAM ロール/プロファイルを使用している
- Per-agent ファイル方式のため、複数デプロイの同時実行でも競合リスクがない（各スクリプトが異なるキーに書き込む）

## Scope Exclusions

- AgentCore プラットフォーム自体の定期起動間隔の変更やコンテナ起動の抑制
- `invoke_execution_agent()` の ARN 指定パターンの変更（S3 から取得した ARN をそのまま使用するのみ）
- A2A プロトコルの `/.well-known/agent-card.json` エンドポイントの廃止（各 agent に残す）
- S3 オブジェクトの暗号化（SSE-S3 で十分。agent card は機密情報を含まない。ARN は AWS アカウント内の識別子）
- S3 レジストリの楽観的ロック。Per-agent ファイル方式のため不要（各スクリプトが独立したキーに書き込む）
