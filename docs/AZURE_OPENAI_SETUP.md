# Azure OpenAI GPT-4.1 Configuration Guide

This guide explains how to configure the application to use Azure OpenAI GPT-4.1 exclusively for all LLM operations.

## Configuration Changes Made

### 1. Backend Configuration (`backend/app/config.py`)
Azure OpenAI settings (all Axet Gateway settings removed):
- `azure_openai_endpoint`: Azure OpenAI endpoint URL (required)
- `azure_openai_api_key`: Azure OpenAI API key (required)
- `azure_openai_deployment`: Deployment name (default: gpt-4.1)
- `azure_openai_api_version`: API version (default: 2024-12-01-preview)

### 2. LLM Client (`backend/app/llm_client.py`)
- **Uses Azure OpenAI exclusively** - no fallback options
- All LLM calls go through Azure OpenAI GPT-4.1
- Validates configuration on startup
- Maintains same response format for compatibility with existing services

### 3. Dependencies (`backend/requirements.txt`)
- Added `openai` package for Azure OpenAI SDK
- Removed httpx dependency for Axet Gateway

## Setup Instructions

### Step 1: Update Backend Environment File

Edit `backend/.env` (create from `backend/.env.example` if it doesn't exist):

```bash
# Azure OpenAI Configuration (Primary)
AZURE_OPENAI_ENDPOINT=https://agent-alm.cognitiveservices.azure.com/
AZURE_OPENAI_API_KEY=your_actual_api_key_here
AZURE_OPENAI_DEPLOYMENT=gpt-4.1
AZURE_OPENAI_API_VERSION=2024-12-01-preview
```

**Replace `your_actual_api_key_here` with your actual Azure OpenAI API key.**

### Step 2: Install Dependencies and Restart Services

Install the Python dependencies, then restart the backend:

```sh
cd backend
../.venv/Scripts/python -m pip install -r requirements.txt
../.venv/Scripts/python app.py
```

The backend launcher starts the API and worker together.

### Step 3: Verify Azure OpenAI is Being Used

Check the API logs to confirm Azure OpenAI is being used:

```sh
curl http://localhost:8000/ready
```

You should see log messages like:
```
Using Azure OpenAI for request_id=...
Azure OpenAI request start request_id=... deployment=gpt-4.1 endpoint=https://agent-alm.cognitiveservices.azure.com/
Azure OpenAI response received request_id=... model=gpt-4.1 usage=...
```

## How It Works

### Azure OpenAI Exclusive

The `call_axet_chat()` function now:

1. **Validates Azure OpenAI is configured** (both endpoint and API key required)
2. **Uses `AsyncAzureOpenAI` client exclusively** for all LLM operations
3. **Raises error if not configured** - no fallback behavior

### Code Flow

```python
# In llm_client.py
async def call_axet_chat(messages, request_id, model=None):
    # Validate configuration
    if not settings.azure_openai_endpoint or not settings.azure_openai_api_key:
        raise ValueError("Azure OpenAI credentials not configured")
    
    # All calls use Azure OpenAI GPT-4.1
    return await call_azure_openai_chat(messages, request_id)
```

**Note**: The `model` parameter is ignored - all calls use the configured Azure OpenAI deployment (gpt-4.1).

### Response Format

Azure OpenAI responses are converted to the same format as Axet Gateway responses, so all existing code continues to work without changes:

```json
{
  "id": "...",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-4.1",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 200,
    "total_tokens": 300
  }
}
```

## Features Used Across Application

The LLM is used in multiple services:

1. **SQL Generation** (`sql_service.py` via `llm_service.py`)
   - Generates SQL extraction scripts from gap analysis

2. **Gap Analysis** (`gap_service.py`)
   - Analyzes functional specs vs data models
   - Identifies mapping gaps

3. **XML Review** (`xml_review_orchestration_service.py`)
   - Reviews XML contracts for compliance
   - Validates field mappings

4. **Functional Spec Analysis** (`functional_spec_service.py`)
   - Extracts requirements from functional specifications

All these services will automatically use Azure OpenAI GPT-4.1 once configured.

## Configuration Options

### Temperature & Token Limits

Current settings in `llm_client.py`:
```python
response = await client.chat.completions.create(
    model=settings.azure_openai_deployment,
    messages=messages,
    temperature=0.7,      # Controls randomness (0-1)
    max_tokens=4096,      # Maximum response length
)
```

You can adjust these by modifying `backend/app/llm_client.py` if needed.

### Logging

Enable detailed payload logging in `.env`:
```bash
LLM_LOG_PAYLOAD=true
LLM_LOG_MAX_CHARS=2000
```

This logs full request/response payloads (useful for debugging).

## Error Handling

If Azure OpenAI is unavailable or credentials are invalid, the application will:

1. **On startup**: Mark LLM as "not configured" in health checks
2. **On API call**: Log the error with full details and raise an exception
3. **User experience**: Return clear error message indicating misconfiguration

**There is no fallback** - Azure OpenAI credentials are mandatory for LLM operations.

## Troubleshooting

### Error: "openai module not found"
**Solution**: Reinstall backend dependencies:
```sh
cd backend
../.venv/Scripts/python -m pip install -r requirements.txt
```

### Error: "Azure OpenAI authentication failed"
**Solution**: Verify your API key in `.env` is correct and has not expired.

### LLM calls failing with configuration error
**Solution**: Ensure both `AZURE_OPENAI_ENDPOINT` and `AZURE_OPENAI_API_KEY` are set in `backend/.env`.

### Check Azure OpenAI is being used
**Solution**: Look at the API terminal logs for `Using Azure OpenAI GPT-4.1`.

### Health check shows LLM not configured
**Solution**: Verify all Azure OpenAI environment variables are set correctly in `backend/.env`.

## Security Notes

1. **Never commit `.env` file** - It contains sensitive API keys
2. **Use environment-specific credentials** - Different keys for dev/prod
3. **Rotate keys regularly** - Azure Portal allows key regeneration
4. **Monitor usage** - Azure provides cost and usage dashboards

## Next Steps

After configuration:

1. Test SQL generation with a gap analysis workflow
2. Monitor Azure OpenAI usage in Azure Portal
3. Adjust temperature/tokens if needed for your use case
4. Set up cost alerts in Azure to monitor spending
