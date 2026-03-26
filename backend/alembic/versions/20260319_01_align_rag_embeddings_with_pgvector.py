"""Align rag chunk embedding storage with pgvector.

Revision ID: 20260319_01
Revises: 20260316_01
Create Date: 2026-03-19 02:30:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260319_01"
down_revision: Union[str, Sequence[str], None] = "20260316_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _embedding_udt_name() -> str | None:
    bind = op.get_bind()
    return bind.execute(
        sa.text(
            """
            SELECT udt_name
            FROM information_schema.columns
            WHERE table_name = 'rag_chunks' AND column_name = 'embedding'
            """
        )
    ).scalar_one_or_none()


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    udt_name = str(_embedding_udt_name() or "").lower()
    if udt_name and udt_name != "vector":
        op.execute(
            """
            ALTER TABLE rag_chunks
            ALTER COLUMN embedding
            TYPE vector(768)
            USING CASE
                WHEN embedding IS NULL THEN NULL
                ELSE embedding::vector
            END
            """
        )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_rag_chunks_project_id_source_ref
        ON rag_chunks (project_id, source_ref)
        """
    )
    # Only create ivfflat index if table has data
    # ivfflat requires training data and will fail on empty tables
    bind = op.get_bind()
    row_count = bind.execute(sa.text("SELECT COUNT(*) FROM rag_chunks")).scalar()
    if row_count and row_count >= 100:
        op.execute(
            """
            CREATE INDEX IF NOT EXISTS ix_rag_chunks_embedding_ivfflat
            ON rag_chunks USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 100)
            """
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute("DROP INDEX IF EXISTS ix_rag_chunks_embedding_ivfflat")
    op.execute("DROP INDEX IF EXISTS ix_rag_chunks_project_id_source_ref")
