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

// seguridad básica con token (opcional, pero útil)
const INGEST_TOKEN = process.env.INGEST_TOKEN || 'demo-token';

// El ESP32 (o un bridge) podrá hacer POST /ingest
// Body esperado: { farmSlug, temp, humAir, humSuelo, bomba, auto, potencia, min, max, analisisIA, historial: [ "...", ... ] }
app.post('/ingest', async (req, res) => {
  try {
    if ((req.headers['x-api-key'] || '') !== INGEST_TOKEN) {
      return res.status(401).json({ error: 'no-auth' });
    }

    const {
      farmSlug,
      temp, humAir, humSuelo, bomba, auto, potencia, min, max, analisisIA,
    } = req.body || {};

    if (!farmSlug) return res.status(400).json({ error: 'farmSlug required' });

    const farm = await prisma.farm.findUnique({ where: { slug: farmSlug } });
    if (!farm) return res.status(404).json({ error: 'farm not found' });

    const created = await prisma.report.create({
      data: { farmId: farm.id, temp, humAir, humSuelo, bomba, auto, potencia, min, max, analisisIA },
    });

    // marca actividad de algún device de esa finca (si quieres)
    await prisma.device.updateMany({
      where: { farmId: farm.id },
      data: { lastSeen: new Date() },
    });

    res.status(201).json(created);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// === PULLER: trae datos del ESP32 cada 6s y guarda ===
const PULL_MS = 6000;

// Node 18+ ya tiene fetch global
async function pullOnceForDevice(device) {
  if (!device.mdnsName) return;

  // Intentos por mDNS y por última IP conocida
  const candidates = [
    `http://${device.mdnsName}.local/datos`,
    device.lastIp ? `http://${device.lastIp}/datos` : null,
  ].filter(Boolean);

  for (const url of candidates) {
    try {
      const res = await fetch(url, { timeout: 3000 });
      if (!res.ok) continue;
      const d = await res.json();

      // Guarda lectura
      await prisma.report.create({
        data: {
          farmId: device.farmId,
          temp: Number(d.temp),
          humAir: Number(d.humAir),
          humSuelo: Number(d.humSuelo),
          bomba: !!d.bomba,
          auto: !!d.auto,
          potencia: Number(d.potencia) || null,
          min: Number(d.min) || null,
          max: Number(d.max) || null,
          analisisIA: String(d.analisisIA || ''),
        },
      });

      // Actualiza IP y lastSeen
      const ip = (res.headers.get('x-forwarded-for') || '').split(',')[0]?.trim();
      await prisma.device.update({
        where: { id: device.id },
        data: { lastSeen: new Date(), lastIp: ip || device.lastIp },
      });

      console.log(`Pull OK ${device.name} via ${url}`);
      return;
    } catch (e) {
      // sigue con el siguiente candidate
    }
  }
  // Si ninguno respondió, no pasa nada (simulador cubrirá si activas)
}

// Loop principal del puller
async function startPuller() {
  const devices = await prisma.device.findMany({ where: { active: true } });
  setInterval(async () => {
    for (const dev of devices) {
      pullOnceForDevice(dev).catch(() => {});
    }
  }, PULL_MS);
}

startPuller().catch(console.error);

const SIM_MS = 7000;
const USE_SIMULATOR = true; // pon false si NO quieres simular

async function simulateIfQuiet() {
  const farms = await prisma.farm.findMany({ select: { id: true } });
  for (const f of farms) {
    const last = await prisma.report.findFirst({
      where: { farmId: f.id },
      orderBy: { ts: 'desc' },
    });

    const tooOld = !last || (Date.now() - new Date(last.ts).getTime()) > 15000; // >15s sin datos
    if (!USE_SIMULATOR || !tooOld) continue;

    // genera numeritos suaves alrededor de lo último o valores base
    const base = last || { temp: 27, humAir: 60, humSuelo: 40, potencia: 80, min: 35, max: 65, auto: true, bomba: false };
    const n = (x, d) => Math.max(0, Math.min(100, Number(x ?? 0) + (Math.random()*2 - 1)*d));

    await prisma.report.create({
      data: {
        farmId: f.id,
        temp: Number((n(base.temp ?? 27, 0.6)).toFixed(1)),
        humAir: Math.round(n(base.humAir ?? 60, 1.5)),
        humSuelo: Math.round(n(base.humSuelo ?? 40, 2.0)),
        bomba: Math.random() < 0.2 ? !base.bomba : base.bomba,
        auto: true,
        potencia: base.potencia ?? 80,
        min: base.min ?? 35,
        max: base.max ?? 65,
        analisisIA: 'Simulador activo (sin dispositivo)',
      },
    });
  }
}

setInterval(simulateIfQuiet, SIM_MS);
