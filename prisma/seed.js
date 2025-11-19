// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Crea 2 fincas
  const a = await prisma.farm.upsert({
    where: { slug: 'farm-a' },
    update: {},
    create: { slug: 'farm-a', name: 'Finca A' },
  });

  const b = await prisma.farm.upsert({
    where: { slug: 'farm-b' },
    update: {},
    create: { slug: 'farm-b', name: 'Finca B' },
  });

  // Crea 2 devices ligados a esas fincas
  await prisma.device.upsert({
    where: { mdnsName: 'farma' },
    update: { farmId: a.id, name: 'Sensor Finca A' },
    create: { mdnsName: 'farma', name: 'Sensor Finca A', farmId: a.id },
  });

  await prisma.device.upsert({
    where: { mdnsName: 'farmb' },
    update: { farmId: b.id, name: 'Sensor Finca B' },
    create: { mdnsName: 'farmb', name: 'Sensor Finca B', farmId: b.id },
  });

  console.log('Seed OK');
}

main().finally(() => prisma.$disconnect());
