# Implementation Plan: 柔軟なホワイトリスト認可

**Branch**: `008-flexible-whitelist` | **Date**: 2025-01-30 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/008-flexible-whitelist/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

ホワイトリスト認可ロジックを柔軟化し、設定されていないエンティティ（team_id、user_id、channel_id）に対して制限をかけないようにする。現在の AND 条件（すべてのエンティティがホワイトリストに含まれている必要がある）から、設定されたエンティティのみをチェックする条件付き AND 条件に変更する。これにより、部分的なホワイトリスト設定が可能になり、未設定時は全許可となる。

**技術的アプローチ**:

- `authorization.py`の`authorize_request()`関数を修正し、各エンティティのチェック前にホワイトリストセットが空かどうかを確認
- `whitelist_loader.py`の空のホワイトリストチェックを削除または条件付きにする（設定読み込み失敗時のみ fail-closed）
- 既存のデータ構造（Dict[str, Set[str]]）をそのまま活用し、空のセットで「制限なし」を表現

## Technical Context

**Language/Version**: Python 3.11+  
**Primary Dependencies**: boto3 (AWS SDK), slack-sdk (Python), AWS Lambda runtime  
**Storage**: DynamoDB (whitelist configuration), AWS Secrets Manager (alternative), Environment variables (fallback)  
**Testing**: pytest  
**Target Platform**: AWS Lambda (Linux serverless)  
**Project Type**: single (Lambda function)  
**Performance Goals**: 認可チェックのレイテンシを既存実装と同等またはそれ以下を維持（<10ms p95）  
**Constraints**:

- 既存のキャッシュメカニズム（5 分 TTL）を維持
- fail-closed 動作を維持（設定読み込み失敗時は全拒否）
- 後方互換性を維持（全エンティティ設定時は従来動作）  
  **Scale/Scope**:
- 既存の Lambda 関数（slack-event-handler）の修正
- ホワイトリスト設定ソース（DynamoDB/Secrets Manager/環境変数）の動作変更なし
- 既存のテストケースの更新が必要

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### I. Security-First Architecture ✅

**Status**: PASS  
**Rationale**: この機能は既存のセキュリティレイヤー（3c. 認可）を拡張するものであり、セキュリティを弱めるものではない。設定されていないエンティティを無視する動作は、管理者が意図的に制限を緩和するための機能であり、fail-closed 動作（設定読み込み失敗時は全拒否）は維持される。

### II. Non-Blocking Async Processing ✅

**Status**: PASS  
**Rationale**: 認可チェックは既存の同期的な処理であり、変更後も同様に動作する。非同期処理への影響なし。

### III. Context History Management ✅

**Status**: PASS  
**Rationale**: この機能は認可レイヤーのみに影響し、コンテキスト履歴管理には影響しない。

### IV. Observability & Monitoring ✅

**Status**: PASS  
**Rationale**: 既存のログ（structured JSON）と CloudWatch メトリクス（WhitelistAuthorizationSuccess/Failed）を維持。新しいメトリクスは不要だが、ログに「設定されていないエンティティをスキップ」の情報を追加可能。

### V. Error Handling & Resilience ✅

**Status**: PASS  
**Rationale**: 既存のエラーハンドリング（fail-closed、設定読み込み失敗時の処理）を維持。新しいエラー条件は追加しない。

### VI. Cost Management ✅

**Status**: PASS  
**Rationale**: 認可チェックのコストへの影響なし。既存のキャッシュメカニズムを維持。

### VII. Compliance Standards ✅

**Status**: PASS  
**Rationale**: 認可ロジックの変更であり、コンプライアンス要件への影響なし。PII 処理、暗号化、監査ログは既存のまま。

### VIII. Testing Discipline ✅

**Status**: PASS  
**Rationale**: 既存の BDD テストシナリオを更新し、新しい動作（部分的なホワイトリスト設定、空のホワイトリスト時の全許可）をカバーするテストを追加する必要がある。

**Overall Gate Status**: ✅ PASS - All constitution principles satisfied

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
lambda/slack-event-handler/
├── authorization.py          # 修正: authorize_request()関数のロジック変更
├── whitelist_loader.py       # 修正: 空のホワイトリスト時のエラー処理変更
└── tests/
    ├── test_authorization.py  # 更新: 新しい動作のテストケース追加
    └── test_whitelist_loader.py  # 更新: 空のホワイトリスト時のテスト追加
```

**Structure Decision**: 既存の Lambda 関数（slack-event-handler）内の認可モジュールを修正する。新しいファイルは作成せず、既存の`authorization.py`と`whitelist_loader.py`を更新する。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

_No violations - all constitution principles satisfied without complexity increases._

## Phase 0: Outline & Research ✅

**Status**: Complete  
**Output**: `research.md`

### Research Questions Resolved

1. **RQ-1**: 空のホワイトリスト時の動作変更 - 全許可に変更、設定読み込み失敗時のみ fail-closed
2. **RQ-2**: 部分的なホワイトリスト設定の実装方法 - 空のセットチェックで実装
3. **RQ-3**: 後方互換性の維持方法 - 設定されたエンティティのみをスキップ、既存動作は維持
4. **RQ-4**: エラーハンドリングとログ - 既存のログ形式を維持、スキップ情報を追加
5. **RQ-5**: パフォーマンスへの影響 - 最小限（O(1)チェックのみ追加）

**Key Decisions**:

- 既存のデータ構造（Dict[str, Set[str]]）をそのまま活用
- 空のセットで「制限なし」を表現
- 設定読み込み失敗時のみ fail-closed を維持

## Phase 1: Design & Contracts ✅

**Status**: Complete  
**Outputs**: `data-model.md`, `contracts/authorization-api.md`, `quickstart.md`

### Data Model

- **Whitelist Configuration**: 各エンティティセットが空の場合、そのエンティティのチェックをスキップ
- **Authorization Request**: リクエストに含まれるエンティティがホワイトリストに設定されていない場合、チェックをスキップ
- **Authorization Result**: 設定されていないエンティティは`unauthorized_entities`に含まれない

### API Contracts

- `authorize_request()`関数の動作を明確化
- 空のホワイトリスト、部分的な設定、全エンティティ設定の各ケースを文書化

### Quick Start Guide

- 使用方法、設定例、テスト方法、トラブルシューティングを文書化

## Phase 2: Task Breakdown

**Status**: Pending  
**Next Command**: `/speckit.tasks`

タスクの詳細な分解は`/speckit.tasks`コマンドで実行されます。
