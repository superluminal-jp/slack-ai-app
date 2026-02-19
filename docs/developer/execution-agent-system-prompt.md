# Execution Agent システムプロンプト（単一ソース）

## 結論

**システムプロンプトは一箇所で定義し、Execution Agent（コンテナ）のみが参照します。**

- **Canonical**: `execution-zones/execution-agent/src/system_prompt.py`
- **参照**: `execution-zones/execution-agent/src/agent_factory.py` → `FULL_SYSTEM_PROMPT`

## Lambda は不要か

**不要です。** 現在の Execution Stack は **コンテナ（AgentCore Runtime）のみ** をデプロイしています（spec 015 で BedrockProcessor Lambda は削除済み）。本番の AI 処理はすべて Execution Agent コンテナ経由です。

## 運用

- **編集するのは一箇所**: `execution-zones/execution-agent/src/system_prompt.py`
- **agent_factory ではプロンプトを書かない**: `execution-agent/agent_factory.py` は `from system_prompt import FULL_SYSTEM_PROMPT` して `system_prompt=FULL_SYSTEM_PROMPT` を渡すだけ。

## ツール

コンテナの `agent_factory.get_tools()` で、ファイル生成・search_docs・get_current_time・文書/スライドガイドラインを登録。system_prompt の `FULL_SYSTEM_PROMPT` がそれらに対応している。
