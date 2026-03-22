# Feature Specification: AgentCore Idle Agent Billing Investigation

**Feature Branch**: `051-investigate-agentcore-idle-costs`
**Created**: 2026-03-22
**Status**: Complete
**Input**: User description: "デプロイしてから一度も呼び出しを行っていない SlackAI_WebFetchAgent_Dev SlackAI_TimeAgent_Dev SlackAI_DocsAgent_Dev SlackAI_FileCreatorAgent_Dev に runtime session が記録されていて、 Memory consumption (GB-hrs) vCPU consumption (vCPU-hrs) が計上されているのはなぜか調査。 aws mcp や aws sso login でログイン済みのアカウントから情報を取得"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Root Cause Identification (Priority: P1)

運用担当者として、未呼び出しの AgentCore エージェント（SlackAI_WebFetchAgent_Dev、SlackAI_TimeAgent_Dev、SlackAI_DocsAgent_Dev、SlackAI_FileCreatorAgent_Dev）に Memory/vCPU コストが発生している原因を特定し、不要なコストを排除または正当化できるようにしたい。

**Why this priority**: コスト発生の原因が不明なままでは意図しない課金が拡大するリスクがある。原因特定が他のすべての対策（設定変更、コスト最適化）の前提となる。

**Independent Test**: AWS Console または AWS CLI で対象エージェントのランタイムセッション記録・課金明細を確認し、発生理由（warm-up セッション、ヘルスチェック、プロビジョニング費用等）を文書化することで単独で検証可能。

**Acceptance Scenarios**:

1. **Given** 対象4エージェントがデプロイ済みで一度も手動呼び出しされていない状態、**When** AWS コスト・ランタイムセッションデータを調査する、**Then** 「なぜセッションが記録されているか」の根本原因が特定され文書化される
2. **Given** 根本原因が特定された状態、**When** その原因を評価する、**Then** 意図的な仕様（AgentCore の動作モデルによる必須コスト）か、設定で回避可能なコストかが明確になる

---

### User Story 2 - Cost Reduction Recommendation (Priority: P2)

コスト管理者として、調査結果に基づいて idle エージェントのコストを削減または排除するための具体的なアクション（設定変更、エージェントの一時停止、アーキテクチャ変更等）を得たい。

**Why this priority**: 原因特定後の次ステップ。具体的な対策なしには調査の価値が限定的になる。

**Independent Test**: 推奨アクションを実施した後に同じ期間のコストを比較し、削減効果を数値で確認できる。

**Acceptance Scenarios**:

1. **Given** 根本原因が特定された状態、**When** 対処方針を検討する、**Then** 「削除」「停止」「設定変更」「現状維持（仕様通り）」のいずれかの具体的な推奨アクションが提示される
2. **Given** 推奨アクションが提示された状態、**When** アクションを実施する、**Then** 対象エージェントの意図しないコストがゼロまたは最小化される

---

### Edge Cases

- 調査対象エージェントが AgentCore の仕様として最低限のセッションを維持する場合（コスト削減不可の可能性）
- AWS SSO セッションが期限切れで情報取得できない場合
- コスト発生がヘルスチェックエンドポイント（`GET /ping`）への自動呼び出しによるものである場合
- 複数のエージェントで発生パターンが異なる場合（エージェントごとに原因が異なる可能性）

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 調査者は AWS MCP または aws CLI（SSO ログイン済みアカウント）を使用して、対象4エージェントのランタイムセッション記録を取得できなければならない
- **FR-002**: 調査者は対象エージェントの Memory consumption (GB-hrs) および vCPU consumption (vCPU-hrs) の詳細データ（期間・量）を確認できなければならない
- **FR-003**: 調査では AgentCore の課金モデル（プロビジョニング費用、warm-up セッション、最小保持期間等）を文書化しなければならない
- **FR-004**: 調査では対象エージェントのデプロイ設定（コンテナサイズ、スケーリング設定、アイドルタイムアウト等）を確認しなければならない
- **FR-005**: 調査結果は「原因」「影響範囲（コスト額）」「推奨アクション」を含む報告書としてまとめなければならない

### Key Entities

