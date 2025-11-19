// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Fincas base
  const a = await prisma.farm.upsert({
    where: { slug: 'farm-a' },
    update: {},
    create: { name: 'Finca A', slug: 'farm-a' },
  });

  const b = await prisma.farm.upsert({
    where: { slug: 'farm-b' },
    update: {},
    create: { name: 'Finca B', slug: 'farm-b' },
  });

  // Un par de reportes de ejemplo para A
  await prisma.report.createMany({
    data: [
      {
        farmId: a.id,
        ts: new Date().toISOString(),
        soil_moisture: 31.2,
        soil_temp: 26.1,
        soil_ph: 6.4,
        light: 12000,
        air_humidity: 62,
        air_temp: 29.6,
        pump_status: false,
        sprinkler_status: false,
      },
      {
        farmId: a.id,
        ts: new Date(Date.now() - 3600_000).toISOString(),
        soil_moisture: 28.5,
        soil_temp: 25.8,
        soil_ph: 6.5,
        light: 9000,
        air_humidity: 58,
        air_temp: 28.9,
        pump_status: true,
        sprinkler_status: true,
      },
    ],
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); return prisma.$disconnect().finally(() => process.exit(1)); });
