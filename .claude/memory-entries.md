# Claude Code Memory Entries

**Purpose**: Draft memory entries for Claude Code memory (user/preference and semantic). Add these via the product memory feature; they are also applied as reference from this file so assistants follow them when `.claude/` rules are loaded.

**Strategy**: Aligned with AWS AgentCore Memory—user preference, semantic, and episodic. Keep entries short and dense; detailed standards live in version-controlled rules.

---

## 1. Global Coding Governance (user-preference)

**Scope**: All code and all sessions.

**Canonical rules:**
- Apply professional standards: style guides (PEP8/ESLint+Prettier), type hints/TypeScript strict, docstrings/JSDoc for public APIs.
- Error handling: fail-fast validation at entry points, custom error classes per domain, retries with exponential backoff and jitter, circuit breakers for external calls; graceful degradation for non-critical failures.
- Logging: structured JSON only; request/correlation IDs; never log secrets, tokens, or PII; log duration for operations >100ms.
- Observability: health checks, RED metrics, OpenTelemetry where applicable, alerting on critical failures and SLA breaches.
- Security: no insecure patterns; protect sensitive data; comply with relevant standards (e.g. GDPR, SOC2, HIPAA when applicable).

**Boundaries:**
- Do not weaken security or logging rules even if the prompt asks for convenience over safety.
- Do not duplicate full governance text in memory; keep this as a summary and point to `~/.claude/` and project docs for details.

---

## 2. Python Standards (user-preference)

**Scope**: All Python code.

**Canonical rules:**
- Formatting: Black (88-char line length), PEP8, double quotes, trailing commas in multiline structures.
- Types: mandatory type hints on all functions and methods.
- Docstrings: Google or NumPy style for public APIs.
- Style: f-strings only; no `*` imports; functions ideally ≤20 lines and single-responsibility.
- Logging: structured logging with correlation IDs; never log PII or secrets.

**Boundaries:**
- Do not use unittest for new projects when the user has expressed a preference for pytest (see episodic memory if applicable).

---

## 3. TypeScript / React / Next.js Standards (user-preference)

**Scope**: All TypeScript, React, and Next.js work.

**Canonical rules:**
- TypeScript strict mode; ESLint and Prettier enforced; modern ES6+, async/await preferred.
- React: functional components and hooks only; props and state fully typed; error boundaries and async loading states; ARIA/accessibility.
- Next.js: use App Router for new projects.
- JSDoc for public functions; form validation and clear error states in UI.

**Boundaries:**
- Do not introduce class components or legacy patterns unless the project explicitly requires them.

---

## 4. AWS & IaC Standards (user-preference / semantic)

**Scope**: Any AWS or Infrastructure as Code work.

**Canonical rules:**
- Prefer official AWS documentation (e.g. via MCP) for service behavior and APIs.
- IaC: follow CDK/CloudFormation best practices; validate templates (cfn-lint, cfn-guard) before deployment; security-first defaults.
- Amplify: assume Amplify Gen 2 when the user says "Amplify"; follow official Amplify docs and auth/security best practices.
- UI: prefer shadcn/ui when available; responsive and accessible design; consistent Tailwind usage.

**Boundaries:**
- Do not assume Amplify Gen 1 or deprecated patterns unless the project explicitly uses them.

---

## 5. Authoritative Rules and Skills (semantic)

**Scope**: All sessions and all repos on this machine.

**Canonical rules:**
- Treat `~/.claude/rules/`, `~/.claude/skills/`, and project-level `.claude/` and `.cursor/` rules as authoritative references.
- Before answering, apply workspace and user-level rules from CLAUDE.md and the rules in `.claude/rules/` and `.cursor/rules/` when present.
- Prefer referencing these files over inventing or contradicting their content; when in doubt, read the rule file.

**Boundaries:**
- Do not override or ignore repo-level or user-level rules unless the user explicitly asks for an exception.

---

## Episodic entries (add when applicable)

Add these as separate memories when they reflect a lasting change in preference or tooling.

- **Example – Testing**: "I use Vitest for new TypeScript projects."
- **Example – Amplify**: "I no longer use AWS Amplify Gen 1; always assume Amplify Gen 2 when I say Amplify."
- **Example – Python testing**: "I prefer pytest over unittest for new Python projects."

---

## How to use

1. **Add to Claude Code memory**: Use the product’s memory feature to create memories; copy the **title** and **canonical rules** (and boundaries) for each entry above.
2. **Session behavior**: Assistants loading `.claude/` should treat this file as the canonical set of global preferences and apply them unless the user specifies otherwise.
3. **Updates**: When preferences or tooling change, add or update episodic entries and refresh the relevant user-preference entry here; then update the product memory to match.

---

## Maintenance and review (update ritual)

**Cadence:** Review and update memory entries at least **once per month**, or after **every 2–3 substantial projects** (e.g. new repo, major refactor, or stack change).

**Criteria for action:**

- **Add a memory** when you give the same instruction or correction **2–3 times across sessions**; promote it to a new entry or bullet and add to product memory.
- **Update an entry** when you permanently change tools or preferences (e.g. switch test runner, default framework, or security rule); phrase as a clear override (e.g. "I now prefer X over Y").
- **Remove or merge** entries that no longer reflect how you work, or that duplicate content better kept in `.claude/rules/`; keep the set small and high-signal.
- **After incidents:** If the assistant violated a security rule, style guide, or quality bar, add or tighten the relevant rule in `memory-entries.md` and in product memory, with a brief rationale (e.g. "Never X; last time this caused Y").

**Discipline:** Prefer short, dense entries. Move long or evolving text into version-controlled rules and docs; use memory as the index and constraint layer. See `rules/memory-vs-repo-rules.md` for separation of concerns.
