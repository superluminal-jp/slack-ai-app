# Research: ホワイトリスト認可

**Feature**: 007-whitelist-auth  
**Date**: 2025-01-30  
**Status**: Complete

## Research Questions

### 1. ホワイトリスト設定の保存方法

**Question**: 環境変数、AWS Secrets Manager、DynamoDB の 3 つの設定ソースから選択する必要がある。それぞれのメリット・デメリットは？

**Decision**: 優先順位付きフォールバック方式を採用
1. **DynamoDB** (優先): 動的更新が可能、即座に反映、スケーラブル
2. **AWS Secrets Manager** (次点): セキュア、暗号化、ローテーション対応
3. **環境変数** (フォールバック): シンプル、再デプロイが必要

**Rationale**: 
- DynamoDB は運用上の柔軟性が高く、ホワイトリストの追加・削除を即座に反映できる
- Secrets Manager は機密情報として管理したい場合に適している
- 環境変数は開発環境や小規模運用に適している

**Alternatives considered**:
- S3 バケット: 更新頻度が低い場合に適するが、Lambda からの直接読み込みは非効率
- Parameter Store: Secrets Manager と同様だが、暗号化がオプション

### 2. ホワイトリストのデータ構造

**Question**: team_id、user_id、channel_id をどのように保存・管理するか？

**Decision**: 3 つの独立したセットとして管理
- `allowed_team_ids`: Set[str]
- `allowed_user_ids`: Set[str]
- `allowed_channel_ids`: Set[str]

**Rationale**:
- 各エンティティタイプは独立して管理可能
- セット構造により O(1) のルックアップが可能
- シンプルで理解しやすい

**Alternatives considered**:
- 複合キー（team_id#user_id#channel_id）: 柔軟性が低く、管理が複雑
- 階層構造（team_id 配下に user_id、channel_id）: 実装が複雑で、要件（AND 条件）に合わない

### 3. キャッシュ戦略

**Question**: ホワイトリスト設定をどのようにキャッシュするか？

**Decision**: Lambda メモリ内キャッシュ + TTL（5 分）
- 初回読み込み時に DynamoDB/Secrets Manager から取得
- メモリ内に 5 分間キャッシュ
- TTL 経過後、次回リクエスト時に再読み込み

**Rationale**:
- DynamoDB や Secrets Manager へのアクセスはレイテンシが発生する（10-50ms）
- メモリ内キャッシュにより処理時間を ≤50ms に抑える
- 5 分の TTL は、ホワイトリスト更新の反映遅延とパフォーマンスのバランス

**Alternatives considered**:
- DynamoDB キャッシュテーブル: 追加のインフラコスト、複雑性
- キャッシュなし: パフォーマンス要件（≤50ms）を満たせない可能性

### 4. エラーハンドリング戦略

**Question**: 設定読み込み失敗時の動作は？

**Decision**: fail-closed 原則に従い、すべてのリクエストを拒否
- 設定読み込み失敗時: 403 Forbidden を返す
- ホワイトリストが空の場合: 403 Forbidden を返す
- エラー詳細をセキュリティログに記録

**Rationale**:
- セキュリティファースト原則に従う
- 不明な状態でのアクセス許可はリスクが高い
- 明示的な拒否により、問題の早期発見が可能

**Alternatives considered**:
- fail-open（設定読み込み失敗時は許可）: セキュリティリスクが高い
- デフォルトホワイトリスト: 管理が複雑で、意図しないアクセス許可のリスク

### 5. パフォーマンス最適化

**Question**: ≤50ms (p95) の処理時間をどのように達成するか？

**Decision**: 
1. メモリ内キャッシュ（5 分 TTL）
2. セット構造による O(1) ルックアップ
3. 並列チェック（team_id、user_id、channel_id を同時に検証）

**Rationale**:
- キャッシュヒット時: DynamoDB/Secrets Manager アクセス不要（<1ms）
- セット構造: リストの線形探索（O(n)）より高速
- 並列チェック: シーケンシャルチェックより高速

**Alternatives considered**:
- 線形探索（リスト）: O(n) の時間計算量で、大規模ホワイトリストで遅延
- データベースクエリ: 毎回のクエリはレイテンシが高く、要件を満たせない

## Implementation Patterns

### 既存コードパターンの活用

1. **logger.py**: 構造化 JSON ログのパターンを活用
2. **existence_check.py**: DynamoDB キャッシュとエラーハンドリングのパターンを参考
3. **handler.py**: 既存の認証・認可フロー（署名検証、Existence Check）の後に統合

### AWS サービス統合パターン

1. **DynamoDB**: 
   - テーブル名: `slack-whitelist-config` (新規作成)
   - Partition Key: `entity_type` (team_id, user_id, channel_id)
   - Sort Key: `entity_id` (実際の ID 値)
   - Billing Mode: PAY_PER_REQUEST

2. **Secrets Manager**:
   - シークレット名: `slack-whitelist-config` (環境変数から取得)
   - JSON 形式: `{"team_ids": [...], "user_ids": [...], "channel_ids": [...]}`

3. **環境変数**:
   - `WHITELIST_TEAM_IDS`: カンマ区切り文字列
   - `WHITELIST_USER_IDS`: カンマ区切り文字列
   - `WHITELIST_CHANNEL_IDS`: カンマ区切り文字列

## Security Considerations

1. **最小権限の原則**: Lambda ロールは DynamoDB 読み取り、Secrets Manager 読み取りのみ
2. **暗号化**: DynamoDB は KMS で暗号化、Secrets Manager は自動暗号化
3. **監査ログ**: すべての認可結果を CloudWatch Logs に記録
4. **PII 保護**: team_id、user_id、channel_id は PII ではないが、ログには最小限の情報のみ記録

## Testing Strategy

1. **Unit Tests**: 
   - ホワイトリスト認可ロジック
   - 設定読み込み（各ソース）
   - キャッシュ動作

2. **BDD Tests**:
   - 認可済みユーザーのリクエスト承認
   - 未認可ユーザーのリクエスト拒否
   - 設定読み込み失敗時の動作

3. **Integration Tests**:
   - エンドツーエンドの認可フロー
   - DynamoDB、Secrets Manager との統合

## Open Questions Resolved

すべての技術的な不明点が解決されました。実装に進む準備が整っています。

