/** Audit events record actions, never credentials, including nested metadata. */
export function redactAuditMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAuditMetadata);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key,item]) => [
    key, /password|token|secret|authorization/i.test(key) ? "[REDACTED]" : redactAuditMetadata(item),
  ]));
}

export function redactStoredAuditMetadata(value: string | null): string | null {
  if (!value) return value;
  try { return JSON.stringify(redactAuditMetadata(JSON.parse(value))); }
  catch { return null; }
}
