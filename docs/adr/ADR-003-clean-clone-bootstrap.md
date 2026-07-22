# ADR-003: 干净 clone 初始化失败的根因与文档边界

## 状态
已采纳

## 背景
从空目录 `git clone` 最新 `main` 后按「装依赖 → 起服务」初始化时，常见失败。复盘发现：

1. **`specs/4.install-dependencies.md` 已说明 Qdrant**：npm 客户端 `@qdrant/js-client-rest`、目录 `data/qdrant`、环境变量 `QDRANT_URL` / `VECTOR_BACKEND`、`npm run start:qdrant`（或 Docker）、`rag:seed-compliance`。Qdrant **不是**「规格漏写」导致的盲区。
2. **真正挡在第一步的是 `npm install` 原生二进制**，与 Qdrant 是否写进规格无关。

## 决策

### 失败分层（干净工作区）

| 层 | 现象 | 根因 |
|----|------|------|
| A. npm 安装 | `sharp` / libvips 超时或 Installation error | 传递依赖（Next.js、`@xenova/transformers`）的 postinstall 默认从 **GitHub** 拉原生包；国内网络常不可达。根 `.npmrc` 仅有 registry + `legacy-peer-deps`；npm 10+ 还会把未知的 `sharp_*` 配置标为 Unknown 而不生效 |
| B. 工作区包解析 | `Can't resolve '@hca/db'` 等 | 包 `exports` 指向 `dist/`，**不进 Git**；仅 `npm install` 不够，须 `npm run build`（或至少构建被 web 引用的包） |
| C. 运行时机密 | migrate / DB 连接失败 | `.env` gitignore；须 `cp .env.example .env` 并填真实 `DATABASE_URL` |
| D. 向量运行时 | RAG / health / seed 连不上 6333 | Qdrant **进程与二进制**不在仓库（`tools/qdrant/` gitignore）；`start:qdrant.sh` 从 **GitHub Releases** 下载二进制——与 A 同类网络风险。规格 §0 将其标为「可选」，README 本地启动甚至省略 Qdrant，易误判「装完 Node 即可」 |

### 文档边界

- **Qdrant 依赖说明**：以 `specs/4.install-dependencies.md`（§0、§1.1、§6、§11）为准；不因「初始化失败」再重复发明一套选型。
- **须补进安装叙事的非 Qdrant 决策**：把 **GitHub 托管的原生资产**（sharp/libvips、可选的 Qdrant 二进制）视为国内环境下的一等阻塞项；推荐可复现路径（如 `SHARP_DIST_BASE_URL` 指向 npmmirror、或 Docker 拉 `qdrant/qdrant` 镜像），写入规格 §11 / README，而不是只写 `npm install`。
- **README 与规格对齐**：产品最小路径（Twin + Postgres）可省略 Qdrant；若验收含 MVP-3/4 RAG，启动清单须显式包含 Qdrant +（可选）seed。

## 原因

- 规格已覆盖「要什么依赖、怎么起 Qdrant」；复盘若只怪「没写 Qdrant」会误导后续改文档方向。
- 干净目录失败的可复现主因是 **安装期外网原生下载** + **workspace 需编译产物** + **机密与可选运行时进程**；这些从读源码/规格不易一眼看出（尤其 sharp 变量名与 npm 10 行为）。
- 备选：把所有二进制 vendoring 进仓——体积与许可证成本高，不采纳为默认。

## 后果

- 新开发者 checklist：`.env` → `npm install`（必要时处理 sharp 镜像）→ `npm run build` → `db:migrate` →（RAG）`start:qdrant` + seed → MCP + web。
- 后续应在 `4.install-dependencies.md` §11 / README 增加「国内网络 / 原生依赖」短节（本 ADR 定责，具体文案可另 PR）。
- 禁止用 mock Qdrant/embedding 掩盖安装失败（与项目「真实连接」约束一致）。

## 日期
2026-07-20
