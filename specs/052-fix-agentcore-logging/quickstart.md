# Quickstart Validation: Fix AgentCore Runtime Logging to CloudWatch

## Local TDD Validation

Run the logger utility tests in each affected agent directory:

```bash
cd verification-zones/verification-agent && python -m pytest tests/test_logger_util.py -q
cd verification-zones/slack-search-agent && python -m pytest tests/test_logger_util.py -q
cd execution-zones/docs-agent && python -m pytest tests/test_logger_util.py -q
cd execution-zones/file-creator-agent && python -m pytest tests/test_logger_util.py -q
cd execution-zones/time-agent && python -m pytest tests/test_logger_util.py -q
cd execution-zones/fetch-url-agent && python -m pytest tests/test_logger_util.py -q
```

Expected result: `4 passed` in each directory.

## Runtime Validation (CloudWatch)

1. Deploy target agents.
2. Invoke the agent with a known `correlation_id`.
3. Query CloudWatch Logs Insights for the runtime log group:

```sql
fields @timestamp, event_type, level, correlation_id, service
| filter correlation_id = "corr-<your-id>"
| sort @timestamp asc
| limit 100
```

Expected result:
- Pipeline events are visible for the target correlation ID.
- Error paths include `error` and `error_type` fields when applicable.
- No duplicate entries are observed per single `log()` call.
