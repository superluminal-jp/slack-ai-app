# Converse API vs InvokeModel API 評価

**日付**: 2025-12-06  
**目的**: 画像処理における`Converse API`と`InvokeModel API`の比較検討

---

## 📊 **API比較**

### **InvokeModel API** (現在使用中)

**特徴**:
- モデル固有のリクエスト形式
- Claude Messages APIの場合、Base64エンコードされた画像データ
- モデルごとに異なる実装が必要
- すべてのモデルで利用可能

**画像フォーマット** (Claude Messages API):
```json
{
  "anthropic_version": "bedrock-2023-05-31",
  "max_tokens": 1024,
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/png",
            "data": "iVBORw0KGgoAAAANSU..." // Base64エンコード済み
          }
        }
      ]
    }
  ]
}
```

**メリット**:
- ✅ すべてのBedrockモデルで利用可能
- ✅ モデル固有の機能にフルアクセス
- ✅ 既存の実装が動作している

**デメリット**:
- ❌ モデルごとに異なるフォーマット
- ❌ モデル切り替え時にコード変更が必要
- ❌ 会話履歴の管理が手動

---

### **Converse API** (新しい統一API - 2024年5月発表)

**特徴**:
- 統一されたインターフェース
- 複数モデル間で一貫した呼び出し方法
- 会話履歴を構造化して管理
- バイナリ形式の画像データ（Base64エンコード不要）

**画像フォーマット** (Converse API):
```python
# バイナリデータを直接使用
response = bedrock_runtime.converse(
    modelId="anthropic.claude-haiku-4-5-20251001-v1:0",
    messages=[
        {
            "role": "user",
            "content": [
                {"text": "この画像には何が写っていますか？"},
                {
                    "image": {
                        "format": "png",  # または "jpeg", "gif", "webp"
                        "source": {
                            "bytes": image_bytes  # バイナリデータ（Base64エンコード不要）
                        }
                    }
                }
            ]
        }
    ],
    inferenceConfig={
        "maxTokens": 1024,
        "temperature": 1.0
    }
)
```

**メリット**:
- ✅ 統一されたインターフェース（モデル切り替えが容易）
- ✅ Base64エンコード不要（バイナリデータ直接送信）
- ✅ メモリ効率が良い（Base64はサイズが約33%増加）
- ✅ 会話履歴の管理が簡単
- ✅ Tool use (function calling) のサポート
- ✅ コードの可読性と保守性が向上

**デメリット**:
- ❌ すべてのモデルでサポートされているわけではない
- ❌ 比較的新しいAPI（2024年5月発表）
- ❌ 既存の実装を変更する必要がある

---

## 🔍 **調査結果**

### 1. **Converse API サポート状況**

**サポートされているモデル**:
- ✅ Anthropic Claude 3 (Opus, Sonnet, Haiku)
- ✅ Anthropic Claude 3.5 (Sonnet)
- ✅ Anthropic Claude 4 (Haiku, Sonnet) ← **使用中のモデル**
- ✅ Mistral Large
- ✅ Cohere Command R/R+
- ✅ Amazon Nova

**確認方法**:
```bash
aws bedrock list-foundation-models \
  --query "modelSummaries[?contains(modelId, 'claude')].modelId"
```

### 2. **画像処理の違い**

| 項目 | InvokeModel | Converse |
|------|-------------|----------|
| 画像フォーマット | Base64エンコード文字列 | バイナリデータ（bytes） |
| データサイズ | +33% (Base64エンコード) | 元のサイズ |
| メモリ使用量 | 高い | 低い |
| 処理速度 | やや遅い（エンコード処理） | 速い |
| コードの複雑さ | Base64エンコードが必要 | シンプル |

### 3. **会話履歴の管理**

**InvokeModel** (現在の実装):
```python
# 手動でメッセージ形式を構築
messages = []
for hist_msg in conversation_history:
    messages.append({
        "role": hist_msg["role"],
        "content": [{"type": "text", "text": hist_msg["content"]}]
    })
messages.append({"role": "user", "content": content_parts})
```

