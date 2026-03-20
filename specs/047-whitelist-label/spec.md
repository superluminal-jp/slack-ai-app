# Feature Specification: Whitelist Channel Label

**Feature Branch**: `047-whitelist-label`
**Created**: 2026-03-20
**Status**: Draft
**Input**: User description: "ホワイトリストのチャンネルIDエントリにチャンネル名（display_name）を任意属性として追加し、管理者が一覧を見たときにIDだけでなく名前でも識別できるようにする。DynamoDB のホワイトリストテーブル（entity_type=channel_id）に label 属性を追加。Secrets Manager / 環境変数フォールバックも label に対応。認証ロジック（entity_id による許可判定）は変更しない。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 管理者が DynamoDB でチャンネルを名前付きで登録する (Priority: P1)

ホワイトリストを管理する担当者が、チャンネルID（例：`C0123456789`）だけでなく人間が読めるラベル（例：`#general`、`#dev-team`）を同時に記録できる。一覧を参照する際にIDだけが並ぶ状況を解消し、どのチャンネルが許可されているかを即座に判断できる。

**Why this priority**: ラベルがなければチャンネルIDだけの一覧から目的エントリを特定できず、誤削除・誤追加のリスクが生じる。他のストーリーの前提となる基盤変更。

**Independent Test**: DynamoDB のホワイトリストテーブルに `label` 属性付きエントリを1件登録し、認証処理が正常に通過することを確認すれば独立して価値を示せる。

**Acceptance Scenarios**:

1. **Given** `entity_type=channel_id`, `entity_id=C0123456789`, `label=#general` のエントリが DynamoDB に存在する, **When** `C0123456789` に対して認証チェックが実行される, **Then** 認証が成功し、ログに `label=#general` が含まれる
2. **Given** `entity_type=channel_id`, `entity_id=C0123456789`（`label` なし）のエントリが DynamoDB に存在する, **When** `C0123456789` に対して認証チェックが実行される, **Then** 認証が成功し、ログに `label` が含まれないか空であることが許容される
3. **Given** `label` 属性が空文字列のエントリ, **When** 認証チェックが実行される, **Then** ラベルなしと同様に処理され、認証結果に影響しない

---

### User Story 2 - 管理者が Secrets Manager でチャンネルを名前付きで管理する (Priority: P2)

Secrets Manager でホワイトリストを管理している環境において、チャンネルエントリをオブジェクト形式（`{"id": "C0123456789", "label": "#general"}`）で記述し、従来の文字列リスト形式（`["C0123456789"]`）との後方互換を保ちつつラベルを活用できる。

**Why this priority**: DynamoDB を使わず Secrets Manager フォールバックで運用しているチームにも同等の管理性を提供するため。

**Independent Test**: Secrets Manager にオブジェクト形式のチャンネルリストを設定し、認証処理が正常に通過することを確認すれば独立して価値を示せる。

**Acceptance Scenarios**:

1. **Given** Secrets Manager の `channel_ids` が `[{"id": "C0123456789", "label": "#general"}]` 形式, **When** 認証チェックが実行される, **Then** `C0123456789` が許可され、認証が成功する
2. **Given** Secrets Manager の `channel_ids` が従来の `["C0123456789"]` 形式, **When** 認証チェックが実行される, **Then** 後方互換が維持され、認証が成功する
3. **Given** Secrets Manager の `channel_ids` が混在形式（文字列とオブジェクトが混在）, **When** 認証チェックが実行される, **Then** どちらの形式も正しく処理される

---

### User Story 3 - 管理者が環境変数でチャンネルをラベル付きで設定する (Priority: P3)

環境変数 `WHITELIST_CHANNEL_IDS` でホワイトリストを設定する場合に、`C0123456789:#general,C9876543210:#ops` のような `ID:ラベル` 形式を受け付け、従来の `C0123456789,C9876543210` 形式との後方互換を維持する。

**Why this priority**: 環境変数フォールバックはローカル開発や小規模デプロイで利用されるが、優先度は最も低い設定経路のため P3。

