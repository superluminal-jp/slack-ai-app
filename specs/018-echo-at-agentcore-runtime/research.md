# Research: Echo at Verification Agent (AgentCore Runtime)

**Branch**: `018-echo-at-agentcore-runtime` | **Date**: 2026-02-08

## 1. エコーモードの切り替え（Runtime 側）

**Decision**: Verification Agent のエコーモードは、既存と同様に環境変数 `VALIDATION_ZONE_ECHO_MODE` で有効/無効を切り替える。値が `"true"`（小文字正規化）のときのみエコーモード有効とする。

**Rationale**:
- 017 で Lambda に同じ名前の環境変数を導入済み。018 では Runtime にも同じ名前を渡し、運用で「Lambda と Runtime を同じ値で揃える」ことで、Lambda は SQS に送り、Runtime でエコーする一貫した動作にする。
- AgentCore Runtime の CreateAgentRuntime / UpdateAgentRuntime では `EnvironmentVariables`（string-to-string マップ）がサポートされている。既存の `verification-agent-runtime.ts` で `addPropertyOverride("EnvironmentVariables", environmentVariables)` により渡しているため、ここに `VALIDATION_ZONE_ECHO_MODE` を追加すればよい。
- AWS ドキュメント: [UpdateAgentRuntime](https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_UpdateAgentRuntime.html) に `environmentVariables` が含まれる。

**Alternatives considered**:
- **別名の環境変数（例: RUNTIME_ECHO_MODE）**: 運用で Lambda と Runtime の両方に同じ意味のフラグを渡す必要があり、名前を揃えた方が分かりやすいため、`VALIDATION_ZONE_ECHO_MODE` を共通で使用する。

---

## 2. Lambda 側の 017 エコー分岐の変更

**Decision**: 018 では、SlackEventHandler Lambda において「`VALIDATION_ZONE_ECHO_MODE` が true のとき Lambda 内でエコーして return」する 017 の分岐を **削除** する。エコーモードの有無にかかわらず、キュー URL が設定されていれば SQS に送信する（017 以前の 016 の挙動に合わせる）。

**Rationale**:
- Spec の前提: 「018 では常に SQS に送り、エコーするかどうかは Runtime 側の設定に委ねる」。Lambda でエコーモードを判定してエコーするか SQS に送るかを切り替えるのではなく、常に SQS に送り、Runtime 側でエコーモードならエコーだけ行う。
- これにより、エコーモード有効時も経路は Lambda → SQS → Agent Invoker → Verification Agent となり、AgentCore Runtime までリクエストが届く。

**Alternatives considered**:
- **Lambda に「エコー at Runtime」用の別フラグを渡し、そのときだけ SQS に送る**: 可能だが、運用で 2 つのフラグを揃える必要が出る。シンプルに「Lambda は常に SQS に送る」に統一し、Runtime 側のフラグだけでエコーするかどうかを決める方が MVP として明確。

---

## 3. Verification Agent でのエコー処理の挿入位置

**Decision**: A2A エントリポイント `handle_message` 内で、**セキュリティ検証（Existence Check, Whitelist, Rate Limit）の直後**、**Execution Agent 呼び出しの直前**に、エコーモード判定を挿入する。有効なら `post_to_slack` で [Echo] + 本文を投稿し、A2A で成功応答を返して終了する（`invoke_execution_agent` は呼ばない）。

**Rationale**:
- セキュリティ検証は従来どおり実行し、不正リクエストはここで弾く。エコーモードは「検証済みの正当なリクエストについて、Execution を呼ばずにエコーだけ返す」という意味になる。
- 既存の `post_to_slack`（slack_poster）を流用できる。channel, thread_ts, bot_token, text は task_payload から取得済み。

**Alternatives considered**:
- **セキュリティ検証の前にエコー分岐**: 不正リクエストにもエコーが返る可能性があり、望ましくない。検証の後が妥当。

---

## 4. Slack 3 秒制約との関係

**Decision**: 016 の非同期フローと同様、Slack への HTTP 200 は Lambda が SQS にメッセージを送った直後に返す。エコー表示はその後の「Agent Invoker → Verification Agent → Slack 投稿」で行うため、ユーザー操作からエコー表示までには数秒かかる可能性がある。MVP では、エコーが 3 秒を超える場合でも Slack の再試行は発生しない（Lambda は既に 200 を返している）。必要であれば後からキューや Runtime のスケール・タイムアウトを調整する。

**Rationale**:
- Spec FR-006 は「即時 200 相当の応答とエコー投稿の完了を考慮した設計」としており、Lambda の即時 200 は満たしている。エコー表示までの時間は非同期フローの性質上、キュー遅延と Runtime 処理時間に依存する。
- 動作検証が目的のため、まずは「経路が Runtime まで通る」「Execution は呼ばれない」「エコーが返る」の 3 点を満たす MVP を優先する。

---

## 5. まとめ

| 項目 | 選択 | 根拠 |
|------|------|------|
| Runtime のエコーモード | 環境変数 `VALIDATION_ZONE_ECHO_MODE` | 017 と同名で運用を統一、既存 CDK の EnvironmentVariables で渡せる |
| Lambda の 017 分岐 | エコーモード時も SQS に送る（Lambda でエコーしない） | 018 では常に SQS に送り、エコーは Runtime のみで行う |
| エコー分岐の位置（Runtime） | セキュリティ検証の後・Execution 呼び出しの前 | 検証済みリクエストにのみエコー、既存 post_to_slack を利用 |
| 3 秒制約 | Lambda は即時 200；エコー表示は非同期で完了 | 動作検証 MVP を優先し、必要に応じて後から最適化 |
