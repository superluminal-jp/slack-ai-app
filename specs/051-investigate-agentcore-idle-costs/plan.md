# Implementation Plan: AgentCore Idle Agent Billing Investigation

**Branch**: `051-investigate-agentcore-idle-costs` | **Date**: 2026-03-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/051-investigate-agentcore-idle-costs/spec.md`

## Summary

調査タスク：デプロイ後に一度も呼び出していない4つの AgentCore エージェント（SlackAI_WebFetchAgent_Dev、SlackAI_TimeAgent_Dev、SlackAI_DocsAgent_Dev、SlackAI_FileCreatorAgent_Dev）に runtime session とコスト（Memory GB-hrs, vCPU-hrs）が計上されている根本原因を AWS MCP/CLI を使って特定し、推奨アクションを文書化する。コード変更は発生しない純粋な調査タスク。

## Technical Context

**Language/Version**: N/A（調査タスク — コード変更なし）
**Primary Dependencies**: AWS CLI (aws bedrock-agentcore), AWS MCP Server, boto3（調査スクリプト用）
**Storage**: N/A
**Testing**: N/A（コード変更なし）
**Target Platform**: Amazon Bedrock AgentCore (ap-northeast-1), AWS Cost Explorer
**Project Type**: Investigation / Research
**Performance Goals**: N/A
**Constraints**: AWS SSO ログイン済みセッションが必要。Cost Explorer データは最大 24 時間の遅延あり
**Scale/Scope**: 対象エージェント 4 体 (Dev 環境のみ)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. SDD — Spec before code | ✅ PASS | spec.md 作成済み、plan.md 生成中 |
| II. TDD — Red→Green→Refactor | ⚠️ EXEMPT | 純粋な調査タスク。テスト対象のプロダクションコードが存在しない（Complexity Tracking 参照） |
| III. Security-First | ✅ N/A | セキュリティパイプラインへの変更なし |
| IV. Fail-Open/Fail-Closed | ✅ N/A | コード変更なし |
| V. Zone-Isolated Architecture | ✅ N/A | ゾーン境界変更なし |
| VI. Documentation Parity | ✅ PLANNED | CHANGELOG.md に調査結果の要約を追加 |
| VII. Clean Code Identifiers | ✅ N/A | コード変更なし |

## Project Structure

### Documentation (this feature)

```text
specs/051-investigate-agentcore-idle-costs/
├── plan.md              # This file
├── research.md          # Phase 0 output — 根本原因分析
├── data-model.md        # Phase 1 output — 収集データ構造
├── quickstart.md        # Phase 1 output — 調査手順
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
# コード変更なし。調査結果のみ文書化。
# CHANGELOG.md のみ更新（同一 PR 内）。
```

**Structure Decision**: 調査タスクのためソースコード変更なし。成果物は全て `specs/051-*/` 以下のドキュメントと `CHANGELOG.md` に限定。

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle II (TDD) — テストなし | 本 feature はコード変更を伴わない純粋な調査タスク。テスト対象のプロダクションコードが存在しない | 調査報告書に対してテストを書くことは意味をなさない。調査結果の「正しさ」は AWS コンソール/CLI データで直接検証する |

---

## Phase 0: Research

### Research Questions

調査前に解決すべき不明点：

1. **AgentCore の課金モデル** — セッションベース（invocation ごと）か、コンテナ稼働時間ベース（provisioned capacity）か？
2. **"Runtime Session" の定義** — AgentCore コンソールの "runtime session" は何を指すか？コンテナ起動・ウォームアップも含むか？
3. **LifecycleConfiguration の影響** — `idleRuntimeSessionTimeoutSeconds: 300` / `maxLifetimeSeconds: 3600` は課金にどう影響するか？
4. **自動ヘルスチェック** — AgentCore は `GET /ping` や `POST /` への内部ヘルスチェックを実施するか？これがセッションとしてカウントされるか？

### Research Tasks

**RT-001**: AWS ドキュメント調査 — AgentCore の課金モデルと "runtime session" 定義を確認する
- 参照: AWS Bedrock AgentCore pricing page, API reference (GetAgentRuntime, ListRuntimeSessions)
- 使用ツール: aws-documentation MCP server / WebFetch

**RT-002**: 現在の AgentCore エージェント設定確認 — 4エージェントのランタイム設定を AWS から取得する
- `aws bedrock-agentcore list-agent-runtimes` (または相当する API)
- 各エージェントの `idleRuntimeSessionTimeoutSeconds`, `maxLifetimeSeconds` 等

**RT-003**: ランタイムセッション一覧取得 — セッション記録の詳細（開始時刻・終了時刻・消費量）を確認する
- `aws bedrock-agentcore list-agent-runtime-sessions` (エージェントごと)
- セッションのトリガーソース（invocation元）が分かれば特定

**RT-004**: CloudWatch ログ確認 — セッション起動時のログを確認し、invocation の発信元（内部ヘルスチェック or 外部呼び出し）を判別する
- ロググループ: `/aws/bedrock-agentcore/` 以下
- 検索キーワード: session start, health check, ping, warm-up

**RT-005**: AWS Cost Explorer 確認 — 対象エージェントの実際のコスト内訳を取得する
- サービス: Amazon Bedrock AgentCore (またはコスト表示上のサービス名)
- 対象期間: デプロイ日から現在まで
- 項目: GB-hrs, vCPU-hrs の実測値

**Output**: `research.md` — 上記5つの調査結果をまとめ、根本原因を "AgentCore 仕様（回避不能）" または "設定で削減可能" に分類する

---

## Phase 1: Design

### Data Model (収集データ構造)

**Output**: `data-model.md`

収集・分析するデータエンティティ:

- **RuntimeSession**: エージェントARN, セッションID, 開始時刻, 終了時刻, メモリ消費 (GB-hrs), vCPU消費 (vCPU-hrs), トリガーソース
- **AgentRuntimeConfig**: エージェント名, ARN, lifecycleConfiguration (idleTimeout, maxLifetime), ネットワーク設定, デプロイ日時
- **CostRecord**: エージェントARN, 計上期間, 合計コスト (USD), 内訳 (GB-hrs 単価 × 量, vCPU-hrs 単価 × 量)

### Contracts / External Interfaces

コード変更なし。調査で使用する AWS API インターフェースを記録する:

```text
contracts/
└── aws-apis-used.md    # 調査で呼び出した AWS API 一覧（再現可能な調査手順として）
```

### Quickstart (調査再現手順)

**Output**: `quickstart.md` — 同様の調査を将来実施する際の手順書

```bash
# 1. AWS SSO ログイン確認
aws sts get-caller-identity

