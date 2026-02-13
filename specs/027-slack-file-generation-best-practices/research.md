# Research: Slack ファイル生成（ベストプラクティス適用）

**Feature Branch**: `027-slack-file-generation-best-practices`
**Date**: 2026-02-11
**Source**: 026-best-practices-alignment 調査結果の統合、AWS MCP、slack-ai-app 既存設計

---

## 1. 026 ベストプラクティス調査の継承

### 参照

- [specs/026-best-practices-alignment/research.md](../026-best-practices-alignment/research.md)

### Decision

027 は 026 の以下の調査結果をそのまま適用する：

| レイヤー | 適用項目 | 026 調査結果 |
|----------|----------|--------------|
| Bedrock | HTTPS、最小権限、PII 非含有 | 026 research §1 |
| AgentCore | エラーハンドリング、Throttling リトライ、ライフサイクル | 026 research §2 |
| Strands | ツール定義の明確化、型付きパラメータ、マルチモーダル | 026 research §3 |
| エンタープライズ | スコープ定義、計装、評価戦略 | 026 research §4 |
| CDK | grant メソッド、暗号化、removal policy | 026 research §5 |

### Rationale

026 は横断的ベストプラクティス適用を完了済み。027 はファイル生成機能に特化し、026 の設計を継承することで重複調査を避ける。

---

## 2. ファイル生成固有のベストプラクティス

### 2.1 ファイルサイズ上限

### Decision

| ファイル種別 | 推奨上限 | 根拠 |
|--------------|----------|------|
| テキスト (.md, .csv, .txt) | 1 MB | テキストベース、メモリ効率良好 |
| オフィス (.docx, .xlsx, .pptx) | 10 MB | Office Open XML は構造化により肥大化しうる |
| 画像 (.png) | 5 MB | matplotlib 出力、高解像度時の上限 |
| 全体 | 10 MB（Slack ワークスペース制限準拠） | Slack API の一般的な制限 |

### Rationale

Slack の files.uploadV2 はワークスペース設定に依存するが、10 MB を超えるファイルは多くのワークスペースで制限される。ユーザー通知（FR-009）のため、事前に上限を設け超過時にメッセージを返す。

### Alternatives Considered

| Alternative | Rejected Because |
|-------------|------------------|
| 25 MB 上限 | 一部ワークスペースで拒否されるリスク |
| 上限なし | メモリ・タイムアウト・Slack 拒否のリスク |

---

### 2.2 ファイル名サニタイズ

### Decision

以下の文字をファイル名から除去または置換する：

- 制御文字（0x00–0x1F）
- Windows 禁止文字: `\ / : * ? " < > |`
- 先頭・末尾の空白、ドット
- 空ファイル名の場合: `generated_file_{timestamp}.{ext}` をフォールバック

### Rationale

クロスプラットフォーム（Windows / macOS / Linux）および Slack のファイル名規則に準拠。FR-014 で要求。

---

### 2.3 ツール定義の明確化（Strands / Bedrock Converse）

### Decision

各 @tool 関数に以下を必須とする：

- **docstring**: 日本語でツールの目的、入力形式、出力形式、使用例を 2–3 文で記述
- **パラメータ説明**: inputSchema の各 property に description を付与（025 tool-definitions.yaml と同期）
- **エラーハンドリング**: ファイル生成失敗時に明確な例外メッセージを返す

### Rationale

026 の Strands ベストプラクティス「ツール定義の明確化」に準拠。モデルがツール選択・パラメータ解釈を正確に行うために必要。

---

### 2.4 生成ライブラリの選定

### Decision

| 形式 | ライブラリ | バージョン | 理由 |
|------|------------|------------|------|
| .xlsx | openpyxl | ~=3.1.0 | デファクトスタンダード、ARM64 対応 |
| .docx | python-docx | ~=1.1.0 | 軽量、テンプレート不要 |
| .pptx | python-pptx | ~=1.0.0 | 軽量、シンプル API |
| .png | matplotlib | ~=3.9.0 | チャート生成の標準、Pillow 依存 |
| テキスト | 標準ライブラリ | — | 追加依存なし |

### Rationale

すべて Python 3.11 および ARM64 (python:3.11-slim) で動作実績あり。requirements.txt は `~=` でバージョン固定（026 方針）。

---

## 3. ベストプラクティス検証の記録

### Decision

以下の検証項目を checklists/ および research.md に記録する：

| 項目 | 検証方法 | 合格基準 |
|------|----------|----------|
| ファイルサイズ上限 | file_config.py の MAX_FILE_SIZE 設定 | 10 MB 以下 |
| ファイル名サニタイズ | 単体テストで禁止文字を含む入力 | サニタイズ済みファイル名が返る |
| ツール docstring | 各ツールの docstring 確認 | 日本語で目的・入出力が明確 |
| HTTPS | 既存 026 検証 | 全通信 HTTPS |
| 最小権限 | 既存 026 検証 | Bedrock / S3 等に最小限 |

### Rationale

FR-017「設計・実装の主要な意思決定は公式ドキュメントやベストプラクティスガイドに照らして検証可能でなければならない」に準拠。SC-006 でギャップ分析の記録を要求。

---

## 4. ギャップ分析サマリ（027 固有）

### 適用優先度

| レイヤー | 027 固有項目 | 026 継承項目 |
|----------|--------------|--------------|
| ファイル生成 | サイズ上限、ファイル名サニタイズ、ライブラリ選定 | — |
| Strands | ツール docstring 明確化 | ツール定義、型付きパラメータ |
| Bedrock / AgentCore / CDK | — | 026 全て |

### 参照 URL 一覧（026 継承）

- Bedrock セキュリティ: https://docs.aws.amazon.com/bedrock/latest/userguide/security-best-practice-agents.html
- AgentCore InvokeAgentRuntime: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-invoke-agent.html
- Strands Prescriptive Guidance: https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-frameworks/strands-agents.html
- エンタープライズ BP: https://aws.amazon.com/blogs/machine-learning/ai-agents-in-enterprises-best-practices-with-amazon-bedrock-agentcore/

---

## 5. SC-006 ギャップ分析記録（検証可能）

**Purpose**: ベストプラクティス適用のギャップ分析が記録され、検証可能である（spec.md SC-006）。

### 検証日: 2026-02-11

### 検証結果

| 項目 | 要件 | 現状 | ギャップ | 検証結果 |
|------|------|------|---------|----------|
| BP-FG-001 | ファイルサイズ上限 10 MB | file_config.py に MAX_*_BYTES 定義 | なし | ✓ PASS |
| BP-FG-002 | ファイル名サニタイズ | sanitize_filename + 単体テスト | なし | ✓ PASS |
| BP-FG-003 | サイズ超過時通知 | main.py に日本語エラーメッセージ | なし | ✓ PASS |
| BP-S-001 | ツール docstring | 各ツールに日本語 docstring | なし | ✓ PASS |
| BP-S-002 | tool-definitions 同期 | パラメータ名・型一致 | なし | ✓ PASS |
| BP-B-001 | HTTPS | boto3 デフォルト、026 検証参照 | なし | ✓ PASS |
| BP-B-002 | 最小権限 IAM | execution-agent-runtime は InvokeModel 等のみ | なし | ✓ PASS |
| BP-C-001 | grant メソッド | addToPolicy で明示付与 | なし | ✓ PASS |

### 記録場所

- 詳細検証: [checklists/best-practices-verification.md](checklists/best-practices-verification.md)
- チェックリスト定義: [contracts/best-practices-checklist.yaml](contracts/best-practices-checklist.yaml)
