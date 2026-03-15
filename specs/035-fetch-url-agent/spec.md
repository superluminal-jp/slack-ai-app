# Feature Specification: Web Fetch Agent (fetch_url 独立エージェント化)

**Feature Branch**: `035-fetch-url-agent`
**Created**: 2026-02-21
**Status**: Draft
**Input**: fetch_url を file-creator エージェントから分離し、独立した別のエージェントの機能にする。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Web URL の内容を取得する (Priority: P1)

Slack ユーザーが URL を含むメッセージを送信したとき、システムが専用の Web Fetch エージェントにリクエストをルーティングし、URL のコンテンツをテキストとして取得・返答する。

**Why this priority**: Web コンテンツ取得は独立した責務であり、最初に独立エージェントとして機能することが価値の核心。ファイル生成機能とは無関係に動作すべき。

**Independent Test**: Slack で "https://example.com の内容を教えて" と送信したとき、Web Fetch エージェントが応答し、ページのテキストが返ってくることで独立テスト可能。

**Acceptance Scenarios**:

1. **Given** ユーザーが有効な https URL を含むリクエストを送信した, **When** ルーターがリクエストを分析する, **Then** Web Fetch エージェントにルーティングされ、URL の内容が返る
2. **Given** ユーザーが private IP または非 http/https URL を含むリクエストを送信した, **When** Web Fetch エージェントが処理する, **Then** アクセスがブロックされ、適切なエラーメッセージが返る
3. **Given** URL のコンテンツが 512 KB を超える, **When** Web Fetch エージェントが取得する, **Then** 最初の 14,000 文字までが返り、省略を示すメッセージが付く

---

### User Story 2 - ファイル生成リクエストが引き続き動作する (Priority: P2)

Slack ユーザーがファイル生成・コード作成を依頼したとき、既存の execution-agent (file-creator) が引き続き担当し、fetch_url 分離後も影響を受けない。

**Why this priority**: 既存機能の後退防止。fetch_url の分離が他のツールに影響しないことの確認。

**Independent Test**: "Python で Hello World を書いて" というリクエストが execution-agent に正しくルーティングされ、ファイルが生成されることで確認可能。

**Acceptance Scenarios**:

1. **Given** ユーザーがファイル生成を依頼する, **When** ルーターが判断する, **Then** execution-agent (file-creator) がルーティング先となり、fetch_url なしでも全ツールが正常動作する
2. **Given** fetch_url が execution-agent から削除されている, **When** execution-agent が起動する, **Then** 残りのツールがすべて利用可能で、エラーなく動作する

---

### User Story 3 - エージェント一覧に Web Fetch エージェントが表示される (Priority: P3)

システム管理者またはルーターが登録済みエージェント一覧を確認したとき、新しい Web Fetch エージェントがリストに含まれている。

**Why this priority**: エージェント発見機能との整合性確保。ルーターが新エージェントを認識できることの確認。

**Independent Test**: エージェント一覧取得 API 呼び出しで Web Fetch エージェントが返却されることで確認可能。

**Acceptance Scenarios**:

1. **Given** Web Fetch エージェントがデプロイ・登録されている, **When** エージェント一覧を取得する, **Then** Web Fetch エージェントがリストに含まれ、役割説明が表示される

---

### Edge Cases

- URL が存在しない（DNS 解決失敗）場合、適切なエラーメッセージを返す
- タイムアウト（10秒）した場合、ユーザーに通知する
- HTML 以外のコンテンツ（JSON、プレーンテキスト）の場合、そのままテキストとして返す
- リダイレクトが発生した場合、最終 URL のコンテンツを取得する
- ルーターが Web Fetch エージェントに接続できない場合、unrouted フォールバックが動作する

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: システムは Web コンテンツ取得専用のエージェントを提供しなければならない
- **FR-002**: 新エージェントは `fetch_url` 機能（SSRF 防止、サイズ制限、HTML テキスト抽出を含む）をすべて引き継がなければならない
- **FR-003**: `fetch_url` ツールは execution-agent から削除されなければならない
- **FR-004**: ルーターは URL 取得リクエストを新 Web Fetch エージェントに正しくルーティングできなければならない
- **FR-005**: 新エージェントは既存の A2A（Agent-to-Agent）通信プロトコルに準拠しなければならない
- **FR-006**: 新エージェントは既存のエージェント登録・発見メカニズムに統合されなければならない
- **FR-007**: execution-agent の残りのツールは fetch_url 削除後も引き続き正常に動作しなければならない
- **FR-008**: 新エージェントはデプロイメント用のインフラ定義を持たなければならない

### Key Entities

- **Web Fetch エージェント**: URL コンテンツ取得に特化した新規エージェント。`fetch_url` ツール 1 つのみを持つ。
- **execution-agent (file-creator)**: `fetch_url` を除いたツールのみを持つ既存エージェント。役割はファイル生成・コード作成に限定。
- **ルーター（verification-agent）**: Web Fetch エージェントを新しいルーティング先として認識し、URL 取得リクエストを振り分ける。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: URL 取得リクエストが 100% の確率で新 Web Fetch エージェントにルーティングされる（ファイル生成エージェントへの誤ルーティングがゼロ）
- **SC-002**: 既存のファイル生成・コード作成リクエストに対する応答品質が分離前と同等である（回帰なし）
- **SC-003**: Web Fetch エージェントへの URL 取得リクエストが既存と同じ制約（タイムアウト 10 秒以内、512 KB 上限）で処理される
- **SC-004**: 新エージェントが A2A エージェント一覧に表示され、ルーターから正常に呼び出し可能である
- **SC-005**: execution-agent のすべての既存テストが fetch_url 削除後も引き続きパスする

## Assumptions

- 新エージェントのデプロイ先は既存エージェントと同じインフラ（AgentCore Runtime）を使用する
- ルーターへの新エージェント登録は環境変数または設定ファイルの追加で対応する
- `fetch_url` の SSRF 防止ロジック、サイズ制限、タイムアウト設定はそのまま移植し、動作を変更しない
- 既存の CDK デプロイスクリプトパターンに従い、新エージェント用のスクリプトを追加する
