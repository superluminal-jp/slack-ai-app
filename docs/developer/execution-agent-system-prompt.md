# エージェントシステムプロンプト管理方針

**目的**: 各 Execution Agent のシステムプロンプトがどこで定義・管理されるかを説明する。
**対象読者**: 開発者
**最終更新日**: 2026-03-18

---

## 方針

各エージェントは **独自の `system_prompt.py`** を持ち、プロンプトはそのエージェント内でのみ定義・参照する。
複数エージェントで共有するシステムプロンプトは存在しない。

| エージェント | Canonical ファイル | 役割 |
|---|---|---|
| docs-agent | `execution-zones/docs-agent/src/system_prompt.py` | プロジェクトドキュメントの検索・回答 |
| file-creator-agent | `execution-zones/file-creator-agent/src/system_prompt.py` | ファイル生成 |
| time-agent | `execution-zones/time-agent/src/system_prompt.py` | 現在時刻の取得・回答 |
| fetch-url-agent | `execution-zones/fetch-url-agent/src/system_prompt.py` | URL コンテンツの取得・要約 |

---

## 運用ルール

- **編集するのはエージェントごとの `system_prompt.py` のみ**。`agent_factory.py` にプロンプト文字列を直接書かない。
- 各 `agent_factory.py` は `from system_prompt import FULL_SYSTEM_PROMPT` でインポートし、`system_prompt=FULL_SYSTEM_PROMPT` として渡す。
- プロンプト変更後は対象エージェントの pytest を実行して動作を確認する。

```bash
# docs-agent の例
cd execution-zones/docs-agent/src && python -m pytest ../tests/ -v

# file-creator-agent の例
cd execution-zones/file-creator-agent && python -m pytest tests/ -v
```

---

## Verification Zone エージェント

Verification Zone の slack-search-agent も同様の構造を持つ。

| エージェント | Canonical ファイル |
|---|---|
| slack-search-agent | `verification-zones/slack-search-agent/src/system_prompt.py` |
