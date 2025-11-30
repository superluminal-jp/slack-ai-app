import json


def lambda_handler(event, context):
    """
    Minimal Slack event handler for url_verification.

    Phase 2: Only handles Slack's url_verification challenge.
    No signature verification yet - that comes in Phase 5.
    """
    try:
        # Parse the incoming request body
        body = json.loads(event.get('body', '{}'))

        # Handle Slack's URL verification challenge
        if body.get('type') == 'url_verification':
            return {
                'statusCode': 200,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'challenge': body.get('challenge')})
            }

        # For any other event type, return 200 OK (will be handled in later phases)
        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'ok': True})
        }

    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': 'Internal server error'})
        }
