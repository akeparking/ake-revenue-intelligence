FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/revenue-core/package.json apps/revenue-core/package.json
RUN npm ci --omit=dev --workspace @ake/contracts --workspace @ake/revenue-core --include-workspace-root=false \
    && npm cache clean --force

COPY packages/contracts/dist packages/contracts/dist
COPY apps/revenue-core/dist apps/revenue-core/dist

USER node
CMD ["node", "apps/revenue-core/dist/main.js"]
