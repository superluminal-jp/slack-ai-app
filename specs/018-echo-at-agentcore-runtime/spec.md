# Feature Specification: Echo at Verification Agent (AgentCore Runtime)

**Feature Branch**: `018-echo-at-agentcore-runtime`  
**Created**: 2026-02-08  
**Status**: Draft  
**Input**: エコーモード時は SlackEventHandler は SQS に送り、Verification Agent (AgentCore Runtime) で Execution Zone へ転送せず [Echo] のみ Slack に返す。Runtime までリクエストを通したうえで動作検証を行う。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - エコーを Verification Agent (Runtime) で返す (Priority: P1)

運用担当がエコーモードを有効にした状態で、Slack からボットにメンションを送る。リクエストは SlackEventHandler Lambda → SQS → Agent Invoker → Verification Agent (AgentCore Runtime) まで届く。Verification Agent は Execution Zone を呼ばず、受信したメッセージ本文に [Echo] を付けて同じスレッドに投稿し、動作検証ができる。

**Why this priority**: AgentCore Runtime まで経路が通っていることを確認できる最小の価値。Lambda のみのエコー（017）より検証範囲が広い。

**Independent Test**: エコーモード有効でメンションを送り、同じスレッドに [Echo] 付きで返ることを確認。CloudWatch 等で Lambda → SQS → Agent Invoker → Verification Agent のログが存在し、Execution Agent は呼ばれていないことを確認。

**Acceptance Scenarios**:

1. **Given** エコーモードが有効、**When** ユーザーがボットにメンションで「テスト」と送る、**Then** 同じスレッドに「[Echo] テスト」が返る。
2. **Given** 上記の状態、**When** リクエストが処理される、**Then** Execution Zone（Execution Agent）への呼び出しは発生しない。
3. **Given** エコーモードが有効、**When** メンションが送られる、**Then** SlackEventHandler は SQS にメッセージを送り、Lambda 内ではエコー投稿を行わない。

---

### User Story 2 - エコーモード無効時は従来どおり (Priority: P2)

エコーモードを無効にした場合、従来どおり SQS → Agent Invoker → Verification Agent → Execution Agent の経路で AI 応答が返る。

**Why this priority**: モード切り替えで既存動作を壊さないことを保証する。

**Independent Test**: エコーモードを無効にしてメンションを送り、Execution 経由の応答が返ることを確認。

**Acceptance Scenarios**:

1. **Given** エコーモードが無効、**When** ユーザーがメンションを送る、**Then** Execution Agent が呼ばれ、通常の AI 応答が返る。

---

### User Story 3 - エコー内容・宛先の明確さ (Priority: P2)

エコーは当該リクエストのチャンネル・スレッドにのみ返り、他スレッドや他チャンネルに投稿されない。投稿内容は当該メッセージの本文と対応する。

**Why this priority**: 複数スレッドや並行リクエストでも混在しないことを保証する。

**Independent Test**: 複数スレッドで同時にメンションを送り、各スレッドに正しいエコーのみ返ることを確認。

**Acceptance Scenarios**:

1. **Given** エコーモード有効、**When** スレッド A で「A」、スレッド B で「B」と送る、**Then** スレッド A に [Echo] A、スレッド B に [Echo] B のみが返る。

---

### Edge Cases

- エコーモード有効時に Verification Agent が Slack 投稿に失敗した場合、ユーザーにはエコーは表示されないが、Lambda は 200 を返しているため Slack の再試行を防ぐ。ログで失敗原因を追えること。
- エコーモードの設定が Lambda と Runtime で食い違う場合（例: Lambda は SQS に送るが Runtime は echo 無効）：Runtime 側の設定に従い、Execution が呼ばれる。運用では両者を揃える前提とする。
- 非常に長いメッセージ本文は Slack API の制限内でエコーする。制限を超える場合は切り詰めまたはエラー扱いを実装で定義する。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: エコーモード有効時、SlackEventHandler Lambda はリクエストを SQS に送信し、Lambda 内ではエコー投稿（Slack への [Echo] 投稿）を行わない。
- **FR-002**: Verification Agent（AgentCore Runtime）はエコーモードをサポートし、有効時は Execution Zone（Execution Agent）を呼び出さず、受信したメッセージ本文に [Echo] を付けて同じ Slack スレッドに投稿すること。
- **FR-003**: Verification Agent のエコーモードは、設定（例: 環境変数）で有効/無効を切り替え可能であること。
- **FR-004**: エコーモード無効時は、従来どおり SQS → Agent Invoker → Verification Agent → Execution Agent の経路で応答が返ること。
- **FR-005**: エコー投稿は、当該リクエストのチャンネル・スレッド・メッセージ本文のみを用い、他リクエストと混在しないこと。
- **FR-006**: エコーモード有効時、Slack の 3 秒以内応答の要請を満たすため、Runtime 側で即時 200 相当の応答とエコー投稿の完了を考慮した設計とすること。

### Key Entities

- **エコーモード設定**: Validation Zone 内で「Execution を呼ばずエコーのみ返す」を有効にする設定。Verification Agent Runtime に渡す。
- **リクエストコンテキスト**: チャンネル、スレッド、ユーザー、メッセージ本文。エコー投稿の宛先と内容の紐付けに用いる。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 運用担当がエコーモード有効でメンションを送ったとき、Slack 上で [Echo] 付きの同一本文が同じスレッドに返り、Execution Zone への呼び出しが発生していないことをログ等で確認できること。
- **SC-002**: エコーモード有効時のエコー応答が、ユーザー操作から Slack に表示されるまで、Slack の再試行を招かない時間（目安 3 秒以内）で完了すること。
- **SC-003**: 複数スレッドで同時にメンションした場合、各スレッドに正しいエコーのみが返り、混在しないこと。
- **SC-004**: エコーモードを無効にした状態で、従来どおり AI 応答が返り、既存の動作が維持されること。

## Assumptions

- 017 で導入した Lambda 側のエコーモード（Lambda 内でエコーして SQS を呼ばない）は、018 では「エコーモード時は SQS に送る」ように変更する。つまり 018 適用後、エコーモード時の経路は Lambda → SQS → Agent Invoker → Verification Agent となり、エコーは Runtime 側でのみ行う。
- エコーモードの設定は、Verification Agent Runtime に環境変数等で渡す。SlackEventHandler は「エコーモードが有効か」を判定して SQS に送るかどうかを決めるのではなく、018 では常に SQS に送り、エコーするかどうかは Runtime 側の設定に委ねる（両方に同じフラグを渡し、Lambda ではエコーせず SQS に送り、Runtime でエコーする、という一貫した運用を想定）。
- Agent Invoker の実装は変更せず、Verification Agent の入力形式は既存のままとする。

## Dependencies

- 016 非同期起動（SQS + Agent Invoker）がデプロイ済みであること。
- 017 Validation Zone Echo（Lambda 側エコー）の実装を、018 では「エコーモード時も SQS に送る」ように変更する前提。
