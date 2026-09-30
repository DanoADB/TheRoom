import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ids = {
  dano: "da000000-0000-4000-8000-000000000001",
  april: "a9000000-0000-4000-8000-000000000002",
  isla: "151a0000-0000-4000-8000-000000000003",
  friday: "f71da000-0000-4000-8000-000000000004",
  room: "700a0000-0000-4000-8000-000000000001",
} as const;

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO_DATA !== "true") {
    console.log("Skipping demo seed in production. Set SEED_DEMO_DATA=true to opt in.");
    return;
  }

  const [dano, april, isla, friday, room] = await Promise.all([
    prisma.user.upsert({ where: { id: ids.dano }, update: { displayName: "Dano" }, create: { id: ids.dano, displayName: "Dano" } }),
    prisma.user.upsert({ where: { id: ids.april }, update: { displayName: "April" }, create: { id: ids.april, displayName: "April" } }),
    prisma.agent.upsert({ where: { id: ids.isla }, update: { displayName: "Isla" }, create: { id: ids.isla, displayName: "Isla" } }),
    prisma.agent.upsert({ where: { id: ids.friday }, update: { displayName: "Friday" }, create: { id: ids.friday, displayName: "Friday" } }),
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

  console.log(`Seeded ${room.name} with Dano, April, Isla, and Friday.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
