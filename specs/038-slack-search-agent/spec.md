# Feature Specification: Slack Search Agent for Verification Zone

**Feature Branch**: `038-slack-search-agent`
**Created**: 2026-03-15
**Status**: Draft
**Input**: User description: "呼び出し元slackのスレッドの取得は既存のルールベースで必須で行うこととして、それとは別に呼び出し元slackチャンネルをverification agentが任意に柔軟に検索して関連情報を収集できるようにする。特にユーザーから検索依頼やURLの提示をリクエストとして受けた場合に対応できるように。execution agentsを呼び出す仕組みと同様にagentとして実装するが、デプロイ先はverification zone内になるように配置。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Slack チャンネル検索による関連情報収集 (Priority: P1)

ユーザーが「先週の #general での議論をまとめて」「〇〇というトピックの過去のやりとりを探して」などと依頼した場合、verification agent が Slack Search Agent を呼び出してチャンネル内のメッセージを検索し、関連情報を回答に反映する。

**Why this priority**: 最も頻度が高いユースケース。チャンネル検索がなければユーザーは手動で情報を探してコピーペーストするか、文脈なしで質問するしかない。

**Independent Test**: ユーザーが検索依頼を含むメッセージを送ると、verification agent が Slack Search Agent を呼び出してチャンネルを検索し、結果を含む回答を Slack に返信する。

**Acceptance Scenarios**:

1. **Given** ユーザーが `#product` チャンネルで「先週の #general の議論を要約して」と依頼する、**When** verification agent がリクエストを受け取る、**Then** Slack Search Agent が公開チャンネル `#general` のメッセージを検索し、検索結果を反映した要約を返信する
2. **Given** ユーザーが「"リリース計画" に関するメッセージを探して」と依頼する、**When** verification agent がリクエストを受け取る、**Then** Slack Search Agent が呼び出し元チャンネルおよび公開チャンネルを対象にキーワードで検索し、一致するメッセージ一覧と文脈を回答する
3. **Given** 検索クエリがヒットしない場合、**When** Slack Search Agent が結果 0 件を返す、**Then** verification agent は「該当するメッセージが見つかりませんでした」とユーザーに通知する
4. **Given** ユーザーがプライベートチャンネル（呼び出し元以外）の検索を依頼する、**When** Slack Search Agent がチャンネル種別を確認する、**Then** アクセス対象外である旨を明示し、公開チャンネルと呼び出し元チャンネルのみで検索した結果を返す

---

### User Story 2 - URL 提示によるメッセージ・スレッドの取得 (Priority: P1)

ユーザーが Slack メッセージの URL を提示して「このスレッドの内容をまとめて」「このメッセージに関連する情報を集めて」と依頼した場合、verification agent が Slack Search Agent を呼び出して対象メッセージおよびそのスレッド全体を取得し、回答に活用する。

**Why this priority**: 既存の `slack_url_resolver.py` はパイプライン起動時に静的処理するが、本ストーリーは会話の流れの中で動的に URL を処理する能力を追加する。P1 として必須。

**Independent Test**: ユーザーが Slack URL を含むメッセージを送ると、Slack Search Agent がその URL のスレッドを取得し、verification agent がその内容を使って回答する。

**Acceptance Scenarios**:

1. **Given** ユーザーが特定の Slack メッセージ URL を送り「このスレッドを要約して」と依頼する、**When** verification agent がリクエストを受け取る、**Then** Slack Search Agent が当該スレッドの全返信を取得し、verification agent が要約を返信する
2. **Given** ユーザーが提示した URL のチャンネルへのアクセス権がない場合、**When** Slack Search Agent がアクセスを試みる、**Then** アクセス不能な旨をユーザーに通知する（エラーでパイプラインが止まらない）
3. **Given** ユーザーが無効・期限切れの Slack URL を提示する、**When** Slack Search Agent がメッセージ取得を試みる、**Then** 取得失敗を明示し、残りの処理は継続する

---

### User Story 3 - 特定チャンネルのメッセージ履歴取得 (Priority: P2)

ユーザーが「#dev チャンネルの最新10件のメッセージを見せて」など、特定チャンネルの最近の投稿一覧を要求した場合に対応する。

**Why this priority**: 検索より限定的なユースケースだが、チャンネル監視・サマリー用途で有用。P1 が完成した後に追加可能。

**Independent Test**: ユーザーが特定チャンネル名と件数を指定すると、Slack Search Agent がそのチャンネルの最新メッセージを取得して返す。

**Acceptance Scenarios**:

