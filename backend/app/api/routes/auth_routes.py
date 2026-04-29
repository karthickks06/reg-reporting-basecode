from __future__ import annotations

from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_db
from app.config import settings
from app.models import Role, User, UserActivityLog
from app.schemas.auth import (
    ActivityLogResponse,
    LoginRequest,
    Token,
    UserCreate,
    UserProfileUpdate,
    UserResponse,
    UserSettingsResponse,
    UserSettingsUpdate,
    UserUpdate,
)
from app.security import create_access_token, get_current_user, get_password_hash, require_admin, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def _role_by_name(db: Session, role_name: str | None) -> Role | None:
    if not role_name:
        return db.query(Role).filter(Role.name == "User").first()
    role = db.query(Role).filter(Role.name == role_name).first()
    if not role:
        raise HTTPException(status_code=400, detail=f"Invalid role: {role_name}")
    return role


def _token_for_user(user: User) -> Token:
    role_name = user.role.name if user.role else None
    access_token = create_access_token(
        {
            "sub": user.id,
            "username": user.username,
            "role": role_name,
            "is_superuser": bool(user.is_superuser),
        },
        expires_delta=timedelta(minutes=settings.auth_access_token_expire_minutes),
    )
    return Token(access_token=access_token, token_type="bearer")


def _log_activity(
    db: Session,
    user: User | None,
    activity_type: str,
    action: str,
    request: Request | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    details: dict[str, Any] | None = None,
    status_value: str = "success",
) -> None:
    db.add(
        UserActivityLog(
            user_id=user.id if user else None,
            username=user.username if user else None,
            activity_type=activity_type,
            resource_type=resource_type,
            resource_id=resource_id,
            action=action,
            action_details=details or {},
            ip_address=request.client.host if request and request.client else None,
            user_agent=request.headers.get("user-agent") if request else None,
            status=status_value,
        )
    )


def _find_user_by_login(db: Session, username: str) -> User | None:
    return (
        db.query(User)
        .options(joinedload(User.role))
        .filter(or_(User.username == username, User.email == username))
        .first()
    )


@router.post("/token", response_model=Token)
def login_for_access_token(login_data: LoginRequest, request: Request, db: Session = Depends(get_db)) -> Token:
    user = _find_user_by_login(db, login_data.username)
    if not user or not verify_password(login_data.password, user.hashed_password):
        _log_activity(db, None, "login", "Failed login", request=request, details={"username": login_data.username}, status_value="failure")
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive")

    _log_activity(db, user, "login", "User logged in", request=request)
    db.commit()
    return _token_for_user(user)


