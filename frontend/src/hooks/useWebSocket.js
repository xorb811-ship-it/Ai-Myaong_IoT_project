import { useEffect, useRef, useState } from "react";

export function useWebSocket(url) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const wsRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);
    ws.onmessage = (e) => setLastMessage(e.data);
    ws.onclose = () => setIsConnected(false);

    return () => ws.close();
  }, [url]);

  const send = (message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(message);
    }
  };

  return { isConnected, lastMessage, send };
}
