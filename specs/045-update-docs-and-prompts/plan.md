# Implementation Plan: docs/ フォルダ更新と docs-agent プロンプト改善

**Branch**: `045-update-docs-and-prompts` | **Date**: 2026-03-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/045-update-docs-and-prompts/spec.md`

## Summary

開発者向けドキュメント（`docs/developer/`）と docs-agent システムプロンプトを現行コードベースに同期する。
現行実装との乖離は以下の 5 点：

1. `architecture.md` が slack-search-agent・usage-history・PITR・S3 SRR・cdk-nag を記載していない
2. `architecture.md` セクション 4.3 が存在しない `execution-zones/execution-agent/src/main.py` を参照している
3. `quickstart.md` が `execution-zones/execution-agent/` を参照しており、file-creator-agent・slack-search-agent のデプロイ手順が不正確
4. `execution-agent-system-prompt.md` が旧モノリシック execution-agent を前提とした記述のまま
5. `execution-zones/docs-agent/src/system_prompt.py` のプロンプトが曖昧で検索ガイダンスを欠く

## Technical Context

**Language/Version**: Markdown (docs), Python 3.11 (system_prompt.py)
**Primary Dependencies**: N/A（ドキュメント更新のみ）
**Storage**: N/A
**Testing**: pytest（docs-agent system_prompt のスモークテスト追加）
**Target Platform**: 静的ドキュメント + docs-agent コンテナ
**Project Type**: documentation + minor Python constant update
**Performance Goals**: N/A
**Constraints**: 既存文書の構造・言語（日本語）・見出しレベルを維持する
**Scale/Scope**: 5 ファイル変更（docs/4 + system_prompt.py/1）+ テスト 1 件追加

## Constitution Check

| Principle | Gate | Status | Notes |
|-----------|------|--------|-------|
| I. Spec-Driven Development | spec → plan → tasks → code | ✅ | spec.md 作成済み |
| II. Test-Driven Development | コード変更前にテスト追加 | ✅ | system_prompt.py はコード変更。テストタスクを実装タスクより先に配置する |
| III. Security-First | セキュリティパイプライン不変 | ✅ | ドキュメント・プロンプト変更のみ、パイプライン無変更 |
| IV. Fail-open/Fail-closed | インフラ/セキュリティ境界不変 | ✅ | 変更なし |
| V. Zone-Isolated Architecture | ゾーン境界不変 | ✅ | 変更なし |
| VI. Documentation & Deploy-Script Parity | CHANGELOG, CLAUDE.md 更新 | ✅ | タスクに含める |
| VII. Clean Code Identifiers | spec 番号をコードに書かない | ✅ | system_prompt.py に番号記載しない |

**Complexity Tracking**: 違反なし。

## Project Structure

### Documentation (this feature)

```text
specs/045-update-docs-and-prompts/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── checklists/
│   └── requirements.md  # Quality checklist (already created)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (modified files)

```text
docs/
├── README.md                             # 最終更新日 + Execution Agent Prompt doc 追記
└── developer/
    ├── architecture.md                   # slack-search-agent / usage-history / S3 SRR / PITR / cdk-nag 追記、4.3 修正
    ├── quickstart.md                     # execution-agent → file-creator-agent 修正、slack-search-agent 追記
    └── execution-agent-system-prompt.md  # 旧単一エージェント前提を除去、複数エージェント方針に書き換え

execution-zones/docs-agent/
└── src/
    └── system_prompt.py                  # 検索ガイダンス・回答フォーマット・スコープ外対応を追加

execution-zones/docs-agent/
└── tests/
    └── test_system_prompt.py             # system_prompt.py の内容検証テスト（新規）

CHANGELOG.md                              # [Unreleased] エントリ追加
```

**Structure Decision**: docs/ の更新はファイル編集（100 行超のため surgical targeted edit）。system_prompt.py は 10 行未満のため全書き換え可。テストは新規ファイル。

---

## Phase 0: Research

### 乖離調査結果

#### architecture.md（673 行）

| 箇所 | 現状 | 必要な変更 |
|------|------|----------|
| セクション 1.1 ダイアグラム | Execution Zone に単一 "Execution Agent (AgentCore Runtime)" のみ。slack-search-agent なし | Execution Zone に 4 エージェント名を列挙、Verification Zone に slack-search-agent 追記 |
| セクション 1.2 コンポーネント表 | "Execution Agents" 行が役割のみ（名称なし）。DynamoDB 行が 3 テーブルのみ記載。slack-search-agent 行なし | Execution Agents に 4 エージェント名を列挙。DynamoDB に usage-history 追記。S3 行追加。slack-search-agent 行追加 |
| セクション 2.2 分離スタック図 | "DynamoDB tables (5)" + slack-search-agent なし | "(6)" に修正、Verification Stack に slack-search-agent 追記 |
| セクション 4.3 | `execution-zones/execution-agent/src/main.py` を参照（存在しない） | 4 エージェント各々の src パスを参照する説明に書き換え |
| usage-history / PITR / S3 SRR / cdk-nag | 一切記載なし | 新セクション 4.6「データ保持と監査」を追加 |

