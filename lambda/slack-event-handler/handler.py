import json
import os
from slack_sdk import WebClient
from token_storage import store_token, get_token


def lambda_handler(event, context):
    """
    Slack event handler with token storage.

    Phase 4: Handles url_verification and event_callback.
    Stores token in DynamoDB on first event, retrieves from DynamoDB for subsequent events.
    Posts fixed message to Slack for message.im and app_mention events.
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

        # Handle event_callback (actual Slack events)
        if body.get('type') == 'event_callback':
            slack_event = body.get('event', {})
            event_type = slack_event.get('type')
            team_id = body.get('team_id')

            # Handle message and app_mention events
            if event_type in ['message', 'app_mention']:
                # Extract channel from event
                channel = slack_event.get('channel')

                # Get bot token from DynamoDB (with fallback to environment variable)
                bot_token = None
                if team_id:
                    bot_token = get_token(team_id)
                    if not bot_token:
                        # Fallback to environment variable
                        bot_token = os.environ.get('SLACK_BOT_TOKEN')
                        # Store token in DynamoDB for future use
                        if bot_token:
                            try:
                                store_token(team_id, bot_token)
                                print(f"Token stored for team {team_id}")
                            except Exception as e:
                                print(f"Error storing token: {str(e)}")
                else:
                    # Fallback to environment variable if no team_id
                    bot_token = os.environ.get('SLACK_BOT_TOKEN')

                # Fixed response message (AI not connected yet)
                response_text = "Hello! I received your message. (Echo mode - AI not connected yet)"

                # Post message to Slack
                if bot_token and channel:
                    client = WebClient(token=bot_token)
                    client.chat_postMessage(
                        channel=channel,
                        text=response_text
                    )
                    print(f"Posted fixed response to channel: {channel}")
                else:
                    print(f"Missing bot token or channel. Token exists: {bool(bot_token)}, Channel: {channel}")

        # Return 200 OK immediately (Slack expects quick acknowledgment)
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
