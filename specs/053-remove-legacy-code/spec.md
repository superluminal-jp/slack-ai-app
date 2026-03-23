# Feature Specification: レガシーコードを削除（Remove Legacy Code）

**Feature Branch**: `053-remove-legacy-code`  
**Created**: 2026-03-24  
**Status**: Draft  
**Input**: User description: "レガシーコードを削除"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 不要な旧 verification-agent ディレクトリの削除 (Priority: P1)

開発者として、`verification-zones/verification-agent/agent/verification-agent/` 配下に残存する旧ディレクトリツリーを削除したい。これにより、正規の `src/` との混同を防ぎ、メンテナンス負荷を軽減する。

**Why this priority**: 旧ディレクトリはもはやビルド・デプロイ（Docker / CDK）で参照されていないが、開発者が誤って旧コードを編集するリスクがある。ファイル数が約33と最大規模のレガシー残存物であり、削除のインパクトが最も大きい。

**Independent Test**: `verification-zones/verification-agent/agent/` ディレクトリが存在しないことを確認し、既存のテスト（`python -m pytest tests/ -v`）・ビルド（CDK synth）・デプロイが正常に完了することで検証できる。

**Acceptance Scenarios**:

1. **Given** 旧ディレクトリ `agent/verification-agent/` が存在する, **When** 削除を実施する, **Then** `verification-zones/verification-agent/agent/` ディレクトリが完全に除去される
2. **Given** 旧ディレクトリが削除された状態, **When** verification-agent の既存テストスイートを実行する, **Then** すべてのテストが成功する
3. **Given** 旧ディレクトリが削除された状態, **When** CDK synth を実行する, **Then** テンプレート生成が正常に完了する

---

### User Story 2 - 未使用の API Gateway クライアントの削除 (Priority: P2)

開発者として、`slack-event-handler/api_gateway_client.py` およびそのテストを削除したい。A2A 通信への移行が完了しており、旧 Execution API（API Gateway + SigV4）クライアントは呼び出されていない。

**Why this priority**: デッドコードの存在はセキュリティレビューやテスト実行のノイズとなる。ただし `handler.py` から import されていないため実行時リスクは低く、P2 とする。

**Independent Test**: `api_gateway_client.py` とそのテストファイルが削除されていることを確認し、Lambda ハンドラーの既存テストが引き続きパスすることで検証できる。

**Acceptance Scenarios**:

1. **Given** `api_gateway_client.py` が `slack-event-handler/` に存在する, **When** 削除を実施する, **Then** 当該ファイルおよび対応テストが除去される
2. **Given** ファイル削除後, **When** `handler.py` の既存テストを実行する, **Then** すべてのテストが成功する
3. **Given** ファイル削除後, **When** CDK synth および Lambda デプロイを実行する, **Then** エラーなく完了する

---

### User Story 3 - 非推奨 router.py の削除検討 (Priority: P3)

開発者として、`verification-zones/verification-agent/src/router.py` の現在の利用状況を調査し、安全に削除可能であれば削除したい。Strands-based orchestrator に機能が移行済みだが、後方互換のために残されている可能性がある。

**Why this priority**: CHANGELOG で「後方互換のために維持」と明記されており、まだ参照箇所がある可能性がある。安全に削除できるかの調査が先行する必要があるため P3 とする。

**Independent Test**: `router.py` への import を grep で検索し、参照がゼロであることを確認した上で削除し、テストスイートが全パスすることで検証できる。

**Acceptance Scenarios**:

1. **Given** `router.py` が存在する, **When** コードベース全体で `from router import` / `import router` を検索する, **Then** `orchestrator.py` 以外からの参照がないことが確認される
2. **Given** 参照がないことが確認された, **When** `router.py` および `tests/test_router.py` を削除する, **Then** 全テストが成功する
3. **Given** 依然として参照が存在する場合, **When** 削除を見送る, **Then** 当該ファイルは維持され、削除見送り理由がドキュメントに記録される

---

### Edge Cases

- 旧ディレクトリ削除後、CI/CD パイプラインが旧パスを参照していないか
- spec ファイル内の旧パス参照（`cdk/lib/verification/agent/verification-agent` 等）は歴史的記録として残すか
- `router.py` を削除する場合、`orchestrator.py` 内のフォールバック import パスが壊れないか
- デプロイスクリプトが旧ディレクトリを前提としていないか

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `verification-zones/verification-agent/agent/verification-agent/` ディレクトリツリー全体を削除しなければならない
- **FR-002**: `verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler/api_gateway_client.py` を削除しなければならない
- **FR-003**: `api_gateway_client.py` に対応するテストファイル `tests/test_api_gateway_client.py` を削除しなければならない
- **FR-004**: `router.py` の削除は、コードベース内の参照状況調査の結果に基づいて判断しなければならない
- **FR-005**: 削除後、既存の全テストスイート（Python pytest, CDK Jest）がパスしなければならない
- **FR-006**: 削除後、CDK synth がエラーなく完了しなければならない
- **FR-007**: 削除対象ファイルの一覧と削除理由を CHANGELOG に記録しなければならない

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 削除対象のファイル・ディレクトリがリポジトリから完全に除去されている
- **SC-002**: 既存テストスイートの全テストがパスする（パス率 100%）
- **SC-003**: CDK synth が全ゾーンでエラーなく完了する
- **SC-004**: デプロイスクリプト（`scripts/deploy.sh`）が正常に実行完了する
- **SC-005**: コードベース内に削除対象への参照（import 文等）が残存しない

## Assumptions

- A2A 通信への完全移行は完了しており、旧 Execution API（API Gateway）パスは本番で使用されていない
- `agent/verification-agent/` ディレクトリは Docker ビルドコンテキスト（`src/`）に含まれておらず、デプロイに影響しない
- CI/CD パイプラインは `src/` ベースのパスのみを参照している
- spec ディレクトリ内の歴史的パス参照はドキュメントとして維持し、本タスクの削除対象外とする

## Scope Boundaries

### In Scope

- `verification-zones/verification-agent/agent/` ディレクトリの削除
- `slack-event-handler/api_gateway_client.py` およびそのテストの削除
- `router.py` の参照調査と条件付き削除
- CHANGELOG・README の更新

### Out of Scope

- spec ディレクトリ内の歴史的パス参照の修正
- 新機能の追加やリファクタリング
- CDK コードの構造変更
- デプロイスクリプトのロジック変更（旧パス参照がなければ不要）
