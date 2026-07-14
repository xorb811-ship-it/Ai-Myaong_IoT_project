FROM node:20-alpine AS frontend-build

WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

COPY frontend ./

ARG VITE_API_BASE_URL
ARG VITE_WS_URL
ARG VITE_MQTT_BROKER_URL
ARG VITE_STREAM_URL
ARG VITE_VISION_FLIP_HORIZONTAL
ARG VITE_ESP32_SETUP_URL
ARG VITE_ESP32_MQTT_HOST
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_EMAILJS_SERVICE_ID
ARG VITE_EMAILJS_TEMPLATE_ID
ARG VITE_EMAILJS_PUBLIC_KEY

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

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

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
