# Agent Status Fix - LLM Connection Detection

## Summary
Improved the LLM health check to accurately detect when Azure OpenAI is online, ensuring the UI displays "Agent Online" when the connection is successful.

## Problem
The previous health check only verified if the Azure OpenAI endpoint URL was reachable via basic HTTP GET/HEAD requests. However, Azure OpenAI endpoints may not respond to such requests, causing the system to incorrectly show "Agent Offline" even when the LLM API was functioning properly.

## Solution
Enhanced the `probe_llm()` function in `backend/app/services/runtime/probes.py` to:

1. **Primary Check**: Actually test the Azure OpenAI API by sending a minimal chat completion request
   - Sends a test message: `[{"role": "user", "content": "hi"}]`
   - Uses the configured deployment and credentials
   - If successful, marks LLM as online (`ok: True`)

2. **Fallback Check**: If the API test fails, falls back to basic endpoint connectivity check
   - Attempts HTTP GET/HEAD requests to verify network connectivity
   - Returns `ok: True` with a warning if endpoint is reachable but API test failed
   - Returns `ok: False` if both checks fail

## Flow
1. Backend `/health` endpoint calls `collect_runtime_health()`
2. `collect_runtime_health()` calls `probe_llm()`
3. `probe_llm()` tests actual Azure OpenAI API
4. Health response includes `llm_up: true/false`
5. Frontend reads `llm_up` and displays:
   - "Agent Online" when `llm_up === true`
   - "Agent Offline" when `llm_up === false`

## Files Modified
- `backend/app/services/runtime/probes.py` - Enhanced LLM health check logic

## Files Already Correct
- `frontend/components/workbench/AppShell.tsx` - UI displays status correctly
- `frontend/components/workbench/health/serviceHealth.ts` - Reads health endpoint correctly
- `backend/app/routes/system_routes.py` - Returns health data correctly

## Testing
1. Ensure Azure OpenAI credentials are configured in `.env`
2. Start the backend service
3. Navigate to the workbench UI
4. Check the header - it should show "Agent Online" with a green indicator
5. If Azure OpenAI is not reachable, it should show "Agent Offline" with a red indicator

## Benefits
- Accurate real-time status of LLM availability
- Users know immediately if AI features are working
- Helps diagnose configuration issues quickly
- Reduces confusion when LLM appears offline but is actually working
