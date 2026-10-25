FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
RUN npx playwright install --with-deps chromium
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/worker ./worker
RUN mkdir -p /app/.data && chown -R node:node /app/.data /root/.cache/ms-playwright && mv /root/.cache/ms-playwright /app/browsers
ENV PLAYWRIGHT_BROWSERS_PATH=/app/browsers HOST=0.0.0.0 PORT=4178
USER node
EXPOSE 4178
CMD ["npm", "start"]
