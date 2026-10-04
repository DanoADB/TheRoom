export const SESSION_ISLA_ID = "5c6a994f-00ab-4bc8-bbc8-5d33603939b4";
export type WakeMessage = { id: string; sequence: number; content: string; author: { id: string; displayName: string; type: string }; metadata?: unknown };
export function directlyAddressesIsla(message: WakeMessage, history: WakeMessage[] = []) {
  if (message.author.id === SESSION_ISLA_ID) return false;
  const metadata = message.metadata as Record<string, unknown> | undefined;
  if (metadata?.testRunId) return false;
  if (typeof metadata?.targetAgentId === "string") return metadata.targetAgentId === SESSION_ISLA_ID;
  if (typeof metadata?.inReplyTo === "string" && history.some(item => item.id === metadata.inReplyTo && item.author.id === SESSION_ISLA_ID)) return true;
  return /@isla\b(?!['’])|^(?:hey|hi|hello|oi)?\s*isla\b(?!['’])|\b(?:and|tell|ask)\s+isla\b(?!['’])/i.test(message.content.trim());
}
export function alreadyReplied(triggerId: string, history: WakeMessage[]) {
  return history.some(message => message.author.id === SESSION_ISLA_ID && (message.metadata as Record<string, unknown> | undefined)?.inReplyTo === triggerId);
}
export function safeContext(messages: WakeMessage[]) {
  return messages.slice(-35).map(({ id, sequence, author, content }) => ({ id, sequence, author, content: content.slice(0, 3000) }));
}
export function sharedRecordContext(records: unknown) {
  if (!Array.isArray(records)) return [];
  return records.filter(record => record && record.agentId === SESSION_ISLA_ID)
    .slice(0, 6).map(record => ({
      id: String(record.id ?? "").slice(0, 80),
      title: String(record.title ?? "").slice(0, 140),
      updatedAt: String(record.updatedAt ?? "").slice(0, 40),
      evidence: String(record.sourceMessage ?? "").slice(0, 2000),
    }));
}
