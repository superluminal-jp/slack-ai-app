# Implementation Plan: ベストプラクティス適用（Bedrock / Strands / AgentCore / AWS）

**Branch**: `026-best-practices-alignment` | **Date**: 2026-02-11 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/026-best-practices-alignment/spec.md`

## Summary

AWS MCP を用いて Bedrock、Strands Agent、AgentCore、AWS CDK の各レイヤーにおける公式ベストプラクティスを調査し、research.md に調査結果を集約した。本 plan は、その調査結果に基づき、プロジェクトへの適用を段階的に実施するための設計とアプローチを定義する。

## Technical Context

**Language/Version**: Python 3.11 (agents), TypeScript 5.x (CDK)
**Primary Dependencies**: strands-agents[a2a]~=1.25.0, bedrock-agentcore, boto3, aws-cdk-lib
**Storage**: DynamoDB, S3（既存）、変更なし
**Testing**: pytest (agents), jest (CDK)、既存テスト維持
**Target Platform**: AWS Bedrock AgentCore Runtime (ARM64), AWS Lambda, ECS
**Project Type**: マルチエージェントシステム（Verification + Execution zones）
**Performance Goals**: 既存 SLA 維持、リグレッションゼロ
**Constraints**: 既存アーキテクチャを維持、破壊的変更を避ける
**Scale/Scope**: 横断的改善。026 単体の新機能追加は行わず、既存コンポーネントの最適化に限定

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Evidence |
|------|--------|----------|
| Spec-first | PASS | spec.md 作成済み、全必須セクション完了 |
| 既存パイプライン維持 | PASS | アーキテクチャ変更なし、最適化のみ |
| 後方互換性 | PASS | 既存動作を壊さない範囲で適用 |
| リグレッションゼロ | PASS | 既存テストを維持し、全件パスを確認 |

## Project Structure

### Documentation (this feature)

```text
specs/026-best-practices-alignment/
├── spec.md              # 機能仕様
├── plan.md              # 本ファイル
├── research.md          # AWS MCP 調査結果（Phase 0 完了）
├── checklists/
│   └── requirements.md  # ベストプラクティス適用チェックリスト
└── tasks.md             # Phase 2 出力（/speckit.tasks で生成）
```

### Source Code (repository root)

変更対象は既存の以下のパスに限定：

```text
cdk/
├── lib/
│   ├── execution/
│   │   └── agent/execution-agent/     # Strands, Bedrock 呼び出し
│   └── verification/
│       ├── agent/verification-agent/   # A2A サーバー
│       └── lambda/
│           └── agent-invoker/         # InvokeAgentRuntime 呼び出し
└── bin/                                # CDK アプリ、スタック定義
```

**Structure Decision**: 新規ディレクトリは作成せず、既存コンポーネント内でベストプラクティスを適用する。026 は横断的改善のため、独立した「feature」ディレクトリは持たない。

## Implementation Approach

### Phase 0: Research（完了）

- AWS MCP を用いて Bedrock、AgentCore、Strands、CDK の公式ドキュメントを検索
- 調査結果を research.md に集約
- ギャップ分析と優先度マトリクスを作成

### Phase 1: Bedrock / AgentCore セキュリティ・耐障害性（P1）

**1.1 IAM 最小権限のレビュー**

- Verification / Execution のタスクロールが使用する権限を一覧化
- Bedrock: `bedrock:InvokeModel`, `bedrock:InvokeAgentRuntime` 等がスコープに限定されているか確認
- CloudWatch: メトリクス名前空間が 021 で修正済みであることを確認

**1.2 InvokeAgentRuntime のエラーハンドリング強化**

- `agent-invoker` Lambda の InvokeAgentRuntime 呼び出しに、ThrottlingException に対する指数バックオフリトライを追加
- ValidationException, ResourceNotFoundException, AccessDeniedException の適切なハンドリングを確認

**1.3 HTTPS / PII の確認**

- 全 Bedrock / AgentCore 通信が HTTPS 経由であることを確認（AWS SDK デフォルト）
- エージェントリソース（アクション名、知識ベース名等）に PII が含まれていないことを確認

### Phase 2: Strands Agent ベストプラクティス（P2）

**2.1 ツール定義の明確化（025 と統合）**

- 025 で追加する各 @tool に、docstring とパラメータ説明を日本語で明確に記述
- ツールの目的・入力形式・出力形式を contracts/tool-definitions.yaml に同期

**2.2 OpenTelemetry の有効化（オプション）**

- strands の OTEL 統合が有効か確認
- AgentCore Runtime のビルトイントレースが利用可能か確認
- 既存の CloudWatch メトリクス送信との重複を避けつつ、トレースを追加

**2.3 エージェントスコープのドキュメント化**

- Verification Agent / Execution Agent の担当範囲・非担当範囲を README または spec に明記
- トーン・パーソナリティのガイドラインを簡潔に記載

### Phase 3: CDK ベストプラクティス（P3）

**3.1 grant メソッドの使用確認**

- Lambda / ECS タスクに S3, DynamoDB, SQS 等へのアクセスを付与する際、`grant*()` を使用しているか確認
- 手動で作成した IAM ポリシーがあれば、grant に置き換え可能か検討

**3.2 暗号化・removal policy の確認**

- S3 バケット、DynamoDB テーブルの暗号化設定を確認
- 本番スタックの removal policy が適切か確認（stateful は RETAIN 推奨）

**3.3 cdk-nag の導入（オプション）**

- ユーザー同意を得た上で、cdk-nag を導入し AwsSolutionsChecks を適用
- 検出された違反を修正可能な範囲で対応

### Phase 4: 評価戦略（エンタープライズ BP #4）

**026 T019: 評価戦略のドキュメント化**

AWS エンタープライズベストプラクティス「Automate evaluation from the start」に基づき、以下の評価戦略を検討対象として記録する。

| 方式 | 内容 | 優先度 | 備考 |
|------|------|--------|------|
| ゴールドデータセット | 代表的な入力・期待出力ペアを JSON/YAML で管理し、リグレッション検証に利用 | 推奨 | 既存 pytest を拡張。入出力スキーマの安定化後に導入 |
| 自動評価パイプライン | CI/CD で E2E テストまたは Bedrock 応答の品質メトリクスを自動実行 | 将来 | 021 で E2E 言及。GitHub Actions 等で統合 |
| メトリクス監視 | CloudWatch の BedrockApiError / ExistenceCheckFailed 等をダッシュボード化 | 現行 | 既存の emit_metric を活用 |

**現状**: 単体テスト（pytest）と CDK テスト（jest）でリグレッションを担保。E2E の自動化は 021 で検討対象。本番応答品質の評価は、ゴールドデータセットまたは自動評価パイプラインの導入時に実施する。

### Phase 5: チェックリスト作成と検証

**5.1 ベストプラクティスチェックリスト**

- checklists/requirements.md に、適用すべき項目を一覧化
- 各項目に「確認方法」「合格基準」を記載
- デプロイ前または PR レビュー時に参照可能にする

**5.2 リグレッション検証**

- 既存の単体テスト・統合テストを全件実行
- E2E テスト（存在する場合）を実行し、既存フローが維持されていることを確認

## Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| リトライ追加によるレイテンシ増加 | Low | Medium | リトライは Throttling 時のみ。指数バックオフで回数制限 |
| OpenTelemetry のオーバーヘッド | Low | Low | 本番で有効化する前に負荷テスト |
| CDK 変更によるデプロイ失敗 | Low | High | 変更は段階的に適用。各変更後にデプロイ検証 |
| 025 との競合 | Low | Medium | 026 の Strands 改善は 025 の実装と並行して設計。統合を計画 |

## Complexity Tracking

Constitution 違反なし。全変更は既存コンポーネントの最適化に限定。

## Next Steps

1. `/speckit.tasks` で Phase 1–4 をタスクに分解
2. Phase 1（Bedrock / AgentCore）から順に実装
3. 各 Phase 完了時にチェックリストで検証
4. 025-slack-file-generation の実装と統合（Strands ツール定義の明確化は 025 と共同で実施）
