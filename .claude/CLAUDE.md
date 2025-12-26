# Claude Code: Professional Output Guidelines

**Purpose**: Execute efficiently through systematic planning, appropriate model selection, context management, and adherence to international professional writing standards.

**Audience**: Professionals requiring high-quality outputs for technical, business, and research contexts.

---

## Planning & Execution

**Create task lists before execution**:

- Break work into atomic tasks
- Mark dependencies explicitly
- Assign complexity level (simple/medium/complex)
- Justify model choice per task

**Example**:

```
1. [Simple, Haiku] Parse input data
2. [Medium, Sonnet] Generate implementation (depends on #1)
3. [Simple, Haiku] Create tests (depends on #2)
```

**Parallelize when**: Tasks have no dependencies and operate on different files or datasets.

---

## Model Selection

**Haiku** (fast, cheap): File ops, format conversion, validation, simple transformations

**Sonnet** (balanced): Code development, analysis, documentation, debugging

**Opus** (deep reasoning): Architecture decisions, complex algorithms, trade-off analysis

---

## Output Standards

### Structure

- **Inverted pyramid**: Key message first, supporting details follow (Economist Style Guide, 2020)
- **One paragraph = one idea**: Maintain focused paragraphs (APA 7th Ed.)
- **Clear heading hierarchy**: Use consistent H1/H2/H3 structure (ISO 21500)

### Language

- **Plain language**: Avoid jargon; translate technical terms into analogies (Plain Writing Act, 2010)
- **Active voice**: Prefer "Claude executes tasks" over "Tasks are executed by Claude" (Elements of Style)
- **Consistent terminology**: Use same terms throughout for same concepts (Chicago Manual, 17th Ed.)

### Evidence & Citations

- **Primary sources**: Cite authoritative, peer-reviewed, or official documentation
- **Citation style**: Apply APA, IEEE, or Chicago consistently
- **Fact vs interpretation**: Distinguish clearly (COPE Guidelines, 2019)
- **Express uncertainty**: Use frequencies ("1 in 10 cases") rather than vague terms

### Visualization

- **Data-ink ratio**: Maximize information, minimize decoration (Tufte)
- **Required elements**: Captions, units, sources for all visuals (ISO 690)
- **Highlight trends**: Show patterns, not raw data dumps (NNG, 2019)

---

## Context Management

**Use temporary files for state**:

```bash
/tmp/claude/project_context.json    # Decisions and progress
/tmp/claude/task_state.json         # Current work status
/tmp/claude/cache_{topic}.json      # Reusable results
/tmp/claude/references.json         # Source tracking with citations
```

**Cache static content**: Style guides, documentation, templates, requirements

**Keep dynamic**: Current task parameters, specific inputs, target files

**Reference tracking**:

```json
{
  "output": "analysis_report",
  "references": [
    {
      "id": "aws-2024",
      "type": "documentation",
      "source": "AWS CDK Developer Guide",
      "url": "https://docs.aws.amazon.com/cdk/",
      "accessed": "2025-12-27",
      "citationStyle": "APA"
    }
  ],
  "assumptions": ["Input data validated", "Network latency < 100ms"],
  "limitations": ["Sample size n=100", "Single-region analysis"]
}
```

**Token savings**: 60-80% for repeated operations

---

## Quality Assurance

### Three-Stage Process

1. **Revision**: Review structure, logic, completeness
2. **Editing**: Refine language, consistency, clarity
3. **Proofreading**: Check grammar, formatting, references

### Output Checklist

- [ ] Purpose and audience stated
- [ ] Key message first (inverted pyramid)
- [ ] Plain, active, consistent language
- [ ] One idea per paragraph
- [ ] Visuals include captions, units, sources
- [ ] References cited with consistent style
- [ ] Assumptions and limitations explicit
- [ ] Facts distinguished from interpretations

### Executive Deliverables

Follow sequence: **Impact → 3 Key Points → Visual → Action Options**

---

## Structured Output

**Specify JSON schemas**:

```json
{
  "status": "completed|failed",
  "summary": {
    "impact": "Primary outcome or value",
    "keyPoints": ["Point 1", "Point 2", "Point 3"]
  },
  "outputs": [],
  "references": [],
  "assumptions": [],
  "limitations": [],
  "errors": []
}
```

**Build template library**: Maintain reusable patterns (40-60% token reduction)

---

## Master Checklist

### Execution

- [ ] Task list with dependencies created
- [ ] Model justified per task
- [ ] Parallel execution identified
- [ ] State files defined
- [ ] Cache strategy set

### Quality

- [ ] Purpose and audience stated
- [ ] Key message first (inverted pyramid)
- [ ] Plain language, active voice
- [ ] Consistent terminology
- [ ] Output format specified
- [ ] References documented with citation style
- [ ] Assumptions and limitations explicit
- [ ] Three-stage editing completed
- [ ] Visuals include captions, units, sources

---

**Standards Applied**: Plain Writing Act (2010), APA 7th Ed., ISO 21500, Economist Style Guide (2020), Elements of Style, Chicago Manual 17th Ed., COPE Guidelines (2019), Tufte principles, ISO 690, NNG (2019)
