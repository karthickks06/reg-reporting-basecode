import json
import logging
import re
from typing import Any, Optional
from uuid import uuid4

from app.config import settings
from app.llm_client import call_axet_chat

logger = logging.getLogger("app.llm")


def extract_json_block(text: str) -> Optional[dict | list]:
    """
    Extract JSON from LLM response with markdown handling.
    
    Tries in order:
    1. Direct JSON parse (clean response)
    2. Extract from ```json markdown blocks
    3. Extract first complete JSON object/array with balanced braces
    4. Return None and log failure
    """
    if not text:
        logger.warning("extract_json_block: Empty input text")
        return None
    
    text = text.strip()
    
    # Try 1: Direct parse
    try:
        parsed = json.loads(text)
        logger.debug("extract_json_block: Direct parse successful")
        return parsed
    except json.JSONDecodeError:
        pass
    
    # Try 2: Markdown code blocks
    markdown_pattern = r'```(?:json)?\s*\n?(.*?)\n?```'
    matches = re.findall(markdown_pattern, text, re.DOTALL)
    
    for match in matches:
        try:
            parsed = json.loads(match.strip())
            logger.debug("extract_json_block: Extracted from markdown block")
            return parsed
        except json.JSONDecodeError:
            continue
    
    # Try 3: Find complete JSON objects (balanced braces)
    start_idx = text.find('{')
    if start_idx != -1:
        brace_count = 0
        for i, char in enumerate(text[start_idx:], start=start_idx):
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0:
                    try:
                        candidate = text[start_idx:i+1]
                        parsed = json.loads(candidate)
                        logger.debug("extract_json_block: Extracted balanced object")
                        return parsed
                    except json.JSONDecodeError:
                        break
    
    # Try 4: Find complete JSON arrays (balanced brackets)
    start_idx = text.find('[')
    if start_idx != -1:
        bracket_count = 0
        for i, char in enumerate(text[start_idx:], start=start_idx):
            if char == '[':
                bracket_count += 1
            elif char == ']':
                bracket_count -= 1
                if bracket_count == 0:
                    try:
                        candidate = text[start_idx:i+1]
                        parsed = json.loads(candidate)
                        logger.debug("extract_json_block: Extracted balanced array")
                        return parsed
                    except json.JSONDecodeError:
                        break
    
    # All methods failed
    logger.error(f"extract_json_block: All extraction methods failed. Text preview: {text[:200]}")
    return None


def validate_json_schema(data: Any, required_keys: list[str]) -> tuple[bool, list[str]]:
    """
    Validate JSON has required keys.
    
    Returns:
        (is_valid, missing_keys)
    """
    if not isinstance(data, dict):
        return False, ["root_must_be_object"]
    
    missing = [key for key in required_keys if key not in data]
    return len(missing) == 0, missing


def llm_content(resp: dict) -> str:
    """Extract the first assistant message content from a chat completion payload."""
    choices = (resp or {}).get("choices") or []
    if not choices:
        return ""
    msg = choices[0].get("message") or {}
    content = msg.get("content") or ""
    return str(content)


async def ask_llm_json(
    system_prompt: str,
    user_prompt: str,
    request_id: str | None = None,
    model: str | None = None,
) -> dict | list | None:
    """Call the LLM and parse the first structured JSON object or array it returns."""
    rid = request_id or f"llm-json-{uuid4()}"
    resp = await call_axet_chat(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        request_id=rid,
        model=model or settings.azure_openai_deployment,
    )
    txt = llm_content(resp)
    parsed = extract_json_block(txt)
    if isinstance(parsed, (dict, list)):
        return parsed
    return None


async def ask_llm_text(
    system_prompt: str,
    user_prompt: str,
    request_id: str | None = None,
    model: str | None = None,
) -> str:
    """Call the LLM and return plain assistant text without further parsing."""
    rid = request_id or f"llm-text-{uuid4()}"
    resp = await call_axet_chat(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        request_id=rid,
        model=model or settings.azure_openai_deployment,
    )
    return llm_content(resp).strip()
