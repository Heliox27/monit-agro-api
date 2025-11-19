// src/server.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

app.use(express.json());

// Ping
app.get('/health', (_req, res) => res.json({ ok: true }));

// Lista de fincas
app.get('/farms', async (_req, res) => {
  try {
    const farms = await prisma.farm.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    });
    res.json(farms);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// Históricos (opcionalmente filtra por ?farmId=...)
app.get('/reports', async (req, res) => {
  try {
    const { farmId } = req.query;
    const where = farmId ? { farmId: String(farmId) } : {};
    const reports = await prisma.report.findMany({
      where,
      orderBy: { ts: 'desc' },
      take: 200,
    });
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// Crear labor (por si ya lo usas desde la app)
app.post('/tasks', async (req, res) => {
  try {
    const data = req.body || {};
    const created = await prisma.task.create({ data });
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`API ready on http://localhost:${PORT}`);
});