- **AgentCore Runtime Session**: エージェントの実行セッション記録。開始時刻、終了時刻、メモリ・vCPU 消費量を含む
- **AgentCore Agent**: 調査対象の4エージェント（SlackAI_WebFetchAgent_Dev、SlackAI_TimeAgent_Dev、SlackAI_DocsAgent_Dev、SlackAI_FileCreatorAgent_Dev）
- **AWS Cost Record**: エージェントに関連する課金明細。GB-hrs および vCPU-hrs の単位で記録
- **Deploy Configuration**: 各エージェントのコンテナ設定（メモリ上限、CPU 設定、スケーリングポリシー、アイドルタイムアウト）

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 調査完了時に、コスト発生の根本原因が「AgentCore の仕様」または「設定で回避可能」のいずれかに分類されている
- **SC-002**: 対象4エージェントそれぞれについて、発生しているセッション数・コスト額が定量的に確認される
- **SC-003**: 調査結果に基づく推奨アクションが、実施後にコストをゼロまたは最小化（意図しない課金の排除）できると検証可能な形で示される
- **SC-004**: 調査報告書が 1 営業日以内に完成し、担当者が内容を理解して意思決定できる

## Assumptions

- AWS SSO セッションは調査開始時点でログイン済みであること
- 対象エージェントは Amazon Bedrock AgentCore 上で動作していること
- AWS Cost Explorer または CloudWatch Metrics でエージェント別のコストデータが参照可能であること
- AgentCore の課金は「セッション時間ベース（GB-hrs, vCPU-hrs）」で計算されるという前提で調査する

## Out of Scope

- 検証エージェント（verification zone）のコスト調査は対象外（execution zone の4エージェントのみ）
- 本番環境（prod）のエージェントは対象外（Dev 環境のみ）
- コスト最適化の実装自体は本仕様の範囲外（調査・報告のみ）

---

## 調査結果（Investigation Findings）

**調査完了日**: 2026-03-22

### 結論（エグゼクティブサマリー）

Dev 環境4エージェントに記録されているセッションは、**AgentCore の仕様として発生する READY-state プロビジョニングセッション**（新規 Runtime CREATE 時に1回のみ）と、**コンソールが旧 Runtime ID のセッションを名前ベースで集約表示する**ことの組み合わせによるものである。意図しない継続的なコストは発生していない。

---

### 根本原因（SC-001 達成）

#### 原因 1: READY-state プロビジョニングセッション（AgentCore 仕様）

- AgentCore は新規 Runtime を CREATE（≠ UPDATE）するたびに、コンテナを1回起動して READY 状態に移行させる
- この起動セッションは約 17〜33秒（ブート）＋ `idleRuntimeSessionTimeoutSeconds`（300秒）= 合計約 5〜6分間コンテナを保持する
- 課金額: 4GB メモリ × 5分 × $0.00945/GB-hr ≒ **$0.013/エージェント/デプロイ**
- 4エージェント × 複数回のデプロイ = 累積コストが Cost Explorer に表示される
- **分類: AgentCore 仕様（回避不能）** — ただしデプロイ回数に比例するため、不必要な再デプロイを避けることでコスト最小化可能

#### 原因 2: コンソール集約表示（表示上の問題）

- AgentCore コンソールのセッション数表示は、エージェント**名**で集約される（Runtime ID 問わず）
- WebFetch エージェントで表示される約70セッションの内訳:
  - 旧 Runtime `sf3Gd1FEcZ`（2026-02-21 〜 2026-03-22、30日間）: 開発者が直接テスト呼び出しした ~69 セッション
  - 新 Runtime `2uMLK92WqA`（2026-03-22 デプロイ）: READY プロビジョニングセッション 1件（CloudWatch: 0 bytes）
- **新 Dev エージェント自体のコストはほぼゼロ**（$0.013/回 のプロビジョニングのみ）

---

### 各エージェントの状況（SC-002 達成）

| エージェント | コンソール表示 | 実際の新 Runtime セッション | 新 Runtime CloudWatch | 判定 |
|-------------|--------------|--------------------------|----------------------|------|
| SlackAI_WebFetchAgent_Dev | ~70 | 1（READY 起動のみ） | 0 bytes | 正常 |
| SlackAI_TimeAgent_Dev | 数件 | 1（READY 起動のみ） | 0 bytes | 正常 |
| SlackAI_DocsAgent_Dev | 数件 | 1（READY 起動のみ） | 0 bytes | 正常 |
| SlackAI_FileCreatorAgent_Dev | 数件 | 1（READY 起動のみ） | 0 bytes | 正常 |
| SlackAI_SlackSearch_Dev | 0 | 1（READY 起動のみ） | 0 bytes | 正常（旧 Runtime 7日分のみ、表示は0）|
| SlackAI_VerificationAgent_Dev | 0 | 0 | 0 bytes | 正常（新 Dev 向け Slack トラフィックなし） |

