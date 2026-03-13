# Implementation Plan: API Gateway + WAF Ingress Migration

**Branch**: `037-api-gateway-waf-migration` | **Date**: 2026-03-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/037-api-gateway-waf-migration/spec.md`

## Summary

Function URL を入口としている現在構成を、API Gateway (Regional) + AWS WAF に段階移行する。移行後も Lambda 内の 2 鍵防御（Slack 署名検証 + Existence Check）を継続し、境界防御とアプリ層防御の多層化を維持する。段階切替とロールバックを前提に、安全性・可観測性・運用性を同時に高める。

## Technical Context

**Language/Version**: TypeScript (AWS CDK), Python 3.11 (Lambda)  
**Primary Dependencies**: aws-cdk-lib (apigateway, wafv2, lambda), boto3/slack-sdk（既存）  
**Storage**: DynamoDB（既存: dedupe, existence-cache, rate-limit）  
**Testing**: npm test（CDK）, pytest（Lambda）, cdk synth/diff  
**Target Platform**: AWS (Regional API Gateway + WAFv2 + Lambda)  
**Project Type**: Monorepo (multi-zone CDK apps + Python runtime)  
**Performance Goals**: Slack 3秒制約に対し受領処理を維持（10秒 Lambda timeout 内）  
**Constraints**: セキュリティ最優先、fail-closed 原則維持、段階移行、ロールバック容易性  
**Scale/Scope**: Verification Zone ingress の置換、Execution A2A 経路は非変更

## Constitution Check

- 仕様 → 計画 → タスクの順に成果物を作成（本計画で満たす）
- セキュリティ境界変更のため、既存防御（署名検証・Existence Check・認可）の後退は禁止
- ドキュメント先行で運用手順とロールバック条件を明示

## Project Structure

### Documentation (this feature)

```text
specs/037-api-gateway-waf-migration/
├── spec.md
├── plan.md
└── tasks.md
```

### Code (expected impact)

```text
verification-zones/verification-agent/cdk/
├── lib/
│   ├── stack/                         # APIGW + WAF + Lambda 統合
│   ├── constructs/                    # 必要に応じて Ingress construct
│   └── lambda/slack-event-handler/    # 署名検証/Existence Check 維持
└── test/

docs/developer/
├── architecture.md
├── security.md
└── runbook.md
```

## Phase 0 Research (AWS MCP ベストプラクティス観点)

> 注: 本環境で AWS MCP サーバーが利用可能な場合は、以下項目を MCP 参照で確定する。未接続時は AWS 公式ドキュメントの同等項目で代替し、実装時に再検証する。

1. API Gateway セキュリティ設定（access log, throttling, request validation）の推奨値
2. AWS WAF managed rules の推奨初期セットと誤検知低減手順
3. WAF rate-based rule の閾値設計（Slack 再送を考慮）
4. ログ集約ベストプラクティス（WAF logs + APIGW access logs + Lambda logs の相関）
5. ロールバック運用（Route 切替・Slack Request URL 戻し手順）

## Phase 1 Design

### Data/Config Model

- `IngressMode`: `FUNCTION_URL | API_GATEWAY`（段階切替フラグ）
- `WafRuleSetVersion`: ルールセット版管理（v1, v1.1 ...）
- `MigrationWave`: `canary | 50_percent | 100_percent | rollback`

### Security Design Principles

- WAF は **事前遮断**、Lambda は **真正性検証**（責務分離）
- 認証/認可失敗時は fail-closed を維持
- 監査可能性（誰が・どこで・なぜブロックしたか）をメトリクス/ログで担保

### Rollout Design

1. APIGW + WAF を追加デプロイ（既存 Function URL は維持）
2. Slack Request URL を APIGW に切替（カナリア）
3. 指標監視（4xx/5xx, WAF blocked count, Lambda error, Slack retry）
4. 問題時は Request URL を旧経路へ戻し即時ロールバック

## Risk Register

- **R-01 WAF 誤検知**: 正常イベントが遮断される → count モード検証 → block 昇格
- **R-02 Slack 再送増加**: rate rule が厳しすぎる → しきい値調整 + allowlist 例外
- **R-03 可観測性不足**: 障害切り分け困難 → correlation ID を各層で統一
- **R-04 運用複雑化**: 切替ミス → runbook とロールバック訓練を必須化

## Test Strategy

- CDK: `cdk synth`, `cdk diff`, stack unit test
- Lambda: 署名不正/存在確認失敗/認可失敗の回帰テスト
- Integration: APIGW 経由の Slack event 疑似送信、WAF ブロック検証
- Operational: カナリア切替・ロールバック演習（runbook 手順確認）

## Best-Practice Checklist (AWS MCP検証対象)

- [ ] APIGW Access Logs 有効化（構造化 + 保持期間定義）
- [ ] APIGW ステージスロットリング設定
- [ ] WAF Managed Rule の選定理由を記録
- [ ] WAF Rate-based Rule 閾値の根拠（Slack 再送考慮）
- [ ] CloudWatch Alarm（WAF block 異常増加, 5xx 増加）
- [ ] 署名検証/Existence Check/認可の回帰試験
- [ ] 切替・ロールバック runbook 更新

## Post-Design Gate

Phase 2 (`/speckit.tasks`) へ進む条件:

1. セキュリティ責務分離（WAF vs Lambda）が明文化されている
2. ロールバック条件が数値しきい値で定義されている
3. 既存 A2A 経路に影響しないことが確認されている
