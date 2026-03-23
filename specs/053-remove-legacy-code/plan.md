# Implementation Plan: レガシーコードを削除（Remove Legacy Code）

**Branch**: `053-remove-legacy-code` | **Date**: 2026-03-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/053-remove-legacy-code/spec.md`

## Summary

リポジトリ内に残存する3種のレガシーコードを安全に削除する。対象は (1) 旧 `agent/verification-agent/` ディレクトリツリー（33ファイル）、(2) 未使用の `api_gateway_client.py` + テスト、(3) 非推奨 `router.py` + テスト。全対象について本番コードからの参照がゼロであることを調査で確認済み（[research.md](research.md) 参照）。

## Technical Context

**Language/Version**: Python 3.11 (コンテナ: `python:3.11-slim`, ARM64), TypeScript 5.x (CDK)
**Primary Dependencies**: 変更なし（削除のみ）
**Storage**: 変更なし（DynamoDB / S3 スキーマに影響なし）
**Testing**: pytest (Python agents), Jest (CDK)
**Target Platform**: AWS Bedrock AgentCore (ARM64 Linux container)
**Project Type**: Slack AI アプリケーション（マルチエージェント構成）
**Performance Goals**: N/A（コード削除のみ、パフォーマンスへの影響なし）
**Constraints**: 既存テスト全パス、CDK synth 成功、デプロイスクリプト正常動作
**Scale/Scope**: ファイル削除 35+ 件、新規コード 0 行

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Pre-Phase 0 | Post-Phase 1 | Notes |
|-----------|:-----------:|:------------:|-------|
| I. Spec-Driven Development | PASS | PASS | spec → plan → tasks → code の流れを遵守 |
| II. Test-Driven Development | PASS | PASS | 削除対象のテストのみ除去。既存テストは影響なし。テスト削除前に既存テストが green であることを確認 |
| III. Security-First | PASS | PASS | セキュリティパイプライン（existence → whitelist → rate limit）に変更なし |
| IV. Fail-Open/Closed | PASS | PASS | エラーハンドリングに変更なし |
| V. Zone-Isolated Architecture | PASS | PASS | ゾーン境界に変更なし |
| VI. Documentation & Deploy-Script Parity | PASS | PASS | CHANGELOG, README, CLAUDE.md を同一コミットで更新 |
| VII. Clean Code Identifiers | PASS | PASS | コード追加なし |

## Project Structure

### Documentation (this feature)

```text
specs/053-remove-legacy-code/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 output — deletion safety analysis
├── data-model.md        # Phase 1 output — N/A (no data model changes)
├── quickstart.md        # Phase 1 output — verification steps
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (affected paths)

```text
verification-zones/verification-agent/
├── agent/                              # DELETE — 旧ディレクトリツリー (33 files)
│   └── verification-agent/
│       ├── *.py                        # 旧 Python モジュール群
│       ├── tests/                      # 旧テスト群
│       ├── scripts/                    # 旧スクリプト
│       ├── requirements.txt            # 旧依存定義
│       └── README.md                   # 旧 README
├── src/
│   └── router.py                       # DELETE — 非推奨、本番参照ゼロ
├── tests/
│   └── test_router.py                  # DELETE — router.py のテスト
└── cdk/lib/lambda/slack-event-handler/
    ├── api_gateway_client.py           # DELETE — 未使用 API Gateway クライアント
    └── tests/
        └── test_api_gateway_client.py  # DELETE — 上記のテスト
```

**Structure Decision**: 既存構造に変更なし。対象ファイル・ディレクトリの削除のみ。

## Deletion Execution Order

リスクを最小化するため、以下の順序で削除を実行する：

### Step 1: 事前検証（既存テスト全パス確認）

削除前にベースラインを確立：
- verification-agent pytest
- verification-agent CDK Jest
- slack-event-handler Lambda テスト

### Step 2: P1 — 旧 `agent/` ディレクトリ削除

- `verification-zones/verification-agent/agent/` を再帰削除
- verification-agent pytest 再実行 → 全パス確認
- CDK synth → 成功確認

### Step 3: P2 — `api_gateway_client.py` + テスト削除

- `api_gateway_client.py` 削除
- `tests/test_api_gateway_client.py` 削除
- slack-event-handler テスト再実行 → 全パス確認

### Step 4: P3 — `router.py` + テスト削除

- `src/router.py` 削除
- `tests/test_router.py` 削除
- verification-agent pytest 再実行 → 全パス確認

### Step 5: ドキュメント更新

- CHANGELOG.md に [Unreleased] エントリ追加
- `docs/license-audit.md` の旧パス参照を更新（該当行を削除または修正）
- README / CLAUDE.md に変更があれば更新

### Step 6: 最終検証

- 全ゾーン pytest
- 全ゾーン CDK synth
- デプロイスクリプト dry-run（可能であれば）

## Complexity Tracking

> No Constitution Check violations. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| (none)    |            |                                      |
