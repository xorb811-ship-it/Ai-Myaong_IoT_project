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
    client = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "unknown"
    print(f"[ws] connected {client}; active={len(active_connections)}", flush=True)

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
            else:
                print(f"[ws] received from {client}: {data}", flush=True)
                await websocket.send_text(f"server: {data}")

    except WebSocketDisconnect as exc:
        print(
            f"[ws] disconnected {client}; code={exc.code}; reason={exc.reason or '-'}",
            flush=True,
        )
    except Exception as exc:
        print(f"[ws] error {client}: {type(exc).__name__}: {exc}", flush=True)
    finally:
        if websocket in active_connections:
            active_connections.remove(websocket)
        print(f"[ws] active={len(active_connections)}", flush=True)
