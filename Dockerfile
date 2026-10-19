# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS frontend-build
WORKDIR /src/web
RUN corepack enable
COPY src/baikor-r-web/package.json src/baikor-r-web/pnpm-lock.yaml ./
COPY src/baikor-r-web/scripts/ ./scripts/
RUN pnpm install --frozen-lockfile
COPY src/baikor-r-web/ ./
RUN pnpm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS host-build
ARG VERSION=1.7.0
WORKDIR /src
COPY src/BaikorR.Core/BaikorR.Core.csproj src/BaikorR.Core/
COPY src/BaikorR.Host/BaikorR.Host.csproj src/BaikorR.Host/
RUN dotnet restore src/BaikorR.Host/BaikorR.Host.csproj
COPY src/BaikorR.Core/ src/BaikorR.Core/
COPY src/BaikorR.Host/ src/BaikorR.Host/
RUN dotnet publish src/BaikorR.Host/BaikorR.Host.csproj \
    --configuration Release \
    --output /app/publish \
    --no-restore \
    /p:Version=${VERSION} \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache krb5-libs
COPY --from=host-build /app/publish ./
COPY --from=frontend-build /src/web/dist ./wwwroot

ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

USER $APP_UID
ENTRYPOINT ["dotnet", "BaikorR.Host.dll"]
