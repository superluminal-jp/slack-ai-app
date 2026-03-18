# Feature Specification: DynamoDB Usage History Daily S3 Export via PITR

**Feature Branch**: `040-dynamodb-pitr-export`
**Created**: 2026-03-16
**Status**: Draft
**Input**: User description: "usage history dynamodb を PITR で1日に一回s3に書き出し。書き出し先は入出力や添付ファイルと合わせる。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — 日次バックアップで利用履歴を完全保護する (Priority: P1)

管理者は、DynamoDB の利用履歴テーブルが毎日自動的に S3 に丸ごとバックアップされることを期待する。これにより、テーブルが誤削除・データ破損した場合でも任意の時点にリストアでき、かつ S3 上でバックアップデータを長期保管・分析に活用できる。

**Why this priority**: DynamoDB TTL による自動削除が90日で機能しているが、バックアップなしでは誤操作やサービス障害によるデータ消失に対抗する手段がない。日次エクスポートは最低限のデータ保護要件を満たす。

**Independent Test**: dev 環境でエクスポートジョブを手動トリガーし、S3 の `dynamodb-exports/` プレフィックス配下に当日分のエクスポートファイルが作成されたことを確認する。コンテンツの整合性（レコード数）が DynamoDB の実際の件数と一致すること。

**Acceptance Scenarios**:

1. **Given** 利用履歴テーブルに1件以上のレコードが存在する、**When** 毎日定時（JST 00:00 / UTC 15:00）にエクスポートジョブが実行される、**Then** S3 の `dynamodb-exports/{YYYY/MM/DD}/` 以下にエクスポートファイルが生成され、ジョブが正常終了する
2. **Given** エクスポートジョブが起動する、**When** DynamoDB PITR が有効でない、**Then** エクスポートは失敗し、CloudWatch にエラーが記録される（ユーザー応答には影響しない）
3. **Given** 過去のエクスポートが S3 に存在する、**When** 新たな日次エクスポートが完了する、**Then** 既存のエクスポートファイルは上書き・削除されない（追記のみ）

---

### User Story 2 — エクスポートデータの長期保管とコスト管理 (Priority: P2)

管理者は、S3 に蓄積される DynamoDB エクスポートデータが一定期間後に自動削除されることで、ストレージコストが管理可能な範囲に収まることを期待する。

**Why this priority**: エクスポートを無制限に保管するとストレージコストが増大する。90日という統一した保持期間をエクスポートにも適用することで、入出力テキスト・添付ファイルと一貫したデータライフサイクル管理を実現する。

**Independent Test**: S3 バケットの `dynamodb-exports/` プレフィックスに対して、90日経過後にオブジェクトが自動削除されるライフサイクルルールが設定されていることを CDK テストで確認する。

**Acceptance Scenarios**:

1. **Given** `dynamodb-exports/` プレフィックスに90日以上前のエクスポートファイルが存在する、**When** S3 ライフサイクルルールが評価される、**Then** 該当ファイルが自動削除される
2. **Given** 90日未満のエクスポートファイルが存在する、**When** S3 ライフサイクルルールが評価される、**Then** 該当ファイルは削除されない

---

### Edge Cases

- エクスポート実行中に DynamoDB に新規レコードが書き込まれた場合、当該レコードはエクスポートに含まれないことがある（PITR の時点スナップショット仕様）
- 同日に複数回エクスポートが実行された場合（手動再実行など）、S3 に複数の世代が保存される
- エクスポートが途中で失敗した場合、S3 に不完全なファイルが残る可能性があるが、次回実行時に別の日付プレフィックスで新たに出力される
- PITR が無効化されている期間中にスケジュール実行されると失敗する；失敗はログに記録されるがユーザー応答には影響しない

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: システムは DynamoDB 利用履歴テーブルの PITR（Point-in-Time Recovery）を常時有効にしなければならない
- **FR-002**: システムは毎日 UTC 00:00 に自動的に DynamoDB テーブル全体を S3 へエクスポートしなければならない
- **FR-003**: エクスポート先は既存の usage-history S3 バケット内の `dynamodb-exports/{YYYY/MM/DD}/` プレフィックスでなければならない（content/、attachments/ と同一バケット）
- **FR-004**: エクスポートデータは S3 上で90日後に自動削除されなければならない
- **FR-005**: エクスポートジョブの成否は CloudWatch に記録されなければならない
- **FR-006**: エクスポートの失敗はユーザーの Slack 応答に影響を与えてはならない（fail-open）
- **FR-007**: エクスポートの実行には最小権限 IAM ポリシーを適用しなければならない

### Key Entities

- **UsageHistoryTable**: DynamoDB テーブル。PITR を有効化する対象。チャンネルごとの利用履歴メタデータを保持する
- **UsageHistoryBucket**: S3 バケット。エクスポート先。既存の `content/`・`attachments/` プレフィックスと同一バケットに `dynamodb-exports/` プレフィックスを追加する
- **DailyExportJob**: 毎日定時に起動するスケジュールジョブ。DynamoDB テーブルを S3 へエクスポートする責務を持つ

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: エクスポートジョブが毎日定時に自動実行され、過去30日間の実行成功率が95%以上である
- **SC-002**: エクスポート完了から S3 でのファイル参照可能まで60分以内である
- **SC-003**: 90日を超えた `dynamodb-exports/` プレフィックスのオブジェクトが自動削除されている（手動確認で100%）
- **SC-004**: エクスポートジョブの失敗が発生した場合、CloudWatch アラームが管理者に通知される

## Assumptions

- エクスポート形式は AWS ネイティブの DynamoDB エクスポート機能の標準出力（DynamoDB JSON）を使用する
- エクスポートのスケジュールは JST 00:00（UTC 15:00）とする
- PITR は既存の usage-history テーブルに対して新たに有効化する（現時点では無効と仮定）
- エクスポートの再実行（手動）は必要に応じて管理者が AWS コンソールまたは CLI から実施できれば十分とする（自動リトライは対象外）
- エクスポートデータの読み取りアクセスは管理者のみとし、エージェントランタイムからの読み取り権限は付与しない

## Out of Scope

- エクスポートデータを使ったクエリ・分析機能（Athena 連携など）
- エクスポート失敗時の自動リトライ
- エクスポートデータの復元（リストア）手順の自動化
