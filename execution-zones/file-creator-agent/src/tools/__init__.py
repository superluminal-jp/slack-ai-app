"""
File generation tools for Execution Agent (027).

Tools are registered via agent_factory and invoked by the Strands Agent when
the model decides to generate files. Each tool returns a description string and
stores GeneratedFile in ToolContext.invocation_state.
"""

__all__: list[str] = []
