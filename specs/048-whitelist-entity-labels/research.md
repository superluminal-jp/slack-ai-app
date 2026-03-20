# Research: Whitelist Team and User Labels

## Decision 1: 047-whitelist-label パターンをそのまま team_id / user_id に適用する

**Decision**: `channel_label` で確立した実装パターン（DynamoDB `label` 属性 → dict キャッシュ → `AuthorizationResult` フィールド → ログ注入）を、`team_id` / `user_id` にも対称的に複製する。新しいパターンや抽象化は導入しない。

**Rationale**: 047 の実装は既にテスト済みで本番稼働している。構造が完全に対称なため、新たな設計決定は不要。コードの変更量を最小化しつつ、既存テストスイートとの一貫性を保てる。

**Alternatives considered**:
- `labels: Dict[str, Dict[str, str]]` のような汎用ラベルマップ: 抽象化レイヤーが増え、既存コードとの後方互換が複雑になるため却下。
- `entity_type` 別の動的ルックアップ: 実装が複雑になりテスト難易度が上がるため却下。

---

## Decision 2: Lambda コピー（whitelist_loader.py + authorization.py）も同時に更新する

**Decision**: `verification-zones/verification-agent/src/authorization.py`（エージェント本体）と `cdk/lib/lambda/slack-event-handler/authorization.py` + `whitelist_loader.py`（Lambda コピー）を同一 PR で更新する。

**Rationale**: 047 でも同様に両方を更新した。Lambda は別プロセスで動作しており、エージェント本体とは独立してリクエストを受け付ける。どちらかだけ更新すると動作に乖離が生じる。

**Alternatives considered**: Lambda 側を後回しにする: 運用中に片方だけ label が出力される不整合が発生するため却下。

---

## Decision 3: CDK config / stack-config.ts の変更は対象外

**Decision**: `ChannelIdEntry` 型の拡張は行わない。`autoReplyChannelIds` / `mentionChannelIds` は channel_id 専用の CDK 設定経路であり、team_id / user_id はこの経路を経由しない。

**Rationale**: 047 でも CDK config は channel_id 専用と位置づけられている。team_id / user_id の CDK 経路は存在せず、不要な抽象化を追加することになる。

**Alternatives considered**: 汎用 `EntityIdEntry` 型の追加: CDK 設定ファイルに team_id / user_id のホワイトリストエントリを書く用途がないため不要。

---

## Decision 4: 新規依存関係・ストレージ変更なし

**Decision**: このフィーチャは純粋な Python コード変更のみ。DynamoDB スキーマ変更（マイグレーション）、新規環境変数、CDK インフラ変更はすべて不要。

**Rationale**: `label` は DynamoDB の追加属性（スパース属性）であり、既存エントリへの影響がない。環境変数は既存の `WHITELIST_TEAM_IDS` / `WHITELIST_USER_IDS` の書式を `ID:label` に拡張するだけで、後方互換。

---

## Decision 5: テストは test_authorization.py に集約する

**Decision**: 新規テストはすべて既存の `verification-zones/verification-agent/tests/test_authorization.py` に追加する。Lambda コピーは Python 層のロジックが同一のため、エージェント側のテストが十分なカバレッジを提供する。

**Rationale**: 047 で確立したテスト構成と一致。Lambda コピーの変更は機械的に同一のため、追加テストファイルを作る必要はない。
