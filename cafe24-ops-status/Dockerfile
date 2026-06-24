# ── 1) React 대시보드 빌드 ──────────────────────────────
FROM node:22-slim AS web
WORKDIR /web
COPY dashboard/package*.json ./
RUN npm ci
COPY dashboard/ ./
RUN npm run build

# ── 2) Python 런타임 (API + 정적 대시보드 서빙) ──────────
FROM python:3.11-slim
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY cafe24_ops/ ./cafe24_ops/
COPY api/ ./api/
COPY scripts/ ./scripts/
COPY config/ ./config/
COPY docker/ ./docker/
COPY pyproject.toml ./
COPY --from=web /web/dist ./dashboard/dist

EXPOSE 8000
ENV CAFE24_OPS_MODE=mock
ENTRYPOINT ["sh", "docker/entrypoint.sh"]
