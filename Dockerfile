# Docker ile çalıştırmak isteyenler için (Railway, Fly.io, kendi sunucunuz).
FROM node:22-alpine
WORKDIR /app
COPY . .
RUN rm -rf data .env && mkdir -p /data && chown -R node:node /app /data
USER node
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
VOLUME /data
EXPOSE 3000
CMD ["npm", "start"]
