# 웹소켓 확인용 (추후 삭제예정)

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(prefix="/ws", tags=["websocket"])

active_connections: list[WebSocket] = []


async def broadcast(message: str):
    """연결된 모든 클라이언트에게 전송"""
    for connection in active_connections:
        await connection.send_text(message)


@router.websocket("/connect")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    print(f"✅ 연결 | 현재 {len(active_connections)}명")

    try:
        while True:
            data = await websocket.receive_text()
            print(f"📨 수신: {data}")
            await websocket.send_text(f"서버 응답: {data}")

    except WebSocketDisconnect:
        active_connections.remove(websocket)
        print(f"❌ 끊김 | 현재 {len(active_connections)}명")