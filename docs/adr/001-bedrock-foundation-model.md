# ADR-001: AWS Bedrock Foundation Model の採用

**ステータス**: Accepted
**決定日**: 2025-11-30
**決定者**: AI アーキテクチャチーム、セキュリティチーム

### コンテキスト

Slack 上でエンタープライズグレードの AI 機能を提供する必要があります。以下の要件を満たす AI プラットフォームを選択する必要がありました：

**機能要件**:

- 複雑なリクエストへの高精度なレスポンス
- 日本語の高品質な処理
- コード生成・デバッグ能力
- 画像生成、データ分析など多様な AI 機能
- 長文コンテキスト処理（コンテキスト履歴管理）
- **セキュアな実行環境**

**非機能要件**:

- 5〜30 秒以内のレイテンシ（p95）
- セキュリティ管理機能（Guardrails）
- AWS 統合（IAM、CloudWatch）
- コスト効率（$10/ユーザー/月以下）
- モデル選択の柔軟性

### 決定

**AWS Bedrock の Foundation Model を採用**（モデルは要件に応じて選択可能）

- デフォルト例: Claude Sonnet 4.5（Model ID: `us.anthropic.claude-sonnet-4-5-20250929-v1:0`）
- その他の選択肢: Titan、Llama、その他の Bedrock 対応モデル

### 代替案の検討

| プラットフォーム                | 長所                     | 短所                                | 不採用理由         |
| ------------------------------- | ------------------------ | ----------------------------------- | ------------------ |
| **AWS Bedrock（Claude）**       | AWS 統合、Guardrails     | モデル依存                          | 採用（柔軟性あり） |
| **AWS Bedrock（Titan）**        | AWS ネイティブ、低コスト | 日本語性能、推論能力                | 要件に応じて選択可 |
| **GPT-4 Turbo（Azure OpenAI）** | 高速、日本語性能良好     | AWS 外部サービス、Guardrails 未統合 | AWS 統合の複雑さ   |
| **Gemini Pro（Vertex AI）**     | マルチモーダル強力       | GCP 依存、移行コスト                | クラウド戦略不一致 |
| **自社構築 LLM**                | 完全制御                 | コスト高、運用複雑                  | コスト効率未達     |

### 結果（Consequences）

**ポジティブ**:

- **モデル選択の柔軟性**: 要件に応じて最適なモデルを選択可能
- **セキュリティ設計**: 多層防御による安全な実行
- **Guardrails 統合**: Automated Reasoning（99%精度）でプロンプトインジェクション防止
- **AWS 統合**: IAM、CloudWatch、CloudTrail による完全な統合管理
- **コスト効率**: 使用量ベースの課金で柔軟なコスト管理
- **多様なモデル**: Claude、Titan、Llama など複数の選択肢

**ネガティブ・トレードオフ**:

- **モデル依存**: 選択したモデルによって性能が異なる
- **レイテンシ**: 平均 5〜30 秒（リアルタイム会話には不向き）
- **コスト変動**: トークン数とモデル選択に依存、予測困難

**技術的負債**:

- モデル切り替え時の互換性検証が必要
- プロンプトエンジニアリングの継続的最適化
- 定期的なコスト分析とチューニング
- 環境変数によるモデル管理の運用負荷

### 検証方法

- **パフォーマンステスト**: 100 リクエストセットで平均レイテンシ測定
- **品質評価**: 人間評価者によるレスポンス品質スコア（1-5）
- **コスト追跡**: CloudWatch + Cost Explorer で週次モニタリング
- **セキュリティ監査**: Guardrails ブロック率と PII 検出率

### 関連資料

- [Amazon Bedrock Foundation Models](https://docs.aws.amazon.com/bedrock/latest/userguide/foundation-models.html)
- [AWS Bedrock Model Selection Guide](https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization.html)
- 内部ベンチマーク結果: `docs/benchmarks/bedrock-models-evaluation.pdf`

---

---

## 関連ドキュメント

- [アーキテクチャ概要](../architecture/overview.md) - システム全体像
- [実装詳細](../architecture/implementation-details.md) - Bedrock統合コード
- [セキュリティ実装](../security/implementation.md) - Guardrails実装
