# Implementation Plan: Slack ファイル生成（ベストプラクティス適用）

**Branch**: `027-slack-file-generation-best-practices` | **Date**: 2026-02-11 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/027-slack-file-generation-best-practices/spec.md`

## Summary

画像・Markdown・Word・Excel・PowerPoint などのファイルを AI が生成し Slack に返す機能を拡張する。025-slack-file-generation の設計を継承しつつ、Bedrock / Strands Agent / AgentCore / AWS 各レイヤーのベストプラクティスを AWS MCP を用いて調査・適用する。026-best-practices-alignment の調査結果を統合し、ファイル生成特有の検証項目（サイズ制限、検証可能性、セキュリティ）を追加する。

## Technical Context

**Language/Version**: Python 3.11 (agents), TypeScript 5.x (CDK)
**Primary Dependencies**: strands-agents[a2a]~=1.25.0, bedrock-agentcore, boto3, openpyxl, python-docx, python-pptx, matplotlib, aws-cdk-lib
**Storage**: DynamoDB, S3（既存）、変更なし
**Testing**: pytest (agents), jest (CDK)、既存テスト維持
**Target Platform**: AWS Bedrock AgentCore Runtime (ARM64), AWS Lambda, ECS
**Project Type**: マルチエージェントシステム（Verification + Execution zones）
**Performance Goals**: ファイル生成応答時間が通常テキスト応答の 2 倍以内（SC-001）
**Constraints**: 既存アーキテクチャ維持、025 設計との整合、Slack ファイルアップロード制限準拠
**Scale/Scope**: 025 の 5 ツール（generate_text_file, generate_excel, generate_word, generate_powerpoint, generate_chart_image）にベストプラクティス適用

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Evidence |
|------|--------|----------|
| Spec-first | PASS | spec.md 作成済み、全必須セクション完了 |
| 既存パイプライン維持 | PASS | file_artifact パイプライン継承、新規設計は 025 準拠 |
| 後方互換性 | PASS | 026 と同様、既存動作を壊さない範囲で適用 |
| リグレッションゼロ | PASS | 既存テスト維持、025 実装との統合を計画 |

## Project Structure

### Documentation (this feature)

```text
specs/027-slack-file-generation-best-practices/
├── spec.md              # 機能仕様
├── plan.md              # 本ファイル
├── research.md          # Phase 0: ベストプラクティス調査（026 統合 + 027 固有）
├── data-model.md        # Phase 1: 025 拡張 + BestPracticeVerification
├── quickstart.md        # Phase 1: セットアップ・検証ガイド
├── contracts/           # Phase 1: 025 契約の拡張
└── checklists/          # ベストプラクティス適用チェックリスト
```

### Source Code (repository root)

変更対象は 025 実装予定のパスに 026 ベストプラクティスを適用：

```text
cdk/
├── lib/
│   ├── execution/
│   │   ├── agent/execution-agent/
│   │   │   ├── tools/                    # 025: ファイル生成ツール
│   │   │   │   ├── generate_text_file.py
│   │   │   │   ├── generate_excel.py
│   │   │   │   ├── generate_word.py
│   │   │   │   ├── generate_powerpoint.py
│   │   │   │   └── generate_chart_image.py
│   │   │   ├── agent_factory.py          # Strands Agent + ツール登録
│   │   │   ├── file_config.py            # MIME タイプ、サイズ上限
│   │   │   └── requirements.txt          # openpyxl, python-docx, python-pptx, matplotlib
│   │   └── constructs/
│   │       └── execution-agent-runtime.ts # IAM、暗号化確認
│   └── verification/
│       └── agent/verification-agent/     # 026 適用済み
```

**Structure Decision**: 025 と 026 の実装を統合。027 は両方の設計を継承し、ベストプラクティス適用を明示的に検証可能にする。

## Implementation Approach

### Phase 0: Research（本 plan で実施）

- 026 の research.md をベースに、ファイル生成固有のベストプラクティスを追加
- AWS MCP による調査結果を research.md に集約
- ギャップ分析と 027 固有の検証項目を記録

### Phase 1: Design & Contracts

**1.1 data-model.md**

- 025 の GeneratedFile、ツール入力スキーマを継承
- BestPracticeVerification エンティティを追加（検証項目、対象レイヤー、充足状況）
- ファイルサイズ上限、検証ルールを明記

**1.2 contracts/**

- tool-definitions.yaml: 025 契約を継承、ツール docstring の明確化要件を反映
- execution-response.yaml: 025 契約を継承（変更なし）
- best-practices-checklist.yaml（新規）: 適用すべきベストプラクティス項目の一覧

**1.3 quickstart.md**

- 025 のセットアップに加え、ベストプラクティス検証手順を記載

### Phase 2: Implementation（/speckit.tasks で分解）

**2.1 ファイル生成ツール実装（025 ベース）**

- generate_text_file, generate_excel, generate_word, generate_powerpoint, generate_chart_image
- 各ツールに docstring とパラメータ説明を日本語で明確化（026 Strands BP）
- ファイルサイズ上限チェック、ファイル名サニタイズ

**2.2 ベストプラクティス適用**

- Bedrock: HTTPS、最小権限（026 適用済み）
- AgentCore: エラーハンドリング、Throttling リトライ（026 適用済み）
- Strands: ツール定義の明確化、型付きパラメータ
- CDK: grant メソッド、暗号化（026 適用済み）

**2.3 検証・計装**

- ベストプラクティスチェックリストによる検証
- ギャップ分析の記録

## Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| 025 未実装による 027 遅延 | Medium | Medium | 027 は 025 と並行設計。025 完了後に 027 統合 |
| オフィスファイル生成の品質 | Low | Medium | python-docx, openpyxl, python-pptx は成熟ライブラリ。単体テストでカバー |
| Slack ファイルサイズ制限超過 | Low | Low | file_config で上限を設定し、超過時にユーザー通知 |

## Complexity Tracking

Constitution 違反なし。027 は 025 + 026 の統合であり、新規アーキテクチャは導入しない。

## Next Steps

1. Phase 0 research.md 作成
2. Phase 1 data-model.md, contracts/, quickstart.md 作成
3. `.specify/scripts/bash/update-agent-context.sh cursor-agent` 実行
4. `/speckit.tasks` で Phase 2 をタスクに分解
