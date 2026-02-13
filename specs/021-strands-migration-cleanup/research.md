# Research: strands-agents 移行とインフラ整備

**Date**: 2026-02-08
**Feature**: 021-strands-migration-cleanup

## R1: strands-agents A2AServer API

### Decision: strands-agents A2AServer + FastAPI wrapper で BedrockAgentCoreApp を完全置換

### Rationale

strands-agents の `A2AServer` クラスは A2A プロトコルをネイティブサポートし、以下の利点がある:

- **ポート 9000 がデフォルト**: `BedrockAgentCoreApp`（デフォルト 8080）と異なり、A2A 契約に準拠
- **POST `/` を自動登録**: カスタムルートハンドラ不要（`_handle_invocation` 依存解消）
- **Agent Card 自動生成**: `/.well-known/agent-card.json` を Agent メタデータから自動構築
- **AWS 公式推奨**: AgentCore Runtime + strands-agents の組み合わせが公式ドキュメントで推奨

### API 概要

```python
from strands import Agent
from strands.multiagent.a2a import A2AServer
from fastapi import FastAPI
import uvicorn

agent = Agent(name="MyAgent", description="...", tools=[...], callback_handler=None)

a2a_server = A2AServer(
    agent=agent,
    http_url=os.environ.get('AGENTCORE_RUNTIME_URL', 'http://127.0.0.1:9000/'),
    serve_at_root=True,
    port=9000,  # デフォルト
)

app = FastAPI()

@app.get("/ping")
def ping():
    return {"status": "healthy"}

app.mount("/", a2a_server.to_fastapi_app())
uvicorn.run(app, host="0.0.0.0", port=9000)
```

### Alternatives Considered

1. **BedrockAgentCoreApp + カスタムルート維持**: 現状の `_handle_invocation` ワークアラウンドを継続。Private API 依存が残るため却下。
2. **Starlette 直接使用**: `a2a_server.to_starlette_app()` も利用可能。FastAPI を選択したのは OpenAPI ドキュメント自動生成とバリデーション機能のため。

### 非同期タスク管理の変更

**現行パターン（BedrockAgentCoreApp）**:
```python
task_id = app.add_async_task("processing")
threading.Thread(target=process, args=(task_id,)).start()
app.complete_async_task(task_id, result)
```

**strands-agents パターン**: `StrandsA2AExecutor` がタスクライフサイクルを自動管理。`InMemoryTaskStore` がデフォルト。手動の `add_async_task` / `complete_async_task` は不要。

**移行戦略**: Execution Agent のバックグラウンドスレッドパターンは、strands-agents の Agent + Tool パターンに移行。Bedrock 呼び出しを strands Tool として実装し、executor のストリーミング実行に委ねる。

### 既知の制限

- `cancel()` 未実装（`UnsupportedOperationError` を返す）
- `input_required` 状態未サポート（Issue #1371）
- カスタム `TaskStore`（DynamoDB 等）は未提供（Issue #985）

### Sources

