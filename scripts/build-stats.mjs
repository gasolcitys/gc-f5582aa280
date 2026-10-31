// Descarga los precios oficiales del Ministerio para la Transición Ecológica y el Reto Demográfico
// y genera data/stats.json, un resumen ligero que lee estadisticas.html.
// Uso: node scripts/build-stats.mjs [ruta-json-local-opcional]
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const API = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';
const OUT = new URL('../data/stats.json', import.meta.url);

const FUELS = [
  ['g95', 'Gasolina 95', 'Precio Gasolina 95 E5'],
  ['diesel', 'Diésel', 'Precio Gasoleo A'],
  ['g98', 'Gasolina 98', 'Precio Gasolina 98 E5'],
  ['dieselp', 'Diésel Premium', 'Precio Gasoleo Premium'],
  ['glp', 'GLP', 'Precio Gases licuados del petróleo'],
  ['adblue', 'AdBlue', 'Precio Adblue']
];

const num = s => (s ? parseFloat(s.replace(',', '.')) : NaN);
const r3 = v => Math.round(v * 1000) / 1000;
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
const q = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
const small = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y']);
function prettyProv(s) {
  const m = s.match(/^(.*) \((.*)\)$/);
  if (m) s = `${m[2]} ${m[1]}`;
  return s.toLowerCase().replace(/[^\s/]+/g, (w, i) => (i > 0 && small.has(w) ? w : w[0].toUpperCase() + w.slice(1)));
}
// Cepsa pasó a llamarse Moeve: se cuentan como una sola marca
const prettyName = s => s.trim().replace(/\s+/g, ' ').replace(/^cepsa\b/i, 'MOEVE');

const raw = process.argv[2]
  ? JSON.parse(await readFile(process.argv[2], 'utf8'))
  : await (async () => {
      for (let i = 0; i < 3; i++) {
        try {
          const res = await fetch(API, { headers: { Accept: 'application/json' } });
          if (res.ok) return await res.json();
        } catch (e) { console.warn('intento', i + 1, e.message); }
        await new Promise(r => setTimeout(r, 5000));
      }
      throw new Error('No se pudo descargar la API oficial');
    })();

const L = raw.ListaEESSPrecio;
if (!Array.isArray(L) || L.length < 5000) throw new Error('Respuesta oficial incompleta');

const fuelKeys = Object.keys(L[0]).filter(k => k.startsWith('Precio '));
const fuelTypes = fuelKeys.filter(k => L.some(e => e[k])).length;
const is24 = e => /L-D: 24H/i.test(e.Horario || '');

const stats = {
  source: 'Ministerio para la Transición Ecológica y el Reto Demográfico · Geoportal de Gasolineras',
  official: raw.Fecha,
  generated: new Date().toISOString(),
  totals: {
    stations: L.length,
    provinces: new Set(L.map(e => e.Provincia)).size,
    municipalities: new Set(L.map(e => e.IDMunicipio)).size,
    fuelTypes,
    open24: L.filter(is24).length,
    adblue: L.filter(e => e['Precio Adblue']).length
  },
  fuels: {},
  provinces: [],
  brands: [],
  extremes: {},
  points: { lat: [], lon: [] },
  history: []
};

for (const [id, name, key] of FUELS) {
  const rows = L.map(e => ({ e, v: num(e[key]) })).filter(x => x.v > 0.3 && x.v < 5);
  const vals = rows.map(x => x.v).sort((a, b) => a - b);
  const lo = q(vals, .01), hi = q(vals, .99), B = 24, hist = new Array(B).fill(0);
  vals.forEach(v => { if (v >= lo && v <= hi) hist[Math.min(B - 1, Math.floor((v - lo) / (hi - lo) * B))]++; });
  stats.fuels[id] = {
    name, n: vals.length, avg: r3(avg(vals)), min: vals[0], max: vals.at(-1),
    p10: q(vals, .1), p33: q(vals, 1 / 3), median: q(vals, .5), p67: q(vals, 2 / 3), p90: q(vals, .9),
    hist: { lo, hi, bins: hist }
  };
  const card = x => ({ r: prettyName(x.e['Rótulo']), m: x.e.Municipio, p: prettyProv(x.e.Provincia), v: x.v });
  const byPrice = [...rows].sort((a, b) => a.v - b.v);
  stats.extremes[id] = { cheap: byPrice.slice(0, 5).map(card), dear: byPrice.slice(-5).reverse().map(card) };
}

const provMap = new Map();
L.forEach(e => { if (!provMap.has(e.Provincia)) provMap.set(e.Provincia, []); provMap.get(e.Provincia).push(e); });
for (const [p, list] of provMap) {
  const row = { name: prettyProv(p), n: list.length, open24: list.filter(is24).length };
  for (const [id, , key] of FUELS) {
    const v = list.map(e => num(e[key])).filter(x => x > 0.3 && x < 5).sort((a, b) => a - b);
    row[id] = v.length >= 3 ? { avg: r3(avg(v)), min: v[0], max: v.at(-1), n: v.length } : null;
  }
  stats.provinces.push(row);
}

const brandMap = new Map();
L.forEach(e => { const b = prettyName(e['Rótulo']).toUpperCase(); if (!brandMap.has(b)) brandMap.set(b, []); brandMap.get(b).push(e); });
stats.brands = [...brandMap].filter(([b]) => !/^N[º°]/.test(b) && b !== 'SIN RÓTULO').sort((a, b) => b[1].length - a[1].length).slice(0, 14).map(([b, list]) => {
  const row = { name: b, n: list.length };
  for (const [id, , key] of FUELS) {
    const v = list.map(e => num(e[key])).filter(x => x > 0.3 && x < 5);
    row[id] = v.length >= 10 ? r3(avg(v)) : null;
  }
  return row;
});

// puntos del mapa: lat/lon en centésimas y precios en milésimas (0 = no lo vende)
for (const [id] of FUELS) stats.points[id] = [];
L.forEach(e => {
  const la = num(e.Latitud), lo = num(e['Longitud (WGS84)']);
  if (!(la > 26 && la < 45 && lo > -19 && lo < 5)) return;
  stats.points.lat.push(Math.round(la * 100));
  stats.points.lon.push(Math.round(lo * 100));
  for (const [id, , key] of FUELS) { const v = num(e[key]); stats.points[id].push(v > 0.3 && v < 5 ? Math.round(v * 1000) : 0); }
});

// serie histórica: se va acumulando en cada ejecución (máx. ~31 días a 30 min)
try {
  const prev = JSON.parse(await readFile(OUT, 'utf8'));
  stats.history = Array.isArray(prev.history) ? prev.history : [];
} catch {}
if (!stats.history.length || stats.history.at(-1).f !== raw.Fecha) {
  stats.history.push({ f: raw.Fecha, t: stats.generated, g95: stats.fuels.g95.avg, diesel: stats.fuels.diesel.avg, g98: stats.fuels.g98.avg });
}
stats.history = stats.history.slice(-1500);

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify(stats));
console.log(`stats.json: ${L.length} gasolineras · ${raw.Fecha} · ${(JSON.stringify(stats).length / 1024).toFixed(0)} KB`);
