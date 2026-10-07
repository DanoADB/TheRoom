// Persist classifications, never arbitrary errors, stderr, prompts or credentials.
export type Diagnostic = { stage: string; kind: string; status?: number; exitCode?: number | null; signal?: string | null; code?: string };
export class ListenerFailure extends Error {
  constructor(public diagnostic: Diagnostic) { super(diagnostic.kind); }
}
// Retry only Room transport failures; never hide model/configuration or authentication failures.
export function retryableRoomFailure(diagnostic: Diagnostic): boolean {
  if (!diagnostic.stage.startsWith('room:')) return false;
  return diagnostic.kind === 'timeout'
    || ['ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(diagnostic.code ?? '')
    || (diagnostic.kind === 'http' && (diagnostic.status === 429 || (diagnostic.status ?? 0) >= 500));
}
export function safeFailure(error: unknown, stage: string): Diagnostic {
  if (error instanceof ListenerFailure) return error.diagnostic;
  const value = error as { name?: string; code?: string; cause?: { code?: string } } | null;
  const code = value?.cause?.code ?? value?.code;
  const allowed = ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ENOENT', 'EACCES', 'EPERM', 'UND_ERR_CONNECT_TIMEOUT'];
  return { stage, kind: value?.name === 'TimeoutError' || value?.name === 'AbortError' ? 'timeout' : 'unexpected', ...(code && allowed.includes(code) ? { code } : {}) };
}
export function stderrCategory(text: string): string | undefined {
  if (/usage limit|quota exceeded|rate limit|429/i.test(text)) return 'usage-limit';
  if (/unauthorized|authentication|401|login required/i.test(text)) return 'authentication';
  if (/unexpected argument|unknown feature|invalid config/i.test(text)) return 'configuration';
  if (/timed out|connection reset|failed to connect/i.test(text)) return 'network';
  return undefined;
}
