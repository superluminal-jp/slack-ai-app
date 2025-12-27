# Data Model: 柔軟なホワイトリスト認可

**Feature**: 008-flexible-whitelist  
**Date**: 2025-01-30

## Entities

### Whitelist Configuration

ホワイトリストの設定を表す。各エンティティタイプ（team_id、user_id、channel_id）は独立して管理され、空（未設定）または1つ以上のエンティティIDを含むことができる。

**Attributes**:
- `team_ids` (Set[String], optional): 許可されたteam_idのセット。空のセットは「team_idの制限なし」を意味する
- `user_ids` (Set[String], optional): 許可されたuser_idのセット。空のセットは「user_idの制限なし」を意味する
- `channel_ids` (Set[String], optional): 許可されたchannel_idのセット。空のセットは「channel_idの制限なし」を意味する

**Relationships**:
- 各エンティティセットは独立して管理される
- 設定されたエンティティのみがチェックされ、設定されていないエンティティは無視される
- すべてのエンティティが空の場合、すべてのリクエストが許可される

**Validation Rules**:
- 各セットは空（未設定）または1つ以上の有効なSlack IDを含む
- Slack ID形式: team_idは"T" + 英数字、user_idは"U" + 英数字、channel_idは"C" + 英数字
- 空の文字列は無効な値として扱われ、セットから除外される

**State Transitions**:
- 追加: ホワイトリストにエンティティが追加される（既存のセットに要素を追加）
- 削除: ホワイトリストからエンティティが削除される（セットから要素を削除、空になる可能性あり）
- 全削除: エンティティタイプ全体の設定が削除される（セットが空になる）
- 検証: リクエスト時に設定されたエンティティのみがチェックされる

### Authorization Request

認可チェックの対象となるリクエスト。各エンティティはオプショナル（欠落している可能性がある）。

**Attributes**:
- `team_id` (String, optional): リクエストに含まれるSlack team ID
- `user_id` (String, optional): リクエストに含まれるSlack user ID
- `channel_id` (String, optional): リクエストに含まれるSlack channel ID

**Relationships**:
- 各リクエストは1つのAuthorization Requestを生成する
- リクエストに含まれるエンティティがホワイトリストに設定されていない場合、そのエンティティのチェックはスキップされる

**Validation Rules**:
- 各エンティティは有効なSlack ID形式である必要がある（検証は既存のvalidation.pyで行われる）
- エンティティが欠落している場合、そのエンティティのチェックはスキップされる（既存の動作を維持）

### Authorization Result

認可チェックの結果。承認/拒否の状態、チェックされたエンティティ、拒否されたエンティティのリストを含む。

**Attributes**:
- `authorized` (Boolean, required): 認可された場合はTrue、拒否された場合はFalse
- `team_id` (String, optional): 検証されたteam_id
- `user_id` (String, optional): 検証されたuser_id
- `channel_id` (String, optional): 検証されたchannel_id
- `unauthorized_entities` (List[String], optional): 未認可であったエンティティのリスト（例: ["team_id", "channel_id"]）。設定されていないエンティティはこのリストに含まれない
- `error_message` (String, optional): エラーメッセージ（設定読み込み失敗時など）
- `timestamp` (Number, required): 認可チェックが実行された時刻（Unix timestamp）

**Relationships**:
- 各リクエストに対して1つのAuthorizationResultが生成される
- 設定されていないエンティティは`unauthorized_entities`に含まれない（スキップされたため）

**State Transitions**:
- 承認: すべての設定されたエンティティがホワイトリストに含まれている場合、またはすべてのエンティティが未設定の場合
- 拒否: 1つ以上の設定されたエンティティがホワイトリストに含まれていない場合
- エラー: ホワイトリストの設定読み込みに失敗した場合（fail-closed）

## Data Flow

1. **ホワイトリスト読み込み**: `whitelist_loader.py`がDynamoDB/Secrets Manager/環境変数からホワイトリスト設定を読み込む
2. **設定検証**: 各エンティティセットが空かどうかを確認（空の場合はそのエンティティのチェックをスキップ）
3. **認可チェック**: `authorization.py`がリクエストのエンティティを設定されたホワイトリストと照合
4. **結果生成**: AuthorizationResultを生成し、ログとメトリクスを出力

## Changes from Previous Model

**007-whitelist-authからの変更点**:

1. **Whitelist Configuration**:
   - 以前: すべてのエンティティが設定されている必要があった（空の場合はエラー）
   - 現在: 各エンティティは独立して空にできる（空の場合はそのエンティティのチェックをスキップ）

2. **Authorization Logic**:
   - 以前: すべてのエンティティがホワイトリストに含まれている必要があった（AND条件）
   - 現在: 設定されたエンティティのみがチェックされ、すべてがホワイトリストに含まれている必要がある（条件付きAND条件）

3. **Empty Whitelist Behavior**:
   - 以前: 空のホワイトリストはエラー（fail-closed）
   - 現在: 空のホワイトリストは全許可（設定読み込み失敗時のみfail-closed）

