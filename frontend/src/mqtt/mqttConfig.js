export const MQTT_BROKER_URL = import.meta.env.VITE_MQTT_BROKER_URL || 'ws://localhost:9001'

export const MQTT_TOPICS = {
  move: 'robot/move',
  camera: 'robot/camera',
  dispenserFeed: 'dispenser/feed',
  dispenserWater: 'dispenser/water',
  status: 'robot/status',
  sensor: 'robot/sensor',
}
