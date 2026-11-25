// Borra los mensajes de los canales de Telegram de cada comunidad (los del bot y los avisos de servicio).
// El bot no puede leer el historial, así que prueba a borrar los mensajes 1..HASTA de cada canal:
// los que no existen se saltan. Telegram solo deja borrar mensajes de menos de 48 horas.
// Uso: TELEGRAM_BOT_TOKEN=... node scripts/telegram-borrar.mjs [--ccaa 12,13] [--hasta 300]
import { readFileSync } from 'node:fs';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('Falta la variable de entorno TELEGRAM_BOT_TOKEN');
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : ''; };
const SOLO = arg('--ccaa').split(',').map(s => s.trim().padStart(2, '0')).filter(s => s !== '00');
const HASTA = Number(arg('--hasta')) || 300;

const { canales } = JSON.parse(readFileSync(new URL('../data/telegram-canales.json', import.meta.url), 'utf8'));

async function api(metodo, datos) {
  for (let intento = 0; intento < 5; intento++) {
    const j = await (await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos)
    })).json();
    if (j.ok) return j.result;
    if (j.error_code === 429) { await new Promise(r => setTimeout(r, ((j.parameters?.retry_after || 5) + 1) * 1000)); continue; }
    throw new Error(`${metodo}: ${j.error_code} ${j.description}`);
  }
  throw new Error(`${metodo}: demasiados reintentos`);
}

// Telegram rechaza el lote entero si un mensaje no se puede borrar (p. ej. avisos de más de 48 horas):
// entonces se parte el lote en dos hasta aislar esos mensajes, que se dejan.
let noBorrables = 0;
async function borrar(canal, ids) {
  try { await api('deleteMessages', { chat_id: canal, message_ids: ids }); }
  catch (e) {
    if (!/can't be deleted|MESSAGE_DELETE_FORBIDDEN/i.test(e.message)) throw e;
    if (ids.length === 1) { noBorrables++; return; }
    const mitad = Math.ceil(ids.length / 2);
    await borrar(canal, ids.slice(0, mitad));
    await borrar(canal, ids.slice(mitad));
  }
}

let fallos = 0;
for (const [id, { nombre, canal }] of Object.entries(canales)) {
  if (!canal || (SOLO.length && !SOLO.includes(id))) continue;
  noBorrables = 0;
  try {
    for (let desde = 1; desde <= HASTA; desde += 100) {
      await borrar(canal, Array.from({ length: Math.min(100, HASTA - desde + 1) }, (_, i) => desde + i));
    }
    console.log(`✓ ${nombre}: mensajes borrados${noBorrables ? ` (${noBorrables} no se pueden borrar)` : ''}`);
  } catch (e) { fallos++; console.error(`✗ ${nombre}: ${e.message}`); }
}
if (fallos) process.exit(1);
