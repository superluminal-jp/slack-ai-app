# ADR-003: response_url 非同期パターンの採用

**ステータス**: Accepted
**決定日**: 2025-11-30
**決定者**: アーキテクチャチーム

### コンテキスト

Bedrock の処理時間（5〜30 秒）が Slack の 3 秒タイムアウト制約を超えるため、応答方法を選択する必要がありました。

### 決定

**SlackEventHandler が即座に応答 + BedrockProcessor が Slack API に POST**の非同期パターンを採用

### 代替案の検討

| 手法                 | 長所                     | 短所                             | 不採用理由               |
| -------------------- | ------------------------ | -------------------------------- | ------------------------ |
| **Slack Events API** | プッシュ通知可能         | 追加 Slack App 設定、権限増大    | 設定複雑性               |
| **WebSocket 接続**   | リアルタイム双方向       | インフラ複雑、Lambda 非対応      | サーバーレス制約         |
| **ポーリング**       | 実装シンプル             | ユーザー体験悪い、API 呼び出し増 | UX 要件未達              |
| **Step Functions**   | オーケストレーション強力 | コスト増、デバッグ複雑           | オーバーエンジニアリング |

### 結果（Consequences）

**ポジティブ**:

- **ユーザー体験**: 2 秒以内の初期応答で安心感
- **シンプル**: Slack ネイティブ機能、追加インフラ不要
- **スケーラブル**: Lambda 非同期呼び出しで自動スケール
- **監査**: 相関 ID で全フロー追跡可能

**ネガティブ**:

- **デバッグ複雑性**: 非同期のため、エラー追跡に相関 ID 必須
- **タイムアウトハンドリング**: response_url の有効期限（30 分）管理必要

### 関連資料

- [Slack response_url 仕様](https://api.slack.com/messaging/webhooks)

---

---

## 関連ドキュメント

- [アーキテクチャ概要](../reference/architecture/overview.md) - 非同期処理の全体像
- [ユーザー体験](../reference/architecture/user-experience.md) - 非同期処理のUX影響
- [実装詳細](../reference/architecture/implementation-details.md) - response_url実装コード
