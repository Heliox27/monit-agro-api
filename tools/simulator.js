// tools/simulator.js
// Simulador de lecturas para Monit-Agro
// Envía lecturas cada 5 s a /reports para farm-a y farm-b

const API_URL = process.env.API_URL || 'http://localhost:4000';

// Usa fetch nativo de Node 18+. Si tu Node es <18, instala node-fetch y usa globalThis.fetch = ...
async function postJSON(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST ${path} -> ${res.status} ${text}`);
  }
  return res.json();
}

// Rango aleatorio con decimales
function rand(min, max, digits = 1) {
  const num = Math.random() * (max - min) + min;
  const p = Math.pow(10, digits);
  return Math.round(num * p) / p;
}

// Genera un payload "tipo Arduino" con todas las variables que usa tu frontend
function makeReadingPayload(farmId) {
  const ts = new Date().toISOString();

  const soil_moisture = rand(20, 60, 1);     // %
  const soil_temp     = rand(20, 30, 1);     // °C
  const soil_ph       = rand(5.8, 7.2, 1);   // pH
  const light         = Math.round(rand(8000, 25000, 0)); // lux
  const air_humidity  = Math.round(rand(45, 85, 0));      // %
  const air_temp      = rand(22, 34, 1);     // °C

  // Reglas de ejemplo para bombas/aspersores según humedad de suelo
  const pump_status      = soil_moisture < 30;
  const sprinkler_status = soil_moisture < 35;

  return {
    farmId,
    ts,
    soil_moisture,
    soil_temp,
    soil_ph,
    light,
    air_humidity,
    air_temp,
    pump_status,
    sprinkler_status,
  };
}

async function tickOnce() {
  const farms = ['farm-a', 'farm-b'];

  for (const farmId of farms) {
    const payload = makeReadingPayload(farmId);
    try {
      const saved = await postJSON('/reports', payload);
      console.log(`[OK] ${farmId} @ ${payload.ts} -> id=${saved.id ?? '(sin id)'}, sm=${payload.soil_moisture}%`);
    } catch (err) {
      console.error(`[ERROR] ${farmId}:`, err.message);
    }
  }
}

async function main() {
  console.log(`Simulador apuntando a ${API_URL}`);
  await tickOnce();
  setInterval(tickOnce, 5000); // cada 5 segundos
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
