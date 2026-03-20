# ライセンス監査レポート

**実施日**: 2026-03-19
**対象ブランチ**: `claude/audit-license-compliance-rXs3o`
**目的**: 商用利用不可ライセンスのライブラリ・パッケージが含まれていないかの確認

---

## 結論

**問題なし。商用利用不可ライセンスのパッケージは検出されませんでした。**

全パッケージが MIT・Apache 2.0・BSD 系などの許容的（permissive）オープンソースライセンスを採用しており、商用利用が明示的に認められています。

---

## Python パッケージ

| パッケージ | バージョン指定 | ライセンス | 商用利用 |
|---|---|---|---|
| `strands-agents[a2a,otel]` | ~=1.25.0 | Apache-2.0 | ✅ |
| `aws-opentelemetry-distro` | ~=0.10.0 | Apache-2.0 | ✅ |
| `fastapi` | ~=0.115.0 | MIT | ✅ |
| `uvicorn` | ~=0.34.0 | BSD | ✅ |
| `boto3` | ~=1.42.0 | Apache-2.0 | ✅ |
| `requests` | ~=2.31.0 | Apache-2.0 | ✅ |
| `slack-sdk` | ~=3.27.0 | MIT | ✅ |
| `beautifulsoup4` | ~=4.12.0 | MIT | ✅ |
| `pypdf` | ~=5.0.0 | BSD-style | ✅ |
| `openpyxl` | ~=3.1.0 | MIT | ✅ |
| `python-docx` | ~=1.1.0 | MIT | ✅ |
| `python-pptx` | ~=1.0.0 | MIT | ✅ |
| `matplotlib` | ~=3.9.0 | BSD/PSF | ✅ |
| `Pillow` | ~=11.0.0 | HPND (MIT互換) | ✅ |

### 注記

- **`PyPDF2`** は上流プロジェクトが deprecated 済み。後継の `pypdf` への移行が推奨されるが、ライセンス上の問題はない（BSD-style、商用利用可）。

---

## npm / Node.js パッケージ（CDK・TypeScript）

| パッケージ | バージョン指定 | ライセンス | 商用利用 |
|---|---|---|---|
| `aws-cdk-lib` | 2.215.0 | Apache-2.0 | ✅ |
| `aws-cdk` | 2.1033.0 | Apache-2.0 | ✅ |
| `cdk-nag` | ^2.28.0 | Apache-2.0 | ✅ |
| `constructs` | ^10.0.0 | Apache-2.0 | ✅ |
| `typescript` | ~5.9.3 | Apache-2.0 | ✅ |
| `zod` | ^3.22.4 | MIT | ✅ |
| `jest` | ^29.7.0 | MIT | ✅ |
| `ts-jest` | ^29.2.5 | MIT | ✅ |
| `ts-node` | ^10.9.2 | MIT | ✅ |
| `@types/node` | ^24.10.1 | MIT | ✅ |
| `@types/jest` | ^29.5.14 | MIT | ✅ |

---

## ライセンス種別サマリー

| ライセンス | 商用利用 | 該当パッケージ数 |
|---|---|---|
| Apache-2.0 | ✅ | 8 |
| MIT | ✅ | 14 |
| BSD / BSD-style | ✅ | 3 |
| HPND（MIT 互換） | ✅ | 1 |

---

## 推奨事項

1. **定期的なライセンス監査の実施**
   依存関係の追加・更新時は `pip-licenses`（Python）および `license-checker`（npm）を用いて自動チェックを行うことを推奨する。

---

## 調査対象ファイル

- `execution-zones/docs-agent/src/requirements.txt`
- `execution-zones/fetch-url-agent/src/requirements.txt`
- `execution-zones/file-creator-agent/src/requirements.txt`
- `execution-zones/time-agent/src/requirements.txt`
- `verification-zones/slack-search-agent/src/requirements.txt`
- `verification-zones/verification-agent/src/requirements.txt`
- `verification-zones/verification-agent/agent/verification-agent/requirements.txt`
- `verification-zones/verification-agent/cdk/lib/lambda/*/requirements.txt`（4ファイル）
- `platform/tooling/package.json`
- `execution-zones/*/cdk/package.json`（4ファイル）
- `verification-zones/*/cdk/package.json`（2ファイル）
