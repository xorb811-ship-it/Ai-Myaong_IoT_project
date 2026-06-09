import database.alerts
import database.clips
import database.detection_logs
import database.emergency_clips
import database.feed_logs
import database.oauth2_providers
import database.pet_health_reports
import database.pets
import database.settings
import database.user_credentials
import database.user_oauth_connections
import database.water_logs
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.core.security import create_access_token, decode_access_token, hash_password, verify_password
from app.models.auth import (
    AuthResponse,
    GoogleAuthRequest,
    LoginRequest,
    PetResponse,
    SetCredentialsRequest,
    SignupRequest,
    UpdateMeRequest,
    UserResponse,
)
from database.base import get_db
from database.oauth2_providers import OAuth2Provider
from database.pets import Pet
from database.user import User
from database.user_credentials import UserCredential
from database.user_oauth_connections import UserOAuthConnection


router = APIRouter(prefix="/api/auth", tags=["auth"])


def _username_for(user: User) -> str | None:
    return user.credential.username if user.credential else None


def _oauth_provider_for(user: User) -> str | None:
    if not user.oauth_connections:
        return None
    provider = user.oauth_connections[0].provider
    return provider.provider_name.lower() if provider else None


def _to_user_response(user: User) -> UserResponse:
    return UserResponse(
        user_id=user.user_id,
        username=_username_for(user),
        email=user.email,
        nickname=user.nickname,
        oauth_provider=_oauth_provider_for(user),
        pets=[PetResponse.model_validate(p) for p in user.pets],
    )


def _current_user(authorization: str | None, db: Session) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization token is required.")
    payload = decode_access_token(authorization.split(" ", 1)[1])
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid authorization token.")
    user = db.query(User).filter(User.user_id == int(payload["sub"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="User was not found.")
    return user


def _get_or_create_provider(db: Session, provider_name: str) -> OAuth2Provider:
    normalized = provider_name.upper()
    provider = db.query(OAuth2Provider).filter(OAuth2Provider.provider_name == normalized).first()
    if provider:
        return provider

    provider = OAuth2Provider(provider_name=normalized)
    db.add(provider)
    db.flush()
    return provider


@router.get("/check-username")
def check_username(username: str, db: Session = Depends(get_db)):
    value = username.strip()
    if not value:
        raise HTTPException(status_code=400, detail="Username is required.")

    exists = db.query(UserCredential).filter(UserCredential.username == value).first()
    return {"username": value, "available": exists is None}


@router.post("/signup", response_model=AuthResponse)
def signup(body: SignupRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=409, detail="Email is already in use.")
    if db.query(UserCredential).filter(UserCredential.username == body.username).first():
        raise HTTPException(status_code=409, detail="Username is already in use.")

    user = User(
        email=body.email,
        nickname=body.nickname,
    )
    db.add(user)
    db.flush()

    credential = UserCredential(
        user_id=user.user_id,
        username=body.username,
        password_hash=hash_password(body.password),
    )
    db.add(credential)

    for pet_data in body.pets:
        pet = Pet(
            user_id=user.user_id,
            name=pet_data.name,
            species=pet_data.species,
            breed=pet_data.breed,
            gender=pet_data.gender,
            birth_date=pet_data.birth_date,
            weight_kg=pet_data.weight_kg,
            height_cm=pet_data.height_cm,
            circumference=pet_data.circumference,
            leg_length=pet_data.leg_length,
        )
        db.add(pet)

    db.commit()
    db.refresh(user)

    token = create_access_token(user.user_id, user.email)
    return AuthResponse(access_token=token, user=_to_user_response(user))


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    credential = db.query(UserCredential).filter(UserCredential.username == body.username).first()
    if not credential or not verify_password(body.password, credential.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    user = credential.user
    token = create_access_token(user.user_id, user.email)
    return AuthResponse(access_token=token, user=_to_user_response(user))


@router.get("/me", response_model=UserResponse)
def me(authorization: str = Header(None), db: Session = Depends(get_db)):
    return _to_user_response(_current_user(authorization, db))


@router.patch("/me", response_model=UserResponse)
def update_me(body: UpdateMeRequest, authorization: str = Header(None), db: Session = Depends(get_db)):
    user = _current_user(authorization, db)

    if body.nickname is not None:
        user.nickname = body.nickname
    if body.email is not None and body.email != user.email:
        if db.query(User).filter(User.email == body.email, User.user_id != user.user_id).first():
            raise HTTPException(status_code=409, detail="Email is already in use.")
        user.email = body.email

    db.commit()
    db.refresh(user)
    return _to_user_response(user)


@router.post("/me/credentials", response_model=UserResponse)
def set_credentials(
    body: SetCredentialsRequest,
    authorization: str = Header(None),
    db: Session = Depends(get_db),
):
    user = _current_user(authorization, db)
    username = body.username.strip()

    if not username:
        raise HTTPException(status_code=400, detail="Username is required.")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    if user.credential:
        raise HTTPException(status_code=409, detail="Local login is already configured.")
    if db.query(UserCredential).filter(UserCredential.username == username).first():
        raise HTTPException(status_code=409, detail="Username is already in use.")

    credential = UserCredential(
        user_id=user.user_id,
        username=username,
        password_hash=hash_password(body.password),
    )
    db.add(credential)
    db.commit()
    db.refresh(user)
    return _to_user_response(user)


@router.delete("/me")
def delete_me(authorization: str = Header(None), db: Session = Depends(get_db)):
    user = _current_user(authorization, db)

    db.query(UserOAuthConnection).filter(UserOAuthConnection.user_id == user.user_id).delete()
    db.query(UserCredential).filter(UserCredential.user_id == user.user_id).delete()
    db.query(Pet).filter(Pet.user_id == user.user_id).delete()
    db.delete(user)
    db.commit()
    return {"ok": True}


@router.post("/google", response_model=AuthResponse)
def google_login(body: GoogleAuthRequest, db: Session = Depends(get_db)):
    provider = _get_or_create_provider(db, "GOOGLE")
    connection = (
        db.query(UserOAuthConnection)
        .filter(
            UserOAuthConnection.provider_id == provider.provider_id,
            UserOAuthConnection.provider_user_id == body.oauth_id,
        )
        .first()
    )
    user = connection.user if connection else None

    if not user:
        user = db.query(User).filter(User.email == body.email).first()
        if not user:
            if not body.allow_create:
                raise HTTPException(
                    status_code=404,
                    detail="No account is linked to this Google login. Please sign up first.",
                )
            user = User(
                email=body.email,
                nickname=body.name,
                profile_photo_path=body.picture,
            )
            db.add(user)
            db.flush()

        connection = UserOAuthConnection(
            user_id=user.user_id,
            provider_id=provider.provider_id,
            provider_user_id=body.oauth_id,
        )
        db.add(connection)
        db.commit()
        db.refresh(user)

    token = create_access_token(user.user_id, user.email)
    return AuthResponse(access_token=token, user=_to_user_response(user))
