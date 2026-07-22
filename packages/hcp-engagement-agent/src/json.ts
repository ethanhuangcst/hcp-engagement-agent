import { agentError } from "./types.js";

export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1]?.trim() ?? text.trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw agentError("LLM_ERROR", "LLM 未返回 JSON 对象", {
      details: { preview: raw.slice(0, 200) },
      retryable: true,
    });
  }
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw agentError("LLM_ERROR", "LLM JSON 解析失败", {
      details: { preview: raw.slice(0, 200) },
      retryable: true,
    });
  }
}

export function extractJsonArray(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1]?.trim() ?? text.trim();
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      /* fall through to object wrapper */
    }
  }
  const obj = extractJsonObject(text);
  if (obj && typeof obj === "object" && "options" in obj) {
    return (obj as { options: unknown }).options;
  }
  throw agentError("LLM_ERROR", "LLM 未返回 options 数组", {
    details: { preview: raw.slice(0, 200) },
    retryable: true,
  });
}
