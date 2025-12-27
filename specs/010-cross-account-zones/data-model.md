# Data Model: Cross-Account Zones Architecture

**Feature**: 010-cross-account-zones  
**Date**: 2025-12-27

## Overview

本機能はインフラストラクチャの再構成であり、新しいデータエンティティは追加しません。既存のデータモデルは変更なしで維持されます。

## Stack Configuration Model

スタック間の設定情報を管理するための概念的なモデルを定義します。

### VerificationStackConfig

Verification Stack のデプロイに必要な設定。

| Field              | Type   | Required | Description                                           |
| ------------------ | ------ | -------- | ----------------------------------------------------- |
| stackName          | string | Yes      | スタック名（例: SlackAI-Verification）                |
| executionApiUrl    | string | Yes      | Execution API の URL                                  |
| executionApiArn    | string | Yes      | API Gateway の ARN（execute-api:Invoke 権限用）       |
| slackBotToken      | string | Yes      | Slack Bot Token（環境変数から）                       |
| slackSigningSecret | string | Yes      | Slack Signing Secret（環境変数から）                  |
| awsRegion          | string | Yes      | デプロイ先リージョン                                  |
| bedrockModelId     | string | No       | Bedrock モデル ID（デフォルト: amazon.nova-pro-v1:0） |

### ExecutionStackConfig

Execution Stack のデプロイに必要な設定。

| Field                 | Type   | Required | Description                                              |
| --------------------- | ------ | -------- | -------------------------------------------------------- |
| stackName             | string | Yes      | スタック名（例: SlackAI-Execution）                      |
| verificationAccountId | string | No       | Verification Stack のアカウント ID（クロスアカウント時） |
| verificationRoleArn   | string | No       | Verification Lambda のロール ARN（初回デプロイ後に設定） |
| awsRegion             | string | Yes      | デプロイ先リージョン                                     |
| bedrockModelId        | string | No       | Bedrock モデル ID（デフォルト: amazon.nova-pro-v1:0）    |

### CrossAccountTrustConfig

クロスアカウント通信の信頼関係設定。

| Field           | Type   | Required | Description                    |
| --------------- | ------ | -------- | ------------------------------ |
| sourceAccountId | string | Yes      | 呼び出し元アカウント ID        |
| sourceRoleArn   | string | Yes      | 呼び出し元 Lambda のロール ARN |
| targetApiArn    | string | Yes      | ターゲット API Gateway の ARN  |

## Existing Data Model (No Changes)

以下の既存テーブルは変更なし。すべて Verification Stack に配置されます。

### slack-workspace-tokens (TokenStorage)

| Field        | Type   | Key | Description               |
| ------------ | ------ | --- | ------------------------- |
| workspace_id | string | PK  | Slack ワークスペース ID   |
| bot_token    | string | -   | Bot OAuth Token（暗号化） |
| created_at   | string | -   | 作成日時                  |

### slack-event-dedupe (EventDedupe)

| Field    | Type   | Key | Description             |
| -------- | ------ | --- | ----------------------- |
| event_id | string | PK  | Slack イベント ID       |
| ttl      | number | -   | TTL（5 分後に自動削除） |

### slack-existence-check-cache (ExistenceCheckCache)

| Field     | Type    | Key | Description                         |
| --------- | ------- | --- | ----------------------------------- |
| cache_key | string  | PK  | キャッシュキー（team:user:channel） |
| result    | boolean | -   | Existence Check 結果                |
| ttl       | number  | -   | TTL（5 分後に自動削除）             |

### slack-whitelist-config (WhitelistConfig)

| Field       | Type     | Key | Description                     |
| ----------- | -------- | --- | ------------------------------- |
| config_type | string   | PK  | 設定タイプ（team/user/channel） |
| allowed_ids | string[] | -   | 許可された ID リスト            |

### slack-rate-limit (RateLimit)

| Field         | Type   | Key | Description                   |
| ------------- | ------ | --- | ----------------------------- |
| entity_id     | string | PK  | レート制限対象エンティティ ID |
| request_count | number | -   | リクエストカウント            |
| window_start  | string | -   | ウィンドウ開始時刻            |
| ttl           | number | -   | TTL                           |

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Verification Stack (Account A)                               │
│                                                              │
│  Slack → Function URL → SlackEventHandler Lambda            │
│                              │                               │
│                              ├─→ DynamoDB (5 tables)        │
│                              └─→ Secrets Manager            │
└──────────────────────────────┼──────────────────────────────┘
                               │ IAM Auth (SigV4)
                               ↓
┌─────────────────────────────────────────────────────────────┐
│ Execution Stack (Account B)                                  │
│                                                              │
│  API Gateway (Resource Policy) → BedrockProcessor Lambda    │
│                                        │                     │
│                                        └─→ Bedrock API      │
└─────────────────────────────────────────────────────────────┘
```

## Entity Relationships

```
VerificationStackConfig
    │
    ├── requires → ExecutionStackConfig.executionApiUrl
    └── outputs  → verificationRoleArn

ExecutionStackConfig
    │
    ├── outputs  → executionApiUrl, executionApiArn
    └── accepts  → VerificationStackConfig.verificationRoleArn

CrossAccountTrustConfig
    │
    ├── binds → VerificationStackConfig
    └── binds → ExecutionStackConfig
```
