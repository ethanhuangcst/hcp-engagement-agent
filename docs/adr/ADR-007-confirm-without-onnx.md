# ADR-007: Twin 确认保存与 Xenova/onnxruntime 解耦

## 状态
已采纳

## 背景
Docker `web` 镜像基于 `bookworm-slim`，未打包 `libonnxruntime`。确认保存路由若静态依赖 `@hca/medical-kb`（进而加载 `@xenova/transformers`），会在 merge-save（如多 OpenAlex 确认）时因缺原生库返回 500，尽管落库本身不需要 embedding。

## 决策
1. **确认路径不强制加载 transformers**：specialty 解析走 `@hca/medical-kb/specialty` 子路径导出；知识库 ingest 使用动态 `import`，失败则跳过并记录，不阻断 Twin 写入。
2. **Embedding 懒加载**：`packages/medical-kb` 内对 `@xenova/transformers` 延迟 `import`，避免无关路由在模块求值阶段拉起 onnx。
3. **Next 打包边界**：transpile `medical-kb`；将 transformers / onnx 相关包标为外部/不可静态打进 confirm 关键路径。
4. **部署预期**：slim web 镜像可不含 onnx；生产 RAG 灌库优先本机 `npm run`、配置 `EMBEDDING_BASE_URL`，或独立 worker。

## 原因
- Twin 落库是创建流程的关键路径；RAG ingest 是旁路增强，不应共享同一失败域。
- 为 slim 镜像捆绑完整 onnxruntime 会显著增大体积与构建复杂度，收益仅覆盖可选 ingest。
- 懒加载 + 子路径导出比「整包 medical-kb 进 confirm」更符合依赖边界。

## 后果
- Docker 内未配远程 embedding 时，确认后知识库可能仍为 pending/sparse，属预期。
- 调用方不得假设 `import "@hca/medical-kb"` 在无 onnx 环境一定成功。
- 说明见 `specs/9.deploy.md` 中 Web 镜像与 Twin 保存的注解。

## 日期
2026-07-23
