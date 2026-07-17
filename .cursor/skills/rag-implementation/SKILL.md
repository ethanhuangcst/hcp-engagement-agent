---
name: rag-implementation
description: |
  Build Retrieval-Augmented Generation (RAG) systems for LLM applications with
  vector databases and semantic search. Use when implementing medical-knowledge-base,
  dual-index academic/compliance retrieval, Qdrant hybrid search, ingest pipelines,
  or integrating LLMs with external knowledge in this repo. Keywords: RAG, Qdrant,
  embedding, BM25, rerank, LangGraph, retrieve_compliance, retrieve_academic.
---

# RAG Implementation

Master Retrieval-Augmented Generation (RAG) to build LLM applications that provide accurate, grounded responses using external knowledge sources.

## When to Use This Skill

- Building Q&A systems over proprietary documents
- Creating chatbots with current, factual information
- Implementing semantic search with natural language queries
- Reducing hallucinations with grounded responses
- Enabling LLMs to access domain-specific knowledge
- Building documentation assistants
- Creating research tools with source citation
- **本仓库**：实现 `packages/medical-kb`、双索引 ingest、Agent 检索 tools

## Core Components

### 1. Vector Databases

**Purpose**: Store and retrieve document embeddings efficiently

**Options:**

- **Pinecone**: Managed, scalable, serverless
- **Weaviate**: Open-source, hybrid search, GraphQL
- **Milvus**: High performance, on-premise
- **Chroma**: Lightweight, easy to use, local development
- **Qdrant**: Fast, filtered search, Rust-based — **本项目主推**
- **pgvector**: PostgreSQL extension — 本项目**业务主库为香港 Postgres**，向量仍用 Qdrant（不用 pgvector 作主向量库）

### 2. Embeddings

**Purpose**: Convert text to numerical vectors for similarity search

**Models (2026):**
| Model | Dimensions | Best For |
|-------|------------|----------|
| **BGE-M3** | — | **本项目首选**；中英混合 + sparse |
| **voyage-3-large** | 1024 | Claude apps (Anthropic recommended) |
| **text-embedding-3-large** | 3072 | OpenAI apps, high accuracy |
| **multilingual-e5-large** | 1024 | Multi-language support |

### 3. Retrieval Strategies

**Approaches:**

- **Dense Retrieval**: Semantic similarity via embeddings
- **Sparse Retrieval**: Keyword matching (BM25, TF-IDF)
- **Hybrid Search**: Combine dense + sparse with weighted fusion — **本项目标配**
- **Multi-Query**: Generate multiple query variations
- **HyDE**: Generate hypothetical documents for better retrieval

### 4. Reranking

**Purpose**: Improve retrieval quality by reordering results

**Methods:**

- **Cross-Encoders**: BERT-based reranking (ms-marco-MiniLM)
- **bge-reranker-v2-m3**: **本项目首选**
- **Cohere Rerank**: API-based reranking
- **Maximal Marginal Relevance (MMR)**: Diversity + relevance

## Quick Start with LangGraph

```python
from langgraph.graph import StateGraph, START, END
from langchain_anthropic import ChatAnthropic
from langchain_voyageai import VoyageAIEmbeddings
from langchain_pinecone import PineconeVectorStore
from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from langchain_text_splitters import RecursiveCharacterTextSplitter
from typing import TypedDict, Annotated

class RAGState(TypedDict):
    question: str
    context: list[Document]
    answer: str

# Initialize components
llm = ChatAnthropic(model="claude-sonnet-5")
embeddings = VoyageAIEmbeddings(model="voyage-3-large")
vectorstore = PineconeVectorStore(index_name="docs", embedding=embeddings)
retriever = vectorstore.as_retriever(search_kwargs={"k": 4})

# RAG prompt
rag_prompt = ChatPromptTemplate.from_template(
    """Answer based on the context below. If you cannot answer, say so.

    Context:
    {context}

    Question: {question}

    Answer:"""
)

async def retrieve(state: RAGState) -> RAGState:
    """Retrieve relevant documents."""
    docs = await retriever.ainvoke(state["question"])
    return {"context": docs}

async def generate(state: RAGState) -> RAGState:
    """Generate answer from context."""
    context_text = "\n\n".join(doc.page_content for doc in state["context"])
    messages = rag_prompt.format_messages(
        context=context_text,
        question=state["question"]
    )
    response = await llm.ainvoke(messages)
    return {"answer": response.content}

# Build RAG graph
builder = StateGraph(RAGState)
builder.add_node("retrieve", retrieve)
builder.add_node("generate", generate)
builder.add_edge(START, "retrieve")
builder.add_edge("retrieve", "generate")
builder.add_edge("generate", END)

rag_chain = builder.compile()

# Use
result = await rag_chain.ainvoke({"question": "What are the main features?"})
print(result["answer"])
```

## Detailed patterns and worked examples

Detailed pattern documentation lives in [`references/details.md`](./references/details.md). Read that file when the navigation tier above is insufficient.

---

## 本项目：medical-knowledge-base（必读锚点）

实现 RAG 时**以仓库规格为准**，勿另起「全科预灌」方案。

| 文档 | 内容 |
|------|------|
| `knowledge/rag-medical-knowledge-base/rag-architecture.md` | 双索引、Hybrid、LangGraph、合规 gate |
| `knowledge/rag-medical-knowledge-base/content-acquisition.md` | PubMed、RDPAC、指南来源 |
| `knowledge/rag-medical-knowledge-base/on-demand-ingest.md` | Twin 专科触发 ingest |
| `specs/3.architecture.md` §5.3、§6.2 | medical-kb 模块边界 |
| `specs/4.install-dependencies.md` §6 | Qdrant、BGE-M3、环境变量 |

### 已决架构（勿偏离 unless ADR）

```text
academic_index  ‖  compliance_index   （分库，禁止混索引）
Hybrid: BGE-M3 dense + BM25 → RRF (~0.7/0.3) → rerank → top-5
Twin specialty/themes → 按需 ingest（非全 PubMed 预灌）
retrieve_compliance：Agent 生成前强制，不可跳过
每条生成须带 academic_refs[] + compliance_refs[]
```

### 切块策略（医学 + 合规）

| 文档类型 | 切块 |
|----------|------|
| RDPAC / 合规 | 按条款号；payload 含 `clause_id` |
| 论文 | 摘要整段；全文按 section |
| 指南 | 按章节；标 `authority` |

### 与 Agent 衔接

- `hcp-engagement-agent` 通过 `retrieve_academic` / `retrieve_compliance` 调 medical-kb
- 合规无命中 → `compliance_gate` 降级或拒答敏感建议（见 `cn-hcp-compliance`）
