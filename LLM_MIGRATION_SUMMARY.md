# LLM Migration Summary: Azure OpenAI GPT-4.1 Exclusive

## Overview
All LLM calls in the application now use Azure OpenAI GPT-4.1 exclusively. The Axet Gateway fallback has been completely removed.

## Files Modified

### 1. **backend/app/llm_client.py**
**Changes:**
- Removed `resolve_gateway_model()`, `use_azure_openai()`, and `call_axet_gateway_chat()` functions
- Removed all Axet Gateway-related code and httpx client usage
- Modified `call_axet_chat()` to validate Azure OpenAI configuration and raise error if not configured
- All LLM calls now route exclusively through `call_azure_openai_chat()`
- The `model` parameter is now ignored - all calls use the configured Azure deployment

**Impact:** Every LLM operation in the application now uses Azure OpenAI GPT-4.1 with no fallback options.

### 2. **backend/app/config.py**
**Changes:**
- Removed `axet_llm_url`, `axet_llm_model`, and `axet_llm_verify_ssl` settings
- Updated Azure OpenAI configuration comment to indicate it's required (not optional)

**Impact:** Configuration is simplified to only Azure OpenAI settings.

### 3. **backend/.env.example**
**Changes:**
- Removed Axet Gateway configuration section
- Updated Azure OpenAI section to indicate it's required
- Removed AXET_LLM_URL, AXET_LLM_MODEL, and AXET_LLM_VERIFY_SSL

**Impact:** New installations will only configure Azure OpenAI.

### 4. **backend/app/services/runtime/probes.py**
**Changes:**
- Modified `probe_llm()` to check Azure OpenAI configuration instead of Axet Gateway
- Updated endpoint probing logic for Azure OpenAI
- Changed health check response to include `llm_endpoint` and `llm_deployment` (Azure-specific)
- Updated error messages to reference Azure OpenAI

**Impact:** Health checks now validate Azure OpenAI connectivity.

### 5. **backend/app/services/runtime/state.py**
**Changes:**
- Updated `build_troubleshooting_steps()` for "llm" topic
- Replaced Axet Gateway troubleshooting steps with Azure OpenAI guidance
- Added steps for verifying Azure credentials and deployment configuration

**Impact:** Error messages and troubleshooting now reference Azure OpenAI.

### 6. **AZURE_OPENAI_SETUP.md**
**Changes:**
- Updated documentation to reflect exclusive Azure OpenAI usage
- Removed all references to Axet Gateway fallback behavior
- Clarified that Azure OpenAI credentials are mandatory
- Updated troubleshooting section for Azure-specific issues

**Impact:** Documentation accurately reflects the new architecture.

## Services Using LLM

All these services now use Azure OpenAI GPT-4.1 exclusively:

1. **backend/app/routes/ba_routes.py**
   - Business Analyst gap analysis endpoints
   - Calls `call_axet_chat()` for AI-powered analysis

2. **backend/app/routes/system_routes.py**
   - System probe and test endpoints
   - Calls `call_axet_chat()` for LLM health checks

3. **backend/app/services/llm_service.py**
   - Core LLM service layer
   - Provides `call_llm_for_json()` and `call_llm_for_text()` wrappers
   - All calls route through `call_axet_chat()`

4. **backend/app/services/sql_generation_service.py** (indirect)
   - Uses `llm_service.py` for SQL generation

5. **backend/app/services/gap_service.py** (indirect)
   - Uses `llm_service.py` for gap analysis

6. **backend/app/services/xml_review_orchestration_service.py** (indirect)
   - Uses `llm_service.py` for XML contract review

7. **backend/app/services/functional_spec_service.py** (indirect)
   - Uses `llm_service.py` for functional spec analysis

## Migration Checklist

For existing deployments, follow these steps:

- [ ] Update `backend/.env` with Azure OpenAI credentials:
  ```bash
  AZURE_OPENAI_ENDPOINT=https://your-endpoint.openai.azure.com/
  AZURE_OPENAI_API_KEY=your-api-key
  AZURE_OPENAI_DEPLOYMENT=gpt-4.1
  AZURE_OPENAI_API_VERSION=2024-12-01-preview
  ```

- [ ] Remove old Axet Gateway settings from `.env` (if present):
  - AXET_LLM_URL
  - AXET_LLM_MODEL
  - AXET_LLM_VERIFY_SSL

- [ ] Rebuild backend container:
  ```powershell
  podman-compose build fca-api
  ```

- [ ] Restart services:
  ```powershell
  podman-compose up -d
  ```

- [ ] Verify Azure OpenAI is working:
  ```powershell
  podman logs fca-api | Select-String "Using Azure OpenAI GPT-4.1"
  ```

- [ ] Test LLM functionality with a gap analysis or SQL generation workflow

## Behavior Changes

### Before
- LLM client would check if Azure OpenAI was configured
- If configured: use Azure OpenAI
- If not configured: fall back to Axet Gateway
- Silent fallback behavior

### After
- LLM client validates Azure OpenAI configuration on every call
- If not configured: raise ValueError with clear error message
- No fallback options
- Explicit failure with actionable error messages

## Benefits

1. **Consistency**: All environments use the same LLM provider
2. **Simplicity**: No complex fallback logic or provider selection
3. **Reliability**: Azure OpenAI provides enterprise-grade SLA
4. **Cost Tracking**: Centralized billing through Azure
5. **Security**: Azure AD integration and managed credentials

## Testing Recommendations

After migration, test these workflows:

1. **Gap Analysis**
   - Upload functional spec
   - Run gap analysis
   - Verify LLM generates analysis correctly

2. **SQL Generation**
   - Complete gap analysis first
   - Generate SQL extraction script
   - Verify SQL is generated

3. **XML Review**
   - Upload XML contract
   - Run validation review
   - Verify LLM performs field validation

4. **Health Checks**
   - Check `/ready` endpoint
   - Verify LLM status shows as "configured" and "ok"

## Rollback Plan

If you need to revert these changes:

1. Restore backed up versions of modified files
2. Add back Axet Gateway settings to `.env`
3. Rebuild and restart containers

However, it's recommended to fix Azure OpenAI configuration issues rather than rolling back.

## Support

For issues:

1. Check logs: `podman logs fca-api`
2. Verify Azure credentials in Azure Portal
3. Review health check: `http://localhost:8000/ready`
4. Consult AZURE_OPENAI_SETUP.md for detailed troubleshooting

## Date
Migration completed: March 26, 2026
