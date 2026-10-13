#!/bin/sh
cat > /usr/share/nginx/html/env.js <<JS
window.__ENV__ = { ANALYTICS_API_URL: "${ANALYTICS_API_URL:-}", GENERATOR_API_URL: "${GENERATOR_API_URL:-}" };
JS
