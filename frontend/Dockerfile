# Stage 1: stamp the build number into the page footer
FROM alpine:3.20 AS render
ARG BUILD_NUMBER=dev
COPY src/ /site/
RUN sed -i "s/__BUILD_NUMBER__/${BUILD_NUMBER}/g" /site/index.html

# Stage 2: serve the static files as a non-root user
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=render /site/ /usr/share/nginx/html/
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/login.html || exit 1