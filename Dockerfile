FROM node:20-alpine AS frontend-build

WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

COPY frontend ./

ARG VITE_API_BASE_URL
ARG VITE_WS_URL
ARG VITE_MQTT_BROKER_URL
ARG VITE_STREAM_URL=https://astonishing-wonder-production-a2e3.up.railway.app/
ARG VITE_VISION_FLIP_HORIZONTAL
ARG VITE_ESP32_SETUP_URL
ARG VITE_ESP32_MQTT_HOST
ARG VITE_GOOGLE_CLIENT_ID=1034586846978-d24vdc078j1ae041c1d77anqrc3s005j.apps.googleusercontent.com
ARG VITE_EMAILJS_SERVICE_ID=service_ys3gyas
ARG VITE_EMAILJS_TEMPLATE_ID=template_5517zca
ARG VITE_EMAILJS_PUBLIC_KEY=QpoSG0GYOKglql4ec

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_WS_URL=$VITE_WS_URL \
    VITE_MQTT_BROKER_URL=$VITE_MQTT_BROKER_URL \
    VITE_STREAM_URL=$VITE_STREAM_URL \
    VITE_VISION_FLIP_HORIZONTAL=$VITE_VISION_FLIP_HORIZONTAL \
    VITE_ESP32_SETUP_URL=$VITE_ESP32_SETUP_URL \
    VITE_ESP32_MQTT_HOST=$VITE_ESP32_MQTT_HOST \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_EMAILJS_SERVICE_ID=$VITE_EMAILJS_SERVICE_ID \
    VITE_EMAILJS_TEMPLATE_ID=$VITE_EMAILJS_TEMPLATE_ID \
    VITE_EMAILJS_PUBLIC_KEY=$VITE_EMAILJS_PUBLIC_KEY

RUN npm run build

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PORT=8000 \
    DATABASE_PATH=/tmp/aimyaong.sqlite3 \
    ORACLE_WALLET_DIR=/tmp/oracle_wallet \
    FRONTEND_DIST_DIR=/app/frontend/dist

WORKDIR /app

COPY backend/requirements.txt /app/backend/requirements.txt

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend /app/backend
COPY database /app/database
COPY --from=frontend-build /app/dist /app/frontend/dist

RUN chmod +x /app/backend/entrypoint.sh

WORKDIR /app/backend

EXPOSE 8000

ENTRYPOINT ["/app/backend/entrypoint.sh"]
CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --no-access-log"]
