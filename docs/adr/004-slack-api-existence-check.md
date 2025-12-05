# ADR-004: Slack API Existence Check の採用

**ステータス**: Accepted
**決定日**: 2025-12-01
**決定者**: セキュリティアーキテクチャチーム

### コンテキスト

T-01（Signing Secret 漏洩）は「高」リスクとして評価されていました。現在の緩和策（SlackEventHandler 認可、モニタリング）では、Signing Secret が漏洩した場合、攻撃者が任意のリクエストを偽造できる可能性があります。

**課題**:

- Signing Secret のみで署名検証を突破可能
- 静的ホワイトリスト（team_id、user_id、channel_id）は設定が煩雑
- 攻撃者が正規の ID を推測または発見した場合、認可を突破できる

### 決定

**Slack API Existence Check を SlackEventHandler に実装し、動的エンティティ検証を追加**

**アプローチ**:

1. 署名検証後、Slack API (team.info, users.info, conversations.info) を呼び出す
2. すべてのエンティティが実在することを確認
3. 検証結果を DynamoDB に 5 分間キャッシュ（パフォーマンス最適化）

**セキュリティモデル**:

- **2 鍵防御**: Signing Secret と Bot Token の両方が必要
- Signing Secret のみ漏洩 → Existence Check で検出
- Bot Token のみ漏洩 → 署名検証で検出

### 代替案の検討

| アプローチ                            | 長所                 | 短所                                     | 不採用理由             |
| ------------------------------------- | -------------------- | ---------------------------------------- | ---------------------- |
| **Slack API Existence Check**         | 動的検証、2 鍵防御   | Slack API レイテンシ（キャッシュで緩和） | 採用                   |
| **静的ホワイトリストのみ**            | レイテンシなし       | 管理コスト高、ID 推測に脆弱              | 静的管理の限界         |
| **nonce トラッキング**                | リプレイ攻撃完全防止 | DynamoDB 書き込みコスト高、複雑          | Existence Check で十分 |
| **IP ホワイトリスト**                 | シンプル             | Slack 側 IP 変更に脆弱、VPN 使用時無効   | Slack IP 範囲の動的性  |
| **Signing Secret 定期ローテーション** | 漏洩影響を時限化     | 運用負荷、ダウンタイムリスク             | 他の対策と併用可能     |

### 結果（Consequences）

**ポジティブ**:

- **リスク軽減**: T-01 リスクレベル「高」→「中」
- **2 鍵防御**: Signing Secret と Bot Token の両方が必要
- **動的検証**: 実在エンティティのみを許可
- **攻撃面縮小**: 偽造リクエストの大部分をブロック
- **監査証跡**: Existence Check 失敗を CloudWatch にログ

**ネガティブ・トレードオフ**:

- **レイテンシ増加**: Slack API 呼び出しで +200-500ms（キャッシュミス時）
- **Slack API 依存**: Slack ダウン時は fail-closed 動作が必要
- **コスト増加**: Slack API 呼び出しコスト（月額推定 $5-10）
- **複雑性**: キャッシュ管理、エラーハンドリング

**技術的負債**:

- キャッシュ戦略の最適化が必要（TTL、キーサイズ）
- Slack API レート制限対策（リトライロジック、バックオフ）
- フォールバック動作の定義と実装

### 検証方法

- **セキュリティテスト**: BDD シナリオ `existence_check.feature` で網羅的にテスト
- **パフォーマンステスト**: キャッシュヒット率 ≥80%、レイテンシ ≤500ms (p95) を確認
- **ペネトレーションテスト**: Signing Secret 漏洩を模擬した攻撃でブロック率を測定

### 関連資料

- [Slack API Methods](https://api.slack.com/methods)
  - [team.info](https://api.slack.com/methods/team.info)
  - [users.info](https://api.slack.com/methods/users.info)
  - [conversations.info](https://api.slack.com/methods/conversations.info)
- T-01 脅威分析: Section 5.2
- 実装コード: Section 6.2

---

---

## 関連ドキュメント

- [セキュリティ要件](../security/requirements.md) - Existence Check要件
- [セキュリティ実装](../security/implementation.md) - 実装詳細とコード
- [脅威モデル](../security/threat-model.md) - T-01脅威分析
- [テストと検証](../operations/testing.md) - Existence Checkテストシナリオ
