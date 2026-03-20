# Quickstart: Adding Labeled Channel Entries to the Whitelist

This guide shows how to register a Slack channel with a human-readable label across all supported configuration methods.

---

## Option A — DynamoDB (recommended for production)

Use the AWS Console or CLI to add a `label` attribute to any `channel_id` item in the whitelist table.

**AWS CLI example**:
```bash
aws dynamodb put-item \
  --table-name <WHITELIST_TABLE_NAME> \
  --item '{
    "entity_type": {"S": "channel_id"},
    "entity_id":   {"S": "C0123456789"},
    "label":       {"S": "#general"}
  }'
```

Updating an existing entry to add a label:
```bash
aws dynamodb update-item \
  --table-name <WHITELIST_TABLE_NAME> \
  --key '{"entity_type": {"S": "channel_id"}, "entity_id": {"S": "C0123456789"}}' \
  --update-expression "SET #lbl = :label" \
  --expression-attribute-names '{"#lbl": "label"}' \
  --expression-attribute-values '{":label": {"S": "#general"}}'
```

Labels appear in authorization logs within 5 minutes (cache TTL).

---

## Option B — Secrets Manager

Update the secret JSON to use object format for labeled entries. Plain strings remain supported.

```json
{
  "team_ids":    ["T0123456789"],
  "user_ids":    [],
  "channel_ids": [
    "C0000000000",
    {"id": "C0123456789", "label": "#general"},
    {"id": "C9876543210", "label": "#ops"}
  ]
}
```

---

## Option C — CDK config file

Edit `cdk.config.dev.json` (or `cdk.config.prod.json`) and redeploy.

```json
{
  "autoReplyChannelIds": [
    {"id": "C0123456789", "label": "#general"}
  ],
  "mentionChannelIds": [
    "C9876543210",
    {"id": "C1111111111", "label": "#eng-alerts"}
  ]
}
```

Deploy:
```bash
DEPLOYMENT_ENV=dev ./scripts/deploy.sh deploy
```

---

## Option D — Environment variable (local dev / fallback)

```bash
export WHITELIST_CHANNEL_IDS="C0000000000,C0123456789:#general,C9876543210:#ops"
```

Format: `<CHANNEL_ID>` or `<CHANNEL_ID>:<label>`, comma-separated. Labels cannot contain commas.

---

## Verifying labels appear in logs

After registering a labeled channel, trigger a request from that channel and check CloudWatch Logs for the authorization event:

```json
{
  "event_type": "whitelist_authorization_success",
  "channel_id": "C0123456789",
  "channel_label": "#general",
  ...
}
```

If `channel_label` is absent in the log, the entry has no label registered.
