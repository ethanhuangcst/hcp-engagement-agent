# 数据回灌设计:生产 RAG 向量重建(OGT-5)

> 目标:把生产节点 Qdrant 从空集合补齐到与受控语料一致,恢复语料、manifest、向量三方一致。
> 执行件:[go-live-instruction.md](./go-live-instruction.md) Phase 3;本文是该 Phase 的设计与验收口径。
> 创建:2026-10-21,OGT-5,status.md 当前 OGT 表。

## 目标与范围

- 回灌对象:生产节点(野草云3 `38.55.192.140`)Qdrant 的 `academic_index` 与 `compliance_index`。
- 不需要回灌:MySQL。本机 `.env.local` 直连生产库(`38.55.199.241:3306/hca`),dev 阶段写入的业务数据已在线上,六表实测齐。
- 方式:经 SSH 隧道,用仓库受控语料在本机跑既有 seed CLI,向量写入生产 Qdrant,元数据写入生产 MySQL manifest。

## 事实基线(2026-10-21 实测)

| 数据面 | 本机 Qdrant | 生产 Qdrant | 受控语料(仓库) | 生产 manifest |
| --- | --- | --- | --- | --- |
| academic_index | 146 点 | (执行前)集合不存在 | 146 条(28 学科:26×5 + kidney_transplant 9 + phage_therapy 7;演示灌入的 PMID 已随语料入库,已提交) | 28 行,合计 146 |
| compliance_index | 24 点 | (执行前)集合不存在 | 23 条(rdpac 15 + cn_med_rep 8;`wc -l` 少计末行换行,真实记录数以 JSONL 行为准) | 2 行,合计 23 |
| MySQL 业务表 | 与生产同库 | 六表齐 | - | - |

本机向量与语料的真实差异(与初稿判断不同,以执行时实测为准):

- academic:本机 146 点与语料 146 条**完全一致**,无演示残留差异(kidney_transplant 9、phage_therapy 7 的「多出」点本就在已提交语料里)。
- compliance:本机多 1 个 `tenant-demo` 测试点(api.test.ts 租户隔离夹具,固定 UUID),语料本身干净。
- 生产 manifest 执行前的 146/23 与本机一致、与语料也一致,不存在初稿所述「manifest 与语料脱节」。

## 方案对比

| 方案 | 做法 | 生产结果 | 判定 |
| --- | --- | --- | --- |
| A 受控语料规范重灌 | SSH 隧道 + 既有 seed CLI,语料为唯一事实源 | academic 140、compliance 21,无残留 | 采用 |
| B Qdrant 快照搬运 | 本机建快照,节点恢复(两端同为 v1.14.1,技术可行) | 146 + 24,含 tenant-demo 测试点与陈旧点 | 拒绝:把测试残留灌进生产 |
| C scroll 逐点复制脚本 | 新写迁移脚本,逐点读本机写远端 | 同 B,外加脚本维护成本 | 拒绝:结果同 B,成本更高 |

选 A 的理由:

- 本机向量与语料仅差 1 个 tenant-demo 测试点,直接复制仍会把该测试点灌进生产;语料重灌则保证零测试残留。
- seed 幂等:向量按 pointId 覆盖,manifest 按 doc_id 覆盖。
- 重灌后语料、manifest、向量三面一致(146 / 23),消除「元数据说有、线上向量说无」的检索空转。

## 技术设计

前置条件:

1. go-live Phase 0.1 已提交语料;执行前用 JSONL 记录数(非 `wc -l`)对账:academic 146 条、compliance 23 条。
2. 嵌入模型本机已缓存(`Xenova/bge-small-zh-v1.5`),无需再下载。
3. 不改任何 `.env` 文件;实际执行方式为停本机 Qdrant、SSH 隧道占用 6333(见执行记录)。

步骤:

1. 开隧道(新终端保持运行):
   ```bash
   ssh -N -L 6334:127.0.0.1:6333 -o PubkeyAuthentication=no -o PreferredAuthentications=password root@38.55.192.140
   curl -s http://127.0.0.1:6334/collections   # 期望空集合
   ```
2. 本机项目根目录,进程内指向隧道:
   ```bash
   export QDRANT_URL=http://127.0.0.1:6334
   ```
3. 灌合规(分钟级,语料 21 行):
   ```bash
   npm run seed:compliance -w @hca/medical-kb
   ```
4. 灌学术(语料 146 条,免 PubMed 拉取;`--force` 必需,否则 manifest 已 ready 的学科全部 skip):
   ```bash
   npm run seed:academic-batch -w @hca/medical-kb -- --force --no-fetch
   ```
5. 若 seed 因空库 404 中止:先手动预建空集合(DEF-005 绕法,见执行记录),再重跑。

## 验收闸门

