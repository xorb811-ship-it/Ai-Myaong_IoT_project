import database.oauth2_providers
import database.user_credentials
import database.user_oauth_connections
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List

from app.core.security import decode_access_token
from app.models.auth import PetCreate, PetResponse
from database.base import get_db
from database.user import User
from database.pets import Pet

router = APIRouter(prefix="/api/pets", tags=["pets"])

_PET_FIELDS = [
    "name", "species", "breed", "gender", "birth_date",
    "weight_kg", "height_cm", "circumference", "leg_length",
]


def _current_user(authorization: str, db: Session) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="인증 토큰이 없습니다.")
    payload = decode_access_token(authorization.split(" ", 1)[1])
    if not payload:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")
    user = db.query(User).filter(User.user_id == int(payload["sub"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    return user


@router.get("", response_model=List[PetResponse])
def list_pets(authorization: str = Header(None), db: Session = Depends(get_db)):
    user = _current_user(authorization, db)
    return [PetResponse.model_validate(p) for p in user.pets]


@router.post("", response_model=PetResponse)
def create_pet(body: PetCreate, authorization: str = Header(None), db: Session = Depends(get_db)):
    user = _current_user(authorization, db)
    pet = Pet(user_id=user.user_id, **{f: getattr(body, f) for f in _PET_FIELDS})
    db.add(pet)
    db.commit()
    db.refresh(pet)
    return PetResponse.model_validate(pet)


@router.patch("/{pet_id}", response_model=PetResponse)
def update_pet(pet_id: int, body: PetCreate, authorization: str = Header(None), db: Session = Depends(get_db)):
    user = _current_user(authorization, db)
    pet = db.query(Pet).filter(Pet.pet_id == pet_id, Pet.user_id == user.user_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="펫을 찾을 수 없습니다.")
    for f in _PET_FIELDS:
        v = getattr(body, f)
        if v is not None:
            setattr(pet, f, v)
    db.commit()
    db.refresh(pet)
    return PetResponse.model_validate(pet)


@router.delete("/{pet_id}")
def delete_pet(pet_id: int, authorization: str = Header(None), db: Session = Depends(get_db)):
    user = _current_user(authorization, db)
    pet = db.query(Pet).filter(Pet.pet_id == pet_id, Pet.user_id == user.user_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="펫을 찾을 수 없습니다.")
    db.delete(pet)
    db.commit()
    return {"ok": True}
