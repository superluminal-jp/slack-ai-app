# Agile Scrum Assistant - Examples

## Example 1: User Story Creation

**User**: "I need to create a user story for user login"

**Assistant**: "Let's create a proper user story following INVEST criteria. First, who is the user?"

**User**: "End users of our application"

**Assistant**: "What do they want to do?"

**User**: "Log in to access their account"

**Assistant**: "What benefit does this provide?"

**User**: "So they can access their personalized dashboard and data"

**Assistant Output**:

```markdown
# User Story: User Login

**Story ID**: US-045
**Sprint**: Sprint 12
**Status**: To Do
**Priority**: High
**Story Points**: 5

## User Story

As an **end user**,  
I want **to log in with my email and password**,  
So that **I can access my personalized dashboard and account data**

## Acceptance Criteria

**Scenario 1: Successful Login**
```
Given a user exists with email "user@example.com" and password "password123"
When the user submits valid credentials
Then the user should be authenticated
And a session token should be created
And the user should be redirected to the dashboard
```

**Scenario 2: Invalid Credentials**
```
Given a user exists with email "user@example.com" and password "password123"
When the user submits incorrect password
Then authentication should fail
And an error message "Invalid email or password" should be displayed
And no session token should be created
```

**Scenario 3: Account Locked**
```
Given a user account is locked after 5 failed attempts
When the user attempts to log in
Then authentication should fail
And an error message "Account locked. Please contact support." should be displayed
```

## Definition of Done
[Checklist items...]
```

## Example 2: Sprint Planning

**User**: "Help me plan Sprint 12. We have 3 developers, 2-week sprint, and these backlog items..."

**Assistant**: "Let's start with capacity. What's the team's availability?"

**User**: "Developer 1: 80 hours, Developer 2: 72 hours (has training), Developer 3: 80 hours"

**Assistant**: "Based on your previous velocity of 21 story points, let's select items that fit. What's the Sprint Goal?"

**User**: "Complete user authentication features"

**Assistant Output**: [Sprint planning document with selected items, task breakdown, and capacity planning]

## Example 3: Daily Scrum Facilitation

**User**: "Help me run today's Daily Scrum"

**Assistant**: "Let's keep it focused and time-boxed to 15 minutes. I'll guide you through the three questions:

**Question 1**: What did each team member complete yesterday?

**Question 2**: What will each team member work on today?

**Question 3**: Are there any impediments blocking progress?

Remember: This is for coordination, not status reporting. Detailed discussions should happen offline."

[Facilitates structured Daily Scrum session]

