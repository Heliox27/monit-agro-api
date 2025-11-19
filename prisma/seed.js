// prisma/seed.js
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // crea una granja
  const farm = await prisma.farm.upsert({
    where: { id: 'seed-farm-a' },
    update: {},
    create: { id: 'seed-farm-a', name: 'Finca A (seed)', location: 'Estelí' },
  })

  // upsert del dispositivo por mdnsName
  const device = await prisma.device.upsert({
    where: { mdnsName: 'farma' },          // CLAVE: único
    update: { name: 'Sensor Finca A', farmId: farm.id },
    create: { mdnsName: 'farma', name: 'Sensor Finca A', farmId: farm.id },
  })

  // opcional: una lectura de sample
  await prisma.reading.create({
    data: {
      ts: new Date(),
      farmId: farm.id,
      deviceId: device.id,
      payload: {
        temp: 29.6, humAir: 61, humSuelo: 13,
        analisisIA: "Suelo seco – preparando riego",
        historial: ["17:12 → ESTRÉS HÍDRICO CRÍTICO!"]
      },
    },
  })

  console.log('Seed OK')
}

main().finally(() => prisma.$disconnect())