@router.post("/login", response_model=Token)
def login_form(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> Token:
    return login_for_access_token(LoginRequest(username=form_data.username, password=form_data.password), request, db)


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, request: Request, db: Session = Depends(get_db)) -> User:
    existing = db.query(User).filter(or_(User.username == user_data.username, User.email == user_data.email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already registered")
    role = _role_by_name(db, user_data.role)
    user = User(
        username=user_data.username,
        email=str(user_data.email),
        full_name=user_data.full_name,
        hashed_password=get_password_hash(user_data.password),
        role_id=role.id if role else None,
        is_superuser=role.name == "Admin" if role else False,
    )
    db.add(user)
    db.flush()
    _log_activity(db, user, "register", "User registered", request=request, resource_type="user", resource_id=user.id)
    db.commit()
    db.refresh(user)
    return db.query(User).options(joinedload(User.role)).filter(User.id == user.id).first()


@router.get("/me", response_model=UserResponse)
def read_current_user(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/logout")
def logout(request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, str]:
    _log_activity(db, current_user, "logout", "User logged out", request=request)
    db.commit()
    return {"message": "Successfully logged out"}


@router.put("/profile", response_model=UserResponse)
def update_profile(
    updates: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    if updates.email is not None:
        duplicate = db.query(User).filter(User.email == str(updates.email), User.id != current_user.id).first()
        if duplicate:
            raise HTTPException(status_code=400, detail="Email already taken")
        current_user.email = str(updates.email)
    if updates.full_name is not None:
        current_user.full_name = updates.full_name
    db.commit()
    db.refresh(current_user)
    return db.query(User).options(joinedload(User.role)).filter(User.id == current_user.id).first()


@router.get("/settings", response_model=UserSettingsResponse)
def get_user_settings(current_user: User = Depends(get_current_user)) -> UserSettingsResponse:
    return UserSettingsResponse(email=current_user.email, username=current_user.username, full_name=current_user.full_name)


@router.put("/settings", response_model=UserSettingsResponse)
def update_user_settings(
    updates: UserSettingsUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserSettingsResponse:
    response = UserSettingsResponse(
        email_notifications=True if updates.email_notifications is None else updates.email_notifications,
        theme=updates.theme or "light",
        language=updates.language or "en",
        timezone=updates.timezone or "UTC",
        email=current_user.email,
        username=current_user.username,
        full_name=current_user.full_name,
    )
    _log_activity(db, current_user, "update_settings", "Updated settings", request=request, details=response.model_dump())
    db.commit()
    return response


@router.get("/activity", response_model=list[ActivityLogResponse])
def get_user_activity(
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[UserActivityLog]:
    return (
        db.query(UserActivityLog)
        .filter(UserActivityLog.user_id == current_user.id)
        .order_by(UserActivityLog.created_at.desc())
        .offset(skip)
        .limit(min(limit, 100))
        .all()
    )


@router.get("/admin/roles")
def admin_get_roles(_admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict[str, list[dict[str, str | None]]]:
    roles = db.query(Role).order_by(Role.name.asc()).all()
    return {"roles": [{"id": role.id, "name": role.name, "description": role.description} for role in roles]}


@router.get("/admin/users", response_model=list[UserResponse])
def admin_list_users(
    skip: int = 0,
    limit: int = 100,
    include_inactive: bool = False,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[User]:
    query = db.query(User).options(joinedload(User.role))
    if not include_inactive:
        query = query.filter(User.is_active.is_(True))
    return query.order_by(User.created_at.desc()).offset(skip).limit(min(limit, 1000)).all()


@router.post("/admin/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def admin_create_user(
    user_data: UserCreate,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> User:
    existing = db.query(User).filter(or_(User.username == user_data.username, User.email == str(user_data.email))).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already registered")
    role = _role_by_name(db, user_data.role)
    if role and role.name == "Super User":
        raise HTTPException(status_code=403, detail="Super User cannot be created from user management")
    user = User(
        username=user_data.username,
        email=str(user_data.email),
        full_name=user_data.full_name,
        hashed_password=get_password_hash(user_data.password),
        role_id=role.id if role else None,
        is_superuser=role.name == "Admin" if role else False,
    )
    db.add(user)
    db.flush()
    _log_activity(db, admin, "create", f"Created user '{user.username}'", request=request, resource_type="user", resource_id=user.id)
    db.commit()
    return db.query(User).options(joinedload(User.role)).filter(User.id == user.id).first()


@router.put("/admin/users/{user_id}", response_model=UserResponse)
def admin_update_user(
    user_id: str,
    updates: UserUpdate,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> User:
    user = db.query(User).options(joinedload(User.role)).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if updates.username is not None:
        duplicate = db.query(User).filter(User.username == updates.username, User.id != user_id).first()
        if duplicate:
            raise HTTPException(status_code=400, detail="Username already taken")
        user.username = updates.username
    if updates.email is not None:
        duplicate = db.query(User).filter(User.email == str(updates.email), User.id != user_id).first()
        if duplicate:
            raise HTTPException(status_code=400, detail="Email already taken")
        user.email = str(updates.email)
    if updates.full_name is not None:
        user.full_name = updates.full_name
    if updates.password is not None and updates.password.strip():
        if len(updates.password) < 8:
            raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
        user.hashed_password = get_password_hash(updates.password)
    if updates.role:
        role = _role_by_name(db, updates.role)
        if role and role.name == "Super User" and user.role and user.role.name != "Super User":
            raise HTTPException(status_code=403, detail="Super User role cannot be assigned from user management")
        user.role_id = role.id if role else None
        user.is_superuser = role.name == "Admin" if role else False
    if updates.is_active is not None:
        user.is_active = updates.is_active
    if updates.is_superuser is not None and (not user.role or user.role.name != "Super User"):
        user.is_superuser = updates.is_superuser
    _log_activity(db, admin, "update", f"Updated user '{user.username}'", request=request, resource_type="user", resource_id=user.id)
    db.commit()
    return db.query(User).options(joinedload(User.role)).filter(User.id == user.id).first()


@router.delete("/admin/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_user(
    user_id: str,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    user = db.query(User).options(joinedload(User.role)).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role and user.role.name == "Super User":
        raise HTTPException(status_code=403, detail="Super User cannot be deleted")
    user.is_active = False
    _log_activity(db, admin, "delete", f"Deleted user '{user.username}'", request=request, resource_type="user", resource_id=user.id)
    db.commit()
    return None


@router.get("/admin/activity", response_model=list[ActivityLogResponse])
def admin_get_activity(
    skip: int = 0,
    limit: int = 1000,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    rows = db.query(UserActivityLog).order_by(UserActivityLog.created_at.desc()).offset(skip).limit(min(limit, 5000)).all()
    return [
        {
            "id": row.id,
            "user_id": row.user_id,
            "username": row.username,
            "activity_type": row.activity_type,
            "resource_type": row.resource_type,
            "resource_id": row.resource_id,
            "action": row.action,
            "action_details": row.action_details,
            "ip_address": row.ip_address,
            "user_agent": row.user_agent,
            "status": row.status,
            "created_at": row.created_at,
            "timestamp": row.created_at,
        }
        for row in rows
    ]
