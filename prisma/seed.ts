import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();

const ids = {
  dano: "da000000-0000-4000-8000-000000000001",
  april: "a9000000-0000-4000-8000-000000000002",
  isla: "151a0000-0000-4000-8000-000000000003",
  friday: "f71da000-0000-4000-8000-000000000004",
  room: "700a0000-0000-4000-8000-000000000001",
  galleryProvenance: "6a110000-0000-4000-8000-000000000001",
  galleryReference: "6a110000-0000-4000-8000-000000000002",
} as const;

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO_DATA !== "true") {
    console.log("Skipping demo seed in production. Set SEED_DEMO_DATA=true to opt in.");
    return;
  }

  const productionSeed = process.env.NODE_ENV === "production";
  const islaToken = process.env.ISLA_API_TOKEN ?? (productionSeed ? undefined : "room_dev_isla_change_me");
  const fridayToken = process.env.FRIDAY_API_TOKEN ?? (productionSeed ? undefined : "room_dev_friday_change_me");
  const danoAccessCode = process.env.DANO_ACCESS_CODE ?? (productionSeed ? undefined : "room_dev_dano_change_me");
  const aprilAccessCode = process.env.APRIL_ACCESS_CODE ?? (productionSeed ? undefined : "room_dev_april_change_me");

  if (!islaToken || !fridayToken) {
    throw new Error("ISLA_API_TOKEN and FRIDAY_API_TOKEN are required when seeding production.");
  }

  const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

  const [dano, april, isla, friday, room] = await Promise.all([
    prisma.user.upsert({ where: { id: ids.dano }, update: { displayName: "Dano", ...(danoAccessCode ? { accessCodeHash: tokenHash(danoAccessCode) } : {}) }, create: { id: ids.dano, displayName: "Dano", accessCodeHash: danoAccessCode ? tokenHash(danoAccessCode) : null } }),
    prisma.user.upsert({ where: { id: ids.april }, update: { displayName: "April", ...(aprilAccessCode ? { accessCodeHash: tokenHash(aprilAccessCode) } : {}) }, create: { id: ids.april, displayName: "April", accessCodeHash: aprilAccessCode ? tokenHash(aprilAccessCode) : null } }),
    prisma.agent.upsert({ where: { id: ids.isla }, update: { displayName: "Isla", apiTokenHash: tokenHash(islaToken) }, create: { id: ids.isla, displayName: "Isla", apiTokenHash: tokenHash(islaToken) } }),
    prisma.agent.upsert({ where: { id: ids.friday }, update: { displayName: "Friday", apiTokenHash: tokenHash(fridayToken) }, create: { id: ids.friday, displayName: "Friday", apiTokenHash: tokenHash(fridayToken) } }),
    prisma.room.upsert({ where: { id: ids.room }, update: { name: "Isla + Friday" }, create: { id: ids.room, name: "Isla + Friday" } }),
  ]);

  await prisma.roomMembership.createMany({
    data: [
      { roomId: room.id, participantType: "HUMAN", userId: dano.id },
      { roomId: room.id, participantType: "HUMAN", userId: april.id },
      { roomId: room.id, participantType: "AGENT", agentId: isla.id },
      { roomId: room.id, participantType: "AGENT", agentId: friday.id },
    ],
    skipDuplicates: true,
  });

  await prisma.agentCuriosity.upsert({
    where: { agentId: isla.id },
    update: { interests: [{ topic: "gallery curation", why: "It helps Isla keep the room visually legible without overbuilding taxonomy.", nextQuestion: "What makes a gallery item feel relevant at a glance?", origin: "adjacent", strength: 4 }] },
    create: { agentId: isla.id, interests: [{ topic: "gallery curation", why: "It helps Isla keep the room visually legible without overbuilding taxonomy.", nextQuestion: "What makes a gallery item feel relevant at a glance?", origin: "adjacent", strength: 4 }] },
  });

  await prisma.agentGalleryItem.createMany({
    data: [
      { id: ids.galleryProvenance, agentId: isla.id, kind: "INITIAL", title: "Room provenance sketch", provenance: "Seeded as a small starting gallery item for Dano to browse immediately.", visualMeta: { medium: "note", accent: "amber" }, steerAway: false },
      { id: ids.galleryReference, agentId: isla.id, kind: "INTERNET_IMAGE", title: "Public gallery reference", provenance: "Curated from an internet image source as a lightweight example item.", imageUrl: "https://example.com/gallery-reference.jpg", visualMeta: { source: "internet", aspectRatio: "4:3" }, steerAway: true },
    ],
    skipDuplicates: true,
  });

  console.log(`Seeded ${room.name} with Dano, April, Isla, and Friday.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