- [strands-agents A2A User Guide](https://strandsagents.com/latest/documentation/docs/user-guide/concepts/multi-agent/agent-to-agent/)
- [A2AServer API Reference](https://strandsagents.com/latest/documentation/docs/api-reference/python/multiagent/a2a/server/)
- [Deploy A2A in AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a.html)
- [strands-agents PyPI](https://pypi.org/project/strands-agents/) (v1.25.0)

---

## R2: CloudWatch メトリクス名前空間の IAM ポリシー

### Decision: IAM ポリシーを `StringLike` + 配列で実際の名前空間に合わせる

### Rationale

現状の不一致:

| 場所 | 名前空間 |
|------|----------|
| IAM ポリシー条件 | `bedrock-agentcore`（唯一の許可値） |
| verification-agent コード | `SlackEventHandler`, `SlackAI/VerificationAgent` |
| execution-agent コード | `SlackAI/ExecutionAgent` |
| CloudWatch Alarms | `SlackEventHandler` |

**結果**: 全メトリクス送信が `AccessDenied` で静かに失敗中。

### 推奨修正

```typescript
conditions: {
  StringLike: {
    "cloudwatch:namespace": ["SlackEventHandler", "SlackAI/*"],
  },
},
```

- `StringLike` を使用し、`SlackAI/*` でプレフィックスマッチ
- `SlackEventHandler` は完全一致（ワイルドカードなし）
- 将来の `SlackAI/XXX` 名前空間も自動カバー

### Alternatives Considered

1. **コード側の名前空間を `bedrock-agentcore` に統一**: IAM 変更不要だが、メトリクスの意味が曖昧になる。却下。
2. **`StringEquals` + 全名前空間を列挙**: 安全だが名前空間追加のたびに IAM 更新が必要。スケーラビリティの観点から却下。

### Sources

- [CloudWatch namespace condition keys](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/iam-cw-condition-keys-namespace.html)
- [IAM condition operators](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_condition_operators.html)

---

## R3: 依存パッケージバージョン戦略

### Decision: 互換バージョン指定（`~=`）を基本、セキュリティクリティカルなパッケージは完全固定（`==`）

### Rationale

- `~=X.Y.Z` はパッチバージョン自動取得を許容（`>=X.Y.Z, <X.(Y+1).0`）
- セキュリティ修正の自動適用とビルド再現性のバランス
- strands-agents 移行後は `bedrock-agentcore` を削除

### strands-agents 移行後の requirements.txt

**Verification Agent**:
```
strands-agents[a2a]~=1.25.0
uvicorn~=0.34.0
fastapi~=0.115.0
boto3~=1.34.0
slack-sdk~=3.27.0
requests~=2.31.0
```

**Execution Agent**:
```
strands-agents[a2a]~=1.25.0
uvicorn~=0.34.0
fastapi~=0.115.0
boto3~=1.34.0
requests~=2.31.0
PyPDF2~=3.0.0
openpyxl~=3.1.0
```

**削除対象**: `bedrock-agentcore`（strands-agents で完全置換）

---

## R4: エコーモード設定の型安全化

### Decision: `CdkConfig` インターフェースに `validationZoneEchoMode?: boolean` を追加

### Rationale

- 現状: CDK コンテキスト変数または環境変数で手動指定
- 改善: `cdk.config.*.json` に含めて型チェック
- 後方互換: 既存のコンテキスト変数指定も維持

### 変更箇所

- `cdk/lib/types/cdk-config.ts`: インターフェース + Zod スキーマに追加
- `cdk/bin/cdk.ts`: config ファイルからの読み込みロジック追加
- `scripts/deploy-split-stacks.sh`: config ファイルの値を優先する分岐追加

---

## R5: 移行対象ファイル一覧

### コード変更（High Impact）

| ファイル | 変更内容 |
|----------|----------|
| `verification-agent/main.py` | `BedrockAgentCoreApp` → strands-agents `A2AServer` + FastAPI |
| `execution-agent/main.py` | 同上 + async task パターンの再設計 |

### テスト変更（Medium Impact）

| ファイル | 変更内容 |
|----------|----------|
| `verification-agent/tests/conftest.py` | Mock を strands-agents 対応に更新 |
| `execution-agent/tests/conftest.py` | 同上 |
| `verification-agent/tests/test_main.py` | `@patch("main.app")` パターンの更新 |
| `execution-agent/tests/test_main.py` | 同上 + async task テストの更新 |

### 設定変更（Low Impact）

| ファイル | 変更内容 |
|----------|----------|
| `verification-agent/requirements.txt` | バージョン固定、bedrock-agentcore 削除 |
| `execution-agent/requirements.txt` | 同上 |
| `cdk/lib/types/cdk-config.ts` | `validationZoneEchoMode` プロパティ追加 |
| `verification-agent-runtime.ts` | IAM 名前空間条件修正 |
| `execution-agent-runtime.ts` | IAM 名前空間条件修正 |

### 変更不要

| ファイル | 理由 |
|----------|------|
| `Dockerfile` (×2) | ポート 9000、Python 3.11、CMD 変更なし |
| CDK Runtime リソース定義 | `AWS::BedrockAgentCore::Runtime` 設定は strands-agents でも同一 |
| ビジネスロジックテスト | `test_cloudwatch_metrics.py`, `test_slack_poster.py` 等は SDK 非依存 |
