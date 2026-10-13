#!/bin/sh
# Базовый URL API задаётся при старте контейнера — один образ на все стенды.
cat > /usr/share/nginx/html/env.js <<JS
window.__ENV__ = { API_BASE_URL: "${API_BASE_URL:-}" };
JS
