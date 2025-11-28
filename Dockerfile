# build
FROM node:lts-alpine AS build-step

LABEL org.opencontainers.image.description="https://github.com/intro-skipper/segment-editor"

RUN npm config set legacy-peer-deps=true
RUN mkdir -p /app
RUN npm cache clear --force
WORKDIR /app
COPY package.json /app
RUN npm install
COPY . /app
RUN npm run build

# deploy
FROM nginx:alpine
COPY --from=build-step /app/dist/spa /usr/share/nginx/html

EXPOSE 80

STOPSIGNAL SIGTERM

CMD ["nginx", "-g", "daemon off;"]
