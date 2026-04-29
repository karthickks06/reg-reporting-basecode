from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: str = "local"
    api_port: int = 8000
    database_url: str = "postgresql+psycopg://fca_user:fca_pass@postgres:5431/fca_app"
    auto_create_schema: bool = True
    auto_apply_schema_patches: bool = True
    startup_probe_timeout_seconds: float = 3.0
    
    # Redis Configuration (Optional)
    redis_url: str = "redis://localhost:6379/0"
    require_redis: bool = False

    # Azure OpenAI Configuration (Required)
    azure_openai_endpoint: str = ""
    azure_openai_api_key: str = ""
    azure_openai_deployment: str = "gpt-4.1"
    azure_openai_api_version: str = "2024-12-01-preview"
    
    llm_log_payload: bool = False
    llm_log_max_chars: int = 1200
    app_log_level: str = "INFO"
    ba_log_payload: bool = False
    ba_log_max_chars: int = 1000
    embedding_dim: int = 768
    auto_backfill_rag_embeddings: bool = True
    rag_embedding_backfill_batch_size: int = 2000
    vector_store: str = "chroma"
    chroma_host: str = "chroma"
    chroma_port: int = 8000
    chroma_persist_dir: str = "/data/chroma"
    chroma_collection: str = "rag_chunks"
    admin_api_key: str = ""
    min_review_coverage_score: float = 80.0


settings = Settings()
