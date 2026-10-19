# ADR-006: Compose 拉取 GHCR 制品，不本地 build 应用镜像

## 状态
已采纳

## 背景
首版 `docker-compose` 对 `web` / `hcp-twin-mcp` 使用本地 `build`。边缘机或缺构建依赖的环境拉依赖慢、失败率高，且与 CI 产物不一致。CI 已通过 GitHub Actions 将镜像推到 GHCR。

## 决策
1. **Compose 只 pull**：`web`、`hcp-twin-mcp` 使用
   `ghcr.io/ethanhuangcst/hcp-engagement-agent/{web,hcp-twin-mcp}:${IMAGE_TAG:-latest}`。
2. **Dockerfile 留给 CI**：`docker/Dockerfile.*` 由 `.github/workflows/docker-build.yml` 构建推送；日常部署不 `compose build`。
3. **Qdrant 仍官方镜像**；**MySQL 不进 compose**（托管库 + `.env` 的 `DATABASE_URL`）。
4. **本地开发**继续 `npm run` / Makefile `dev`；需要固定版本时用 `IMAGE_TAG=sha-…` 或 semver。

## 原因
- 部署机应消费已验证制品，而不是重复完整 monorepo 构建。
- 与「推 main → GHCR `latest`」的发布节奏一致，便于回滚到 `sha-*`。
- 缩小边缘环境对 npm / 原生依赖的暴露面。

## 后果
- 私有 GHCR 需 `docker login`；公开包可跳过。
- 改代码后须等 CI 推镜像（或本地 npm 调试），不能指望 `compose up --build` 反映未发布改动。
- 部署文档以 `specs/9.deploy.md` 与 README 的 pull 流程为准。

## 日期
2026-07-22
