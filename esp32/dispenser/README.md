# ESP32 Dispenser

This sketch is for the standalone dispenser hardware.

- receives web/backend commands through MQTT
- `dispenser/feed` controls food output
- `dispenser/water` controls water output
- does not control the remote robot

Wi-Fi setup behavior:

- tries the saved SSID/password from ESP32 Preferences on boot
- starts the `ESP32_FEEDER_SETUP` access point if Wi-Fi fails
- serves setup UI and JSON APIs at `http://192.168.4.1`
- stores the MQTT broker host during Wi-Fi setup
- defaults to MQTT broker `10.1.82.103:1883`
- use the same real Wi-Fi SSID/password that the Raspberry Pi uses
- hold the setup button on GPIO0 for 3 seconds to clear saved Wi-Fi/MQTT settings and reopen setup mode

Shared Raspberry Pi / ESP32 Wi-Fi setup:

```bash
cd ~/Ai-Myaong_IoT_project
bash ./scripts/setup-raspberrypi-wifi.sh "Wi-Fi SSID" "Wi-Fi password"
```

The script connects the Raspberry Pi to the Wi-Fi, detects the Raspberry Pi Wi-Fi IP, writes that IP to `raspberrypi/.env`, updates the ESP32 sketch default MQTT host, and pushes the same settings to the ESP32 setup portal when `http://192.168.4.1` is reachable.

ESP32 recovery behavior:

- Wi-Fi credentials and MQTT host are stored in Preferences.
- New Wi-Fi settings are tested before replacing the old saved settings.
- If the new Wi-Fi connection fails, the previous SSID/password/MQTT host are restored.
- If saved Wi-Fi cannot connect on boot, the `ESP32_FEEDER_SETUP` AP setup mode starts.

Setup page:

- app route: `/wifi-setup`
- device AP page: `http://192.168.4.1`

Arduino library requirement:

- `PubSubClient`
