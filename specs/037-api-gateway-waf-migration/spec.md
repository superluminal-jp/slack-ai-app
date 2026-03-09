# Feature Specification: Slack Ingress を API Gateway + WAF に移行

**Feature Branch**: `037-api-gateway-waf-migration`  
**Created**: 2026-03-09  
**Status**: Draft  
**Input**: User description: "API gatewayへの移行を計画。WAFを導入する利点も併せて整理。speckitで spec/plan/tasks を作成し、AWS MCPベストプラクティス準拠で進める"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - セキュリティ最優先で入口を強化する (Priority: P1)

セキュリティ担当者として、Slack からの入口を Function URL から API Gateway + WAF に移行し、L7 防御とレートベース保護を Lambda 到達前に適用したい。

**Why this priority**: 入口強化は攻撃面を最も早く縮小し、可用性・コスト・運用安全性への影響が大きいため。

**Independent Test**: WAF ルールに該当する疑似攻撃リクエストが API Gateway で遮断され、Lambda 側に到達しないことをログで確認できる。

**Acceptance Scenarios**:

1. **Given** Slack Event の受信エンドポイントが API Gateway に切り替わっている, **When** 正常な Slack リクエストが送信される, **Then** SlackEventHandler が従来どおり 2 鍵防御で検証し、処理継続できる。
2. **Given** WAF マネージドルールに合致するリクエスト, **When** API Gateway に到達する, **Then** リクエストは Lambda 実行前にブロックされる。
3. **Given** 短時間の大量アクセス, **When** レートベースルール閾値を超える, **Then** WAF が自動遮断し、下流の同時実行枯渇を抑制する。

---

### User Story 2 - 既存アプリ層防御を維持する (Priority: P1)

開発者として、入口を API Gateway + WAF にしても、Slack 署名検証・Existence Check・ホワイトリスト認可を必須のまま維持したい。

**Why this priority**: 境界防御は補完であり、なりすまし対策の中核はアプリ層の2鍵防御であるため。

**Independent Test**: 署名不正リクエストに対して 401、Existence Check 失敗で 403、ホワイトリスト未許可で 403 が返ることを確認できる。

**Acceptance Scenarios**:

1. **Given** API Gateway + WAF が有効, **When** Slack 署名が不正なリクエストが届く, **Then** SlackEventHandler は 401 を返す。
2. **Given** 実在しない team/user/channel を含むリクエスト, **When** Existence Check を実行する, **Then** fail-closed で 403 を返す。
3. **Given** 未許可エンティティ, **When** 認可判定する, **Then** リクエストを拒否し監査ログを残す。

---

### User Story 3 - 運用で安全に段階移行する (Priority: P2)

運用担当として、Function URL から API Gateway へダウンタイムなく段階移行し、ロールバック可能な計画でリスクを抑えたい。

**Why this priority**: 本番切替失敗時のサービス影響を最小化し、監視しながら安全に移行するため。

**Independent Test**: カナリア切替後にエラー率・レイテンシ・Slack 再送率がしきい値内であることを確認し、問題時に旧経路へ戻せる。

**Acceptance Scenarios**:

1. **Given** 新旧入口が並行稼働, **When** カナリアで API Gateway に一部切替, **Then** 監視指標が許容範囲内なら段階的に 100% へ移行する。
2. **Given** 異常を検知, **When** ロールバック判断を行う, **Then** 速やかに旧経路へ戻せる。

---

### Edge Cases

- Slack 再送（3秒ルール）と WAF 誤検知が重なり正規トラフィックが遮断される場合。
- CloudFront 未利用構成で、IP ベース制御のみでは Slack 送信元変動に追従しづらい場合。
- WAF が block したために Slack 側で再送が増え、二次的な負荷になる場合。
- API Gateway タイムアウトやマッピング設定不備でチャレンジ応答（url_verification）が失敗する場合。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: システムは Slack 入口を API Gateway (Regional) 経由で受信できること。
- **FR-002**: システムは API Gateway に AWS WAF Web ACL を関連付けること。
- **FR-003**: システムは WAF に Managed Rule + Rate-based Rule を適用できること。
- **FR-004**: システムは API Gateway 導入後も Slack 署名検証（HMAC SHA256）を Lambda 内で必須とすること。
- **FR-005**: システムは API Gateway 導入後も Existence Check とホワイトリスト認可を継続すること。
- **FR-006**: システムは新旧入口の並行稼働をサポートし、段階的切替とロールバックを可能にすること。
- **FR-007**: システムは WAF / API Gateway / Lambda の監査ログとメトリクス相関を可能にすること。
- **FR-008**: システムは Slack url_verification およびイベント受信の既存互換性を維持すること。
- **FR-009**: 実装計画は AWS MCP で確認可能なベストプラクティス項目（WAF ルール設計、APIGW セキュリティ設定、可観測性）をチェックリスト化すること。

### Key Entities

- **IngressEndpoint**: Slack の受信先エンドポイント（Function URL / API Gateway）。
- **WafPolicyProfile**: Web ACL 設定セット（managed rules, rate-limit, allow/deny 例外）。
- **MigrationWave**: 段階切替単位（canary, 50%, 100%, rollback）。
- **SecuritySignal**: WAF/API Gateway/Lambda のログ・メトリクス・アラート。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 悪性トラフィックのうち、WAF ルールに合致するリクエストの 95%以上を Lambda 到達前に遮断できる。
- **SC-002**: 切替後も Slack 署名検証・Existence Check の拒否動作（401/403）が既存同等で維持される。
- **SC-003**: 本番切替時、ユーザー影響エラー率を 1% 未満に保ち、必要時 15 分以内にロールバック可能である。
- **SC-004**: 入口移行後 2 週間で、不要な Lambda 起動数（無効/攻撃トラフィック由来）を移行前比で削減できる。
