// server.js — CommonJS, listo para Node 18+ (fetch nativo)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

// ---------- Middlewares ----------
const allowed = process.env.CORS_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: allowed?.length ? allowed : '*' }));
app.use(express.json({ limit: '1mb' }));

// ---------- Healthcheck ----------
app.get('/healthz', (_, res) => res.send('ok'));

// =============== API PARA LA APP ===============

// FARMS
app.get('/farms', async (_req, res) => {
  const rows = await prisma.farm.findMany({
    select: { id: true, name: true, location: true },
    orderBy: { name: 'asc' },
  });
  res.json(rows);
});

// REPORTS (lecturas históricas)
app.get('/reports', async (req, res) => {
  const { farmId, limit = '200', order = 'asc' } = req.query;
  const where = farmId ? { farmId: String(farmId) } : {};
  const rows = await prisma.reading.findMany({
    where,
    orderBy: { ts: order === 'desc' ? 'desc' : 'asc' },
    take: Number(limit) || undefined,
  });
  res.json(rows);
});

// TASKS (labores) CRUD
app.get('/tasks', async (req, res) => {
  const { farmId } = req.query;
  const where = farmId ? { farmId: String(farmId) } : {};
  const rows = await prisma.task.findMany({ where, orderBy: { ts: 'desc' } });
  res.json(rows);
});

app.post('/tasks', async (req, res) => {
  const data = req.body || {};
  data.farmId = String(data.farmId || 'farm-a');
  data.type   = String(data.type   || 'riego');
  data.cost   = Number(data.cost   || 0);
  data.notes  = data.notes ? String(data.notes) : null;
  data.ts     = data.ts ? new Date(data.ts) : new Date();
  const row = await prisma.task.create({ data });
  res.status(201).json(row);
});

app.put('/tasks/:id', async (req, res) => {
  const row = await prisma.task.update({ where: { id: req.params.id }, data: req.body });
  res.json(row);
});

app.delete('/tasks/:id', async (req, res) => {
  await prisma.task.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// =============== INGESTA (Arduino / Simulador) ===============
//
// 1) POST /reports  -> acepta formato "Arduino" (plano) y "backend" (payload)
//    Si defines INGEST_SHARED_TOKEN en .env, exige header x-shared-token con ese valor.
//
app.post('/reports', async (req, res) => {
  try {
    console.log('[IN] POST /reports keys=', Object.keys(req.body || {}));

    // Token compartido (opcional)
    if (process.env.INGEST_SHARED_TOKEN) {
      const tok = req.get('x-shared-token') || '';
      if (tok !== process.env.INGEST_SHARED_TOKEN) {
        return res.status(401).json({ error: 'bad token' });
      }
    }

    const body = req.body || {};
    const isArduino =
      ('finca' in body) ||
      ('temperatura' in body) ||
      ('humedad_aire' in body) ||
      ('humedad_suelo' in body);

    let farmId   = body.farmId   || process.env.FARM_ID_DEFAULT   || 'farm-a';
    let deviceId = body.deviceId || process.env.DEVICE_ID_DEFAULT || 'esp32-a';
    let ts       = body.ts || body.timestamp || new Date().toISOString();
    let payload  = body.payload;

    if (isArduino) {
      // Normaliza JSON "plano" de Arduino a payload
      payload = {
        temp:       body.temperatura,
        humAir:     body.humedad_aire,
        humSuelo:   body.humedad_suelo,
        bomba:      body.bomba_activa,
        auto:       body.modo_automatico,
        potencia:   body.potencia_bomba,
        min:        body.umbral_min,
        max:        body.umbral_max,
        analisisIA: body.analisis_ia,
      };
      // Deriva farmId por nombre de finca si viene
      if (typeof body.finca === 'string') {
        const name = body.finca.trim().toLowerCase();
        farmId = name.includes('b') ? 'farm-b' : 'farm-a';
      }
    }

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'payload missing/invalid' });
    }

    // Asegura device
    const device = await prisma.device.upsert({
      where: { mdnsName: deviceId },
      update: { lastSeen: new Date() },
      create: { mdnsName: deviceId, name: deviceId, farmId, lastSeen: new Date() },
    });

    // Guarda lectura
    const row = await prisma.reading.create({
      data: { farmId, deviceId: device.id, payload, ts: new Date(ts) },
    });

    res.status(201).json(row);
  } catch (e) {
    console.error('POST /reports error:', e);
    res.status(500).json({ error: 'internal error' });
  }
});

//
// 2) Modo PULL (opcional): backend jala desde /datos del ESP32 sin tocar el sketch
//
function parseMaybeJson(text) {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/{[\s\S]*}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return { raw: text };
}

const sensors = (process.env.SENSORS || '')
  .split(',').map(s => s.trim()).filter(Boolean)
  .map(s => {
    // formato: farma@http://192.168.0.9/datos
    const [key, url] = s.split('@');
    return {
      key,
      url,
      farmId: process.env[`SENSOR_FARM_${key}`] || 'farm-a',
      host: (() => { try { return new URL(url).hostname; } catch { return null; } })()
    };
  });

async function pollOnce(sensor) {
  try {
    const r = await fetch(sensor.url, { cache: 'no-store' });
    const txt = await r.text();
    const payload = parseMaybeJson(txt);

    const device = await prisma.device.upsert({
      where: { mdnsName: sensor.key },
      update: { lastSeen: new Date(), lastIp: sensor.host || null },
      create: { mdnsName: sensor.key, name: sensor.key, farmId: sensor.farmId, lastSeen: new Date(), lastIp: sensor.host || null },
    });

    await prisma.reading.create({
      data: { farmId: sensor.farmId, deviceId: device.id, payload, ts: new Date() },
    });

    console.log('[ingest] ok', sensor.key);
  } catch (err) {
    console.warn('[ingest]', sensor.key, '->', err.message);
  }
}

if (process.env.PULL_ARDUINO === '1' && sensors.length) {
  const interval = Number(process.env.PULL_INTERVAL_MS || 6000);
  setInterval(() => sensors.forEach(pollOnce), interval);

  // endpoint manual para disparar un pull
  app.post('/ingest/pull', async (_req, res) => {
    await Promise.all(sensors.map(pollOnce));
    res.json({ ok: true, polled: sensors.map(s => s.key) });
  });
}

// ---------- Arranque ----------
const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API on http://0.0.0.0:${PORT}`);
  if (sensors.length) {
    console.log('PULL enabled for:', sensors.map(s => `${s.key} -> ${s.url}`).join(', '));
  }
});
