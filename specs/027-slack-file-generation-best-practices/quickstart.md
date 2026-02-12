# Quickstart: Slack ファイル生成（ベストプラクティス適用）

**Feature Branch**: `027-slack-file-generation-best-practices`

## 概要

027 は 025 のファイル生成機能に 026 のベストプラクティスを適用した統合機能である。Execution Agent が Markdown、CSV、Excel、Word、PowerPoint、チャート画像を生成し、Slack に返す。

## アーキテクチャ

```
Slack User: "売上データのExcelファイルを作って"
    ↓
Verification Agent (026 ベストプラクティス適用済み)
    ↓
Execution Agent (027):
    ├── strands Agent with @tool file generation tools
    ├── ツール定義の明確化（docstring、パラメータ説明）
    ├── ファイルサイズ上限チェック、ファイル名サニタイズ
    ├── file_artifact で file_config の MIME タイプ検証
    └── Returns response_text + file_artifact
    ↓
Verification Agent → SQS → Slack Poster
    ↓
Slack: 📎 quarterly_report.xlsx + "売上データのExcelファイルを作成しました。"
```

## 前提条件

- 025-slack-file-generation の実装が完了している、または
- 027 の実装で 025 の tools を同時に実装する

## 主要変更

### Execution Agent (`cdk/lib/execution/agent/execution-agent/`)

| ファイル           | 変更内容                                               |
| ------------------ | ------------------------------------------------------ |
| `tools/*.py`       | 5 ツール実装、docstring 明確化                         |
| `file_config.py`   | MAX_FILE_SIZE、ALLOWED_MIME_TYPES、サニタイズ関数      |
| `agent_factory.py` | Strands Agent + ツール登録                             |
| `requirements.txt` | openpyxl, python-docx, python-pptx, matplotlib, Pillow |

### ベストプラクティス検証

```bash
# チェックリストの確認
cat specs/027-slack-file-generation-best-practices/contracts/best-practices-checklist.yaml

# 単体テスト実行
cd cdk/lib/execution/agent/execution-agent/
pytest tests/

# ファイルサイズ・サニタイズのテスト
pytest tests/test_file_config.py tests/test_generate_*.py -k "size or sanitize"
```

## ローカルテスト

```bash
cd cdk/lib/execution/agent/execution-agent/
pip install -r requirements.txt

# 各ツールの単体テスト
pytest tests/

# Integration: generate_excel
python -c "
from tools.generate_excel import generate_excel
result = generate_excel(filename='test', sheets=[{'name': 'Sheet1', 'headers': ['A', 'B'], 'rows': [[1, 2]]}])
print(result)
"
```

## 追加依存

```
openpyxl~=3.1.0
python-docx~=1.1.0
python-pptx~=1.0.0
matplotlib~=3.9.0
Pillow~=11.0.0
```

## デプロイ前チェック

1. `contracts/best-practices-checklist.yaml` の全項目を確認
2. ファイルサイズ上限（10 MB）が file_config に設定されていること
3. ファイル名サニタイズの単体テストがパスすること
4. 026 の検証結果（HTTPS、IAM、AgentCore）が適用済みであること
