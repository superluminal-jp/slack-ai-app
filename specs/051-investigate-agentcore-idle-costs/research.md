# Research: AgentCore Idle Agent Billing Investigation

**Branch**: `051-investigate-agentcore-idle-costs`
**Date**: 2026-03-22
**Status**: Complete

## Research Tasks

- [x] RT-001: AWS ドキュメント調査 — AgentCore 課金モデル
- [x] RT-002: 現在の AgentCore エージェント設定確認
- [x] RT-003: ランタイムセッション一覧取得（API 調査含む）
- [x] RT-004: CloudWatch ログ確認
- [x] RT-005: AWS Cost Explorer 確認

---

## RT-001: AgentCore 課金モデル

**課金モデル**: **Consumption-based（使用量ベース）**

Cost Explorer の USAGE_TYPE 区分:
- `APN1-Runtime:Consumption-based:Memory` — セッション中のメモリ使用量 (GB-hrs)
- `APN1-Runtime:Consumption-based:vCPU` — セッション中の vCPU 使用量 (vCPU-hrs)

**重要**: AgentCore は Lambda ではなくコンテナベースで動作するが、**常時稼働のプロビジョニング課金ではない**。セッションが開始されたときのみコンテナが起動し、アイドルタイムアウト後に停止する。コンテナが停止している間はコストは発生しない。

**セッションライフサイクル** (現在の設定):
- `idleRuntimeSessionTimeoutSeconds: 300` — 5分間アイドルでセッション終了・コンテナ停止
- `maxLifetimeSeconds: 3600` — セッション最大継続時間 1時間

→ **課金は「セッション継続時間 × リソース量」のみ。未呼び出しのエージェントはコストを発生させない。**

---

## RT-002: 対象エージェント設定確認

| エージェント | ARN (Runtime ID) | Status | idleTimeout | maxLifetime | デプロイ日時 |
|-------------|-----------------|--------|-------------|-------------|-------------|
| SlackAI_WebFetchAgent_Dev | 2uMLK92WqA | READY | 300s | 3600s | 2026-03-22 07:04 UTC |
| SlackAI_TimeAgent_Dev | JlyS3bFYUU | READY | 300s | 3600s | 2026-03-22 07:00 UTC |
| SlackAI_DocsAgent_Dev | jYLCPE9hhf | READY | 300s | 3600s | 2026-03-22 06:59 UTC |
| SlackAI_FileCreatorAgent_Dev | 3UQvaoCUQE | READY | 300s | 3600s | 2026-03-22 06:57 UTC |

全エージェント: NetworkMode=PUBLIC, Protocol=A2A

---

## RT-003: ランタイムセッション API 調査

AWS CLI の `bedrock-agentcore` (Data Plane) および `bedrock-agentcore-control` (Control Plane) には **セッション履歴を一覧するAPIは存在しない**。

- `list-agent-runtime-sessions` → 存在しない
- `list-agent-runtime-versions` → バージョン一覧のみ（セッション情報なし）
- `list-agent-runtime-endpoints` → エンドポイント情報のみ

セッション履歴はマネジメントコンソールの UI 経由でのみ確認可能。**コンソールはエージェント名でセッションを集約表示するため、旧デプロイ (旧 Runtime ID) のセッションも現在のエージェント名で表示される。**

---

## RT-004: CloudWatch ログ確認

### 新 Dev エージェント（今日 2026-03-22 デプロイ分）

| ロググループ | 作成日時 | storedBytes |
|------------|---------|------------|
| SlackAI_WebFetchAgent_Dev-**2uMLK92WqA**-DEFAULT | 2026-03-22 07:44 UTC | **0 bytes** |
| SlackAI_TimeAgent_Dev-**JlyS3bFYUU**-DEFAULT | 2026-03-22 07:40 UTC | **0 bytes** |
| SlackAI_DocsAgent_Dev-**jYLCPE9hhf**-DEFAULT | 2026-03-22 07:39 UTC | **0 bytes** |
| SlackAI_FileCreatorAgent_Dev-**3UQvaoCUQE**-DEFAULT | 2026-03-22 07:37 UTC | **0 bytes** |

→ **新デプロイのエージェントにはコンテナ活動の痕跡がゼロ。セッションは存在しない。**

### 旧 Dev エージェント（前回デプロイ分 — 既に削除済み）

| ロググループ | 作成日時 | storedBytes |
|------------|---------|------------|
| SlackAI_WebFetchAgent_Dev-**sf3Gd1FEcZ**-DEFAULT | 2026-02-21 02:58 UTC | 5,315,180 bytes |
| SlackAI_FileCreatorAgent_Dev-**dMAfqf3kb9**-DEFAULT | 2026-02-21 02:56 UTC | 5,327,132 bytes |
| SlackAI_TimeAgent_Dev-**vA2AmkBzdQ**-DEFAULT | 2026-02-17 16:53 UTC | 6,043,711 bytes |
| SlackAI_DocsAgent_Dev-**V9z0YxHYQM**-DEFAULT | 2026-02-16 22:06 UTC | 6,806,248 bytes |