**Independent Test**: 環境変数を `ID:ラベル` 形式で設定し、認証処理が通過することで独立して確認できる。

**Acceptance Scenarios**:

1. **Given** `WHITELIST_CHANNEL_IDS=C0123456789:#general,C9876543210:#ops`, **When** `C0123456789` の認証チェックが実行される, **Then** 認証が成功する
2. **Given** `WHITELIST_CHANNEL_IDS=C0123456789,C9876543210`（従来形式）, **When** 認証チェックが実行される, **Then** 後方互換が維持され、認証が成功する

---

### Edge Cases

- `label` が登録されていないエントリに対してラベルを参照した場合、エラーにならず空または未設定として扱われる
- `label` が非常に長い文字列（255文字超）の場合、切り捨てまたはそのまま保持し、認証には影響しない
- `label` に特殊文字（スラッシュ、Unicode 等）が含まれる場合、ログ出力時にエスケープ処理される
- DynamoDB に `label` 属性が存在しない既存エントリは、移行なしにそのまま動作し続ける
- 認証判定は `entity_id` の一致のみで行い、`label` の内容は判定に使用しない

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: DynamoDB のホワイトリストテーブルは、`entity_type=channel_id` のエントリに対し任意の `label` 属性（文字列）をサポートしなければならない
- **FR-002**: ホワイトリスト読み込み処理は、DynamoDB から `label` 属性を取得し、内部データ構造に保持しなければならない
- **FR-003**: Secrets Manager のホワイトリスト定義で、`channel_ids` の各要素をオブジェクト形式（`{"id": "...", "label": "..."}`）と従来の文字列形式の両方で受け付けなければならない
- **FR-004**: 環境変数 `WHITELIST_CHANNEL_IDS` で `ID:ラベル` 形式と従来の文字列形式の両方を受け付けなければならない
- **FR-005**: 認証判定は `entity_id`（チャンネルID文字列）の一致のみで行い、`label` の値は判定に影響してはならない
- **FR-006**: 認証成功・失敗のログに `label` が設定されている場合はその値を含めなければならない
- **FR-007**: `label` が未設定のエントリは既存の動作と完全に後方互換でなければならない
- **FR-008**: `team_id` および `user_id` の各エントリは本変更の対象外とする（`channel_id` エントリのみ `label` をサポート）

### Key Entities

- **WhitelistEntry**: ホワイトリスト上の単一エントリ。`entity_type`（team_id / user_id / channel_id）と `entity_id`（ID文字列）を持つ。`channel_id` タイプのみ任意の `label`（人間可読な名称）を持てる
- **Whitelist**: 全エントリの集合。`channel_ids` は IDの集合（認証判定用）と、IDからラベルへのマッピング（ログ・管理用）で表現される

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `label` 属性が付いた channel_id エントリを持つホワイトリストで、既存の全認証テストが 100% パスする（認証ロジックへの影響ゼロ）
- **SC-002**: `label` なしの既存エントリを含む全テストが移行なしにパスし、後方互換が完全に保たれる
- **SC-003**: ホワイトリストの認証ログに `label` フィールドが出力され、管理者が `channel_id` だけでなくチャンネル名でエントリを識別できる
- **SC-004**: DynamoDB・Secrets Manager・環境変数の全 3 設定経路で `label` が正しく読み込まれることがテストで確認できる
- **SC-005**: 新規追加コードのユニットテストカバレッジが既存水準を維持する

## Assumptions

- `label` は任意項目であり、登録必須としない
- `label` はチャンネルIDと1対1で対応し、認証判定には使用しない
- `team_id` と `user_id` のエントリへのラベル追加は本フィーチャのスコープ外とする
- 既存の DynamoDB テーブルスキーマ変更（マイグレーション）は不要（`label` は追加属性として既存エントリに影響しない）
- ログ出力で `label` が未設定の場合は出力しないか `null` を出力する（エラーにしない）
