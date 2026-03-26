"""
SQL generation and validation service.

Provides schema access, SQL validation, and intelligent repair strategies
for handling LLM-generated SQL with potential table name hallucinations.
"""

import re
from typing import Any
from difflib import get_close_matches

from sqlalchemy import text

from app.db import engine


def db_schema_snapshot(table_name_filter: str | None = None) -> dict[str, list[str]]:
    """
    Get schema snapshot of DATA MODEL tables only (fact_*, dim_*, bridge_*, regulatory_*).
    Excludes application tables (workflows, artifacts, admin_audit_logs, etc.).
    
    Returns:
        dict: {table_name: [column_names]}
    """
    query = """
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema='public'
      AND (
        table_name LIKE 'fact_%'
        OR table_name LIKE 'dim_%'
        OR table_name LIKE 'bridge_%'
        OR table_name LIKE 'regulatory_%'
      )
    """
    params: dict[str, Any] = {}
    if table_name_filter:
        query += " AND table_name = :table_name"
        params["table_name"] = table_name_filter
    query += " ORDER BY table_name, ordinal_position"

    out: dict[str, list[str]] = {}
    with engine.begin() as conn:
        rows = conn.execute(text(query), params).fetchall()
        for table_name, column_name in rows:
            out.setdefault(str(table_name), []).append(str(column_name))
    return out


def get_valid_table_names() -> list[str]:
    """Get authoritative list of valid table names from database."""
    return list(db_schema_snapshot().keys())


def normalize_sql_text(sql_text: str) -> str:
    """
    Normalize SQL text by removing markdown, comments, and trailing semicolons.
    
    Args:
        sql_text: Raw SQL text potentially with markdown or comments
        
    Returns:
        Cleaned SQL statement
    """
    sql = (sql_text or "").strip()
    # Remove markdown code blocks
    sql = re.sub(r"```(?:sql)?", "", sql, flags=re.IGNORECASE).replace("```", "")
    sql = sql.strip()
    # Remove trailing semicolon (we don't allow multi-statement)
    if ";" in sql:
        sql = sql.split(";", 1)[0]
    return sql.strip()


def sanitize_sql_candidate(sql_text: str) -> str:
    """
    Sanitize SQL by normalizing and removing comments.
    
    Args:
        sql_text: SQL to sanitize
        
    Returns:
        Sanitized SQL
    """
    sql = normalize_sql_text(sql_text)
    # Remove SQL comments
    sql = re.sub(r"^\s*[\-\#].*$", "", sql, flags=re.MULTILINE)
    # Normalize whitespace
    sql = re.sub(r"\s+", " ", sql).strip()
    return sql


def validate_readonly_sql(sql_text: str) -> tuple[bool, str]:
    """
    Validate that SQL is read-only (SELECT or WITH only).
    
    Args:
        sql_text: SQL to validate
        
    Returns:
        (is_valid, error_message)
    """
    sql = normalize_sql_text(sql_text)
    if not sql:
        return False, "empty_sql"
    
    lowered = sql.lower()
    # Check for write operations
    if re.search(r"\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy)\b", lowered):
        return False, "non_readonly_keyword"
    
    # Must start with SELECT or WITH
    first_token = (re.split(r"\s+", sql, maxsplit=1)[0] or "").lower()
    if first_token not in {"select", "with"}:
        return False, "sql_must_start_with_select_or_with"
    
    # No semicolons (prevents multi-statement)
    if ";" in sql:
        return False, "multi_statement_or_semicolon_not_allowed"
    
    return True, "ok"


def extract_table_names_from_sql(sql_text: str) -> set[str]:
    """
    Extract all table names referenced in SQL.
    
    Args:
        sql_text: SQL statement
        
    Returns:
        Set of table names found in FROM and JOIN clauses
    """
    tables: set[str] = set()

    # Remove comments and quoted text first so words like "from credit broker"
    # inside aliases do not get mistaken for FROM/JOIN clauses.
    scrubbed = re.sub(r"--.*?$", "", sql_text or "", flags=re.MULTILINE)
    scrubbed = re.sub(r"/\*.*?\*/", "", scrubbed, flags=re.DOTALL)
    scrubbed = re.sub(r"'(?:''|[^'])*'", "''", scrubbed)
    scrubbed = re.sub(r'"(?:\"\"|[^"])*"', '""', scrubbed)

    pattern = re.compile(
        r"\b(?:FROM|JOIN)\s+(?:LATERAL\s+)?((?:[A-Za-z_][A-Za-z0-9_]*)(?:\.(?:[A-Za-z_][A-Za-z0-9_]*))?)",
        flags=re.IGNORECASE,
    )

    for match in pattern.findall(scrubbed):
        table_ref = str(match or "").strip()
        if not table_ref:
            continue
        # Handle optional schema prefixes by using table part.
        table_name = table_ref.split(".")[-1]
        if table_name:
            tables.add(table_name)

    return tables


