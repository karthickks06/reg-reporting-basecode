from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Role, User
from app.security import get_password_hash

logger = logging.getLogger(__name__)

DEFAULT_ROLES = (
    ("Super User", "System owner with unrestricted local administration access."),
    ("Admin", "Administrator who can manage users and configuration."),
    ("Business Analyst", "Business analyst persona for requirements and gap analysis."),
    ("Developer", "Developer persona for SQL/XML generation workflows."),
    ("Reviewer", "Reviewer persona for validation and approval workflows."),
    ("Analyst", "General analyst user."),
    ("User", "Default authenticated user."),
)


def ensure_auth_seed_data(db: Session) -> dict:
    """Create default roles and the first local admin account when needed."""
    created_roles: list[str] = []
    for name, description in DEFAULT_ROLES:
        role = db.query(Role).filter(Role.name == name).first()
        if role:
            continue
        db.add(Role(name=name, description=description))
        created_roles.append(name)
    if created_roles:
        db.commit()

    users_exist = db.query(User.id).first() is not None
    admin_created = False
    if settings.auth_bootstrap_enabled and not users_exist:
        role = db.query(Role).filter(Role.name == "Super User").first()
        user = User(
            username=settings.auth_bootstrap_username,
            email=settings.auth_bootstrap_email,
            full_name="Local Administrator",
            hashed_password=get_password_hash(settings.auth_bootstrap_password),
            is_active=True,
            is_superuser=True,
            role_id=role.id if role else None,
        )
        db.add(user)
        db.commit()
        admin_created = True
        logger.warning(
            "Created bootstrap auth user username=%s. Change AUTH_BOOTSTRAP_PASSWORD before shared use.",
            settings.auth_bootstrap_username,
        )

    return {"created_roles": created_roles, "admin_created": admin_created}
