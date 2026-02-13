# デプロイ用 IAM ポリシー

このドキュメントでは、Slack AI App をデプロイする際の IAM 権限を説明します。

## リソースポリシー適用（デプロイスクリプト）

`deploy-split-stacks.sh` が Execution Agent の Runtime へ `PutResourcePolicy` を適用します（Endpoint は `PutResourcePolicy` 非対応）。**デプロイ用 IAM に `PutResourcePolicy` 権限が必要**です。

次の警告が出る場合は、下記の IAM 権限を追加してください。

```
[WARNING] Could not apply resource policy (check bedrock-agentcore-control PutResourcePolicy permissions)
```

## 必要な追加権限

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "bedrock-agentcore-control:PutResourcePolicy",
      "Resource": "arn:aws:bedrock-agentcore:*:*:runtime/*"
    }
  ]
}
```

### AWS CLI でポリシーを追加する例

```bash
# カスタマー管理ポリシーを作成
aws iam create-policy \
  --policy-name SlackAIDeploymentAgentCorePolicy \
  --policy-document file:///tmp/deployment-agentcore-policy.json \
  --description "Allows PutResourcePolicy for AgentCore Runtime/Endpoint (deployment script)"

# デプロイ用ユーザーにアタッチ
aws iam attach-user-policy \
  --user-name YOUR_DEPLOYMENT_USER \
  --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/SlackAIDeploymentAgentCorePolicy
```

## 関連ドキュメント

- [Resource-based policies for Amazon Bedrock AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/resource-based-policies.html)
- [PutResourcePolicy - Control Plane API](https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_PutResourcePolicy.html)
- [トラブルシューティング: A2A デプロイ](../../how-to/troubleshooting.md)
