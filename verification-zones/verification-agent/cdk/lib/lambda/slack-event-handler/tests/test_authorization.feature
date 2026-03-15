Feature: Whitelist Authorization
  As a security system
  I want to authorize requests based on whitelist
  So that only authorized users can access the AI feature

  Background:
    Given the whitelist configuration is loaded successfully
    And the whitelist contains authorized entities

  Scenario: Authorized user request is allowed
    Given signature verification (3a) and Existence Check (3b) have succeeded
    And team_id "T123ABC" is in the whitelist
    And user_id "U111" is in the whitelist
    And channel_id "C001" is in the whitelist
    When a request is sent with team_id "T123ABC", user_id "U111", and channel_id "C001"
    Then the request should be authorized
    And AI processing should be executed

  Scenario: Unauthorized team_id request is rejected
    Given signature verification (3a) and Existence Check (3b) have succeeded
    And team_id "T999XXX" is NOT in the whitelist
    And user_id "U111" is in the whitelist
    And channel_id "C001" is in the whitelist
    When a request is sent with team_id "T999XXX", user_id "U111", and channel_id "C001"
    Then the request should return 403 Forbidden
    And a security event should be logged with unauthorized_entities containing "team_id"

  Scenario: Unauthorized user_id request is rejected
    Given signature verification (3a) and Existence Check (3b) have succeeded
    And team_id "T123ABC" is in the whitelist
    And user_id "U999XXX" is NOT in the whitelist
    And channel_id "C001" is in the whitelist
    When a request is sent with team_id "T123ABC", user_id "U999XXX", and channel_id "C001"
    Then the request should return 403 Forbidden
    And a security event should be logged with unauthorized_entities containing "user_id"

  Scenario: Unauthorized channel_id request is rejected
    Given signature verification (3a) and Existence Check (3b) have succeeded
    And team_id "T123ABC" is in the whitelist
    And user_id "U111" is in the whitelist
    And channel_id "C999XXX" is NOT in the whitelist
    When a request is sent with team_id "T123ABC", user_id "U111", and channel_id "C999XXX"
    Then the request should return 403 Forbidden
    And a security event should be logged with unauthorized_entities containing "channel_id"

  Scenario: Missing entity IDs are treated as unauthorized
    Given signature verification (3a) and Existence Check (3b) have succeeded
    When a request is sent with team_id None, user_id "U111", and channel_id "C001"
    Then the request should return 403 Forbidden
    And a security event should be logged with unauthorized_entities containing "team_id"

  Scenario: Whitelist configuration load failure results in request rejection
    Given signature verification (3a) and Existence Check (3b) have succeeded
    And whitelist configuration cannot be loaded from any source
    When a request is sent with any team_id, user_id, and channel_id
    Then the request should return 403 Forbidden
    And a security event should be logged with error_message indicating configuration load failure

  Scenario: Empty whitelist allows all requests (flexible whitelist)
    Given signature verification (3a) and Existence Check (3b) have succeeded
    And the whitelist is empty (no entities configured)
    When a request is sent with team_id "T123ABC", user_id "U111", and channel_id "C001"
    Then the request should be authorized
    And AI processing should be executed

  Scenario: Partial whitelist (channel_id only) allows any team_id and user_id
    Given signature verification (3a) and Existence Check (3b) have succeeded
    And channel_id "C001" is in the whitelist
    And team_id is NOT configured in the whitelist
    And user_id is NOT configured in the whitelist
    When a request is sent with team_id "T123ABC", user_id "U111", and channel_id "C001"
    Then the request should be authorized
    And AI processing should be executed
    When a request is sent with team_id "T999XXX", user_id "U888", and channel_id "C001"
    Then the request should be authorized
    And AI processing should be executed
    When a request is sent with team_id "T123ABC", user_id "U111", and channel_id "C999XXX"
    Then the request should return 403 Forbidden
    And a security event should be logged with unauthorized_entities containing "channel_id"

  Scenario: All entities configured maintains backward compatibility (AND condition)
    Given signature verification (3a) and Existence Check (3b) have succeeded
    And team_id "T123ABC" is in the whitelist
    And user_id "U111" is in the whitelist
    And channel_id "C001" is in the whitelist
    When a request is sent with team_id "T123ABC", user_id "U111", and channel_id "C001"
    Then the request should be authorized
    And AI processing should be executed
    When a request is sent with team_id "T123ABC", user_id "U111", and channel_id "C999XXX"
    Then the request should return 403 Forbidden
    And a security event should be logged with unauthorized_entities containing "channel_id"

