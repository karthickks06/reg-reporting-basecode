"""Chroma-backed vector storage for RAG chunks."""

from __future__ import annotations

import json
import logging
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)
_COLLECTION = None


def _enabled() -> bool:
    return str(getattr(settings, "vector_store", "chroma") or "").lower() == "chroma"


def _doc_id(project_id: str, source_ref: str) -> str:
    return f"{project_id}:{source_ref}"


def _source_bucket(source_ref: str) -> str:
    parts = str(source_ref or "").split(":")
    if len(parts) >= 3 and parts[0] in {"artifact", "dmf", "fcaf"}:
        return ":".join(parts[:2])
    return parts[0] if parts else ""


def _metadata(project_id: str, source_ref: str, metadata: dict[str, Any] | None) -> dict[str, Any]:
    raw = metadata or {}
    out: dict[str, Any] = {
        "project_id": str(project_id),
        "source_ref": str(source_ref),
        "source_bucket": _source_bucket(source_ref),
        "metadata_json": json.dumps(raw, sort_keys=True, default=str),
    }
    for key in ("kind", "artifact_id", "field", "ref"):
        value = raw.get(key)
        if value is not None:
            out[key] = str(value)
    return out


def _decode_metadata(value: dict[str, Any] | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        decoded = json.loads(str(value.get("metadata_json") or "{}"))
        return decoded if isinstance(decoded, dict) else {}
    except Exception:
        return {}


def _collection():
    global _COLLECTION
    if _COLLECTION is not None:
        return _COLLECTION
    if not _enabled():
        return None
    try:
        import chromadb
    except ImportError:
        logger.warning("Chroma vector store is enabled, but the chromadb package is not installed.")
        return None

    try:
        host = str(getattr(settings, "chroma_host", "") or "").strip()
        port = int(getattr(settings, "chroma_port", 8000) or 8000)
        if host:
            client = chromadb.HttpClient(host=host, port=port)
        else:
            client = chromadb.PersistentClient(path=str(settings.chroma_persist_dir))
        _COLLECTION = client.get_or_create_collection(
            name=str(settings.chroma_collection or "rag_chunks"),
            metadata={"hnsw:space": "cosine"},
        )
        return _COLLECTION
    except Exception as exc:
        logger.warning("Chroma vector store is unavailable: %s", exc)
        return None


def probe_chroma() -> dict[str, Any]:
    """Return runtime status for the configured Chroma vector store."""
    result = {
        "configured": _enabled(),
        "ok": False,
        "collection": str(settings.chroma_collection or "rag_chunks"),
    }
    if not _enabled():
        result["ok"] = True
        result["detail"] = "Chroma vector store is disabled."
        return result

    collection = _collection()
    if collection is None:
        result["detail"] = "Chroma collection is unavailable."
        return result

    try:
        result["count"] = int(collection.count())
        result["ok"] = True
        result["detail"] = "Chroma vector store is available."
    except Exception as exc:
        result["error"] = str(exc)
        result["detail"] = "Chroma vector store probe failed."
    return result


def upsert_rag_chunk(
    *,
    project_id: str,
    source_ref: str,
    text: str,
    embedding: list[float],
    metadata: dict[str, Any] | None = None,
) -> bool:
    """Upsert one RAG chunk into Chroma."""
    collection = _collection()
    if collection is None:
        return False
    try:
        collection.upsert(
            ids=[_doc_id(project_id, source_ref)],
            embeddings=[embedding],
            documents=[text],
            metadatas=[_metadata(project_id, source_ref, metadata)],
        )
        return True
    except Exception as exc:
        logger.warning("Chroma upsert failed source_ref=%s error=%s", source_ref, exc)
        return False


def delete_by_source_prefix(*, project_id: str, source_ref_prefix: str) -> bool:
    """Delete Chroma chunks by project and source reference prefix."""
    collection = _collection()
    if collection is None:
        return False
    try:
        matches = collection.get(where={"project_id": project_id}, include=["metadatas"])
        ids = []
        for item_id, metadata in zip(matches.get("ids", []), matches.get("metadatas", []), strict=False):
            if str((metadata or {}).get("source_ref") or "").startswith(source_ref_prefix):
                ids.append(item_id)
        if ids:
            collection.delete(ids=ids)
        return True
    except Exception as exc:
        logger.warning("Chroma delete failed project_id=%s prefix=%s error=%s", project_id, source_ref_prefix, exc)
        return False


def query_rag_chunks(
    *,
    project_id: str,
    query_embedding: list[float],
    limit: int,
    source_ref_prefix: str | None = None,
) -> list[dict[str, Any]]:
    """Query Chroma and return normalized result dictionaries."""
    collection = _collection()
    if collection is None:
        return []
    where: dict[str, Any] = {"project_id": project_id}
    if source_ref_prefix:
        where = {"$and": [{"project_id": project_id}, {"source_bucket": _source_bucket(source_ref_prefix)}]}
    try:
        raw = collection.query(
            query_embeddings=[query_embedding],
            n_results=max(1, int(limit)),
            where=where,
            include=["documents", "metadatas", "distances"],
        )
    except Exception as exc:
        logger.warning("Chroma query failed project_id=%s error=%s", project_id, exc)
        return []

    ids = (raw.get("ids") or [[]])[0]
    documents = (raw.get("documents") or [[]])[0]
    metadatas = (raw.get("metadatas") or [[]])[0]
    distances = (raw.get("distances") or [[]])[0]

    out: list[dict[str, Any]] = []
    for item_id, document, metadata, distance in zip(ids, documents, metadatas, distances, strict=False):
        source_ref = str((metadata or {}).get("source_ref") or "")
        if source_ref_prefix and not source_ref.startswith(source_ref_prefix):
            continue
        score = max(0.0, 1.0 - float(distance or 0.0))
        out.append(
            {
                "id": item_id,
                "source_ref": source_ref,
                "text": str(document or ""),
                "metadata": _decode_metadata(metadata),
                "score": round(score, 6),
                "strategy": "chroma",
            }
        )
        if len(out) >= limit:
            break
    return out
