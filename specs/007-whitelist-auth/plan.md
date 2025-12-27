# Implementation Plan: ホワイトリスト認可

**Branch**: `007-whitelist-auth` | **Date**: 2025-01-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-whitelist-auth/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

ホワイトリスト認可機能を実装し、署名検証（3a）と Existence Check（3b）の後に、team_id、user_id、channel_id の 3 つのエンティティすべてがホワイトリストに含まれている場合のみリクエストを承認する。未認可の場合は 403 Forbidden を返し、セキュリティログに記録する。ホワイトリスト設定は環境変数、AWS Secrets Manager、または DynamoDB から読み込み、パフォーマンス最適化のためキャッシュを使用する。

## Technical Context

**Language/Version**: Python 3.11+  
**Primary Dependencies**: slack-sdk>=3.27.0, boto3>=1.34.0, requests>=2.31.0  
**Storage**: DynamoDB (whitelist configuration and cache), AWS Secrets Manager (optional whitelist storage)  
**Testing**: pytest (unit tests), BDD scenarios (Gherkin) for security-critical paths  
**Target Platform**: AWS Lambda (Python 3.11 runtime)  
**Project Type**: Serverless Lambda function (single project)  
**Performance Goals**: ホワイトリスト認可の処理時間 ≤50ms (p95)  
**Constraints**:

- Fail-closed 原則（設定読み込み失敗時はすべて拒否）
- セキュリティログへの記録が必須
- キャッシュ使用でレイテンシ最小化
- 環境変数、Secrets Manager、DynamoDB の 3 つの設定ソースに対応  
  **Scale/Scope**:
- 複数の Slack ワークスペース（team_id）
- 各ワークスペース内の複数ユーザー（user_id）
- 各ワークスペース内の複数チャンネル（channel_id）
- ホワイトリストエントリ数: 数百〜数千規模を想定

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

**Status**: ✅ PASSED (Pre-Phase 0 and Post-Phase 1)

### I. Security-First Architecture ✅

- **HMAC SHA256 署名検証**: 既存実装（3a）を利用
- **認可チェック**: ホワイトリスト認可（3c）を実装
- **入力検証**: 既存の validation.py を利用
- **セキュリティログ**: すべての認可結果をログに記録（FR-004, FR-006）

**Compliance**: ✅ PASS - 多層防御のレイヤー 3c として実装

### II. Non-Blocking Async Processing ✅

- ホワイトリスト認可は同期的に実行（処理時間 ≤50ms）
- 認可失敗時は即座に 403 を返す（非ブロッキング）

**Compliance**: ✅ PASS - 認可チェックは高速で、非同期処理は不要

### III. Context History Management ✅

- ホワイトリスト認可はコンテキスト履歴に依存しない

**Compliance**: ✅ PASS - 本機能はコンテキスト履歴を使用しない

### IV. Observability & Monitoring ✅

- 構造化 JSON ログ（correlation ID、タイムスタンプ、イベントタイプ）
- CloudWatch メトリクス: 認可成功/失敗、処理時間
- セキュリティイベントのログ記録（FR-004, FR-006）
- PII はログに含めない（team_id、user_id、channel_id のみ）

**Compliance**: ✅ PASS - すべての要件を満たす

### V. Error Handling & Resilience ✅

- 設定読み込み失敗時: fail-closed（すべて拒否）
- ホワイトリストが空の場合: fail-closed（すべて拒否）
- エラーハンドリング: 適切な例外処理とログ記録

**Compliance**: ✅ PASS - fail-closed 原則に従う

### VI. Cost Management ✅

- ホワイトリスト認可は Bedrock 呼び出し前に実行されるため、コスト管理に直接影響しない
- DynamoDB キャッシュ使用で API 呼び出しコストを削減

**Compliance**: ✅ PASS - コスト管理要件に準拠

### VII. Compliance Standards ✅

- SOC 2 Type II: セキュリティログ記録、アクセス制御
- GDPR: PII をログに含めない
- 監査ログ: すべての認可結果を記録

**Compliance**: ✅ PASS - コンプライアンス要件を満たす

### VIII. Testing Discipline ✅

- BDD テストシナリオ（Gherkin）: セキュリティクリティカルな認可フロー
- 統合テスト: エンドツーエンドの認可フロー
- セキュリティテスト: 未認可アクセスの検証

**Compliance**: ✅ PASS - テスト要件を満たす

**Overall Constitution Compliance**: ✅ PASS - すべての原則に準拠

## Project Structure

### Documentation (this feature)

```text
specs/007-whitelist-auth/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
lambda/verification-stack/slack-event-handler/
├── handler.py              # Main Lambda handler (add whitelist authorization call)
├── authorization.py        # NEW: Whitelist authorization module
├── whitelist_loader.py     # NEW: Whitelist configuration loader
├── logger.py               # Existing structured logging
├── slack_verifier.py       # Existing signature verification (3a)
├── existence_check.py      # Existing existence check (3b)
├── validation.py           # Existing input validation
├── requirements.txt        # Python dependencies
└── tests/
    ├── test_authorization.py        # NEW: Unit tests for authorization
    ├── test_whitelist_loader.py     # NEW: Unit tests for whitelist loader
    ├── test_authorization.feature   # NEW: BDD scenarios for authorization
    └── test_handler.py              # Update: Add whitelist authorization tests
```

**Structure Decision**: 既存の `lambda/verification-stack/slack-event-handler/` ディレクトリ構造に新しいモジュールを追加。`authorization.py` でホワイトリスト認可ロジックを実装し、`whitelist_loader.py` で設定読み込みを実装する。`handler.py` は既存の Existence Check の後にホワイトリスト認可を呼び出すように更新する。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations - all constitution principles are satisfied.