# 2. AgentCore エージェント一覧（対象4エージェント確認）
aws bedrock-agentcore list-agent-runtimes --region ap-northeast-1

# 3. 各エージェントのセッション一覧
aws bedrock-agentcore list-agent-runtime-sessions \
  --agent-runtime-identifier <ARN> --region ap-northeast-1

# 4. CloudWatch ログ検索（セッション起動ログ）
aws logs filter-log-events \
  --log-group-name /aws/bedrock-agentcore/ \
  --filter-pattern "session"

# 5. コスト確認 (Cost Explorer)
aws ce get-cost-and-usage \
  --time-period Start=<deploy-date>,End=<today> \
  --granularity DAILY \
  --filter '{"Dimensions":{"Key":"SERVICE","Values":["Amazon Bedrock"]}}' \
  --metrics "BlendedCost" "UsageQuantity"
```

---

## Investigation Hypothesis

現時点でのコード分析から得られた仮説：

### 仮説 A: AgentCore の "Warm Session" 自動起動（最有力）

`web-fetch-agent-runtime.ts` を確認した結果、`LifecycleConfiguration` が設定されている:

```
IdleRuntimeSessionTimeout: 300 秒 (5分)
MaxLifetime: 3600 秒 (1時間)
```

AgentCore は「コンテナを常温に保つ（warm）」ために、デプロイ後に自動でセッションを起動する可能性がある。この場合、明示的な invocation がなくても IdleTimeout ごとにセッションが作成・終了し、その都度課金が発生する。

### 仮説 B: AgentCore ヘルスチェックがセッションとしてカウント

AgentCore インフラが各エージェントの `GET /ping` エンドポイントに対して定期的にヘルスチェックを実施しており、これが runtime session としてカウントされている可能性。

### 仮説 C: デプロイ時の初期化セッション

CloudFormation リソース (`AWS::BedrockAgentCore::Runtime`) のデプロイ/更新時に、AgentCore サービスが初期化チェックとしてセッションを起動する可能性。

### 仮説 D: AgentCore の Provisioned Capacity 課金モデル

AgentCore が Lambda ではなくコンテナベースのインフラ（ECS Fargate 相当）を使用しており、invocation の有無に関わらず「プロビジョニングされた容量」として時間課金される可能性。

---

## Expected Outcomes

調査完了時に以下を文書化する:

1. **根本原因**: 上記仮説A〜Dのいずれか（または複合）
2. **定量データ**: 各エージェントの実測セッション数・コスト額
3. **推奨アクション** (原因に応じて):
   - 仮説 A/B/C の場合: `idleRuntimeSessionTimeoutSeconds` 削減、または AgentCore 設定で warm session 無効化
   - 仮説 D の場合: AgentCore の課金モデルを受け入れるか、未使用エージェントを削除
4. **CHANGELOG.md 更新**: 調査結果の要約を `[Unreleased]` セクションに追加
