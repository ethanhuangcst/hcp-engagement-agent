# ADR-014: 学术检索覆盖率信号与知识灌注的显式触发

日期：2026-10-21
状态：Accepted（修订 ADR-012 工具表，沿用 ADR-013 的修订先例）
关联：ADR-012（MCP 2.0 只做数据面）、ADR-013（幂等写先例）、MCP2-04（retrieve_academic）、MCP2-07（add_hcp 预灌对齐 + coverage 信号）、MCP2-08（ingest_academic）、F-WEB-039（Web 确认后触发预灌）

## 背景

对外 `retrieve_academic` 为纯读工具。当学术库没有目标专科知识时（如查询「糖尿病」而库内只有肾移植种子），检索返回低分近邻 chunk（实测 score 0.31–0.37，主题命中为 0.6+），调用方无从区分「命中稀疏」与「主题本身不相关」。

Web 侧已有自动扩充链路：Twin 确认保存（`POST /api/twins/confirm`）后 fire-and-forget 调用 `triggerKnowledgeIngest`，逐受控专科走 medical-kb `ingest_on_demand`（coverage 门控：ready 幂等跳过，否则异步 job 拉 PubMed/OpenAlex → corpus → embed → upsert），详情页轮询 `get_ingest_status` 可观测。MVP-4 验收口径明确「学术可 sparse」。

问题：不经网页的 MCP 调用方没有「Twin 确认」动作，拿不到预灌；`retrieve_academic` 返回体也没有覆盖率信号，稀疏不可见。

## 决策

1. **`retrieve_academic` 保持纯读，不内联补种**。`readOnlyHint: true` 不变。查询内同步补种被否决：补种耗时秒到分钟（嵌入 + 公开源拉取），会击穿查询时延；任意调用方查询词可直接驱动共享语料库写入，成本与投毒面不可控；读工具注解失真。
2. **返回体增加 coverage 信号**：`retrieve_academic` 返回 `{ chunks, coverage }`，`coverage` 复用 medical-kb `coverageCheck`（`status: ready | sparse` 与该专科 chunk 数，权威以 job/manifest 为准，对齐 F-RAG-017，不写 Twin 文档）。`status` 为 sparse 时附 `repair_hint`，建议调用 `ingest_academic` 补种后重试。信号为只读旁路，不阻塞、不写库。
3. **新增对外工具 `ingest_academic`（MCP2-08）**：入参 `specialty`（受控键）必填、`themes` 可选，透传 `ingest_on_demand`，立即返回 `{ job_id, knowledge_status }`；配套 `get_ingest_status`（jobId 或 specialty 查进度）。annotations：`readOnlyHint: false`（知识面幂等写，写的是知识库语料与 job 记录，非决策输出；同 ADR-013 对 ADR-012 的修订先例）、`openWorldHint: true`（公开源拉取）。同专科互斥沿用 `INGEST_IN_PROGRESS` 错误。
4. **`add_hcp` 预灌对齐（MCP2-07）**：写库成功后 fire-and-forget 按 Twin 专科触发知识预灌（与 Web confirm 的 `triggerKnowledgeIngest` 同语义），失败只记日志、不阻塞返回。MCP 调用方新增的 HCP 与 Web 确认的 HCP 获得同等的知识库覆盖。
5. **稀疏判定不自造阈值**：直接采用 `coverageCheck` 的 ready/sparse 结论，检索层与灌库层共用一个口径。

## 后果

- MCP 调用方可感知「命中稀疏」并显式补种；检索路径时延与注解不变。
- 对外工具集从五工具扩为七工具（`ingest_academic`、`get_ingest_status`）；ADR-012 工具表以本 ADR 为准。
- 测试新增契约：coverage 信号透出、sparse 建议 ingest、`ingest_academic` 透传与幂等、`add_hcp` 预灌不阻塞。
- 受控专科词表覆盖（当前仅 kidney_transplant / phage_therapy / down_syndrome，糖尿病等不在内）是独立缺口，本 ADR 不解决，需另行开条目扩充词表与 fixture。
