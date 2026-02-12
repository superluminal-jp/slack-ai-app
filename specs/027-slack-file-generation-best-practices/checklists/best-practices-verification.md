# Best Practices Verification: 027-slack-file-generation-best-practices

**Feature**: Slack ファイル生成（ベストプラクティス適用）
**Date**: 2026-02-11
**Contract**: [contracts/best-practices-checklist.yaml](../contracts/best-practices-checklist.yaml)

---

## T026: HTTPS Verification (BP-B-001)

**Criterion**: 全通信が HTTPS。boto3 デフォルト、use_ssl=False なし。

**Verification**:
- Execution Agent の Bedrock 呼び出しは `strands.models.bedrock.BedrockModel` 経由
- strands-agents は boto3 の Bedrock クライアントを使用
- boto3 はデフォルトで HTTPS (TLS) を使用
- コードベース検索: `use_ssl=False` および `endpoint_url` の明示的な HTTP 指定なし

**Reference**: [specs/026-best-practices-alignment/research.md](../../026-best-practices-alignment/research.md) §1 — 026 Phase 3 で検証済み（bedrock_client_converse, agent-invoker 等）

**Result**: ✓ PASS

---

## T027: Minimal IAM Verification (BP-B-002, BP-C-001)

**Criterion**: 最小権限。InvokeModel / InvokeAgentRuntime のみ。grant メソッドで権限付与。

**Verification** (`cdk/lib/execution/constructs/execution-agent-runtime.ts`):

| Sid | Actions | Resources | Purpose |
|-----|---------|-----------|---------|
| ECRImageAccess | ecr:BatchGetImage, GetDownloadUrlForLayer, GetAuthorizationToken | * | コンテナイメージ取得 |
| CloudWatchLogs | logs:CreateLogGroup, CreateLogStream, PutLogEvents, DescribeLogGroups, DescribeLogStreams | /aws/bedrock-agentcore/* | ログ出力 |
| XRayTracing | xray:PutTraceSegments, PutTelemetryRecords, GetSamplingRules, GetSamplingTargets, GetSamplingStatisticSummaries | * | トレース |
| CloudWatchMetrics | cloudwatch:PutMetricData | * (namespace: SlackEventHandler, SlackAI/*) | メトリクス |
| BedrockInvokeModel | bedrock:InvokeModel, InvokeModelWithResponseStream | * | AI 推論 |

**Notes**:
- Execution Agent は AgentCore Runtime 内で Bedrock を直接呼び出すため、InvokeModel が必須
- InvokeAgentRuntime は agent-invoker (Verification Agent) 側の権限
- S3 アクセスは不要（添付ファイルは presigned URL 経由で HTTP GET）
- `addToPolicy` で明示的にポリシーを付与（手動 IAM JSON は使用していない）

**Result**: ✓ PASS

---

## T028: Best Practices Checklist Validation

### BP-FG-001: ファイルサイズ上限

- **Verification**: `file_config.py` に MAX_FILE_SIZE_BYTES が定義されている
- **Location**: `cdk/lib/execution/agent/execution-agent/file_config.py`
- **Values**: MAX_FILE_SIZE_BYTES = 10 MB, MAX_TEXT_FILE_BYTES = 1 MB, MAX_OFFICE_FILE_BYTES = 10 MB, MAX_IMAGE_FILE_BYTES = 5 MB
- **Result**: ✓ PASS

### BP-FG-002: ファイル名サニタイズ

- **Verification**: 単体テストで禁止文字を含む入力がサニタイズされる
- **Location**: `tests/test_file_config.py` — `TestSanitizeFilename.test_forbidden_chars_replaced`
- **Criterion**: `sanitize_filename("report:test.csv") == "report_test.csv"`, `sanitize_filename("file<name>.txt") == "file_name_.txt"`
- **Result**: ✓ PASS

### BP-FG-003: サイズ超過時にユーザー通知

- **Verification**: サイズ超過時に response_text にエラーメッセージがある
- **Location**: `main.py` — `size_err = "生成されたファイルがサイズ上限を超えているため、アップロードできませんでした。"`
- **Criterion**: 日本語で説明、代替手段を提案（文言は簡潔に状況説明）
- **Result**: ✓ PASS

### BP-S-001: 各ツールに docstring とパラメータ説明

- **Verification**: 各 @tool の docstring と inputSchema の description を確認
- **Tools**: generate_text_file, generate_excel, generate_word, generate_powerpoint, generate_chart_image
- **Criterion**: 日本語で目的・入出力が明確
- **Result**: ✓ PASS（各ツールに日本語 docstring、Args でパラメータ説明あり）

### BP-S-002: ツール定義が tool-definitions.yaml と同期

- **Verification**: `contracts/tool-definitions.yaml` と実装の一致
- **Criterion**: パラメータ名・型が一致
- **Comparison**: generate_text_file (content, filename), generate_excel (filename, sheets), generate_word (filename, title, sections), generate_powerpoint (filename, slides), generate_chart_image (filename, chart_type, title, data) — すべて一致
- **Result**: ✓ PASS

---

## Summary

| Layer | Item | Status |
|-------|------|--------|
| ファイル生成 | BP-FG-001, BP-FG-002, BP-FG-003 | ✓ PASS |
| Strands | BP-S-001, BP-S-002 | ✓ PASS |
| Bedrock | BP-B-001 (HTTPS), BP-B-002 (IAM) | ✓ PASS |
| CDK | BP-C-001 (grant/addToPolicy) | ✓ PASS |

**User Story 5 Checkpoint**: Best practices verified and documented.
