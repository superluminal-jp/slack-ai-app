# Canvas Feature Development Suspended

**Date**: 2025-12-06  
**Status**: 🚫 **Development Suspended**

## Reason for Suspension

Development of the Canvas feature has been suspended due to technical limitations with the Slack SDK.

**Primary Issue**:
- Slack SDK (`slack-sdk`) does not provide direct Canvas API methods
- Attempts to use `api_call("canvases.create", ...)` resulted in errors
- Error: `'WebClient' object has no attribute 'canvas_create'`

**Technical Challenges Encountered**:
1. **API Method Availability**: 
   - `canvases.create` API exists in Slack API documentation
   - However, `slack-sdk` Python library does not expose this method directly
   - `api_call()` method usage was attempted but encountered issues

2. **Document Content Format**:
   - Canvas API requires ProseMirror structured format for `document_content`
   - Markdown to ProseMirror conversion is complex
   - Basic structure was implemented but full markdown support requires significant work

3. **API Integration Complexity**:
   - Canvas API integration requires specific scopes (`canvases:write`)
   - API response format and error handling need extensive testing
   - Sharing Canvas in threads/channels requires additional API calls

## Current Implementation Status

### ✅ Completed Components

1. **Formatting Detection**: ✅ Implemented
   - `formatting_detector.py`: Detects structured formatting (headings, lists, code blocks, tables)
   - Threshold logic (2+ structural elements)

2. **Reply Routing**: ✅ Implemented
   - `reply_router.py`: Determines Canvas vs regular message based on length (>800 chars) and formatting

3. **Canvas Creator**: ⚠️ Partially Implemented
   - `canvas_creator.py`: Basic structure implemented
   - ProseMirror format conversion implemented
   - API call structure in place but not fully functional

4. **Canvas Sharer**: ⚠️ Partially Implemented
   - `canvas_sharer.py`: Basic structure implemented
   - Fallback to `chat.postMessage` implemented

5. **Handler Integration**: ⚠️ Partially Implemented
   - `handler.py`: Canvas creation logic integrated
   - Fallback to regular messages implemented
   - Error handling in place

### 🚫 Suspended Components

- Canvas API integration testing
- Markdown to ProseMirror full conversion
- Canvas sharing optimization
- E2E testing in Slack workspace

## Code Status

All Canvas-related code remains in the codebase but is **not actively used** due to:
- Handler integration includes fallback logic that prevents errors
- Canvas creation attempts fail gracefully and fall back to regular messages
- System continues to function normally with regular message posting

## Future Considerations

### Option 1: Wait for SDK Support
- Monitor `slack-sdk` updates for Canvas API support
- Revisit implementation when SDK adds Canvas methods

### Option 2: Alternative Implementation
- Use `files.upload` API for long content
- Use Block Kit for structured formatting
- Split long messages into multiple messages

### Option 3: Direct API Calls
- Use `requests` library to call Slack Canvas API directly
- Bypass `slack-sdk` limitations
- Requires manual authentication and error handling

## Files Modified

The following files contain Canvas-related code:

- `lambda/bedrock-processor/canvas_creator.py` - Canvas creation logic
- `lambda/bedrock-processor/canvas_sharer.py` - Canvas sharing logic
- `lambda/bedrock-processor/formatting_detector.py` - Formatting detection
- `lambda/bedrock-processor/reply_router.py` - Routing logic
- `lambda/bedrock-processor/handler.py` - Integration with fallback
- `lambda/bedrock-processor/tests/test_canvas_*.py` - Test files

## Decision

**Development is suspended until**:
1. Slack SDK adds native Canvas API support, OR
2. Alternative implementation approach is approved, OR
3. Direct API call implementation is prioritized

**Current behavior**: System falls back to regular messages for all replies, which is acceptable for production use.

