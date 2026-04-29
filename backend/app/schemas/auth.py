from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RoleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    username: str
    full_name: str | None = None
    role: RoleResponse | None = None
    is_active: bool = True
    is_superuser: bool = False
    created_at: datetime


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=80)
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str | None = None
    role: str | None = None


class UserUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=80)
    email: EmailStr | None = None
    full_name: str | None = None
    role: str | None = None
    password: str | None = None
    is_active: bool | None = None
    is_superuser: bool | None = None


class UserProfileUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = None


class UserSettingsUpdate(BaseModel):
    email_notifications: bool | None = None
    theme: str | None = None
    language: str | None = None
    timezone: str | None = None


class UserSettingsResponse(BaseModel):
    email_notifications: bool = True
    theme: str = "light"
    language: str = "en"
    timezone: str = "UTC"
    email: str | None = None
    username: str | None = None
    full_name: str | None = None


class ActivityLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str | None = None
    username: str | None = None
    activity_type: str
    resource_type: str | None = None
    resource_id: str | None = None
    action: str
    action_details: dict[str, Any] | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    status: str
    created_at: datetime | None = None
    timestamp: datetime | None = None
