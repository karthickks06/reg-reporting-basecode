import uuid

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import relationship

from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Role(Base):
    __tablename__ = "roles"

    id = Column(String(36), primary_key=True, default=_uuid)
    name = Column(String(80), unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    users = relationship("User", back_populates="role")


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=_uuid)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(80), unique=True, index=True, nullable=False)
    hashed_password = Column(Text, nullable=False)
    full_name = Column(String(255), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    is_superuser = Column(Boolean, nullable=False, default=False, server_default="false")
    role_id = Column(String(36), ForeignKey("roles.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    role = relationship("Role", back_populates="users")


class UserActivityLog(Base):
    __tablename__ = "user_activity_logs"

    id = Column(String(36), primary_key=True, default=_uuid)
    user_id = Column(String(36), index=True, nullable=True)
    username = Column(String(80), index=True, nullable=True)
    activity_type = Column(String(80), index=True, nullable=False)
    resource_type = Column(String(80), index=True, nullable=True)
    resource_id = Column(String(120), nullable=True)
    action = Column(String(255), nullable=False)
    action_details = Column(JSON, nullable=True)
    ip_address = Column(String(80), nullable=True)
    user_agent = Column(Text, nullable=True)
    status = Column(String(40), index=True, nullable=False, default="success")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
