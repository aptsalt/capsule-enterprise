# CAPSULE — Next.js app container (multi-stage)
FROM node:20-alpine AS base
WORKDIR /app

# --- deps ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
# Talk to the Ollama service (see docker-compose.yml). Override for a remote model.
ENV OLLAMA_URL=http://ollama:11434
ENV RELAY_OLLAMA_MODEL=qwen2.5-coder:14b
COPY --from=build /app ./
EXPOSE 3010
# package.json: "start": "next start -p 3010"
CMD ["npm", "run", "start"]
