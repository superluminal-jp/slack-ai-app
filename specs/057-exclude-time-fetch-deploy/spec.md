# Feature Specification: Exclude Time and Web Fetch from Default Deployment

**Feature Branch**: `057-exclude-time-fetch-deploy`  
**Created**: 2026-03-30  
**Status**: Draft  
**Input**: User description: "time agent と web fetch agent を実用観点とセキュリティ観点からデプロイに含めないように修正"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Standard deployment omits Time and Web-fetch capabilities (Priority: P1)

A platform operator runs the organization’s **standard** deployment for the Slack AI assistant. That procedure must not provision, register, or validate the **Time** capability or the **Web-fetch** capability, so production cost and attack surface stay aligned with operational priorities.

**Why this priority**: This is the core outcome—default rollout must not include these two agents for practical and security reasons.

**Independent Test**: Run only the standard deployment procedure in a clean target environment and confirm neither capability is brought online or offered to end users.

**Acceptance Scenarios**:

1. **Given** a greenfield environment, **When** the standard deployment finishes successfully, **Then** no live service for the Time capability is created by that procedure.
2. **Given** a greenfield environment, **When** the standard deployment finishes successfully, **Then** no live service for the Web-fetch capability is created by that procedure.
3. **Given** a completed standard deployment, **When** the assistant resolves which capabilities are available to users, **Then** Time and Web-fetch are not included in the default capability set.

---

### User Story 2 - End users are not exposed to excluded capabilities by default (Priority: P2)

An end user interacts with the Slack assistant after a standard deployment. They must not be routed to workflows that depend on the Time or Web-fetch capabilities, and failures must be understandable if legacy configuration still references them.

**Why this priority**: Deployment changes are only effective if user-facing behavior matches the intended security and product posture.

**Independent Test**: From Slack, attempt actions that would previously use only Time or only Web-fetch; observe that default behavior does not invoke those capabilities.

**Acceptance Scenarios**:

1. **Given** a system deployed via the standard procedure, **When** a user requests something that would require the Web-fetch capability alone, **Then** the assistant does not perform unrestricted URL retrieval on the user’s behalf via that capability.
2. **Given** a system deployed via the standard procedure, **When** a user requests something that would require the Time capability alone, **Then** that capability is not invoked.
3. **Given** optional documentation for advanced setups, **When** an operator follows only the standard procedure, **Then** user-visible capability labels do not imply Time or Web-fetch are available.

---

### User Story 3 - Clear rationale and boundaries for operators (Priority: P3)

Operators and security reviewers need a concise explanation of **why** Time and Web-fetch are excluded by default (practical value vs. cost, and security considerations for fetching arbitrary URLs), and what is in scope vs. out of scope for this change.

**Why this priority**: Reduces misconfiguration and avoids teams assuming the capabilities are present after reading older documentation.

**Independent Test**: Review published operator-facing notes for this release; confirm exclusion reasons and default scope are stated without requiring code inspection.

**Acceptance Scenarios**:

1. **Given** release or operator notes for this feature, **When** a new team member reads them, **Then** they understand that standard deployment intentionally omits Time and Web-fetch and why.
2. **Given** an environment that previously had these capabilities deployed, **When** the organization adopts the new default procedure, **Then** documentation states whether existing resources are left in place or must be removed separately (see Assumptions).

---

### Edge Cases

- **Prior deployments**: Environments that already deployed Time or Web-fetch may retain cloud resources until explicitly torn down; standard deployment must not rely on their presence and must not re-register them by default.
- **Selective / partial runs**: If the organization allows running only part of a deployment, behavior must remain consistent with documented “standard full run” expectations.
- **Naming and discovery**: If user messages or internal labels still mention “time” or “fetch URL” generically, the assistant should not silently invoke the excluded capabilities when they are not part of the default capability set.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The **standard deployment procedure** documented for this product SHALL NOT include steps that provision, update, or register the Time capability or the Web-fetch capability.
- **FR-002**: After a successful standard deployment, the **default user-facing capability set** SHALL NOT expose or route to the Time capability or the Web-fetch capability.
- **FR-003**: The standard deployment procedure SHALL NOT treat successful readiness of the Time or Web-fetch capability as required for overall success (no hard dependency on those capabilities being present).
- **FR-004**: Operator-facing documentation SHALL state that Time and Web-fetch are excluded from the default deployment for **practical** reasons (e.g., limited unique value relative to operating cost) and **security** reasons (e.g., risk surface of retrieving arbitrary network content on behalf of users).
- **FR-005**: Where the product stores a catalog of available capabilities for routing, the result of a standard deployment SHALL NOT list Time or Web-fetch among active capabilities unless the organization explicitly adopts a separate, documented opt-in path (out of scope for defining that path here beyond noting it may exist).

### Assumptions

- “Standard deployment” means the primary, documented end-to-end procedure operators run for normal releases—not ad hoc or experimental scripts.
- Excluding these agents from default deployment does not require deleting historical cloud resources automatically; cleanup of previously deployed resources is a separate operator decision.
- Other capabilities (for example file creation, documentation, or search) remain in scope for default deployment unless separately specified.
- Teams that still need Time or Web-fetch for development may use a separate, explicitly documented workflow; this specification does not mandate that workflow’s shape.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a controlled test, **100%** of runs of the standard deployment procedure complete without creating or updating runtimes for Time and Web-fetch.
- **SC-002**: After such a deployment, **100%** of sampled user-facing capability checks show neither Time nor Web-fetch as available for routing under default configuration.
- **SC-003**: Operator documentation includes both practical and security rationales for exclusion, and at least **one** independent reviewer can confirm the rationale is clear without reading application source code.
- **SC-004**: Support or security review can verify in under **30 minutes** that default deployment does not introduce unrestricted third-party URL retrieval via the Web-fetch capability.