**Converse**:
```python
# 会話履歴を直接渡せる
response = bedrock_runtime.converse(
    modelId=model_id,
    messages=conversation_history + [current_message],
    inferenceConfig={...}
)
```

---

## 💡 **推奨事項**

### ✅ **Converse APIへの移行を推奨**

**理由**:

1. **現在の問題を解決できる可能性が高い**
   - Base64エンコードの問題を回避
   - バイナリデータを直接送信できる
   - `ValidationException: Could not process image` エラーの解決

2. **将来性**
   - AWSが推奨する新しいAPI
   - 統一されたインターフェース
   - モデル切り替えが容易

3. **パフォーマンス**
   - Base64エンコード不要（メモリ効率）
   - データサイズが33%削減
   - 処理速度の向上

4. **保守性**
   - コードがシンプルになる
   - モデル固有の実装が不要
   - 会話履歴の管理が簡単

---

## 🔧 **実装変更の概要**

### 変更が必要なファイル:

1. **`lambda/bedrock-processor/bedrock_client.py`**
   - `invoke_bedrock()` 関数を `invoke_bedrock_converse()` に変更
   - `bedrock_runtime.invoke_model()` → `bedrock_runtime.converse()`
   - Base64エンコード処理を削除

2. **`lambda/bedrock-processor/attachment_processor.py`**
   - Base64エンコード処理を削除
   - バイナリデータのまま返す

3. **`lambda/bedrock-processor/handler.py`**
   - 画像データの準備方法を変更

### コード変更例:

**Before** (InvokeModel):
```python
# Base64エンコード
base64_image = base64.b64encode(file_bytes).decode('utf-8')

# InvokeModel呼び出し
response = bedrock_runtime.invoke_model(
    modelId=model_id,
    body=json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 1024,
        "messages": messages
    })
)
```

**After** (Converse):
```python
# バイナリデータのまま使用
image_bytes = file_bytes

# Converse呼び出し
response = bedrock_runtime.converse(
    modelId=model_id,
    messages=[
        {
            "role": "user",
            "content": [
                {"text": prompt},
                {
                    "image": {
                        "format": "png",
                        "source": {"bytes": image_bytes}
                    }
                }
            ]
        }
    ],
    inferenceConfig={
        "maxTokens": 1024,
        "temperature": 1.0
    }
)
```

---

## 📝 **移行手順**

### Phase 1: 調査 ✅
- [x] Converse APIの機能確認
- [x] Claude Haiku 4.5のサポート確認
- [x] 画像フォーマットの違いを理解

### Phase 2: 実装 (次のステップ)
- [ ] `bedrock_client.py` を Converse API に書き換え
- [ ] `attachment_processor.py` からBase64エンコードを削除
- [ ] `handler.py` のデータ準備処理を更新
- [ ] エラーハンドリングの調整

### Phase 3: テスト
- [ ] 画像添付のテスト
- [ ] ドキュメント添付のテスト
- [ ] 会話履歴のテスト
- [ ] エラーケースのテスト

### Phase 4: デプロイ
- [ ] 本番環境にデプロイ
- [ ] CloudWatch ログで検証
- [ ] パフォーマンス測定

---

## ⚠️ **注意事項**

1. **レスポンス形式の違い**
   - InvokeModel: JSON文字列をパース
   - Converse: 構造化されたレスポンスオブジェクト

2. **エラーハンドリング**
   - エラーコードや形式が異なる可能性
   - 既存のエラーハンドリングを見直す必要

3. **後方互換性**
   - 既存のログやモニタリングへの影響を確認
   - 段階的な移行を検討

---

## 🎯 **結論**

### **推奨**: Converse APIに移行すべき

**優先度**: 🔴 **高** - 現在の画像処理エラーを解決できる可能性が高い

**期待される効果**:
1. ✅ `ValidationException: Could not process image` エラーの解決
2. ✅ コードの簡素化とメンテナンス性の向上
3. ✅ パフォーマンスの改善（メモリ効率）
4. ✅ 将来のモデル切り替えが容易

**実装時間**: 約2-3時間（実装 + テスト）

**リスク**: 低 - Boto3のAPIは安定しており、Converse APIは公式サポート

---

**次のアクション**: Converse APIへの移行を実装しますか？