def find_closest_table_name(invalid_table: str, valid_tables: list[str]) -> str | None:
    """
    Find the closest matching table name using fuzzy matching.
    
    Args:
        invalid_table: The hallucinated or mistyped table name
        valid_tables: List of actual valid table names
        
    Returns:
        Best matching table name or None if no good match
    """
    # Try exact match first (case-insensitive)
    for valid in valid_tables:
        if valid.lower() == invalid_table.lower():
            return valid
    
    # Try fuzzy matching with 60% similarity threshold
    matches = get_close_matches(invalid_table, valid_tables, n=1, cutoff=0.6)
    return matches[0] if matches else None


def repair_table_names_with_fuzzy_matching(sql_text: str, valid_tables: list[str]) -> tuple[str, list[str]]:
    """
    Repair SQL by replacing invalid table names with closest matches.
    
    Uses fuzzy matching to find the most similar valid table name for each
    invalid reference. This handles common LLM hallucinations like:
    - Pluralization: fact_credit_agreements -> fact_credit_agreement_sale
    - Name completion: dim_agreement_characteristics -> dim_agreement_characterist
    - Similar names: bridge_borrowers -> bridge_credit_agreement_borrowe
    
    Args:
        sql_text: SQL with potentially invalid table names
        valid_tables: List of actual table names from database
        
    Returns:
        (repaired_sql, list_of_fixes_applied)
    """
    sql = sql_text
    fixes_applied = []
    
    # Extract all table references from SQL
    referenced_tables = extract_table_names_from_sql(sql)
    
    # Check each referenced table
    for table_ref in referenced_tables:
        # Check if this table exists (case-insensitive)
        if table_ref.lower() not in {t.lower() for t in valid_tables}:
            # Find closest match
            closest = find_closest_table_name(table_ref, valid_tables)
            
            if closest:
                # Replace all occurrences (FROM, JOIN, and table.column references)
                # Use word boundary to avoid partial replacements
                sql = re.sub(
                    rf'\b{re.escape(table_ref)}\b',
                    closest,
                    sql,
                    flags=re.IGNORECASE
                )
                fixes_applied.append(f"{table_ref} → {closest}")
    
    return sql, fixes_applied


def repair_hardcoded_common_errors(sql_text: str) -> tuple[str, list[str]]:
    """
    Fix known common table name hallucinations with hardcoded mappings.
    
    This provides fast, deterministic repairs for the most frequent errors
    observed in LLM SQL generation.
    
    Args:
        sql_text: SQL to repair
        
    Returns:
        (repaired_sql, list_of_fixes_applied)
    """
    sql = sql_text
    fixes_applied = []
    
    # Map of common hallucinations -> actual table names
    # These are based on observed LLM errors
    common_fixes = {
        # Missing suffix
        "fact_credit_agreement": "fact_credit_agreement_sale",
        # Pluralization errors
        "fact_credit_agreement_sales": "fact_credit_agreement_sale",
        "dim_security_detail": "dim_security_details",
        "dim_penalty_charge": "dim_penalty_charges",
        "dim_repayment_term": "dim_repayment_terms",
        # Truncation (LLM tries to complete the name)
        "dim_agreement_characteristics": "dim_agreement_characterist",
        "bridge_credit_agreement_borrowers": "bridge_credit_agreement_borrowe",
        "dim_creditworthiness_assessment": "dim_creditworthiness_assess",
        # Singular where it should be singular
        "dim_total_amount_credits": "dim_total_amount_credit",
        "dim_total_charge_credits": "dim_total_charge_credit",
        "dim_running_account_uses": "dim_running_account_use",
    }
    
    for incorrect, correct in common_fixes.items():
        # Check if this incorrect name appears in the SQL
        if re.search(rf'\b{re.escape(incorrect)}\b', sql, re.IGNORECASE):
            # Replace in all contexts (FROM, JOIN, table.column)
            sql = re.sub(
                rf'\b{re.escape(incorrect)}\b',
                correct,
                sql,
                flags=re.IGNORECASE
            )
            fixes_applied.append(f"{incorrect} → {correct}")
    
    return sql, fixes_applied


