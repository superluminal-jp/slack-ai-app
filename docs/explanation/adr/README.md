# Architecture Decision Records (ADR)

このディレクトリには、slack-ai-app プロジェクトのアーキテクチャ決定記録（ADR）が含まれています。

## ADR 一覧

- [ADR-001: AWS Bedrock Foundation Model の採用](./001-bedrock-foundation-model.md)
- [ADR-003: response_url 非同期パターンの採用](./003-response-url-async.md)
- [ADR-004: Slack API Existence Check の採用](./004-slack-api-existence-check.md)

## ADR テンプレート

新しい ADR を作成する際は、以下のテンプレートを使用してください：

```markdown
# ADR-XXX: [タイトル]

**ステータス**: [Proposed | Accepted | Deprecated | Superseded]
**決定日**: YYYY-MM-DD
**決定者**: [決定に関わったチーム・個人]

## コンテキスト

[決定が必要となった背景・状況を説明]

## 決定

[採用することに決定した解決策]

## 代替案の検討

### オプション 1: [代替案名]
- メリット: [...]
- デメリット: [...]

### オプション 2: [代替案名]
- メリット: [...]
- デメリット: [...]

## 結果（Consequences）

### ポジティブ
- [...]

### ネガティブ
- [...]

### ニュートラル
- [...]

## 検証方法

[この決定が正しかったかどうかを検証する方法]

## 関連資料

- [参考URL...]
```

## ADR作成ガイドライン

1. **明確な決定**: 何を決定したのかを明確に記述
2. **コンテキスト**: なぜこの決定が必要だったのかを説明
3. **代替案**: 検討した他の選択肢とその理由
4. **結果**: この決定がもたらす影響（ポジティブ・ネガティブ）
5. **検証**: 決定の妥当性をどう検証するか
