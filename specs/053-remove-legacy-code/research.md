# Research: 053-remove-legacy-code

**Date**: 2026-03-24  
**Branch**: `053-remove-legacy-code`

## Research Summary

Three deletion targets were investigated for safety. All are confirmed safe to delete.

---

## RES-001: `agent/verification-agent/` ディレクトリ (P1)

### Decision: SAFE TO DELETE

### Investigation

| Check | Result |
|-------|--------|
| CI/CD 参照 (`.github/`, `buildspec.yml`) | なし（CI ワークフロー自体が存在しない） |
| Dockerfile / Docker ビルドコンテキスト | 不使用 — CDK は `../../../src` を参照 (`verification-agent-ecr.ts` L37-46) |
| CDK TypeScript | `agent/` への参照なし |
| デプロイスクリプト (`scripts/`, zone `scripts/`) | 参照なし |
| package.json / Makefile / pyproject.toml | 参照なし |
| Python import（ディレクトリ外から） | 参照なし |

### Scope

33 ファイル（Python モジュール 18、テスト 10、README 1、requirements.txt 1、スクリプト 1、conftest 1、`__init__.py` 1）。

### Rationale

CHANGELOG で `src/` + `tests/` への移行が記録済み。Docker イメージビルドは `src/` のみを参照。旧ツリーは `orchestrator.py` 等の新モジュールを含まず、`pipeline.py` は旧 `route_request` パスを使用。完全にスーパーセッドされている。

### Alternatives Considered

- 段階的削除（テストのみ残す）→ 不要。ディレクトリ全体がデッドコードであり、部分削除にメリットなし。

### Caveats

- `docs/license-audit.md` (L86) に旧パスへの言及あり → ドキュメント更新で対応。
- `CHANGELOG.md` に移行記録あり → 歴史的記録として維持（変更不要）。

---

## RES-002: `api_gateway_client.py` + テスト (P2)

### Decision: SAFE TO DELETE

### Investigation

| Check | Result |
|-------|--------|
| `handler.py` からの import | なし — `handler.py` は `api_gateway_client` を import していない |
| 他 Python ファイルからの import | なし — `invoke_execution_api` は当該ファイルとテストのみに存在 |
| CDK コード | 参照なし |
| デプロイスクリプト | 参照なし |
| CI/CD 設定 | 参照なし |

### Files

| File | Path |
|------|------|
| Module | `verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler/api_gateway_client.py` |
| Test | `verification-zones/verification-agent/cdk/lib/lambda/slack-event-handler/tests/test_api_gateway_client.py` |

### Rationale

A2A 移行（spec 015）完了後、API Gateway + SigV4 経由の Execution API 呼び出しは廃止。`handler.py` は A2A パスのみを使用。モジュールとそのテストは自己完結しており、他コードへの影響なし。

### Alternatives Considered

- 非推奨マーカー付与のみ → 不要。呼び出し元がゼロのため、残す理由がない。

### Caveats

- Lambda パッケージングは `slack-event-handler/` ディレクトリ全体をバンドルする可能性があるが、import されないため実行時に影響しない。削除によりパッケージサイズが微減する。

---

## RES-003: `router.py` + `test_router.py` (P3)

### Decision: SAFE TO DELETE（条件付き → 条件充足済み）

### Investigation

| Check | Result |
|-------|--------|
| `orchestrator.py` からの import | **なし** — `orchestrator.py` は `router` を一切参照していない |
| `pipeline.py` (`src/`) からの import | **なし** — `pipeline.py` は `orchestrator` のみを import |
| `main.py` からの import | **なし** |
| 他の `src/` モジュールからの import | **なし** |
| `tests/test_router.py` | **あり** — テストファイルのみが `from router import ...` を使用 |
| 旧 `agent/verification-agent/pipeline.py` | **あり** — ただし P1 で旧ディレクトリ全体を削除対象 |

### Key Finding

spec 作成時の仮定「`orchestrator.py` が `router.py` を参照」は**不正確**。実際には `orchestrator.py` は `router.py` を一切 import しておらず、完全に独立。本番コードからの参照はゼロ。

### Rationale

- CHANGELOG に「`router.py` は後方互換のために維持」と記載されているが、実際には **どの本番コードも参照していない**
- `pipeline.py` は `run_orchestration_loop()` を使用しており、`route_request()` は呼ばれない
- 唯一の参照元は `tests/test_router.py`（テスト専用）と旧 `agent/` ツリー内（P1 で削除）
- 削除時に `tests/test_router.py` も同時に削除すれば破壊的変更なし

### Alternatives Considered

- 非推奨のまま維持 → 不要。本番参照ゼロかつ、維持しても後方互換の対象が存在しない。
- `orchestrator.py` へのリダイレクト shim 化 → 不要。`orchestrator.py` は異なるインターフェース（`OrchestrationRequest`）を使用しており、API 互換性なし。
