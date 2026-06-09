import { MQTT_BROKER_URL } from './mqttConfig'

export function createMqttClient() {
  return {
    url: MQTT_BROKER_URL,
    connected: false,
    connect() {
      console.info(`[mqtt:placeholder] broker ${MQTT_BROKER_URL}`)
      this.connected = false
    },
  }
}