→ **旧エージェントには大量のログ（5〜6MB）= 実際の呼び出しセッションが存在した。**

### Prod エージェント（2026-03-15 デプロイ）

| ロググループ | 作成日時 | storedBytes |
|------------|---------|------------|
| SlackAI_FileCreatorAgent_Prod-ZnAkMb3Hw8-DEFAULT | 2026-03-15 06:32 UTC | 1,941,016 bytes |
| SlackAI_DocsAgent_Prod-1g0Uz7GECC-DEFAULT | 2026-03-15 06:33 UTC | 1,936,278 bytes |
| SlackAI_TimeAgent_Prod-fFsoIyCK9I-DEFAULT | 2026-03-15 06:34 UTC | 1,943,206 bytes |
| SlackAI_WebFetchAgent_Prod-Xv4nIMDlf9-DEFAULT | 2026-03-15 06:39 UTC | 1,935,921 bytes |

→ **Prod エージェントは 2026-03-15 にデプロイされ、以降は実際の Slack トラフィックを処理している。**

---

## RT-005: AWS Cost Explorer — コスト実績

**サービス**: Amazon Bedrock AgentCore (ap-northeast-1)

| 日付 | Memory GB-hrs | vCPU-hrs | コスト USD | 備考 |
|------|--------------|----------|-----------|------|
| 2026-03-01 | 425.197 | 4.023 | $4.38 | 初回スパイク（Dev エージェント初期デプロイ） |
| 2026-03-02〜14 | ~100/日 | ~0.87/日 | ~$1.00/日 | Dev エージェント定常使用（開発中） |
| **2026-03-15** | **1360.171** | **16.525** | **$14.33** | **Prod エージェントデプロイ → 急増** |
| 2026-03-16 | 1516.278 | 19.509 | $16.08 | Prod + Dev 合算ピーク |
| 2026-03-17〜21 | ~1000-1100/日 | ~9-12/日 | ~$10-11/日 | Prod エージェント定常稼働 |
| **2026-03-22** | **33.124** | **0.254** | **$0.34** | **新 Dev エージェントデプロイ → 急減** |

**今日 (2026-03-22) の内訳**:
- `APN1-Runtime:Consumption-based:Memory`: $0.313 (33.124 GB-hrs)
- `APN1-Runtime:Consumption-based:vCPU`: $0.023 (0.254 vCPU-hrs)
- データ転送: $0.000

今日のコストは 07:00 UTC のデプロイ前に旧 Dev エージェントがバックグラウンドで処理していたセッション分と、VerificationAgent の通常運用分と推定される。

---

## Root Cause

**判定**: **AgentCore のエンドポイント READY 状態遷移に伴う自動コンテナ起動とアイドルウォームアップ（新 Dev エージェント限定）**

### 詳細分析（新 Dev エージェントのみ対象）

対象: 2026-03-22 06:57〜07:04 UTC にデプロイされた4体（新 Runtime ID）。

**根拠: エンドポイント createdAt vs lastUpdatedAt の差**

```
SlackAI_FileCreatorAgent_Dev-3UQvaoCUQE: 06:57:05 → 06:57:38 (+33s) → READY
SlackAI_DocsAgent_Dev-jYLCPE9hhf:       06:59:07 → 06:59:24 (+17s) → READY
SlackAI_TimeAgent_Dev-JlyS3bFYUU:       07:00:17 → 07:00:34 (+17s) → READY
SlackAI_WebFetchAgent_Dev-2uMLK92WqA:   07:04:10 → 07:04:28 (+18s) → READY
```

**メカニズム（3フェーズ）:**

1. **プロビジョニングヘルスチェック** (17〜33秒): AgentCore がコンテナを起動し、エンドポイントの疎通を内部確認して READY に遷移。
2. **アイドルウォームアップ** (300秒): ユーザーリクエストが来ない → `idleRuntimeSessionTimeoutSeconds: 300` 経過後にコンテナが停止。
3. **合計課金時間** (317〜333秒/エージェント): この 1 セッションが Memory/vCPU 消費として計上される。

**なぜ CloudWatch ログが 0 bytes か**:
`otel-rt-logs` ストリームは OpenTelemetry SDK（`strands-agents[otel]`）のトレースデータ専用。ユーザーリクエストが処理されたときのみ OTel トレースが生成される。コンテナ起動・アイドル・停止だけでは OTel トレースは出力されないため 0 bytes。コンテナは確かに起動したが、OTel 可観測データは生成されなかった。

**新 Dev 4体の推定コスト（2GB RAM / 1vCPU 仮定）:**

| エージェント | 課金時間 | Memory (GB-hr) | vCPU (hr) | コスト (USD) |
|------------|---------|---------------|-----------|-------------|
| FileCreatorAgent | 333秒 | 0.185 | 0.093 | ~$0.010 |
| TimeAgent | 317秒 | 0.176 | 0.088 | ~$0.010 |
| DocsAgent | 317秒 | 0.176 | 0.088 | ~$0.010 |
| WebFetchAgent | 318秒 | 0.177 | 0.088 | ~$0.010 |
| **合計** | | **0.714** | **0.357** | **~$0.039** |