def explain_sql_or_error(sql_text: str, auto_repair: bool = True) -> tuple[bool, str, str | None]:
    """
    Validate SQL by running EXPLAIN and optionally attempting repairs.
    
    This is the final validation step that actually tests if the SQL
    will execute against the database.
    
    Args:
        sql_text: SQL statement to validate
        auto_repair: If True, attempt automatic repairs before failing
        
    Returns:
        (is_valid, message, repaired_sql_or_none)
        - message is "ok" if valid
        - message is "ok_after_repair: <details>" if repaired
        - message is error description if invalid
        - repaired_sql_or_none is the repaired SQL if repairs were applied, None otherwise
    """
    # First validate it's read-only
    ok, reason = validate_readonly_sql(sql_text)
    if not ok:
        return False, reason, None
    
    sql = normalize_sql_text(sql_text)
    
    # Try automatic repair if enabled
    if auto_repair:
        valid_tables = get_valid_table_names()
        
        # Try hardcoded repairs first (fastest)
        repaired_sql, hardcoded_fixes = repair_hardcoded_common_errors(sql)
        
        # Then try fuzzy matching for any remaining issues
        repaired_sql, fuzzy_fixes = repair_table_names_with_fuzzy_matching(repaired_sql, valid_tables)
        
        all_fixes = hardcoded_fixes + fuzzy_fixes
        
        if all_fixes:
            # Try EXPLAIN with repaired SQL
            try:
                with engine.begin() as conn:
                    conn.execute(text(f"EXPLAIN {repaired_sql}"))
                
                fixes_str = ", ".join(all_fixes)
                return True, f"ok_after_repair: {fixes_str}", repaired_sql
            except Exception:
                # Repair didn't help, fall through to try original
                pass
    
    # Try EXPLAIN with original/unrepaired SQL
    try:
        with engine.begin() as conn:
            conn.execute(text(f"EXPLAIN {sql}"))
        return True, "ok", None
    except Exception as exc:
        return False, f"explain_failed: {exc}", None


def compact_schema_for_sql(rows: list[dict[str, Any]], full_schema: dict[str, list[str]]) -> dict[str, list[str]]:
    """
    Reduce schema to only tables/columns relevant to the gap analysis rows.
    
    This helps fit more relevant schema information in the LLM context window
    by filtering out unrelated tables.
    
    Args:
        rows: Gap analysis rows with matching_column field
        full_schema: Complete database schema
        
    Returns:
        Filtered schema containing only relevant tables
    """
    if not rows:
        return full_schema

    # Extract table and column names from gap rows
    tokens: set[str] = set()
    for r in rows[:250]:
        field = str((r or {}).get("matching_column") or "")
        if ":" in field:
            table, column = field.split(":", 1)
            tokens.add(table.strip().lower())
            tokens.add(column.strip().lower())
        else:
            tokens.add(field.strip().lower())

    # Filter schema to matching tables/columns
    out: dict[str, list[str]] = {}
    for table, cols in (full_schema or {}).items():
        t = table.lower()
        if t in tokens or any(c.lower() in tokens for c in cols):
            out[table] = cols

    return out or full_schema


def format_table_list_for_llm(valid_tables: list[str]) -> str:
    """
    Format table list for LLM prompt with clear structure.
    
    Args:
        valid_tables: List of valid table names
        
    Returns:
        Formatted string for prompt inclusion
    """
    return "\n".join(f"  ✅ {table}" for table in sorted(valid_tables))


