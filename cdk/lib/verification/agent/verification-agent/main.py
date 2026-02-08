"""
Verification Agent A2A Server — 公式契約のみの最小実装.

Amazon Bedrock AgentCore Runtime の A2A プロトコル契約に従い、以下だけを実装する。
- POST / : InvokeAgentRuntime のペイロードを受けるエントリポイント（@app.entrypoint）
- GET /.well-known/agent-card.json : Agent Card（Discovery）
- GET /ping : ヘルスチェック

ビジネスロジックは pipeline.run() に集約。公式ドキュメント:
- A2A protocol contract: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a-protocol-contract.html
- Service contract: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-service-contract.html
- Deploy A2A servers: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a.html
"""

import json

from starlette.responses import Response
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from agent_card import get_agent_card, get_health_status
from pipeline import run as run_pipeline, is_processing

app = BedrockAgentCoreApp()


def _json_response(data: dict) -> Response:
    """Return JSON response for GET routes (framework expects Response, not str)."""
    return Response(
        content=json.dumps(data),
        media_type="application/json",
    )


@app.route("/.well-known/agent-card.json", methods=["GET"])
def agent_card_endpoint(request=None):
    """A2A Agent Card for discovery (required by contract)."""
    return _json_response(get_agent_card())


@app.route("/ping", methods=["GET"])
def ping_endpoint(request=None):
    """Health check (required by contract)."""
    return _json_response(get_health_status(is_busy=is_processing))


@app.route("/", methods=["POST"])
async def a2a_root_handler(request):
    """A2A protocol: POST / (root) routes to SDK invocation handler.

    AWS A2A Service Contract requires POST / on port 9000.
    See: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-service-contract.html
    """
    return await app._handle_invocation(request)


@app.entrypoint
def handle_message(payload):
    """
    A2A entrypoint: InvokeAgentRuntime から渡されるペイロードをそのまま pipeline に渡す.

    payload は InvokeAgentRuntime のバイナリペイロードが JSON として渡された形。
    本プロジェクトでは {"prompt": "<JSON task_payload>"} を想定。
    """
    return run_pipeline(payload)


if __name__ == "__main__":
    # A2A protocol contract requires port 9000 (not SDK default 8080)
    app.run(port=9000)
