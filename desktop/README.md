# Desktop Vision Worker

This workspace is for the desktop-side robot worker.

Responsibilities:
- Receive the MJPEG stream from the Raspberry Pi camera service
- Run OpenCV or other desktop-side vision logic
- Publish robot movement and camera commands to MQTT

This folder is separate from the web frontend. The frontend is for user interaction, while this desktop worker is for automation, tracking, and higher-level control logic.

## Local Run

Windows `cmd` example:

```cmd
cd /d C:\Users\soldesk\Desktop\Ai-Myaong\desktop
python -m venv .venv
.venv\Scripts\activate.bat
pip install -r requirements.txt
python main.py
```

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed.
