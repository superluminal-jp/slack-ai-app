# Implementation Plan: Whitelist Team and User Labels

**Branch**: `048-whitelist-entity-labels` | **Date**: 2026-03-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/048-whitelist-entity-labels/spec.md`

## Summary

`channel_label` フィールド（047-whitelist-label で導入）を `team_label` / `user_label` にも対称拡張する。DynamoDB・Secrets Manager・環境変数の 3 つの設定経路すべてで `team_id` / `user_id` エントリのラベルを読み込み、`AuthorizationResult` に格納して認証ログに出力する。認証判定ロジックは一切変更しない。

## Technical Context

**Language/Version**: Python 3.11
**Primary Dependencies**: boto3 ~=1.42.0、pytest（テスト）— 新規依存なし
**Storage**: DynamoDB（変更なし — `label` はスパース属性として全エンティティタイプに適用可能）
**Testing**: pytest（`verification-zones/verification-agent/tests/`）
**Target Platform**: Amazon Bedrock AgentCore Runtime（ARM64 コンテナ）+ AWS Lambda（slack-event-handler）
**Project Type**: サーバーレス Python マイクロサービス（内部モジュール変更）
**Performance Goals**: 変更なし — ラベル取得はメモリ dict ルックアップで O(1)
**Constraints**: 認証セキュリティパイプラインへの影響ゼロ、後方互換 100%
**Scale/Scope**: 3ファイル変更（src/authorization.py、Lambda authorization.py、Lambda whitelist_loader.py）+ 1テストファイル追加変更

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Spec-Driven Development | ✅ PASS | spec.md → plan.md → tasks.md → code のトレーサビリティあり |
| II. Test-Driven Development | ✅ PASS | テストタスクが実装タスクに先行する。Red→Green→Refactor 必須 |
| III. Security-First | ✅ PASS | 認証判定ロジック無変更。`label` はログのみに使用 |
| IV. Fail-Open / Fail-Closed | ✅ PASS | ラベル解決は `dict.get()` で None フォールバック — パイプラインをブロックしない |
| V. Zone-Isolated Architecture | ✅ PASS | verification-agent ゾーン内のみ変更、ゾーン境界を越えない |
| VI. Docs & Deploy-Script Parity | ✅ PASS | CHANGELOG / README / CLAUDE.md をタスクに含める |
| VII. Clean Code Identifiers | ✅ PASS | スペック番号・ブランチ名をコードに含めない |

**Post-design re-check**: 設計はインフラ変更・新規依存・API 変更を含まないためゲート通過を維持。

## Project Structure

### Documentation (this feature)

```text
specs/048-whitelist-entity-labels/
├── plan.md          # This file
├── research.md      # Phase 0 output ✅
├── data-model.md    # Phase 1 output ✅
├── quickstart.md    # Phase 1 output ✅
└── tasks.md         # Phase 2 output (speckit.tasks)
```

### Source Code (affected files only)

```text
verification-zones/verification-agent/
├── src/
│   └── authorization.py          # 変更: AuthorizationResult + 全ローダー + authorize_request
├── tests/
│   └── test_authorization.py     # 変更: team_label / user_label テスト追加
└── cdk/lib/lambda/slack-event-handler/
    ├── authorization.py           # 変更: AuthorizationResult + authorize_request（Lambda コピー）
    └── whitelist_loader.py        # 変更: 全ローダー（Lambda コピー）
```

**Structure Decision**: Verification-agent ゾーン内の既存ファイルへの追加変更のみ。新規ファイル・新規モジュール・CDK 変更なし。

## Affected Functions (per file)

### `src/authorization.py`

| 関数 | 変更内容 |
|------|---------|
| `AuthorizationResult` dataclass | `team_label: Optional[str] = None`、`user_label: Optional[str] = None` フィールドを `channel_label` の前に追加 |
| `_get_whitelist_from_dynamodb()` | `team_labels: {}` / `user_labels: {}` を whitelist dict に追加。`entity_type == "team_id"` / `"user_id"` の item から `label` を読み込み |
| `_get_whitelist_from_secrets_manager()` | `team_ids` / `user_ids` の各要素を `str` または `{"id": "...", "label": "..."}` として解析。`team_labels` / `user_labels` dict を構築 |
| `_get_whitelist_from_env()` | `WHITELIST_TEAM_IDS` / `WHITELIST_USER_IDS` トークンを `ID:label` 形式で解析。`team_labels` / `user_labels` dict を構築 |
| `load_whitelist_config()` | キャッシュ辞書に `team_labels` / `user_labels` を追加。戻り値に含める |
| `authorize_request()` | `team_label` / `user_label` を whitelist から解決。成功・失敗ログに注入（truthy の場合のみ）。`AuthorizationResult` にセット |

### `cdk/lib/lambda/slack-event-handler/whitelist_loader.py`

| 関数 | 変更内容 |
|------|---------|
| `get_whitelist_from_dynamodb()` | src/authorization.py の `_get_whitelist_from_dynamodb()` と同等の変更 |
| `get_whitelist_from_secrets_manager()` | src/authorization.py の `_get_whitelist_from_secrets_manager()` と同等の変更 |
| `get_whitelist_from_env()` | src/authorization.py の `_get_whitelist_from_env()` と同等の変更 |
| `load_whitelist_config()` | src/authorization.py の `load_whitelist_config()` と同等の変更 |

### `cdk/lib/lambda/slack-event-handler/authorization.py`

| 関数 | 変更内容 |
|------|---------|
| `AuthorizationResult` dataclass | src/authorization.py と同等の変更 |
| `authorize_request()` | src/authorization.py と同等の変更 |

## Complexity Tracking

> 憲法違反なし。このセクションは記録のみ。

なし。
