require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');

const app = express();
const prisma = new PrismaClient();

app.use(cors());              // permite llamadas desde Expo
app.use(express.json());

app.get('/health', (_, res) => res.json({ ok: true }));

// --- FARMS ---
app.get('/farms', async (_, res) => {
  const farms = await prisma.farm.findMany({ orderBy: { name: 'asc' } });
  res.json(farms);
});

// --- REPORTS ---
app.get('/reports', async (req, res) => {
  const { farmId } = req.query;

  const where = farmId ? { farmId: String(farmId) } : {};
  const reports = await prisma.report.findMany({
    where,
    orderBy: { ts: 'desc' },
    take: 200, // límite razonable
  });

  res.json(reports);
});

// --- LATEST REPORT (útil para hero/dashboard) ---
app.get('/reports/latest', async (req, res) => {
  const { farmId } = req.query;
  const where = farmId ? { farmId: String(farmId) } : {};
  const r = await prisma.report.findFirst({
    where,
    orderBy: { ts: 'desc' },
  });
  res.json(r ?? null);
});

// --- TASKS (registro de labores) ---
const TaskSchema = z.object({
  farmId: z.string().min(1),
  type: z.enum(['siembra','riego','fertilizacion','maleza']),
  cost: z.number().nonnegative().default(0),
  notes: z.string().optional().default(''),
  ts: z.string().datetime().optional(), // si viene, lo usamos
});

app.post('/tasks', async (req, res) => {
  const parse = TaskSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Bad Request', issues: parse.error.flatten() });
  }
  const { farmId, type, cost, notes, ts } = parse.data;
  const task = await prisma.task.create({
    data: { farmId, type, cost, notes, ts: ts ? new Date(ts) : undefined },
  });
  res.status(201).json(task);
});

// --- seed mínimo si no hay farms ---
app.post('/dev/seed', async (_req, res) => {
  const count = await prisma.farm.count();
  if (count > 0) return res.json({ seeded: false });

  const farmA = await prisma.farm.create({ data: { name: 'Finca A', slug: 'farm-a' } });
  const farmB = await prisma.farm.create({ data: { name: 'Finca B', slug: 'farm-b' } });

  await prisma.report.createMany({
    data: [
      { farmId: farmA.id, soil_moisture: 31.2, soil_temp: 26.1, soil_ph: 6.4, light: 13500, air_humidity: 62, air_temp: 28.2 },
      { farmId: farmB.id, soil_moisture: 29.7, soil_temp: 27.0, soil_ph: 6.3, light: 17800, air_humidity: 58, air_temp: 29.1 },
    ]
  });

  res.json({ seeded: true });
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`API running on :${port}`));
