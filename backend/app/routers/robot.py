from fastapi import APIRouter, HTTPException, Request

from app.models.command import CameraRequest, CommandResponse, MoveRequest, RobotStatus
from app.services.local_serial import LocalSerialError

router = APIRouter(prefix="/api/robot", tags=["robot"])


@router.post("/move", response_model=CommandResponse)
def move_robot(payload: MoveRequest, request: Request):
    try:
        return request.app.state.robot_service.move(payload.command)
    except LocalSerialError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.post("/camera", response_model=CommandResponse)
def move_camera(payload: CameraRequest, request: Request):
    try:
        return request.app.state.robot_service.camera(payload.direction)
    except LocalSerialError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.get("/status", response_model=RobotStatus)
def robot_status(request: Request):
    return request.app.state.robot_service.status()


@router.get("/dashboard")
def dashboard(request: Request):
    return request.app.state.robot_service.dashboard()
