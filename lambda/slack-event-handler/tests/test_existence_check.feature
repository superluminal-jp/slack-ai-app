# BDD Scenarios for Existence Check Feature

Feature: Two-Key Defense - Existence Check
  As a security system
  I want to verify that team_id, user_id, and channel_id exist in Slack
  So that attackers who have stolen only the Signing Secret cannot create fake requests with made-up IDs

  Background:
    Given the system has a valid Bot Token
    And the system has verified the request signature

  Scenario: Valid signature with fake team_id
    Given a request with valid signature
    And the request contains team_id "T_INVALID" that does not exist in Slack
    When the system performs Existence Check
    Then the system should reject the request with 403 Forbidden
    And the system should log a security event "existence_check_failed"
    And the security event should include team_id "T_INVALID"

  Scenario: Valid signature with fake user_id
    Given a request with valid signature
    And the request contains user_id "U_INVALID" that does not exist in Slack
    When the system performs Existence Check
    Then the system should reject the request with 403 Forbidden
    And the system should log a security event "existence_check_failed"
    And the security event should include user_id "U_INVALID"

  Scenario: Valid signature with fake channel_id
    Given a request with valid signature
    And the request contains channel_id "C_INVALID" that does not exist in Slack
    When the system performs Existence Check
    Then the system should reject the request with 403 Forbidden
    And the system should log a security event "existence_check_failed"
    And the security event should include channel_id "C_INVALID"

  Scenario: Valid signature with all valid entities
    Given a request with valid signature
    And the request contains valid team_id "T01234567"
    And the request contains valid user_id "U01234567"
    And the request contains valid channel_id "C01234567"
    When the system performs Existence Check
    Then the system should accept the request
    And the system should log "existence_check_success"

  Scenario: Bot Token unavailable
    Given a request with valid signature
    And the Bot Token is not available
    When the system performs Existence Check
    Then the system should skip Existence Check
    And the system should log "existence_check_skipped" with reason "bot_token_unavailable"
    And the system should continue processing the request

  Scenario: Missing entity IDs
    Given a request with valid signature
    And the request does not contain team_id, user_id, or channel_id
    When the system performs Existence Check
    Then the system should skip Existence Check
    And the system should log "existence_check_skipped" with reason "no_entity_ids"
    And the system should continue processing the request

  Scenario: Slack API timeout
    Given a request with valid signature
    And the request contains valid team_id "T01234567"
    And the Slack API times out after 2 seconds
    When the system performs Existence Check
    Then the system should reject the request with 403 Forbidden
    And the system should log a security event "existence_check_timeout"
    And the security event should include team_id "T01234567"

  Scenario: Slack API rate limit
    Given a request with valid signature
    And the request contains valid team_id "T01234567"
    And the Slack API returns rate limit error (429)
    When the system performs Existence Check
    Then the system should retry with exponential backoff (1s, 2s, 4s)
    And if all retries fail, the system should reject the request with 403 Forbidden
    And the system should log a security event "existence_check_rate_limit"

  Scenario: Slack API complete failure
    Given a request with valid signature
    And the request contains valid team_id "T01234567"
    And the Slack API returns internal server error (500)
    When the system performs Existence Check
    Then the system should reject the request with 403 Forbidden
    And the system should log a security event "existence_check_api_error"
    And the security event should include team_id "T01234567"

