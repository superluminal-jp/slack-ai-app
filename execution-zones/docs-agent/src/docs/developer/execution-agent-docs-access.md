# Execution Agent で docs/ を参照する方法

`docs/` 配下のドキュメントを Execution Agent から参照可能にする実現パターンを整理する。

**適用済み**: パターン 1（ビルド時に docs をイメージに同梱）を実装済み。デプロイ時に `docs/` が Execution Agent のビルドコンテキストにコピーされ、Strands ツール `search_docs` で検索可能。

## 現状

- **Execution Agent のビルド**: `cdk/lib/execution/constructs/execution-agent-ecr.ts` で Docker イメージのビルドコンテキストは `cdk/lib/execution/agent/execution-agent` のみ。**リポジトリルートの `docs/` はイメージに含まれていない**。
- **ランタイム**: AgentCore Runtime 上のコンテナ（FastAPI, port 9000）。Strands ツールで「ドキュメント検索」を追加する前提で検討する。

---

## 実現パターン

### 1. ビルド時に docs をイメージに同梱する（コンテナ内ファイル参照）

**概要**: ビルド時に `docs/` をコンテナ内にコピーし、Strands ツールでファイルを読む。

**やり方の例**:
- **A. ビルド前コピー**: デプロイスクリプトや CDK のアセット準備で、`docs/` を `execution-agent/docs/` にコピーしてから Docker ビルド。Dockerfile で `COPY docs/ /app/docs/` を追加。
- **B. ビルドコンテキストをリポジトリルートに変更**: `ExecutionAgentEcr` の `directory` をリポジトリルートにし、Dockerfile の場所を `dockerfilePath` で指定。Dockerfile 内で `COPY docs/ /app/docs/` と `COPY cdk/lib/execution/agent/execution-agent/... /app` のようにコピー。コンテキストが大きくなるので `.dockerignore` で不要なものを除外する。

**ツール案**: `search_docs(query: str)` または `get_doc(path_or_topic: str)`  
- 実装: `/app/docs` 以下の `.md` 等を走査し、キーワードに一致するファイルを読む、またはパス指定で 1 ファイル返す。簡易には `pathlib` + テキスト検索（`query in content`）や、事前にビルド時に JSON インデックス（パス・見出し・要約）を作って同梱し、ツールはそのインデックス + 該当ファイル読みで対応。

**メリット**: 外部サービス不要。オフラインでも動作。  
**デメリット**: ドキュメント更新のたびにイメージ再ビルド・再デプロイが必要。イメージサイズ増加。

---

### 2. S3 + Amazon Bedrock Knowledge Base（RAG）

**概要**: `docs/` を S3 に同期し、Bedrock Knowledge Base で RAG を用意。Execution Agent から Retrieve（または RetrieveAndGenerate）で参照する。

**やり方**:
- デプロイ時に `docs/` を S3 バケットにアップロード（CDK の Asset や CI で sync）。
- Bedrock Knowledge Base を作成し、データソースにその S3 を指定。ベクトル DB は OpenSearch Serverless 等（マネージドで構築可能）。
- Execution Agent の IAM ロールに `bedrock:Retrieve`（対象 KB の ARN に限定）を付与。
- Strands ツール例: `search_documentation(query: str)` 内で `bedrock-agent-runtime.retrieve()` を呼び、取得したチャンクを文字列で返す。モデルはそのテキストをコンテキストとして回答に利用。

**メリット**: 意味検索（RAG）が使える。ドキュメント更新は S3 同期＋KB の再同期でよく、エージェントイメージの再ビルドは不要。  
**デメリット**: KB・S3・同期パイプラインの設計と運用が必要。コスト・権限設計が必要。

---

### 3. 検索 API を用意し、ツールから HTTP で呼ぶ

**概要**: `docs/` を検索する API（Lambda や Verification Zone 内のエンドポイント）を用意し、Execution Agent の Strands ツールがその API を呼ぶ。

**やり方**:
- 検索用 Lambda を用意し、リポジトリの `docs/` を Asset で同梱するか、S3 に置いて Lambda から読む。キーワード検索や簡易 RAG を実装。
- または Verification Zone 側に「ドキュメント検索」用のルートを追加し、Execution からその URL を呼ぶ（クロスゾーン・認証の設計が必要）。
- Strands ツール: `search_documentation(query: str)` で `requests.get/post` して結果テキストを返す。

**メリット**: ドキュメント更新は API 側のデプロイや S3 更新で対応可能。既存の Verification インフラを流用できる場合がある。  
**デメリット**: ネットワーク・認証・エラーハンドリングが必要。Execution から該当 API へのアクセス経路（VPC/パブリック）を決める必要がある。

---

## 推奨の選び方

| 要件 | 向いているパターン |
|------|---------------------|
| とにかくシンプルに、外部依存なし | **1. イメージ同梱**（ビルド前コピー or コンテキスト変更） |
| 意味検索（RAG）で精度を上げたい、docs 更新をイメージと切り離したい | **2. S3 + Bedrock KB** |
| 既存の検索 API や他サービスを流用したい | **3. 検索 API** |

**まず試すなら**: パターン 1（ビルド前に `docs/` を `execution-agent/docs/` にコピーし、Dockerfile で `COPY docs/ /app/docs/`。Strands ツール `search_docs(query)` で `/app/docs` を走査して該当ファイル内容を返す）。実装量が少なく、すぐに「参照できる」状態を確認できる。

---

## ツール実装の共通メモ（Strands）

- **ツール名**: 例 `search_docs` または `get_doc`。docstring で「プロジェクトの docs/ を検索し、該当するドキュメントの内容を返す」と明示する。
- **戻り値**: 参照したドキュメントのテキスト（または要約）。ファイル成果物は不要なら `@tool` のみ（`context=True` は不要）。
- **システムプロンプト**: 「ユーザーがプロジェクトの仕様・ドキュメントについて質問した場合は、まず search_docs で該当ドキュメントを参照し、その内容を踏まえて回答すること」と追記する。
- **権限**: パターン 2 を採用する場合、Execution Agent の IAM ロールに Bedrock Knowledge Base 用の `bedrock:Retrieve` を付与する（最小スコープで）。

---

## まとめ

- **できる**: docs/ を Execution Agent で参照することは、上記いずれかの方法で実現可能。
- **手軽さ**: イメージに同梱（パターン 1）が最も手軽。RAG や運用の柔軟性を重視するなら S3 + Bedrock KB（パターン 2）を検討する。

具体的な変更箇所（Dockerfile・CDK・ツールコード）が必要であれば、採用するパターンを決めたうえで仕様化するとよい。