#### quickstart.md

| 箇所 | 現状 | 必要な変更 |
|------|------|----------|
| ステップ 2 CDK 依存関係 | `cd execution-zones/execution-agent/cdk && npm install` | `cd execution-zones/file-creator-agent/cdk && npm install` に修正 |
| 初回デプロイ 方法1（強制再ビルド例） | `./execution-zones/execution-agent/scripts/deploy.sh --force-rebuild` | `./execution-zones/file-creator-agent/scripts/deploy.sh --force-rebuild` に修正 |
| 方法2 手動デプロイ | `cd execution-zones/execution-agent/cdk` + `npx cdk deploy SlackAI-FileCreator-Dev` | ディレクトリを `file-creator-agent` に修正 |
| デプロイ順序注記 | "execution-agent → time-agent → docs-agent → fetch-url-agent" | "file-creator-agent → time-agent → docs-agent → fetch-url-agent → slack-search-agent" に修正 |
| デプロイ完了リソース | slack-search-agent なし | SlackSearch Agent（`SlackAI-SlackSearch-{Env}`）を追記 |
| Execution Stacks の CDK 出力例 | slack-search-agent なし | SlackSearchAgentRuntimeArn 出力を追記 |

#### execution-agent-system-prompt.md

| 箇所 | 現状 | 必要な変更 |
|------|------|----------|
| 全文 | 旧 execution-agent を前提とした単一エージェント記述 | 各エージェント（docs-agent/file-creator-agent/time-agent/fetch-url-agent）それぞれの system_prompt.py を参照する記述に書き換え |

#### docs-agent/src/system_prompt.py

現状の 6 行プロンプトは以下を欠く：
- どのカテゴリの質問に search_docs を使うか（アーキテクチャ、デプロイ、エージェント構成、セキュリティ等）
- 推奨検索キーワード例
- 回答のフォーマット指針（簡潔な文章 + ソースファイル名）
- スコープ外質問（Slack 操作、AWS 費用算出等）への対応

#### docs/README.md

- `execution-agent-system-prompt.md` が開発者向け表に未掲載
- 最終更新日が 2026-02-14

### 決定事項

| 決定 | 根拠 | 却下した代替案 |
|------|------|--------------|
| docs-agent プロンプトの言語は英語で記述（現行踏襲） | 現行プロンプトが英語、モデルへの英語指示が精度上有利 | 日本語化：モデル応答には影響なく変更コスト大 |
| architecture.md セクション 4.3 を「4 エージェント個別説明」に書き換え（コードスニペット削除） | 旧コードは存在しない。エージェントは独立ファイルを持つため個別説明が正確 | スニペットを全エージェント分追記：冗長で保守コスト大 |
| usage-history / PITR / S3 SRR / cdk-nag を既存セクション 2.2 の Verification Stack に追記 + 新セクション 4.6 | ストレージは Verification Zone に属する。ガバナンスは独立セクションで説明 | 巨大な新セクションを冒頭に追加：可読性が下がる |
| test_system_prompt.py を新規追加 | system_prompt.py はコード変更であるため TDD を適用 | 既存 test_main.py に追記：テストの関心分離のため独立ファイルが適切 |

---

## Phase 1: 設計詳細

### docs-agent FULL_SYSTEM_PROMPT 設計

改善後のプロンプトに含める内容：

```
1. ロール: SlackAI Docs Agent — プロジェクト文書の検索と回答
2. ツール使用規則:
   - 以下のカテゴリには必ず search_docs を呼ぶ：
     アーキテクチャ、エージェント構成、デプロイ手順、設定、セキュリティ、
     トラブルシューティング、DynamoDB/S3、コスト、用語定義
   - 推奨キーワード例: "architecture", "quickstart", "deploy", "whitelist",
     "execution agent", "docs-agent", "fetch-url-agent", "verification-agent",
     "security", "DynamoDB", "rate limit", "A2A", "AgentCore"
3. 回答フォーマット:
   - 文書に基づいた簡潔な回答
   - 参照元ファイルを末尾に明示（例: 参照: developer/architecture.md）
   - 不確かな情報は推測せずドキュメントを再検索
4. スコープ外の扱い:
   - Slack の操作方法、AWS 料金計算、プロジェクト外の一般的な技術質問は
     「このエージェントはプロジェクト文書の検索に特化しています」と明示
5. 検索失敗時: 一致なしと明示し、別キーワードを提案
```