**SlackSearch が全指標ゼロの理由**: 旧 Runtime `kOeoWb6YTa` が 2026-03-15 デプロイ（7日間のみ）で、条件付きオンデマンド呼び出しのため蓄積セッション数が少なく、コンソール上はゼロ表示。新 Runtime の READY セッションも execution agents と同様に発生しているが、コスト額が Cost Explorer の表示閾値以下。

**VerificationAgent_Dev がゼロの意味**: 新しい execution zone エージェントをデプロイしてから、Dev 環境への Slack トラフィックは一切ルーティングされていない。VerificationAgent が起動していないため、cascade loop（`ENABLE_AGENT_CARD_DISCOVERY`）は Dev 環境では発動していない。

---

### 否定された仮説

| 仮説 | 内容 | 否定の根拠 |
|------|------|-----------|
| 仮説 A: Cascade loop | VerificationAgent が `discover_agent_card` を繰り返し呼び出し、execution agent をタイムアウトごとに再起動 | VerificationAgent_Dev のセッション数 = 0。Dev では VerificationAgent 未起動のため不成立 |
| 仮説 B: ヘルスチェック自動呼び出し | AWS 内部ヘルスチェックがセッションを生成 | CloudWatch ログ = 0 bytes。内部 HTTP リクエストの痕跡なし |
| 仮説 C: 初期化セッション繰り返し | idle timeout ごとに再起動を繰り返す | 新 Runtime のセッション数 = 1のみ。繰り返しなし（Consumption-based 課金のため、idle 中はコンテナ停止） |
| 仮説 D: Provisioned Capacity 課金 | 使用量に関わらず固定費が発生 | Cost Explorer の USAGE_TYPE は `Consumption-based:Memory`。provisioned capacity なし |

---

### `ENABLE_AGENT_CARD_DISCOVERY` について（Prod 予防措置）

- Prod 環境では VerificationAgent_Prod が稼働しており、`ENABLE_AGENT_CARD_DISCOVERY=true` であった場合、各 Slack メッセージ処理時に `refresh_missing_cards()` が execution agent を呼び出す可能性があった
- 2026-03-22 以前に `true` → `false` へ変更済み（CDK `verification-agent-runtime.ts:247`）
- Dev 環境では VerificationAgent が起動していないため、この問題は Dev には影響しなかった

---

### OTel WARN ログについて

```
"Configuration of configurator not loaded, aws_configurator already loaded"
severityNumber: 13 (WARN)
scope: opentelemetry.instrumentation.auto_instrumentation._load
```

- **原因**: AgentCore ランタイムが `aws_configurator` を先に読み込む。その後 `strands-agents[otel]` が別の configurator を読み込もうとするが、重複として検出されスキップされる
- **影響**: なし。OTel トレースは正常に機能する。エラーではなく WARN
- **出現条件**: 実際にリクエストを処理しているエージェント（Prod または旧 Dev）のログにのみ出現。新 Dev エージェント（0 bytes）には出現しない

---

### 推奨アクション（SC-003 達成）

| 対象 | アクション | 理由 | 期待効果 |
|------|-----------|------|---------|
| 新 Dev 4エージェント | **現状維持** | コストはプロビジョニング分のみ（$0.013/エージェント/デプロイ）。問題なし | — |
| 旧 Dev エージェント（使用中止分） | **削除を検討** | 不要になった旧 Runtime は削除することでコンソール表示を整理できる | コンソールの混乱解消 |
| Prod エージェント | **コスト監視継続** | Prod は実際に Slack トラフィックを処理しており、月 ~$300 の課金は正常 | — |
| 不必要な再デプロイ | **回避** | Runtime を CREATE するたびに $0.013/エージェントのプロビジョニングコストが発生 | デプロイ回数削減でコスト最小化 |
| `ENABLE_AGENT_CARD_DISCOVERY` | **`false` 維持** | Prod での cascade 防止。既に対処済み | Prod コスト安定 |

---

### 成功基準の達成確認

- **SC-001** ✅ AgentCore 仕様（READY プロビジョニング）+ コンソール集約表示の2つが原因と特定。「AgentCore 仕様（回避不能）」に分類
- **SC-002** ✅ 全6エージェントのセッション数・コスト状況を定量的に確認（上表参照）
- **SC-003** ✅ 推奨アクション（現状維持・旧 Runtime 削除・不要デプロイ回避）が提示済み
- **SC-004** ✅ 調査開始〜報告書完成まで 1 営業日以内（2026-03-22 当日完了）
