# Tasks: Slack Bedrock MVP (Incremental Development)

**Input**: Design documents from `/specs/001-slack-bedrock-mvp/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/slack-events-api.yaml

**Development Approach**: Incremental "Walking Skeleton" - build minimal end-to-end connection first, then gradually add features with validation at each step.

**Tests**: Tests are NOT explicitly requested in the specification. This implementation uses manual testing per quickstart.md. Only critical security tests (signature verification) are included.

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions
- Each phase ends with a **CHECKPOINT** for validation before proceeding

## Path Conventions

Per plan.md structure:
- **Infrastructure**: `cdk/` (TypeScript)
- **Lambda①**: `lambda/slack-event-handler/` (Python 3.11)
- **Lambda②**: `lambda/bedrock-processor/` (Python 3.11)
- **Environment**: `.env` at repository root

---

## Phase 1: Setup (Project Initialization)

**Purpose**: Create project structure and initialize tools

**Estimated Time**: 30 minutes

- [x] T001 Create project structure per plan.md (cdk/, lambda/slack-event-handler/, lambda/bedrock-processor/)
- [x] T002 Initialize CDK project with TypeScript in cdk/ (`cdk init app --language typescript`)
- [x] T003 [P] Create Python requirements.txt for lambda/slack-event-handler/ (slack-sdk only for now)
- [x] T004 [P] Create .env.example with SLACK_SIGNING_SECRET placeholder
- [x] T005 [P] Create .gitignore for Python, Node.js, and AWS CDK artifacts
- [x] T006 Install CDK dependencies (`npm install` in cdk/)

**Checkpoint Phase 1**: Project structure created, CDK initialized, dependencies installed

---

## Phase 2: Walking Skeleton (Minimal Connection)

**Purpose**: Establish minimal Slack → Lambda → Slack connection without any business logic

**Goal**: Verify that Slack can send requests to Lambda and receive responses

**Estimated Time**: 1-2 hours

### Infrastructure

- [x] T007 Create minimal CDK stack skeleton in cdk/lib/slack-bedrock-stack.ts (imports only)
- [x] T008 Create Lambda① construct (minimal) in cdk/lib/constructs/slack-event-handler.ts
  - Python 3.11 runtime
  - Function URL enabled (auth: NONE)
  - No environment variables yet
  - Timeout: 10 seconds
- [x] T009 Create CDK app entry point in cdk/bin/app.ts
- [x] T010 Bootstrap CDK if needed (`cdk bootstrap`) and deploy stack (`cdk deploy`)

### Lambda Handler (Minimal)

- [x] T011 Create minimal handler.py in lambda/slack-event-handler/
  - Handle `url_verification` event only
  - Return challenge response: `{"challenge": event["challenge"]}`
  - No signature verification yet
  - No other event handling

### Slack App Configuration

- [x] T012 Create Slack App at https://api.slack.com/apps
  - App name: "Bedrock AI Assistant" (or preferred)
  - Select test workspace
- [x] T013 Configure OAuth scopes in Slack App settings
  - Bot Token Scopes: `chat:write`, `im:history`, `app_mentions:read`
- [x] T014 Configure Event Subscriptions in Slack App
  - Enable Events: ON
  - Request URL: <Lambda Function URL from T010 output>
  - Wait for "Verified ✓" status
  - Subscribe to bot events: (none yet - just verification)

**✅ CHECKPOINT Phase 2**:
- CDK deployed successfully
- Lambda Function URL obtained
- Slack Event Subscriptions shows "Verified ✓"
- **Test**: Slack successfully validates the endpoint

---

## Phase 3: Event Echo (Fixed Response)

**Purpose**: Handle actual Slack events and respond with a fixed message (no AI yet)

**Goal**: Verify event routing works and bot can post messages to Slack

**Estimated Time**: 1-2 hours

### Event Handling

- [ ] T015 Extend handler.py in lambda/slack-event-handler/ to handle `event_callback`
  - Extract `event` from payload
  - Check `event["type"]` for "message" or "app_mention"
  - For now, ignore event details
- [ ] T016 [P] Add simple response logic in handler.py
  - Create fixed response text: "Hello! I received your message. (Echo mode - AI not connected yet)"
  - Extract `channel` from event
  - Return simple JSON response (Slack will ignore, need to actually post)

### Slack API Integration

- [ ] T017 Install bot to workspace and get bot token
  - In Slack App settings → OAuth & Permissions → Install to Workspace
  - Copy "Bot User OAuth Token" (xoxb-...)
  - Add to .env file: `SLACK_BOT_TOKEN=xoxb-...`
- [ ] T018 Update Lambda① CDK construct to include environment variable
  - Add SLACK_BOT_TOKEN from environment in cdk/lib/constructs/slack-event-handler.ts
  - Redeploy: `cdk deploy`
- [ ] T019 Implement Slack message posting in handler.py
  - Import slack_sdk: `from slack_sdk import WebClient`
  - Initialize client: `client = WebClient(token=os.environ["SLACK_BOT_TOKEN"])`
  - Post message: `client.chat_postMessage(channel=channel, text=response_text)`
- [ ] T020 Update Slack Event Subscriptions to subscribe to events
  - Add bot event: `message.im` (direct messages)
  - Add bot event: `app_mention` (mentions in channels)
  - Save changes → Slack will re-verify endpoint

**✅ CHECKPOINT Phase 3**:
- **Test 1**: Send DM to bot → Receive fixed response "Hello! I received your message..."
- **Test 2**: Invite bot to channel (`/invite @bot`), mention bot → Receive fixed response
- **Validation**: Slack event routing works, bot can post messages

---

## Phase 4: Token Storage (DynamoDB Integration)

**Purpose**: Add DynamoDB to store workspace installation tokens

**Goal**: Support proper OAuth installation flow and persistent token storage

**Estimated Time**: 1-2 hours

### Infrastructure

- [ ] T021 Create DynamoDB table construct in cdk/lib/constructs/token-storage.ts
  - Table name: `slack-workspace-tokens`
  - Partition key: `team_id` (String)
  - Billing mode: PAY_PER_REQUEST
  - Encryption: AWS_MANAGED
- [ ] T022 Add DynamoDB table to stack in cdk/lib/slack-bedrock-stack.ts
- [ ] T023 Grant Lambda① read/write permissions to DynamoDB table
  - `tokenTable.grantReadWriteData(slackEventHandler)`
- [ ] T024 Add DynamoDB table name to Lambda① environment variables
  - `TOKEN_TABLE_NAME: tokenTable.tableName`
- [ ] T025 Redeploy CDK stack (`cdk deploy`)

### Token Storage Implementation

- [ ] T026 [P] Create token_storage.py in lambda/slack-event-handler/
  - Function: `store_token(team_id, bot_token)`
  - Function: `get_token(team_id)`
  - Use boto3 DynamoDB client
- [ ] T027 Add boto3 to requirements.txt in lambda/slack-event-handler/
- [ ] T028 Update handler.py to store token on first event
  - Extract `team_id` from event
  - On first run, store current SLACK_BOT_TOKEN to DynamoDB
  - Log: "Token stored for team {team_id}"
- [ ] T029 Update handler.py to retrieve token from DynamoDB
  - Lookup token by team_id instead of using environment variable
  - Fallback to environment variable if not in DynamoDB

**✅ CHECKPOINT Phase 4**:
- **Test 1**: Send message to bot → Response still works
- **Test 2**: Check DynamoDB table in AWS Console → Token entry exists for team_id
- **Validation**: Token storage works, bot uses DynamoDB for authentication

---

## Phase 5: Bedrock Integration (Synchronous)

**Purpose**: Replace fixed response with AI-generated response from Bedrock (synchronous call)

**Goal**: Verify Bedrock API integration works (warning: may exceed 3-second Slack timeout)

**Estimated Time**: 2-3 hours

### Security Implementation

- [ ] T030 [P] Create test for valid HMAC SHA256 signature in lambda/slack-event-handler/tests/test_slack_verifier.py
- [ ] T031 [P] Create test for invalid signature rejection in lambda/slack-event-handler/tests/test_slack_verifier.py
- [ ] T032 [P] Create test for timestamp validation (±5 minutes) in lambda/slack-event-handler/tests/test_slack_verifier.py
- [ ] T033 Implement HMAC SHA256 signature verification in lambda/slack-event-handler/slack_verifier.py
  - Function: `verify_signature(event, timestamp, signature, signing_secret)`
  - Use hmac.compare_digest for timing-safe comparison
- [ ] T034 Add SLACK_SIGNING_SECRET to .env and Lambda① environment variables
- [ ] T035 Update handler.py to verify signature before processing
  - Extract headers: X-Slack-Signature, X-Slack-Request-Timestamp
  - Call verify_signature() - return 401 if invalid
  - Check timestamp is within ±5 minutes - return 403 if too old

### Bedrock Integration (Sync)

- [ ] T036 Add Bedrock IAM permissions to Lambda① role in cdk/lib/slack-bedrock-stack.ts
  - `bedrock:InvokeModel` for Claude 3 Haiku
- [ ] T037 Add AWS region to Lambda① environment variables: `AWS_REGION_NAME=us-east-1`
- [ ] T038 Redeploy CDK stack (`cdk deploy`)
- [ ] T039 [P] Create bedrock_client.py in lambda/slack-event-handler/ (temporary - will move to Lambda② later)
  - Function: `invoke_bedrock(prompt: str) -> str`
  - Model: `anthropic.claude-3-haiku-20240307-v1:0`
  - Max tokens: 1024, Temperature: 1.0
  - Use boto3 bedrock-runtime client
- [ ] T040 Update handler.py to call Bedrock instead of fixed response
  - Extract message text from event
  - Strip bot mention if app_mention: `<@U12345>` → ""
  - Call `invoke_bedrock(text)`
  - Post AI response to Slack
- [ ] T041 Add message validation in handler.py
  - Check text is not empty - return friendly error if empty
  - Check text length ≤4000 chars - return error if exceeded

**⚠️ WARNING**: This phase may cause Slack timeout warnings (>3 seconds) because Bedrock calls are synchronous. This is expected and will be fixed in Phase 6.

**✅ CHECKPOINT Phase 5**:
- **Test 1**: Run pytest for signature verification tests (`pytest lambda/slack-event-handler/tests/`)
- **Test 2**: Send message to bot → Receive AI-generated response (may take 5-10 seconds)
- **Test 3**: Check CloudWatch Logs → Verify no signature verification errors
- **Validation**: Bedrock integration works, AI responses are generated
- **Known Issue**: Slack may show timeout warnings - acceptable for this phase

---

## Phase 6: Async Processing (Lambda② + Fire-and-Forget)

**Purpose**: Split processing into two Lambdas to meet Slack's 3-second timeout requirement

**Goal**: Lambda① acknowledges <3 seconds, Lambda② processes asynchronously

**Estimated Time**: 2-3 hours

### Infrastructure

- [ ] T042 Create Lambda② construct in cdk/lib/constructs/bedrock-processor.ts
  - Python 3.11 runtime
  - No Function URL (invoked by Lambda① only)
  - Timeout: 30 seconds (enough for Bedrock)
  - Environment: AWS_REGION_NAME, (no SLACK_BOT_TOKEN yet)
- [ ] T043 Add Lambda② to stack in cdk/lib/slack-bedrock-stack.ts
- [ ] T044 Grant Lambda① permission to invoke Lambda② asynchronously
  - `bedrockProcessor.grantInvoke(slackEventHandler)`
- [ ] T045 Add Lambda② ARN to Lambda① environment variables
  - `BEDROCK_PROCESSOR_ARN: bedrockProcessor.functionArn`
- [ ] T046 Create Python requirements.txt for lambda/bedrock-processor/
  - slack-sdk, boto3
- [ ] T047 Redeploy CDK stack (`cdk deploy`)

### Lambda② Implementation

- [ ] T048 [P] Move bedrock_client.py from lambda/slack-event-handler/ to lambda/bedrock-processor/
- [ ] T049 [P] Create slack_poster.py in lambda/bedrock-processor/
  - Function: `post_to_slack(channel: str, text: str, bot_token: str)`
  - Use slack_sdk.WebClient
- [ ] T050 Create handler.py in lambda/bedrock-processor/
  - Parse event payload: `{ "channel": "...", "text": "...", "bot_token": "..." }`
  - Call `invoke_bedrock(text)`
  - Call `post_to_slack(channel, ai_response, bot_token)`
  - Log success/failure to CloudWatch

### Lambda① Update (Async Invocation)

- [ ] T051 Update handler.py in lambda/slack-event-handler/ to invoke Lambda② asynchronously
  - Remove Bedrock call (moved to Lambda②)
  - Retrieve bot_token from DynamoDB
  - Create payload: `{"channel": channel, "text": user_message, "bot_token": bot_token}`
  - Invoke Lambda② with `InvocationType='Event'` (fire-and-forget)
  - Return 200 OK immediately (no waiting for Lambda②)
- [ ] T052 Add boto3 lambda client to handler.py
  - `lambda_client = boto3.client('lambda')`
  - `lambda_client.invoke(FunctionName=PROCESSOR_ARN, InvocationType='Event', Payload=json.dumps(payload))`

**✅ CHECKPOINT Phase 6**:
- **Test 1**: Send message to bot → Immediate "typing..." indicator, then AI response within 10 seconds
- **Test 2**: Check CloudWatch Logs for Lambda① → Shows "200 OK" within 1-2 seconds
- **Test 3**: Check CloudWatch Logs for Lambda② → Shows Bedrock invocation and Slack posting
- **Test 4**: Send rapid messages → All acknowledged quickly, responses arrive asynchronously
- **Validation**: Slack 3-second timeout satisfied, async processing works correctly

---

## Phase 7: Error Handling (User Story 3)

**Purpose**: Add graceful error handling for Bedrock API failures

**Goal**: User receives friendly error messages instead of silence when Bedrock fails

**Estimated Time**: 1-2 hours

### Error Message Catalog

- [ ] T053 Create ERROR_MESSAGES dictionary in lambda/bedrock-processor/handler.py (per research.md)
  - bedrock_timeout: "Sorry, the AI service is taking longer than usual. Please try again in a moment."
  - bedrock_throttling: "The AI service is currently busy. Please try again in a minute."
  - bedrock_access_denied: "I'm having trouble connecting to the AI service. Please contact your administrator."
  - invalid_response: "I received an unexpected response from the AI service. Please try again."
  - generic: "Something went wrong. I've logged the issue and will try to fix it. Please try again later."

### Error Handlers

- [ ] T054 [P] Add timeout error handler in lambda/bedrock-processor/handler.py
  - Catch `ReadTimeoutException` or timeout errors
  - Post ERROR_MESSAGES["bedrock_timeout"] to Slack
  - Log error to CloudWatch
- [ ] T055 [P] Add throttling error handler in lambda/bedrock-processor/handler.py
  - Catch `ThrottlingException` from boto3
  - Post ERROR_MESSAGES["bedrock_throttling"] to Slack
- [ ] T056 [P] Add access denied error handler in lambda/bedrock-processor/handler.py
  - Catch `AccessDeniedException`
  - Post ERROR_MESSAGES["bedrock_access_denied"] to Slack
- [ ] T057 [P] Add generic error handler in lambda/bedrock-processor/handler.py
  - Catch all other exceptions
  - Log full traceback to CloudWatch (no PII in logs)
  - Post ERROR_MESSAGES["generic"] to Slack
- [ ] T058 Add empty message validation to Lambda① in lambda/slack-event-handler/handler.py
  - If text is empty after mention stripping: Don't invoke Lambda②
  - Post friendly message: "Please send me a message and I'll respond! For example, 'Hello' or 'What can you do?'"

**✅ CHECKPOINT Phase 7**:
- **Test 1**: Simulate Bedrock error (invalid model ID) → Receive friendly error message
- **Test 2**: Send empty message → Receive "Please send me a message..." prompt
- **Test 3**: Send very long message (>4000 chars) → Receive length error
- **Validation**: All error conditions handled gracefully with user-friendly messages

---

## Phase 8: Polish & Deployment Preparation

**Purpose**: Add logging, documentation, and final validation

**Estimated Time**: 1-2 hours

### Logging

- [ ] T059 [P] Add structured logging to Lambda① in lambda/slack-event-handler/handler.py
  - Log: Event received (team_id, channel, event_type)
  - Log: Signature verification result (success/failure)
  - Log: Lambda② invocation (function ARN, async)
  - Use CloudWatch-friendly format (JSON if possible)
- [ ] T060 [P] Add structured logging to Lambda② in lambda/bedrock-processor/handler.py
  - Log: Bedrock request (model, input length)
  - Log: Bedrock response (output length, stop_reason)
  - Log: Slack post result (success/failure)
  - Log: Errors with full context (no PII)

### Documentation

- [ ] T061 [P] Create README.md in repository root
  - Project overview
  - Architecture diagram (ASCII or link to diagram)
  - Link to quickstart.md for deployment instructions
  - Environment variables reference
- [ ] T062 [P] Create docs/slack-app-manifest.yaml template
  - OAuth scopes
  - Event subscriptions (message.im, app_mention)
  - Bot permissions
  - (Users can import this when creating Slack App)
- [ ] T063 [P] Update .env.example with all required variables
  - SLACK_SIGNING_SECRET
  - SLACK_BOT_TOKEN
  - AWS_REGION_NAME

### Final Validation

- [ ] T064 Run full deployment test per quickstart.md
  - Fresh CDK deploy to new environment
  - Create new Slack App
  - Configure Event Subscriptions
  - Install to test workspace
  - Test all scenarios (DM, mention, errors)
- [ ] T065 Run signature verification tests (`pytest lambda/slack-event-handler/tests/`)
- [ ] T066 Verify CloudWatch Logs are readable and useful for debugging
- [ ] T067 Document known limitations in README.md (link to spec.md Out of Scope section)

**✅ CHECKPOINT Phase 8 (FINAL)**:
- All tests pass
- Documentation complete
- Fresh deployment successful
- End-to-end validation complete
- **MVP READY FOR DEMO**

---

## Dependencies & Execution Order

### Phase Dependencies (Must Execute in Order)

1. **Phase 1 (Setup)** → 2. **Phase 2 (Walking Skeleton)** → 3. **Phase 3 (Event Echo)** → 4. **Phase 4 (Token Storage)** → 5. **Phase 5 (Bedrock Sync)** → 6. **Phase 6 (Async)** → 7. **Phase 7 (Error Handling)** → 8. **Phase 8 (Polish)**

**⚠️ CRITICAL**: Each phase MUST be validated at its checkpoint before proceeding to the next phase.

### Why This Order?

- **Phase 2 before 3**: Verify Slack can reach Lambda before handling events
- **Phase 3 before 4**: Verify event routing works before adding database complexity
- **Phase 4 before 5**: Need token storage before Bedrock (uses tokens for Slack posting)
- **Phase 5 before 6**: Prove Bedrock works synchronously before adding async complexity
- **Phase 6 before 7**: Need working async flow before adding error handling
- **Phase 7 before 8**: Complete functionality before polish

### Parallel Opportunities Within Each Phase

**Phase 1**:
- T003, T004, T005 (different files)

**Phase 3**:
- T016, T017 (different tasks)

**Phase 5**:
- T030, T031, T032 (security tests - different test functions)

**Phase 6**:
- T048, T049 (different files in Lambda②)

**Phase 7**:
- T054, T055, T056, T057 (different error handlers - if separate functions)

**Phase 8**:
- T059, T060, T061, T062, T063 (all different files)

---

## Incremental Development Strategy

### Walking Skeleton Approach

This task list follows the "Walking Skeleton" pattern:

1. **Build thinnest possible end-to-end connection first** (Phase 2-3)
2. **Validate it works** (checkpoints)
3. **Add one feature at a time** (Phases 4-7)
4. **Validate each addition** (checkpoints)
5. **Never break the working skeleton** (each phase builds on previous)

### Checkpoint Validation

**At Each Checkpoint**:
1. ✅ Run manual tests specified in checkpoint
2. ✅ Verify CloudWatch Logs show expected behavior
3. ✅ Take notes on what works / what doesn't
4. ✅ Fix issues before proceeding
5. ✅ Git commit with checkpoint message

**Example Git Commits**:
```bash
git commit -m "Phase 2 complete: Walking skeleton - Slack verification works"
git commit -m "Phase 3 complete: Event echo - Bot responds with fixed message"
git commit -m "Phase 4 complete: Token storage - DynamoDB integration working"
# ... etc
```

### Benefits of This Approach

1. **Risk Reduction**: Catch integration issues early (Slack connectivity, AWS permissions)
2. **Fast Feedback**: Working demo after Phase 3 (fixed responses)
3. **Incremental Complexity**: Add one complex feature at a time (DynamoDB, Bedrock, Async)
4. **Easy Debugging**: If something breaks, you know which phase caused it
5. **Motivating Progress**: Working software at each checkpoint

### Minimum Demo Points

- **After Phase 3**: "Look, the bot responds to messages!" (fixed response)
- **After Phase 5**: "Look, the bot uses AI!" (slow, may timeout)
- **After Phase 6**: "Look, the bot is fast!" (async working)
- **After Phase 7**: "Look, the bot handles errors gracefully!"

---

## Task Count Summary

- **Phase 1 (Setup)**: 6 tasks ≈ 30 min
- **Phase 2 (Walking Skeleton)**: 8 tasks ≈ 1-2 hours
- **Phase 3 (Event Echo)**: 6 tasks ≈ 1-2 hours
- **Phase 4 (Token Storage)**: 9 tasks ≈ 1-2 hours
- **Phase 5 (Bedrock Sync)**: 12 tasks ≈ 2-3 hours
- **Phase 6 (Async Processing)**: 11 tasks ≈ 2-3 hours
- **Phase 7 (Error Handling)**: 6 tasks ≈ 1-2 hours
- **Phase 8 (Polish)**: 9 tasks ≈ 1-2 hours

**Total**: 67 tasks

**Estimated Total Time**: 10-16 hours (single developer, sequential)

**Parallelizable**: 20 tasks marked [P] within phases

---

## Recommended Daily Plan

### Day 1 (3-4 hours)
- Phase 1: Setup
- Phase 2: Walking Skeleton
- Phase 3: Event Echo
- **End of Day 1**: Working bot that responds with fixed messages

### Day 2 (3-4 hours)
- Phase 4: Token Storage
- Phase 5: Bedrock Sync
- **End of Day 2**: Bot responds with AI (may timeout)

### Day 3 (3-4 hours)
- Phase 6: Async Processing
- Phase 7: Error Handling
- **End of Day 3**: Production-quality async AI bot

### Day 4 (1-2 hours)
- Phase 8: Polish
- Final validation
- **End of Day 4**: MVP ready for stakeholder demo

---

## Notes

- **[P] tasks** = different files, can run in parallel within phase
- **CHECKPOINTS** are mandatory - DO NOT skip validation
- **Incremental commits** recommended after each task or small task group
- If a checkpoint fails, debug before proceeding to next phase
- CloudWatch Logs are your friend - check them at every checkpoint
- Slack App configuration can be updated iteratively (add event subscriptions as needed)
- Constitution violations acknowledged - this is MVP with justified deferrals per plan.md