| # | 闸门 | 命令 | 期望 |
| --- | --- | --- | --- |
| G1 | 集合建立 | `curl -s http://127.0.0.1:6334/collections` | 恰好 2 个 collection |
| G2 | 向量数与语料一致 | 两个 `points/count`(`exact:true`) 对照语料 JSONL 记录数(注意 `wc -l` 会少计无末行换行的文件) | academic 146、compliance 23 |
| G3 | manifest 一致 | 生产库 `select index_name, count(*) n, sum(chunk_count) s from ingest_manifest group by index_name` | academic 28 行合计 146(kidney_transplant 9、phage_therapy 7)、compliance 2 行合计 23 |
| G4 | 全链路冒烟 | 生产 MCP2 `retrieve_academic`(王拥军,神经内科「卒中」) | 5 chunks ready,specialty 无串科(DEF-003 回归点) |

G1 到 G3 在隧道端口与生产库核对;G4 在 Portainer 部署完成后执行(同 go-live Phase 6 S4)。

## 回滚

- 灌种只新增集合,不改动既有数据。回滚即删除:
  ```bash
  curl -X DELETE http://127.0.0.1:6333/collections/academic_index
  curl -X DELETE http://127.0.0.1:6333/collections/compliance_index
  ```
- manifest 行保留:旧镜像不读该表,新镜像重灌时按 doc_id 幂等覆盖,无害。
- 隧道中途断开失败:seed 幂等,重跑即可,无部分态风险。

## 决策与风险

| 项 | 结论 |
| --- | --- |
| 不可逆性 | 无。新增集合可删,manifest 幂等覆盖。 |
| DEF-004(scroll offset 分页缺陷) | 灌种窗口无并发写,只读检索不触发;已知问题随 MKB2-04 修复,不阻塞本 OGT。 |
| 验收口径冲突 | 本文件与 go-live-instruction.md Phase 3 不一致时,以本文件为准(146 / 23)。 |
| 隧道窗口串写风险 | 隧道占用 6333 期间,本机一切读写 `.env.local` QDRANT_URL 的进程(含测试套件)都会打到生产。执行时实测发生一次:api.test.ts 的 tenant-demo 夹具点被写入生产,已定位删除。缓解:窗口内不跑测试,完成即拆隧道。 |

## 与其他文档的关系

- [go-live-instruction.md](./go-live-instruction.md) Phase 3 是执行步骤,已于 2026-10-21 执行完毕(见下方执行记录)。
- [env-changes.md](./env-changes.md) §1.2 记录了「manifest 与向量脱节」的根因分析,本文给出修复方案。
- rag 模块规格(stories / tests / design)不受影响:回灌使用既有已规格化的 seed CLI,无新代码、无新产品行为。

## 执行记录(2026-10-21,OGT-5)

G1–G3 已执行并通过;G4 待 Portainer 部署后执行。

| 闸门 | 结果 |
| --- | --- |
| G1 | 2 个 collection(academic_index、compliance_index) |
| G2 | academic 146 点 = 语料 146 条;compliance 23 点 = 语料 23 条;逐科分布与语料一致(kidney_transplant 9、phage_therapy 7,其余 26 科各 5) |
| G3 | manifest:academic 28 行合计 146、compliance 2 行合计 23,与向量、语料三面一致 |
| 附加 | 隧道窗口期混入的 tenant-demo 测试点已删除(见决策表);31 个 seed job 全部 ready(phage_therapy 两行卡 running 的账本已按实测置 ready) |

执行中发现并绕过的缺陷(待登记 issues-log,编号建议 DEF-005):

- `seed-compliance.ts` 顺序自锁:先跑 `health` 预检(probe 要求集合已存在),后跑 `ensureDualCollectionsWithProbe` 建集合。空库上 health 永远 404,seed 永远中止,集合永远建不成。本机从未触发是因为本地集合一直存在;`seed-academic-batch.ts` 顺序正确(先 ensure 后 health,代码注释已点名此防御)。
- 执行绕法:手动预建两个空集合(SDK `createCollection`,dim 512、Cosine,与 `ensureCollections` 参数一致),health 即通过。

执行方式与设计差异(实际操作记录):

- `loadRootEnv` 对 `.env.local` 强制 override,进程内 `export QDRANT_URL` 无效;实际方案为停本机 Qdrant、SSH 隧道(`ssh -N -L 127.0.0.1:6333:127.0.0.1:6333`)直接占用 6333,seed 零改动。执行期间另一会话自动重启了本机 Qdrant 抢占端口,已识别并再次停用;完成后已重启本机 Qdrant(146 / 24 原数据完好)。
- 学术批次实际命令:`npm run seed:academic-batch -w @hca/medical-kb -- --force --no-fetch`(`--force` 必需,否则 ready 学科全部 skip;语料已含全部数据,无需 PubMed 拉取)。