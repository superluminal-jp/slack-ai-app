# Daily Logging Assistant - Examples

## Example 1: Routine Operations Log

**User**: "I need to log my work from today"

**Assistant**: "What is the date and your role?"

**User**: "2025-01-15, Senior Software Engineer"

**Assistant**: "What project or context is this log entry for?"

**User**: "E-commerce platform backend"

**Assistant**: "What type of day was it: routine operations, critical decisions, problem resolution, or milestone achievement?"

**User**: "Routine operations"

**Assistant**: "Let's capture what happened. What actions did you complete today?"

**User**: "I finished implementing the payment processing API and deployed it to staging"

**Assistant**: "Great. What was the outcome? Did it work as expected?"

**User**: "Yes, all tests passed and it's ready for review"

**Assistant**: "Who else was involved in this work?"

**User**: "I worked with Sarah from the payments team for integration testing"

**Assistant**: "Any decisions made today?"

**User**: "We decided to use Stripe instead of PayPal for the initial launch"

**Assistant**: "What was the rationale for that decision?"

**User**: "Stripe has better API documentation and lower transaction fees for our volume"

**Final Output**: [Structured log entry following template]

## Example 2: Critical Decision Log

**User**: "I need to log a major decision we made today"

**Assistant**: "What was decided?"

**User**: "We're switching from monolith to microservices architecture"

**Assistant**: "This is a significant decision. Let's capture it properly. What problem does this solve?"

**User**: "Our monolith is becoming too slow to deploy and teams are blocking each other"

**Assistant**: "What alternatives were considered?"

**User**: "We looked at modular monolith and just improving our CI/CD, but microservices gives us the independence we need"

**Assistant**: "Who approved this decision?"

**User**: "The CTO and engineering leadership team"

**Assistant**: "What's the expected impact? Can you quantify it?"

**User**: "We expect to reduce deployment time from 2 hours to 15 minutes, and eliminate 80% of cross-team blocking issues"

**Final Output**: [Detailed decision log with all required fields]

## Example 3: Blocker Documentation

**User**: "I need to log a blocker that's preventing progress"

**Assistant**: "What is preventing progress?"

**User**: "The third-party API we depend on is down"

**Assistant**: "How many people or tasks are affected?"

**User**: "Three developers and about 5 user stories in the current sprint"

**Assistant**: "What's the business impact if this remains unresolved?"

**User**: "We can't complete the checkout feature, which blocks our Q1 launch goal"

**Assistant**: "What's your mitigation plan?"

**User**: "We've contacted the vendor's support team and set up monitoring. We're also exploring a backup provider"

**Assistant**: "When do you expect resolution?"

**User**: "The vendor says 24-48 hours, but we're pushing for faster resolution"

**Final Output**: [Blocker log with impact assessment and mitigation plan]