1. **Given** ユーザーが「#announcements の最新投稿を教えて」と依頼する、**When** verification agent がリクエストを受け取る、**Then** Slack Search Agent が公開チャンネル `#announcements` の最近のメッセージを取得し、要約を返信する
2. **Given** ユーザーがプライベートチャンネル（呼び出し元以外）の履歴取得を依頼する、**When** Slack Search Agent がチャンネル種別を確認する、**Then** アクセス対象外である旨を通知し、処理を継続する
3. **Given** 対象チャンネルが公開かつボットが参加していない場合、**When** Slack Search Agent がメッセージ取得を試みる、**Then** 取得不能な旨を通知する

---

### Edge Cases

- ホワイトリスト未設定の場合、どの範囲を検索対象とするか？ → 呼び出し元チャンネルと公開チャンネルのみを対象とする。追加制限は既存ホワイトリスト機構で管理する
- 検索結果が大量（100件超）の場合、どこまで取得するか？ → 最大 20 件に制限し、ユーザーには件数と絞り込み方法を案内する
- Slack API レートリミットに達した場合？ → リトライせずエラーメッセージを返し、verification agent は他の情報源で回答を試みる
- verification agent が Slack Search Agent を呼び出すべきか否か判断できない曖昧な依頼？ → 検索意図が明示されている場合のみ呼び出し、曖昧な場合はユーザーに確認する

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: システムは、Slack Search Agent として機能するエージェントを verification zone 内にデプロイしなければならない
- **FR-002**: Slack Search Agent は、キーワード・フレーズによるチャンネルメッセージ検索機能を提供しなければならない
- **FR-003**: Slack Search Agent は、Slack メッセージ URL からスレッド全体（親メッセージ＋返信）を取得する機能を提供しなければならない
- **FR-004**: Slack Search Agent は、指定チャンネルの最新メッセージ履歴を取得する機能を提供しなければならない
- **FR-005**: verification agent は、Slack Search Agent を execution agent と同様の A2A プロトコルで呼び出せなければならない
- **FR-006**: Slack Search Agent は、verification zone 内に配置され、同ゾーンの他のコンポーネントから直接呼び出し可能でなければならない
- **FR-007**: Slack Search Agent は、呼び出し元チャンネルと公開（パブリック）チャンネルのみにアクセスを許可し、それ以外のプライベートチャンネルへのアクセスを拒否しなければならない
- **FR-008**: Slack Search Agent は、1 回の検索・取得で返すメッセージ数を最大 20 件に制限しなければならない
- **FR-009**: Slack Search Agent は、アクセスエラー・取得失敗時にエラー内容を明示した応答を返し、verification agent のパイプラインを停止させてはならない
- **FR-010**: 既存のルールベーススレッド取得（`build_current_thread_context`）は変更せず、本機能はそれに加える追加能力として実装しなければならない
- **FR-011**: Slack Search Agent は、agent card（A2A 標準）を公開し、その機能とスキルを機械可読な形で提供しなければならない

### Key Entities

- **Slack Search Agent**: verification zone 内で稼働し、Slack API を介してチャンネル検索・メッセージ取得を担うエージェント。`search_messages`、`get_thread`、`get_channel_history` の 3 スキルを持つ
- **SearchRequest**: エージェントへの入力。検索クエリ、対象チャンネル（任意）、取得件数上限を含む
- **MessageResult**: 取得したメッセージの集合。各メッセージはチャンネル名・投稿者・タイムスタンプ・本文・スレッド返信数を含む

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: ユーザーがチャンネル検索依頼を行った場合、Slack Search Agent が 5 秒以内に検索結果を返し、verification agent が 15 秒以内に回答をユーザーに返せること
- **SC-002**: ユーザーが Slack URL を提示した場合、Slack Search Agent がスレッド取得を含む処理を 5 秒以内に完了すること
- **SC-003**: Slack API のアクセスエラーが発生した場合、パイプライン全体を止めることなく 100% のケースで graceful な応答を返すこと
- **SC-004**: 既存のルールベーススレッド取得の動作が本機能追加後も変更されないこと（既存テストがすべて通過すること）
- **SC-005**: Slack Search Agent が agent card を公開し、verification agent が起動時にそのスキル情報を自動取得できること

## Assumptions

- ボットトークンはすでに verification agent が保持しており、Slack Search Agent に渡す仕組みがある
- Slack Search Agent は execution zone 形式と同じ A2A コンテナベース構成で実装する
- Slack API の検索機能（`search.messages`）が利用可能なトークン権限（`search:read`）を持つ
- アクセス可能な範囲は「呼び出し元チャンネル」と「公開チャンネル」に限定する。呼び出し元以外のプライベートチャンネルはアクセス対象外とする
- verification zone の CDK スタックを拡張して Slack Search Agent を追加デプロイする