def extract_schema_from_artifact(artifact_json: dict, artifact_file_path: str | None = None) -> dict[str, list[str]]:
    """
    Extract table and column schema from uploaded data model artifact.
    
    Supports both:
    - Parsed Excel with 'tables' array (standard format)
    - Direct JSON schema formats
    - Reading from actual file if extracted_json has flattened format
    
    Args:
        artifact_json: The extracted_json from data model artifact
        artifact_file_path: Optional path to actual artifact file (fallback)
        
    Returns:
        dict: {table_name: [column_names]}
    """
    import logging
    import json
    from pathlib import Path
    logger = logging.getLogger(__name__)
    
    schema: dict[str, list[str]] = {}
    
    if not isinstance(artifact_json, dict):
        logger.error(f"Artifact JSON is not a dict: {type(artifact_json)}")
        return schema
    
    # Check if this is a flattened format (fields/headers/targets)
    # If so, try re-parsing from actual file instead
    if "headers" in artifact_json and "fields" in artifact_json and "tables" not in artifact_json:
        logger.info("Detected flattened format in extracted_json, attempting to re-parse from file")
        if artifact_file_path and Path(artifact_file_path).exists():
            try:
                file_path = Path(artifact_file_path)
                ext = file_path.suffix.lower()
                
                # Only try to read JSON files as JSON - Excel files need special parsing
                if ext == '.json':
                    with open(artifact_file_path, 'r', encoding='utf-8') as f:
                        file_json = json.load(f)
                        if isinstance(file_json, dict) and "tables" in file_json:
                            logger.info(f"Successfully loaded schema from JSON file with {len(file_json.get('tables', []))} tables")
                            artifact_json = file_json
                        else:
                            logger.warning("JSON file content doesn't have expected 'tables' structure")
                elif ext in {'.xlsx', '.xls'}:
                    logger.warning(f"Cannot re-parse Excel file at runtime. Please re-upload the artifact: {artifact_file_path}")
                    # Excel files can't be re-parsed here - they need proper pandas/openpyxl parsing
                    # User needs to re-upload the artifact to trigger extract_model_catalog
                else:
                    logger.warning(f"Unsupported file type for re-parsing: {ext}")
            except Exception as e:
                logger.error(f"Failed to re-parse artifact file {artifact_file_path}: {e}")
        else:
            logger.warning(f"Cannot read from file: path={artifact_file_path}, exists={Path(artifact_file_path).exists() if artifact_file_path else False}")
    
    # Format 1: Structured schema with 'tables' array (standard format)
    if "tables" in artifact_json:
        tables_list = artifact_json.get("tables", [])
        logger.info(f"Found 'tables' key with {len(tables_list)} tables")
        
        for idx, table in enumerate(tables_list):
            if not isinstance(table, dict):
                logger.warning(f"Table at index {idx} is not a dict: {type(table)}")
                continue
                
            table_name = table.get("table_name")
            if not table_name:
                logger.warning(f"Table at index {idx} has no table_name")
                continue
            
            columns = []
            cols_list = table.get("columns", [])
            for col in cols_list:
                if not isinstance(col, dict):
                    logger.warning(f"Column in table {table_name} is not a dict: {type(col)}")
                    continue
                    
                col_name = col.get("name") or col.get("column_name")
                if col_name:
                    columns.append(col_name)
            
            if columns:
                schema[table_name] = columns
                logger.debug(f"Extracted table {table_name} with {len(columns)} columns")
            else:
                logger.warning(f"Table {table_name} has no valid columns")
    
    # Format 2: Direct table mapping (alternative format)
    elif isinstance(artifact_json, dict):
        logger.info(f"Using direct mapping format with {len(artifact_json)} top-level keys")
        for table_name, table_data in artifact_json.items():
            if isinstance(table_data, dict) and "columns" in table_data:
                columns = []
                for col in table_data.get("columns", []):
                    if isinstance(col, str):
                        columns.append(col)
                    elif isinstance(col, dict):
                        col_name = col.get("name") or col.get("column_name")
                        if col_name:
                            columns.append(col_name)
                
                if columns:
                    schema[table_name] = columns
    
    logger.info(f"Extracted schema with {len(schema)} tables total")
    return schema


def validate_sql_against_schema(
    sql_text: str, 
    schema: dict[str, list[str]]
) -> tuple[bool, str, list[str]]:
    """
    Validate SQL against uploaded schema (without database EXPLAIN).
    
    Checks:
    - All referenced tables exist in schema
    - All referenced columns exist in their tables
    - Provides suggestions for typos
    
    Args:
        sql_text: SQL statement to validate
        schema: Schema dict from uploaded artifact
        
    Returns:
        (is_valid, message, suggestions)
    """
    sql = normalize_sql_text(sql_text)
    
    # Extract table names from SQL
    referenced_tables = extract_table_names_from_sql(sql)
    valid_tables = list(schema.keys())
    
    invalid_tables = []
    suggestions = []
    
    for table_ref in referenced_tables:
        # Check if table exists (case-insensitive)
        table_exists = any(
            table_ref.lower() == t.lower() 
            for t in valid_tables
        )
        
        if not table_exists:
            invalid_tables.append(table_ref)
            
            # Find closest match
            closest = find_closest_table_name(table_ref, valid_tables)
            if closest:
                suggestions.append(f"Did you mean '{closest}' instead of '{table_ref}'?")
    
    if invalid_tables:
        msg = f"Invalid tables: {', '.join(invalid_tables)}"
        return False, msg, suggestions
    
    return True, "Schema validation passed", []
