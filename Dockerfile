# pslab 무인 데몬 — 24시간 호스팅용 이미지
# 빌드: docker build -t pslab .
# 실행: docker run --env-file .env -v $PWD/clients:/app/clients -v $PWD/data:/app/data pslab

# --- 1) 빌드 단계 (TypeScript → dist) ---
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

# --- 2) 실행 단계 (운영 의존성 + dist) ---
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# 한국 시간 기준으로 scheduleTimes(11:00, 19:00 등) 해석
ENV TZ=Asia/Seoul

# 운영 의존성만 설치 (optionalDependencies의 @anthropic-ai/sdk 포함, devDeps 제외)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 빌드 산출물과 설정표/예시 복사
COPY --from=build /app/dist ./dist
COPY clients ./clients

# 클라이언트 설정표와 사이클 이력은 볼륨으로 마운트하는 것을 권장
VOLUME ["/app/clients", "/app/data"]

# 무인 데몬 가동 (scheduleTimes에 맞춰 자동 발행)
CMD ["node", "dist/cli.js", "daemon"]
