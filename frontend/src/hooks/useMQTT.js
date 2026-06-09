import { useEffect, useState } from 'react'
import { createMqttClient } from '../mqtt/mqttClient'

export function useMQTT() {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const client = createMqttClient()
    client.connect()
    setConnected(client.connected)
  }, [])

  return { connected }
}
