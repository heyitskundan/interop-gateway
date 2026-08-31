FROM node:18-alpine AS build
WORKDIR /app
COPY . .
RUN npm install --workspaces --include-workspace-root=false --omit=dev=false \
 && npm run build -w packages/core -w packages/format-hl7v2 -w packages/format-cda \
      -w packages/protocol-mllp -w packages/protocol-http -w packages/protocol-file \
      -w packages/validate-us-core -w packages/engine

FROM node:18-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
WORKDIR /app/packages/engine
ENTRYPOINT ["node", "dist/cli.js", "run", "/config/pipeline.yaml"]
