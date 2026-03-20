# Feature Specification: Whitelist Team and User Labels

**Feature Branch**: `048-whitelist-entity-labels`
**Created**: 2026-03-20
**Status**: Draft
**Input**: User description: "team_id, user_id のホワイトリストも channel_id と同様にlabelをつけれるように"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 管理者が DynamoDB でチームとユーザーを名前付きで登録する (Priority: P1)

ホワイトリストを管理する担当者が、チームID（例：`T0123456789`）やユーザーID（例：`U0123456789`）に対して人間が読めるラベル（例：`My Workspace`、`@alice`）を同時に記録できる。チャンネルと同様に、一覧を参照する際にIDだけが並ぶ状況を解消し、どのチームやユーザーが許可されているかを即座に判断できる。

**Why this priority**: チャンネルラベルと対称性を持たせる基盤変更であり、DynamoDB はラベル管理の主要経路。他ストーリーの前提。

**Independent Test**: DynamoDB のホワイトリストテーブルに `label` 属性付きの `team_id` および `user_id` エントリを1件ずつ登録し、認証処理が正常に通過しつつログに各ラベルが含まれることを確認すれば独立して価値を示せる。

**Acceptance Scenarios**:

1. **Given** `entity_type=team_id`, `entity_id=T0123456789`, `label=My Workspace` のエントリが DynamoDB に存在する, **When** `T0123456789` に対して認証チェックが実行される, **Then** 認証が成功し、ログに `team_label=My Workspace` が含まれる
2. **Given** `entity_type=user_id`, `entity_id=U0123456789`, `label=@alice` のエントリが DynamoDB に存在する, **When** `U0123456789` に対して認証チェックが実行される, **Then** 認証が成功し、ログに `user_label=@alice` が含まれる
3. **Given** `label` 属性がない既存の `team_id` / `user_id` エントリ, **When** 認証チェックが実行される, **Then** 後方互換が維持され、認証結果に影響しない

---

### User Story 2 - 管理者が Secrets Manager でチームとユーザーを名前付きで管理する (Priority: P2)

Secrets Manager でホワイトリストを管理している環境において、`team_ids` および `user_ids` の各要素をオブジェクト形式（`{"id": "T0123456789", "label": "My Workspace"}`）で記述し、従来の文字列リスト形式（`["T0123456789"]`）との後方互換を保ちつつラベルを活用できる。

**Why this priority**: DynamoDB を使わず Secrets Manager フォールバックで運用しているチームにも同等の管理性を提供するため。チャンネルラベルで確立したオブジェクト形式を team_id / user_id にも適用する。

**Independent Test**: Secrets Manager にオブジェクト形式の team_ids を設定し、認証処理が正常に通過しつつログにラベルが表示されることを確認すれば独立して価値を示せる。

**Acceptance Scenarios**:

1. **Given** Secrets Manager の `team_ids` が `[{"id": "T001", "label": "My Workspace"}]` 形式, **When** 認証チェックが実行される, **Then** `T001` が許可され、ログに `team_label=My Workspace` が含まれる
2. **Given** Secrets Manager の `user_ids` が `[{"id": "U001", "label": "@alice"}, "U002"]` 混在形式, **When** 認証チェックが実行される, **Then** `U001` / `U002` ともに許可され、`U001` のログに `user_label=@alice` が含まれ、`U002` のログには含まれない
3. **Given** 従来の `["T001", "T002"]` 文字列形式, **When** 認証チェックが実行される, **Then** 後方互換が維持される

---

### User Story 3 - 管理者が環境変数でチームとユーザーをラベル付きで設定する (Priority: P3)

環境変数 `WHITELIST_TEAM_IDS` および `WHITELIST_USER_IDS` でホワイトリストを設定する場合に、`T0123456789:My Workspace,U0123456789:@alice` のような `ID:ラベル` 形式を受け付け、従来の `T0123456789,U0123456789` 形式との後方互換を維持する。

**Why this priority**: チャンネルの環境変数フォールバックと対称性を持たせる。ローカル開発や小規模デプロイで利用される経路のため P3。

**Independent Test**: 環境変数 `WHITELIST_TEAM_IDS` を `ID:ラベル` 形式で設定し、認証処理が通過しつつログにラベルが表示されることで独立して確認できる。

**Acceptance Scenarios**:

1. **Given** `WHITELIST_TEAM_IDS=T001:My Workspace,T002:Other Workspace`, **When** `T001` の認証チェックが実行される, **Then** 認証が成功し、ログに `team_label=My Workspace` が含まれる
2. **Given** `WHITELIST_USER_IDS=U001:@alice,U002`, **When** 認証チェックが実行される, **Then** `U001` は `user_label=@alice` 付きで成功、`U002` はラベルなしで成功する
3. **Given** `WHITELIST_TEAM_IDS=T001,T002`（従来形式）, **When** 認証チェックが実行される, **Then** 後方互換が維持され、認証が成功する

---

### Edge Cases

- `label` が登録されていない `team_id` / `user_id` エントリに対してラベルを参照した場合、エラーにならず空または未設定として扱われる
- `label` が非常に長い文字列（255文字超）の場合、切り捨てずそのまま保持し、認証には影響しない
- `label` に特殊文字（スラッシュ、Unicode 等）が含まれる場合、ログ出力時にそのまま出力される（エラーにしない）
- DynamoDB に `label` 属性が存在しない既存の `team_id` / `user_id` エントリは、移行なしにそのまま動作し続ける
- 認証判定は `entity_id` の一致のみで行い、`label` の内容は判定に影響しない
- `team_label` および `user_label` が未設定の場合、ログには出力しない（エラーにしない）
- ラベルのコロン区切りパース（環境変数）で、ラベル部分にコロンが含まれる場合（例：`T001:label:extra`）は最初のコロンのみ区切りとして使用する

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: ホワイトリストは、`team_id` および `user_id` エントリに対し任意の `label` 属性（文字列）をサポートしなければならない
- **FR-002**: ホワイトリスト読み込み処理は、DynamoDB から `team_id` および `user_id` エントリの `label` 属性を取得し、内部データ構造に保持しなければならない
- **FR-003**: Secrets Manager のホワイトリスト定義で、`team_ids` および `user_ids` の各要素をオブジェクト形式（`{"id": "...", "label": "..."}`）と従来の文字列形式の両方で受け付けなければならない
- **FR-004**: 環境変数 `WHITELIST_TEAM_IDS` および `WHITELIST_USER_IDS` で `ID:ラベル` 形式と従来の文字列形式の両方を受け付けなければならない
- **FR-005**: 認証判定は `entity_id` の一致のみで行い、`label` の値は判定に影響してはならない
- **FR-006**: 認証成功・失敗のログに `team_label` / `user_label` が設定されている場合はその値を含めなければならない
- **FR-007**: `label` が未設定の `team_id` / `user_id` エントリは既存の動作と完全に後方互換でなければならない
- **FR-008**: 認証結果オブジェクトに `team_label` および `user_label` フィールドを追加し、呼び出し元がラベルを参照できるようにしなければならない

### Key Entities

- **WhitelistEntry**: ホワイトリスト上の単一エントリ。`entity_type`（team_id / user_id / channel_id）と `entity_id`（ID文字列）を持つ。全エンティティタイプが任意の `label`（人間可読な名称）を持てる
- **WhitelistConfig**: 全エントリの集合。`team_ids` / `user_ids` / `channel_ids` はIDの集合（認証判定用）と、IDからラベルへのマッピング（ログ・管理用）で表現される
- **AuthorizationResult**: 認証チェックの結果。`team_label`、`user_label`、`channel_label` の3フィールドを持ち、ラベルが設定されたエントリの認証ログに使用される

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `label` 属性が付いた team_id / user_id エントリを持つホワイトリストで、既存の全認証テストが 100% パスする（認証ロジックへの影響ゼロ）
- **SC-002**: `label` なしの既存 team_id / user_id エントリを含む全テストが移行なしにパスし、後方互換が完全に保たれる
- **SC-003**: ホワイトリストの認証ログに `team_label` / `user_label` フィールドが出力され、管理者がIDだけでなく名称でエントリを識別できる
- **SC-004**: DynamoDB・Secrets Manager・環境変数の全 3 設定経路で `team_label` / `user_label` が正しく読み込まれることがテストで確認できる
- **SC-005**: 新規追加コードのユニットテストカバレッジが既存水準を維持する

## Assumptions

- `label` は任意項目であり、登録必須としない
- `label` はエンティティIDと1対1で対応し、認証判定には使用しない
- CDK config（`autoReplyChannelIds` / `mentionChannelIds`）は `channel_id` 専用のため、`team_id` / `user_id` のラベルは CDK config での管理対象外とする
- 既存の DynamoDB テーブルスキーマ変更（マイグレーション）は不要（`label` は追加属性として既存エントリに影響しない）
- ログ出力で `team_label` / `user_label` が未設定の場合は出力しない（エラーにしない）
- 047-whitelist-label で確立した `channel_label` の実装パターン（DynamoDB/Secrets Manager/env var の各ローダー）を team_id / user_id にも対称的に適用する