### テスト設計（test_system_prompt.py）

```python
from src.system_prompt import FULL_SYSTEM_PROMPT

class TestSystemPrompt:
    """FULL_SYSTEM_PROMPT contains required guidance elements."""

    def test_contains_search_docs_instruction(self):
        assert "search_docs" in FULL_SYSTEM_PROMPT

    def test_contains_keyword_guidance(self):
        # Must mention concrete search topics
        keywords = ["architecture", "deploy", "quickstart"]
        assert any(k in FULL_SYSTEM_PROMPT.lower() for k in keywords)

    def test_contains_source_citation_instruction(self):
        # Must instruct citing the source document
        assert any(word in FULL_SYSTEM_PROMPT.lower()
                   for word in ["source", "参照", "ファイル", "file", "reference"])

    def test_contains_out_of_scope_instruction(self):
        # Must handle out-of-scope questions
        assert any(word in FULL_SYSTEM_PROMPT.lower()
                   for word in ["scope", "specialize", "特化", "スコープ"])
```

### architecture.md 変更箇所（surgical edits）

1. **セクション 1.1 Execution Zone ボックス**（行 52-75）: 単一 "Execution Agent" を 4 エージェント名リストに置換
2. **セクション 1.1 Verification Zone ボックス**（行 12-42）: slack-search-agent を Verification Agent の隣接コンポーネントとして追記
3. **セクション 1.2 コンポーネント表**（行 113-122）: Execution Agents 行に 4 エージェント名追記、DynamoDB 行に usage-history 追記、S3 行追加、slack-search-agent 行追加
4. **セクション 2.2 分離スタック図**（行 213-223）: Verification Stack に slack-search-agent 追記、"5" → "6"
5. **セクション 3.3 デプロイフロー**（行 285-291）: すでに slack-search-agent が記載済み。番号順の整合を確認。
6. **セクション 4.3**（行 445-464）: `execution-zones/execution-agent/` パスを除去、4 エージェント別に役割・ファイルパスを記述
7. **新セクション 4.6 追加**（行 565 以降、セクション 5 の前）: usage-history DynamoDB、S3 バケット、S3 SRR、PITR エクスポート、cdk-nag を説明
8. **関連ドキュメントリンク修正**（行 666）: `../how-to/troubleshooting.md` → `./troubleshooting.md` に修正（実際のパスに合わせる）
9. **最終更新日**（行 673）: `2026-02-22` → `2026-03-18`

### quickstart.md 変更箇所（surgical edits）

1. **ステップ 2 CDK 依存関係** 個別インストール例: `execution-zones/execution-agent/cdk` → `execution-zones/file-creator-agent/cdk`
2. **方法 1 強制再ビルド例**: `./execution-zones/execution-agent/scripts/deploy.sh` → `./execution-zones/file-creator-agent/scripts/deploy.sh`
3. **方法 2 手動デプロイ ステップ 1**: `cd execution-zones/execution-agent/cdk` → `cd execution-zones/file-creator-agent/cdk`
4. **デプロイ順序注記**: "execution-agent → time-agent → docs-agent → fetch-url-agent" → "file-creator-agent → time-agent → docs-agent → fetch-url-agent" + slack-search-agent 追記
5. **Execution Stacks リソース一覧**: SlackSearch Agent を追記
6. **CDK 出力例**: SlackSearchAgentRuntimeArn 出力を追記
7. **最終更新日**: `2026-02-14` → `2026-03-18`

### execution-agent-system-prompt.md 全書き換え

旧内容（単一 execution-agent 前提）を廃止。新内容：

```markdown
# エージェントシステムプロンプト（各エージェント独自管理）

## 方針

各 Execution Agent は独自の system_prompt.py を持つ。プロンプトは単一エージェント内でのみ定義・参照する。

| エージェント | Canonical ファイル |
|---|---|
| docs-agent | execution-zones/docs-agent/src/system_prompt.py |
| file-creator-agent | execution-zones/file-creator-agent/src/system_prompt.py |
| time-agent | execution-zones/time-agent/src/system_prompt.py |
| fetch-url-agent | execution-zones/fetch-url-agent/src/system_prompt.py |

各 agent_factory.py は from system_prompt import FULL_SYSTEM_PROMPT で参照する。

## 運用

- 編集はエージェントごとの system_prompt.py のみ
- agent_factory.py にプロンプト文字列を直接書かない
- 変更後は対応エージェントの pytest を実行して確認
```
