from fastapi import APIRouter, Request

from app.models.command import CommandResponse, FeedRequest, WaterRequest

router = APIRouter(prefix="/api/dispenser", tags=["dispenser"])


@router.post("/feed", response_model=CommandResponse)
def feed(payload: FeedRequest, request: Request):
    return request.app.state.feed_service.feed(payload.amount)


@router.post("/water", response_model=CommandResponse)
def water(payload: WaterRequest, request: Request):
    return request.app.state.feed_service.water(payload.amount)
