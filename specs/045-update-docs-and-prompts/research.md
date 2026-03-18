# Research: docs/ フォルダ更新と docs-agent プロンプト改善

**Feature**: 045-update-docs-and-prompts
**Date**: 2026-03-18

## 調査結果サマリー

NEEDS CLARIFICATION マーカーはなし。以下は実装前に確認した事実の記録。

---

## 1. 現行エージェント構成（コードベース実態）

### Execution Zones

| ディレクトリ | 役割 |
|---|---|
| `execution-zones/docs-agent/` | ドキュメント検索エージェント。`search_docs` ツールを持つ |
| `execution-zones/fetch-url-agent/` | URL 取得エージェント |
| `execution-zones/file-creator-agent/` | ファイル生成エージェント |
| `execution-zones/time-agent/` | 時刻取得エージェント |

`execution-zones/execution-agent/` は存在しない（削除済み）。

### Verification Zones

| ディレクトリ | 役割 |
|---|---|
| `verification-zones/verification-agent/` | セキュリティパイプライン + Strands オーケストレーション |
| `verification-zones/slack-search-agent/` | Slack メッセージ検索エージェント |

---

## 2. docs/developer/architecture.md の乖離

- **セクション 1.1**: Execution Zone を単一 "Execution Agent" として描画 → 4 エージェント個別表示が正確
- **セクション 1.1**: Verification Zone に slack-search-agent の記載なし
- **セクション 1.2**: DynamoDB 行に usage-history テーブルの記載なし（5 テーブル→6 テーブル）
- **セクション 1.2**: slack-search-agent の行なし
- **セクション 2.2**: "DynamoDB tables (5)" が古い（6 が正しい）
- **セクション 4.3**: `execution-zones/execution-agent/src/main.py` を参照（存在しない）
- **セクション 4.3**: 旧モノリシック Execution Agent のコードスニペットを掲載（4 エージェント分割後の実装と不一致）
- **セクション 3.3**: slack-search-agent デプロイは記載済み（手順 2）。番号体系は正しい。
- **関連ドキュメントリンク**: `../how-to/troubleshooting.md` → 実際は `./troubleshooting.md`
- **不足セクション**: usage-history DynamoDB・S3・PITR・S3 SRR、cdk-nag ガバナンスの説明がない

---

## 3. docs/developer/quickstart.md の乖離

- `execution-zones/execution-agent/cdk` への参照が 2 箇所（正しくは `file-creator-agent`）
- デプロイ順序注記が "execution-agent → time-agent → docs-agent → fetch-url-agent" と記述（正しくは "file-creator-agent → time-agent → docs-agent → fetch-url-agent → slack-search-agent"）
- slack-search-agent のデプロイ手順（CDK スタック名: `SlackAI-SlackSearch-{Env}`、出力キー: `SlackSearchAgentRuntimeArn`）が未記載

---

## 4. docs/developer/execution-agent-system-prompt.md の乖離

- Canonical ファイルを `execution-zones/execution-agent/src/system_prompt.py` と記載（存在しない）
- 4 エージェント個別の system_prompt.py について言及なし
- "Lambda は不要か" セクションが旧構成を前提とした記述で混乱を招く

---

## 5. docs-agent/src/system_prompt.py の改善機会

現状の 6 行プロンプトは機能するが以下が不足：
- 検索すべきカテゴリ（アーキテクチャ、デプロイ、エージェント、セキュリティ等）
- 推奨キーワード例
- 回答時のソースファイル引用指示
- スコープ外質問（Slack 操作、AWS 料金計算等）への対応方針

---

## 6. docs/README.md の乖離

- 開発者向け表に `execution-agent-system-prompt.md` が未掲載
- 最終更新日: 2026-02-14（更新後は 2026-03-18）

---

## 7. slack-search-agent の CDK スタック名・出力キー

`verification-zones/slack-search-agent/` が存在することを確認済み。
quickstart.md に追記するスタック名・出力キーは他エージェントのパターン（`SlackAI-<Name>-{Env}`, `<Name>AgentRuntimeArn`）に準拠する。

---

## 決定事項

| 決定 | 根拠 |
|------|------|
| docs-agent プロンプトは英語で記述 | 現行プロンプトが英語。英語指示がモデル精度上有利 |
| architecture.md セクション 4.3 はコードスニペットを削除 | 旧コードは存在しない。4 エージェント分コードを掲載するのは冗長 |
| usage-history 等は新セクション 4.6 として追加 | 既存セクションの読みやすさを維持しつつ、新機能を独立セクションで説明 |
| test_system_prompt.py を新規ファイルとして追加 | TDD 原則。system_prompt.py はコード変更のためテストが必要 |
