import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

function argument(name: string) {
  const value = process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3).trim();
  if (!value) throw new Error(`--${name}=... is required.`);
  return value;
}

function fileArguments() {
  const files = process.argv
    .filter((item) => item.startsWith("--file="))
    .map((item) => item.slice("--file=".length).trim())
    .filter(Boolean);
  if (!files.length) throw new Error("At least one --file=... is required.");
  return files;
}

const prisma = new PrismaClient();

async function main() {
  const displayName = argument("agent");
  const filePaths = fileArguments();
  const documents = await Promise.all(filePaths.map((filePath) => readFile(filePath, "utf8")));
  const content = documents.map((document) => document.trim()).filter(Boolean).join("\n\n--- CONTINUITY ADDENDUM ---\n\n");
  if (!content) throw new Error("The profile file is empty.");

  const agent = await prisma.agent.findFirst({
    where: { displayName: { equals: displayName, mode: "insensitive" } },
    select: { id: true, displayName: true },
  });
  if (!agent) throw new Error(`Agent ${displayName} was not found.`);

  const existing = await prisma.agentProfile.findUnique({ where: { agentId: agent.id }, select: { version: true } });
  const profile = await prisma.agentProfile.upsert({
    where: { agentId: agent.id },
    create: { agentId: agent.id, content },
    update: { content, version: { increment: 1 } },
    select: { version: true },
  });

  console.log(`Imported private profile for ${agent.displayName} (version ${profile.version}, ${content.length} characters; previous version ${existing?.version ?? "none"}).`);
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
