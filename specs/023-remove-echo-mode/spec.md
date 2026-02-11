# Feature Specification: エコーモード削除

**Feature Branch**: `023-remove-echo-mode`
**Created**: 2026-02-11
**Status**: Draft
**Input**: User description: "不要になったエコーモードを削除"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - エコーモード関連コードの完全除去 (Priority: P1)

開発チームとして、不要になったエコーモード（`VALIDATION_ZONE_ECHO_MODE` 環境変数による条件分岐）を全コンポーネントから削除し、コードベースの保守性を向上させたい。

エコーモードは Verification Agent の接続検証用に Feature 017〜018 で導入された一時的なテスト機能であり、Feature 022 で正常フロー（エコーモード無効状態）の TDD 検証が完了した。本番環境ではエコーモードを使用しておらず、検証目的を達成したため、デッドコードとして除去する。

**Why this priority**: エコーモードのコードが残っていると、パイプライン処理フロー理解の妨げとなり、新規メンバーの混乱を招く。除去が本機能の中核目的。

**Independent Test**: エコーモード関連コード（環境変数チェック、条件分岐、`[Echo]` プレフィックス付き応答）がコードベースから完全に消えたことを確認し、既存の正常フロー（Execution Agent 委譲）が引き続き動作することで検証可能。

**Acceptance Scenarios**:

1. **Given** Verification Agent のパイプラインコード、**When** エコーモード削除後にコードを確認する、**Then** `VALIDATION_ZONE_ECHO_MODE` 環境変数の参照が存在しない
2. **Given** Verification Agent のパイプラインコード、**When** エコーモード削除後にコードを確認する、**Then** `[Echo]` プレフィックスを付与するロジックが存在しない
3. **Given** エコーモード削除後のシステム、**When** Slack メッセージを受信する、**Then** 常に Execution Agent に委譲され、正常な応答がユーザーに返される

---

### User Story 2 - CDK 構成からのエコーモード設定除去 (Priority: P1)

インフラ管理者として、CDK スタック定義からエコーモード関連の設定（`validationZoneEchoMode` プロパティ、条件付き環境変数設定）を削除し、デプロイ構成を簡素化したい。

**Why this priority**: インフラ構成にデッドオプションが残るとデプロイ時の混乱を招く。パイプラインコードと同時に除去すべき。

**Independent Test**: CDK コード内に `validationZoneEchoMode` プロパティや関連する条件分岐が存在しないことを確認し、CDK synth が成功することで検証可能。

**Acceptance Scenarios**:

1. **Given** CDK スタック定義、**When** エコーモード削除後にコードを確認する、**Then** `validationZoneEchoMode` プロパティが型定義・コンストラクトの両方から消えている
2. **Given** CDK スタック定義、**When** エコーモード削除後にコードを確認する、**Then** `VALIDATION_ZONE_ECHO_MODE` 環境変数の条件付きセットアップが存在しない
3. **Given** エコーモード削除後の CDK コード、**When** CDK synth を実行する、**Then** エラーなくテンプレートが生成される

---

### User Story 3 - エコーモード関連テストの除去 (Priority: P2)

開発チームとして、エコーモードの動作を検証していたテスト（Feature 018 のエコーモード ON/OFF テスト）を削除し、テストスイートが現在の実装のみを検証する状態にしたい。Feature 022 で追加された正常フロー検証テストは残す。

**Why this priority**: テストコードにデッド機能のテストが残るとテスト実行時間の浪費とメンテナンスコスト増加を招く。ただしパイプライン・CDK の除去が先。

**Independent Test**: エコーモード ON 時の動作を検証するテストクラス（`Test018EchoModeAtRuntime`, `Test018EchoContentAndTarget`, `Test018EchoModeOff`）が削除され、残存テストがすべてパスすることで検証可能。

**Acceptance Scenarios**:

1. **Given** テストスイート、**When** エコーモード関連テスト削除後に全テストを実行する、**Then** 全テストがパスする
2. **Given** テストスイート、**When** エコーモード関連テスト削除後にテストファイルを確認する、**Then** `Test018EchoModeAtRuntime`, `Test018EchoContentAndTarget`, `Test018EchoModeOff` クラスが存在しない
3. **Given** テストスイート、**When** Feature 022 の正常フローテストを実行する、**Then** 全テストがパスし、エコーモードの環境変数に依存していない

---

### Edge Cases

- エコーモード関連コードを削除した結果、他のコンポーネントが暗黙的にエコーモードの存在を前提としていないか？
- Feature 022 テスト内でエコーモード OFF を前提条件として設定しているテストがある場合、その前提条件の記述を更新する必要があるか？
- `VALIDATION_ZONE_ECHO_MODE` が将来再導入された場合の混乱を防ぐため、関連 spec（017, 018, 022）のステータスを更新すべきか？

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: パイプラインコード（`pipeline.py`）から `VALIDATION_ZONE_ECHO_MODE` 環境変数の読み取りおよびエコーモード条件分岐を完全に除去すること
- **FR-002**: CDK 型定義（`stack-config.ts`）から `validationZoneEchoMode` プロパティを除去すること
- **FR-003**: CDK コンストラクト（`slack-event-handler.ts`, `verification-agent-runtime.ts`）からエコーモード関連の環境変数設定ロジックを除去すること
- **FR-004**: エコーモードの動作を検証するテスト（Feature 018 関連テストクラス）を除去すること
- **FR-005**: Feature 022 で追加された正常フロー検証テストは保持し、エコーモードの環境変数前提条件がある場合は更新すること
- **FR-006**: 削除後、Verification Agent は全メッセージを無条件に Execution Agent に委譲すること
- **FR-007**: 削除後、既存のセキュリティチェックパイプライン（存在確認・認可・レート制限）は影響を受けないこと

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: コードベース全体で `VALIDATION_ZONE_ECHO_MODE` の参照が 0 件であること
- **SC-002**: コードベース全体で `validationZoneEchoMode` の参照が 0 件であること（spec ファイルを除く）
- **SC-003**: 削除後の全テストスイートが 100% パスすること
- **SC-004**: エコーモード関連テストクラス（3 クラス）が削除され、テストファイルの行数が削減されていること
- **SC-005**: 正常フロー（メッセージ受信→Execution Agent 委譲→応答返却）が中断なく動作すること

## Assumptions

- エコーモードは本番環境で無効化されており、現在どの環境でもアクティブに使用されていない
- Feature 022 の正常フロー検証テストはエコーモードの存在に依存せず、削除後もそのまま動作する（依存がある場合は更新対象）
- 関連する Feature 017, 018, 022 の spec ファイルはアーカイブとして保持し、削除対象としない