※ 今日の全 AgentCore コスト $0.3358 のうち新 Dev 4体の割合は約 12%。残り ~$0.30 は VerificationAgent_Dev/Prod および Prod エージェント（Slack ユーザートラフィック）分。

### 仮説との照合

| 仮説 | 判定 | 根拠 |
|------|------|------|
| B: ヘルスチェックによるセッション | ✅ **正（部分）** | endpoint READY 遷移時の内部ヘルスチェックで起動（新 Dev の 1 セッション） |
| **C: デプロイ時初期化セッション** | ✅ **正（新 Dev の主因）** | endpoint lastUpdatedAt が 17〜33s 後に変化 = コンテナ起動の証拠 |
| D: Provisioned Capacity 常時課金 | ❌ 否定 | 課金タイプ "Consumption-based" = セッション中のみ |
| **E: コンソール集約表示** | ✅ **正（70セッション表示の原因）** | コンソールはエージェント名で全 Runtime ID を集約。旧 Runtime (`sf3Gd1FEcZ`) の実セッション + 新 Runtime の 1 セッション = ~70 |
| A: Agent Card Discovery カスケード | ⚠️ **Dev には不適用** | VerificationAgent_Dev のセッション数が 0 → Dev では VerificationAgent が起動しておらず `discover_agent_card` は呼ばれていない。Prod 環境での追加セッション要因としては有効。 |

### 補足調査: SlackAI_WebFetchAgent_Dev の「70セッション」

**前提確認**: 新 execution zone エージェントのデプロイ後、`SlackAI_VerificationAgent_Dev` のセッション数は **0**。

VerificationAgent_Dev が 0 セッション = コンテナが一度も起動していない。したがって:
- `initialize_registry()` は実行されていない
- `discover_agent_card` は Dev execution agent に対して呼ばれていない
- **Agent Card Discovery カスケードは Dev 環境の 70 セッションの原因ではない**

**70 セッションの正しい説明:**

| Runtime ID | 状態 | CloudWatch ログ | セッション源泉 |
|-----------|------|----------------|--------------|
| `sf3Gd1FEcZ` | 削除済み（旧） | 5,315,180 bytes | 開発・テスト期間中の直接 `invoke_agent_runtime` 呼び出し（VerificationAgent 非経由） |
| `2uMLK92WqA` | READY（新） | **0 bytes** | READY プロビジョニングヘルスチェック 1 回のみ |

AgentCore コンソールがエージェント名で全 Runtime ID を集約 → 旧 Runtime 実使用分 (~69) + 新 Runtime プロビジョニング (1) = **~70** と表示。

**`ENABLE_AGENT_CARD_DISCOVERY` カスケードについて:**
このカスケードは Slack トラフィックが実際に流れている環境（Prod など）で VerificationAgent が起動する場合に発生しうる。Dev では VerificationAgent が起動していないため影響なし。`false` への変更は Prod 環境での予防措置として有効。

---

## Recommendation

### 短期アクション（緊急度: 低）

1. **初回デプロイコスト (~$0.04/4体) は仕様として受け入れる** — AgentCore の READY 遷移ヘルスチェックによるもの。設定で無効化不可。1デプロイあたり1回のみ発生し、その後リクエストなしで追加コスト $0。
2. **`idleRuntimeSessionTimeoutSeconds` の削減（任意）** — 現在 300秒 → 60秒（最小値）に変更すると初回プロビジョニングコストが約 1/5 に削減。ただし実際の呼び出し時のコールドスタートが増加するトレードオフあり。

### 中期アクション（緊急度: 中）

4. **本番コストの確認** — $10〜16/日（月~$300〜480）は Prod エージェントが Slack ユーザーのリクエストを処理している正常な課金。予算との整合を確認する。
5. **不要な Dev エージェントの削除** — 開発テスト不要期間中は `cdk destroy` で削除し、次デプロイ時の初回起動コストのみ支払う形にできる。削除しても Prod には影響しない。

### 参考: コスト構造

```
AgentCore 課金 = Consumption-based (従量制)
  セッション時間 × メモリ(GB) × $0.00945/GB-hr
+ セッション時間 × vCPU × $0.0895/vCPU-hr

コスト発生タイミング:
  1. デプロイ時: コンテナ起動 + idleTimeout 分 (~$0.01/エージェント)
  2. 呼び出し時: 実際の処理時間 + idleTimeout 分
  3. コンテナ停止後: $0

現状の月次推計:
  - Prod エージェント (4体): ~$10/日 × 30 = ~$300/月 (実トラフィック処理)
  - Dev エージェント (4体): デプロイ時 ~$0.04 + 呼び出し分のみ
  - VerificationAgent Dev+Prod: 呼び出し分のみ
```
