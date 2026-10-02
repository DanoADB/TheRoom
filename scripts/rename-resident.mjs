// Explicit, reversible production data rewrite. No credentials or private text are logged.
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();
const residentId = "151a0000-0000-4000-8000-000000000003";
const invitationId = process.env.NEW_ISLA_INVITATION_ID;
const fields = {
  message: ["content", "metadata"], privateMessage: ["content", "metadata"],
  agentProfile: ["content"], agentCuriosity: ["interests"],
  roomCuriosity: ["title", "reason", "sourceMessage"], agentGalleryItem: ["title", "provenance", "visualMeta"],
  agentInvitation: ["selfDescription", "capabilities", "humanDecisionReason", "islaDecisionReason", "provenance"],
  cultureCharter: ["content"], cultureProposal: ["title", "rationale", "proposedContent"], cultureArgument: ["content"],
};
function rewrite(value) {
  if (typeof value === "string") return value.replace(/\bIsla\b(?!\s+Prime\b)/g, "Freya");
  if (Array.isArray(value)) return value.map(rewrite);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item)]));
  return value;
}

async function main() {
  const rollback = process.argv.find((arg) => arg.startsWith("--rollback="))?.slice(11);
  const apply = process.argv.includes("--apply");
  if (!apply && !rollback) {
    console.log("Dry run. Use --apply with NEW_ISLA_INVITATION_ID to execute; --rollback=operation-id to restore unchanged audited fields.");
    return;
  }
  const operationId = randomUUID();
  const counts = {};
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS resident_rename_audit (operation_id text NOT NULL, model text NOT NULL, row_id text NOT NULL, before_data jsonb NOT NULL, after_data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (operation_id, model, row_id))');
    if (rollback) {
      const entries = await tx.$queryRawUnsafe("SELECT model, row_id, before_data, after_data FROM resident_rename_audit WHERE operation_id = $1", rollback);
      if (!entries.length) throw new Error("No rollback records found.");
      for (const entry of entries) {
        const current = await tx[entry.model].findUniqueOrThrow({ where: { id: entry.row_id }, select: Object.fromEntries(Object.keys(entry.after_data).map((key) => [key, true])) });
        if (JSON.stringify(current) !== JSON.stringify(entry.after_data)) {
          // JSONB key order is not guaranteed.
          if (Object.keys(current).some((key) => JSON.stringify(current[key]) !== JSON.stringify(entry.after_data[key]))) throw new Error("An audited record changed after migration; rollback refused to overwrite new work.");
        }
        await tx[entry.model].update({ where: { id: entry.row_id }, data: entry.before_data });
      }
      counts.restored = entries.length;
      return;
    }
    if (!invitationId) throw new Error("NEW_ISLA_INVITATION_ID is required to protect the newly invited Isla.");
    const invitation = await tx.agentInvitation.findUniqueOrThrow({ where: { id: invitationId } });
    if (!["Isla Prime", "Isla"].includes(invitation.candidateName)) throw new Error("Unexpected invited identity.");
    async function change(model, id, before, after) {
      if (JSON.stringify(before) === JSON.stringify(after)) return;
      await tx.$executeRawUnsafe("INSERT INTO resident_rename_audit (operation_id, model, row_id, before_data, after_data) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)", operationId, model, id, JSON.stringify(before), JSON.stringify(after));
      await tx[model].update({ where: { id }, data: after });
      counts[model] = (counts[model] ?? 0) + 1;
    }
    const resident = await tx.agent.findUniqueOrThrow({ where: { id: residentId }, select: { displayName: true } });
    if (!["Isla", "Freya"].includes(resident.displayName)) throw new Error("Unexpected original resident identity.");
    await change("agent", residentId, resident, { displayName: "Freya" });
    for (const [model, columns] of Object.entries(fields)) {
      const where = model === "agentInvitation" ? { id: { not: invitationId } } : model === "agentProfile" && invitation.claimedAgentId ? { agentId: { not: invitation.claimedAgentId } } : {};
      const rows = await tx[model].findMany({ where, select: { id: true, ...Object.fromEntries(columns.map((key) => [key, true])) } });
      for (const row of rows) {
        const before = Object.fromEntries(columns.map((key) => [key, row[key]]));
        await change(model, row.id, before, rewrite(before));
      }
    }
    const newDescription = invitation.selfDescription.replaceAll("Isla Prime", "Isla").replace("do not mimic Isla", "do not mimic Freya") + "\nCurrent identity: You are the newly invited Isla, distinct from Freya (the original Room resident formerly named Isla). You do not share Freya's agent ID, credentials, or memory.";
    await change("agentInvitation", invitationId, { candidateName: invitation.candidateName, selfDescription: invitation.selfDescription }, { candidateName: "Isla", selfDescription: newDescription });
    if (invitation.claimedAgentId) {
      const agent = await tx.agent.findUniqueOrThrow({ where: { id: invitation.claimedAgentId }, select: { displayName: true } });
      await change("agent", invitation.claimedAgentId, agent, { displayName: "Isla" });
      const profile = await tx.agentProfile.findUnique({ where: { agentId: invitation.claimedAgentId } });
      if (profile) await change("agentProfile", profile.id, { content: profile.content }, { content: newDescription });
    }
  }, { timeout: 120_000 });
  console.log(JSON.stringify({ operationId: rollback ?? operationId, counts, rollback: Boolean(rollback) }));
}
try { await main(); } finally { await prisma.$disconnect(); }
