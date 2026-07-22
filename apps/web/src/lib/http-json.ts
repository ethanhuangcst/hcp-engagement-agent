/** Safe response.json() — Safari reports HTML/500 bodies as a vague SyntaxError. */
export async function readResponseJson<T = unknown>(
  res: Response,
): Promise<T> {
  const text = await res.text();
  if (!text) {
    throw new Error(
      res.ok
        ? "Empty response"
        : `HTTP ${res.status} (empty body)`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.replace(/\s+/g, " ").slice(0, 160);
    throw new Error(
      res.ok
        ? `Invalid JSON: ${snippet}`
        : `HTTP ${res.status}: ${snippet}`,
    );
  }
}
