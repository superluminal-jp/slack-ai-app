# Quickstart: Usage History Integration Test Scenarios (039)

## Scenario 1: Text-only request is recorded

```
1. Send Slack message (no attachments) to a whitelisted channel
2. Wait for agent response
3. Query DynamoDB table {stack}-usage-history
   - PK=channel_id, SK begins_with(timestamp)
4. Assert:
   - Record exists with correct channel_id, user_id, team_id
   - input_text == original message text
   - output_text == agent response text
   - pipeline_result.existence_check == true
   - pipeline_result.authorization == true
   - pipeline_result.rate_limited == false
   - attachment_keys == []
   - duration_ms > 0
   - ttl is approximately now + 90 days
```

## Scenario 2: Request with attachments — text + files recorded

```
1. Send Slack message with 1 image attachment
2. Wait for agent response
3. Assert DynamoDB record exists (same as Scenario 1)
4. Assert attachment_keys has 1 entry
5. Verify S3 object exists at key from attachment_keys[0]
   - Bucket: {stack}-usage-history
   - Prefix: attachments/{channel_id}/{date}/{correlation_id}/
```

## Scenario 3: Pipeline rejection — metadata recorded, no text

```
1. Send message from a non-whitelisted channel
2. Agent returns rejection message
3. Query DynamoDB table
4. Assert:
   - Record exists
   - input_text == "" (no user text — pipeline rejected before enrichment)
   - output_text == ""
   - pipeline_result.authorization == false
   - pipeline_result.rejection_stage == "authorization"
   - orchestration is absent from record
```

## Scenario 4: Storage failure does not break user experience

```
1. Temporarily revoke DynamoDB write permission (or simulate error in unit test)
2. Send Slack message
3. Assert:
   - User receives normal agent response
   - CloudWatch Logs contain WARNING log with event_type=usage_history_write_error
   - No error message sent to user
```

## Scenario 5: correlation_id lookup

```
1. Send message and capture correlation_id from CloudWatch Logs
2. Query DynamoDB GSI correlation_id-index with PK=correlation_id
3. Assert record is returned with matching channel_id and request details
```
