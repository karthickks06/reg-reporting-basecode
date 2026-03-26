import logging
from typing import Any

from openai import AsyncAzureOpenAI

from app.config import settings


logger = logging.getLogger("app.llm_client")


async def call_azure_openai_chat(messages: list[dict[str, str]], request_id: str) -> dict[str, Any]:
    """Send a chat-completions request to Azure OpenAI and return raw JSON."""
    logger.info(
        "Azure OpenAI request start request_id=%s deployment=%s endpoint=%s messages=%d",
        request_id,
        settings.azure_openai_deployment,
        settings.azure_openai_endpoint,
        len(messages or []),
    )
    
    if settings.llm_log_payload:
        preview = str({"messages": messages})
        logger.info(
            "Azure OpenAI payload request_id=%s payload_preview=%s",
            request_id,
            preview[: settings.llm_log_max_chars],
        )
    
    try:
        client = AsyncAzureOpenAI(
            api_key=settings.azure_openai_api_key,
            api_version=settings.azure_openai_api_version,
            azure_endpoint=settings.azure_openai_endpoint,
        )
        
        response = await client.chat.completions.create(
            model=settings.azure_openai_deployment,
            messages=messages,
            temperature=0.7,
            max_tokens=4096,
        )
        
        logger.info(
            "Azure OpenAI response received request_id=%s model=%s usage=%s",
            request_id,
            response.model,
            response.usage.model_dump() if response.usage else None,
        )
        
        # Convert to same format as Axet gateway response
        data = {
            "id": response.id,
            "object": response.object,
            "created": response.created,
            "model": response.model,
            "choices": [
                {
                    "index": choice.index,
                    "message": {
                        "role": choice.message.role,
                        "content": choice.message.content,
                    },
                    "finish_reason": choice.finish_reason,
                }
                for choice in response.choices
            ],
            "usage": response.usage.model_dump() if response.usage else None,
        }
        
        if settings.llm_log_payload:
            out_preview = str(data)
            logger.info(
                "Azure OpenAI response parsed request_id=%s response_preview=%s",
                request_id,
                out_preview[: settings.llm_log_max_chars],
            )
        
        return data
        
    except Exception as exc:
        logger.exception("Azure OpenAI error request_id=%s error=%s", request_id, str(exc))
        raise


async def call_axet_chat(messages: list[dict[str, str]], request_id: str, model: str | None = None) -> dict[str, Any]:
    """
    Send a chat-completions request to Azure OpenAI GPT-4.1.
    
    This function is the main entry point for all LLM calls in the application.
    The 'model' parameter is ignored - all calls use the configured Azure OpenAI deployment.
    """
    if not settings.azure_openai_endpoint or not settings.azure_openai_api_key:
        logger.error("Azure OpenAI not configured. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY in .env")
        raise ValueError("Azure OpenAI credentials not configured. Check AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY environment variables.")
    
    logger.info("Using Azure OpenAI GPT-4.1 for request_id=%s", request_id)
    return await call_azure_openai_chat(messages, request_id)
