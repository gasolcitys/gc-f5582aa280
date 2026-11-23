// Genera las páginas «Precio de la gasolina hoy en…» para España, las 52 provincias y cada municipio con
// 5 o más gasolineras (todas las capitales incluidas), con los precios oficiales del Ministerio.
// Todo el contenido va escrito en el HTML (sin depender de JavaScript) para que los buscadores lo lean entero.
//
// Uso: node scripts/build-seo.mjs [ruta-json-oficial]        (sin ruta, lo descarga)
//      node scripts/build-seo.mjs --historico                (rellena una vez la evolución de provincias con el git de stats.json)
// Con INDEXNOW=1 avisa a Bing, DuckDuckGo, Yandex, Seznam… (IndexNow) de las páginas que han cambiado.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SITE = 'https://gasolcitys.com';
const BASE = 'precio-gasolina';
const MIN_GASOLINERAS = 5;
const INDEXNOW_KEY = '6738efd74b5dbffa602534dbe2440ae5';
const API = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';
const ROOT = new URL('../', import.meta.url);
const F_ESTADO = new URL('data/seo-estado.json', ROOT);
const F_HIST = new URL('data/seo-historico.json', ROOT);
const IOS = 'https://apps.apple.com/es/app/id6823373113';
const ANDROID = 'https://play.google.com/store/apps/details?id=com.gasolcity.app';

const FUELS = [
  ['g95', 'Gasolina 95', 'Precio Gasolina 95 E5', 'Gasolina 95 E5'],
  ['diesel', 'Diésel', 'Precio Gasoleo A', 'Gasóleo A'],
  ['g98', 'Gasolina 98', 'Precio Gasolina 98 E5', 'Gasolina 98 E5'],
  ['dieselp', 'Diésel Premium', 'Precio Gasoleo Premium', 'Gasóleo Premium'],
  ['glp', 'GLP', 'Precio Gases licuados del petróleo', 'Autogás']
];
const MAIN = ['g95', 'diesel'];

// Provincias: nombre con el que se buscan, ruta, nombre oficial alternativo, si es uniprovincial/ciudad autónoma
const PROV = {
  '01': ['Álava', 'alava', 'Araba'], '02': ['Albacete', 'albacete'], '03': ['Alicante', 'alicante', 'Alacant'],
  '04': ['Almería', 'almeria'], '05': ['Ávila', 'avila'], '06': ['Badajoz', 'badajoz'],
  '07': ['Baleares', 'baleares', 'Illes Balears', 1], '08': ['Barcelona', 'barcelona'], '09': ['Burgos', 'burgos'],
  '10': ['Cáceres', 'caceres'], '11': ['Cádiz', 'cadiz'], '12': ['Castellón', 'castellon', 'Castelló'],
  '13': ['Ciudad Real', 'ciudad-real'], '14': ['Córdoba', 'cordoba'], '15': ['A Coruña', 'a-coruna', 'La Coruña'],
  '16': ['Cuenca', 'cuenca'], '17': ['Girona', 'girona', 'Gerona'], '18': ['Granada', 'granada'],
  '19': ['Guadalajara', 'guadalajara'], '20': ['Guipúzcoa', 'guipuzcoa', 'Gipuzkoa'], '21': ['Huelva', 'huelva'],
  '22': ['Huesca', 'huesca'], '23': ['Jaén', 'jaen'], '24': ['León', 'leon'], '25': ['Lleida', 'lleida', 'Lérida'],
  '26': ['La Rioja', 'la-rioja', '', 1], '27': ['Lugo', 'lugo'], '28': ['Madrid', 'madrid', 'Comunidad de Madrid', 1],
  '29': ['Málaga', 'malaga'], '30': ['Murcia', 'murcia', 'Región de Murcia', 1], '31': ['Navarra', 'navarra', 'Nafarroa', 1],
  '32': ['Ourense', 'ourense', 'Orense'], '33': ['Asturias', 'asturias', '', 1], '34': ['Palencia', 'palencia'],
  '35': ['Las Palmas', 'las-palmas'], '36': ['Pontevedra', 'pontevedra'], '37': ['Salamanca', 'salamanca'],
  '38': ['Santa Cruz de Tenerife', 'santa-cruz-de-tenerife'], '39': ['Cantabria', 'cantabria', '', 1],
  '40': ['Segovia', 'segovia'], '41': ['Sevilla', 'sevilla'], '42': ['Soria', 'soria'], '43': ['Tarragona', 'tarragona'],
  '44': ['Teruel', 'teruel'], '45': ['Toledo', 'toledo'], '46': ['Valencia', 'valencia', 'València'],
  '47': ['Valladolid', 'valladolid'], '48': ['Vizcaya', 'vizcaya', 'Bizkaia'], '49': ['Zamora', 'zamora'],
  '50': ['Zaragoza', 'zaragoza'], '51': ['Ceuta', 'ceuta', '', 2], '52': ['Melilla', 'melilla', '', 2]
};
const CAPITAL = {
  '01': 'Vitoria-Gasteiz', '02': 'Albacete', '03': 'Alicante', '04': 'Almería', '05': 'Ávila', '06': 'Badajoz', '07': 'Palma',
  '08': 'Barcelona', '09': 'Burgos', '10': 'Cáceres', '11': 'Cádiz', '12': 'Castellón de la Plana', '13': 'Ciudad Real',
  '14': 'Córdoba', '15': 'A Coruña', '16': 'Cuenca', '17': 'Girona', '18': 'Granada', '19': 'Guadalajara', '20': 'San Sebastián',
  '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León', '25': 'Lleida', '26': 'Logroño', '27': 'Lugo', '28': 'Madrid',
  '29': 'Málaga', '30': 'Murcia', '31': 'Pamplona', '32': 'Ourense', '33': 'Oviedo', '34': 'Palencia',
  '35': 'Las Palmas de Gran Canaria', '36': 'Pontevedra', '37': 'Salamanca', '38': 'Santa Cruz de Tenerife', '39': 'Santander',
  '40': 'Segovia', '41': 'Sevilla', '42': 'Soria', '43': 'Tarragona', '44': 'Teruel', '45': 'Toledo', '46': 'Valencia',
  '47': 'Valladolid', '48': 'Bilbao', '49': 'Zamora', '50': 'Zaragoza', '51': 'Ceuta', '52': 'Melilla'
};
// Municipios cuyo nombre oficial no es el que más se busca
const RENOMBRA = {
  'Donostia-San Sebastián': ['San Sebastián', 'Donostia'], 'Arrasate/Mondragón': ['Mondragón', 'Arrasate'],
  'Altsasu/Alsasua': ['Alsasua', 'Altsasu'], 'Bera/Vera de Bidasoa': ['Vera de Bidasoa', 'Bera'],
  'Urdazubi/Urdax': ['Urdax', 'Urdazubi'], 'Eivissa': ['Ibiza', 'Eivissa'], 'Palma de Mallorca': ['Palma', 'Palma de Mallorca']
};

/* ---------- utilidades ---------- */
const num = s => (s ? parseFloat(s.replace(',', '.')) : NaN);
const ok = v => v > 0.3 && v < 5;
const r3 = v => Math.round(v * 1000) / 1000;
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
const q = (s, p) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
const eur = v => v.toFixed(3).replace('.', ',');
const eur2 = v => v.toFixed(2).replace('.', ',');
const cts = v => (Math.abs(v) * 100).toFixed(1).replace('.', ',').replace(/,0$/, '');
const miles = n => n.toLocaleString('es-ES');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’]/g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const PEQ = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'a', 'en', 'al', 'i', 'les', 'dels', 'da', 'do', 'das', 'dos', 'o', 'e', 'con', 's/n']);
function titulo(s) {
  let i = 0;
  return s.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[^\s]+/g, w => {
    const first = i++ === 0;
    if (!first && PEQ.has(w)) return w;
    if (/^(km|s\/n)\.?$/.test(w)) return w;
    if (/^[ivxl]+$/.test(w) && w.length <= 4 && !first) return w.toUpperCase();
    return w.replace(/(^|[-'’(\/.])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  });
}
function marca(r) {
  r = (r || '').trim().replace(/\s+/g, ' ');
  if (!r || /^N[º°o]\s?[\d.]+$/i.test(r) || /^sin r[óo]tulo$/i.test(r)) return '';
  r = r.replace(/^cepsa\b/i, 'MOEVE');
  return r.split(' ').map(w => (w.length <= 2 || /\d/.test(w) || /\./.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join(' ');
}
// «Palmas de Gran Canaria (Las)» → «Las Palmas de Gran Canaria»; «Alicante/Alacant» → Alicante (Alacant)
function nombreMunicipio(oficial) {
  if (RENOMBRA[oficial]) return { name: RENOMBRA[oficial][0], alt: RENOMBRA[oficial][1] };
  const art = s => s.trim().replace(/^(.*) \(([^)]{1,4})\)$/, (m, base, a) => (/'$/.test(a) ? titulo(a) + base : titulo(a) + ' ' + base));
  const partes = oficial.split('/').map(art);
  return { name: partes[0].replace(/^(.)/, c => c.toUpperCase()), alt: partes[1] || '' };
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
function km(a, b) {
  const R = 6371, t = Math.PI / 180, dLa = (b.lat - a.lat) * t, dLo = (b.lon - a.lon) * t;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const existe = f => access(f).then(() => true, () => false);
const leerJSON = async (f, d) => { try { return JSON.parse(await readFile(f, 'utf8')); } catch { return d; } };

/* ---------- histórico inicial de provincias (una sola vez) ---------- */
if (process.argv[2] === '--historico') {
  const REPO = fileURLToPath(ROOT);
  const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
  const hist = await leerJSON(F_HIST, { dias: {} });
  const porNombre = {};
  const lineas = git('log', 'origin/main', '--since=60 days ago', '--format=%H %cI', '--', 'data/stats.json').split('\n').filter(Boolean);
  const ultimoDelDia = new Map();
  for (const l of lineas) { const [h] = l.split(' '); const s = JSON.parse(git('show', `${h}:data/stats.json`)); const [d, m, y] = s.official.split(' ')[0].split('/'); const dia = `${y}-${m}-${d}`; if (!ultimoDelDia.has(dia)) ultimoDelDia.set(dia, s); }
  // nombre «bonito» de stats.json → id de provincia (se deduce con el JSON oficial)
  const raw = JSON.parse(await readFile(process.argv[3], 'utf8')).ListaEESSPrecio;
  const small = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y']);
  const pretty = s => { const m = s.match(/^(.*) \((.*)\)$/); if (m) s = `${m[2]} ${m[1]}`; return s.toLowerCase().replace(/[^\s/]+/g, (w, i) => (i > 0 && small.has(w) ? w : w[0].toUpperCase() + w.slice(1))); };
  raw.forEach(e => { porNombre[pretty(e.Provincia)] = e.IDProvincia; });
  for (const [dia, s] of ultimoDelDia) {
    const e = hist.dias[dia] || (hist.dias[dia] = {});
    e.es = e.es || [s.fuels.g95.avg, s.fuels.diesel.avg];
    for (const p of s.provinces) { const id = porNombre[p.name]; if (id && p.g95 && p.diesel && !e['p' + id]) e['p' + id] = [p.g95.avg, p.diesel.avg]; }
  }
  await writeFile(F_HIST, JSON.stringify(hist));
  console.log(`histórico: ${ultimoDelDia.size} días de provincias`);
  process.exit(0);
}

/* ---------- datos oficiales ---------- */
const raw = process.argv[2]
  ? JSON.parse(await readFile(process.argv[2], 'utf8'))
  : await (async () => {
      for (let i = 0; i < 3; i++) {
        try { const r = await fetch(API, { headers: { Accept: 'application/json' } }); if (r.ok) return await r.json(); } catch (e) { console.warn('intento', i + 1, e.message); }
        await new Promise(r => setTimeout(r, 5000));
      }
      throw new Error('No se pudo descargar la API oficial');
    })();
const L = raw.ListaEESSPrecio;
if (!Array.isArray(L) || L.length < 5000) throw new Error('Respuesta oficial incompleta');

const [fd, fm, fy] = raw.Fecha.split(' ')[0].split('/').map(Number);
const hora = raw.Fecha.split(' ')[1].slice(0, 5);
const DIA = `${fy}-${String(fm).padStart(2, '0')}-${String(fd).padStart(2, '0')}`;
const diaSemana = DIAS[new Date(Date.UTC(fy, fm - 1, fd)).getUTCDay()];
const FECHA = `${fd} de ${MESES[fm - 1]} de ${fy}`;           // 17 de noviembre de 2026
const FECHA_CORTA = `${fd} de ${MESES[fm - 1]}`;                  // 17 de noviembre
const FECHA_LARGA = `${diaSemana} ${FECHA}`;                       // martes 17 de noviembre de 2026
// hora peninsular: +01:00 en invierno, +02:00 en verano
const TZ = (() => { const m = new Date(Date.UTC(fy, fm - 1, fd, 12)).toLocaleString('en-US', { timeZone: 'Europe/Madrid', timeZoneName: 'shortOffset' }).match(/GMT([+-]\d+)/); const h = m ? +m[1] : 1; return `${h < 0 ? '-' : '+'}${String(Math.abs(h)).padStart(2, '0')}:00`; })();
const ISO = `${DIA}T${hora}:00${TZ}`;

const est = L.map(e => {
  const p = {};
  for (const [id, , key] of FUELS) { const v = num(e[key]); if (ok(v)) p[id] = v; }
  const h = (e.Horario || '').trim();
  return {
    id: e.IDEESS, marca: marca(e['Rótulo']), dir: titulo(e['Dirección'] || ''), cp: e['C.P.'], loc: titulo(e.Localidad || ''),
    mun: e.IDMunicipio, munOf: e.Municipio, prov: e.IDProvincia, lat: num(e.Latitud), lon: num(e['Longitud (WGS84)']),
    h24: /L-D: (24H|00:00-23:59|00:00-24:00)$/i.test(h), horario: /L-D: (24H|00:00-23:59|00:00-24:00)$/i.test(h) ? '24 horas' : h.replace(/;\s*/g, ' · '), p
  };
}).filter(s => PROV[s.prov] && Object.keys(s.p).length);
const nombre = s => s.marca || 'Gasolinera';

function resumen(lista) {
  const r = { n: lista.length, h24: lista.filter(s => s.h24).length, f: {} };
  for (const [id] of FUELS) {
    const con = lista.filter(s => s.p[id]).sort((a, b) => a.p[id] - b.p[id]);
    if (!con.length) continue;
    const v = con.map(s => s.p[id]);
    r.f[id] = { n: v.length, avg: r3(avg(v)), min: v[0], max: v.at(-1), p33: q(v, 1 / 3), p67: q(v, 2 / 3), baratas: con.slice(0, 10), caras: con.slice(-3).reverse() };
  }
  return r;
}
const centro = lista => { const g = lista.filter(s => s.lat > 26 && s.lat < 45 && s.lon > -19 && s.lon < 5); return g.length ? { lat: avg(g.map(s => s.lat)), lon: avg(g.map(s => s.lon)) } : null; };

/* ---------- estado y estructura de páginas ---------- */
const estado = await leerJSON(F_ESTADO, { paginas: {} });
const hist = await leerJSON(F_HIST, { dias: {} });

const ES = resumen(est);
const provincias = Object.entries(PROV).map(([id, [name, sl, alt, tipo]]) => {
  const lista = est.filter(s => s.prov === id);
  return { id, name, slug: sl, alt: alt || '', tipo: tipo || 0, lista, r: resumen(lista), c: centro(lista), url: `/${BASE}/${sl}/`, munis: [] };
}).filter(p => p.lista.length);
const PROVM = new Map(provincias.map(p => [p.id, p]));

const munMap = new Map();
for (const s of est) { if (!munMap.has(s.mun)) munMap.set(s.mun, []); munMap.get(s.mun).push(s); }
const municipios = [];
for (const [id, lista] of munMap) {
  const P = PROVM.get(lista[0].prov);
  const { name, alt } = nombreMunicipio(lista[0].munOf);
  const capital = CAPITAL[P.id] === name;
  const m = { id, name, alt, prov: P, lista, capital, slug: slug(name), c: centro(lista) };
  lista.forEach(s => { s.munName = name; });
  P.munis.push(m);
  municipios.push(m);
}
// rutas únicas dentro de cada provincia
for (const P of provincias) {
  const vistos = new Map();
  for (const m of P.munis.sort((a, b) => b.lista.length - a.lista.length)) {
    if (vistos.has(m.slug)) m.slug += '-' + m.id;
    vistos.set(m.slug, 1);
    m.url = `${P.url}${m.slug}/`;
  }
}
// página propia: 5+ gasolineras, capitales y las que ya existían (para no romper enlaces ya indexados)
// (Ceuta y Melilla: la página de la ciudad sería la misma que la de la «provincia», así que solo hay una)
for (const m of municipios) m.pagina = m.prov.tipo !== 2 && (m.lista.length >= MIN_GASOLINERAS || m.capital || !!estado.paginas[m.url]);
const conPagina = municipios.filter(m => m.pagina);
for (const m of conPagina) m.r = resumen(m.lista);
// cómo se nombra cada sitio en los textos
for (const m of municipios) m.label = m.capital && m.name === m.prov.name ? `${m.name} capital` : m.name;
for (const P of provincias) P.label = P.tipo === 2 ? P.name : P.tipo === 1 ? P.name : `la provincia de ${P.name}`;

/* ---------- histórico diario (medias de gasolina 95 y diésel) ---------- */
const hoyH = hist.dias[DIA] = {};
hoyH.es = [ES.f.g95.avg, ES.f.diesel.avg];
for (const P of provincias) if (P.r.f.g95 && P.r.f.diesel) hoyH['p' + P.id] = [P.r.f.g95.avg, P.r.f.diesel.avg];
for (const m of conPagina) if (m.r.f.g95 && m.r.f.diesel) hoyH['m' + m.id] = [m.r.f.g95.avg, m.r.f.diesel.avg];
const diasOrden = Object.keys(hist.dias).sort().slice(-120);
hist.dias = Object.fromEntries(diasOrden.map(d => [d, hist.dias[d]]));
function serie(clave) { return diasOrden.filter(d => hist.dias[d][clave]).map(d => ({ d, v: hist.dias[d][clave] })); }
function variacion(clave, dias) {
  const s = serie(clave); if (s.length < 2) return null;
  const objetivo = new Date(Date.parse(DIA + 'T12:00:00Z') - dias * 864e5).toISOString().slice(0, 10);
  const antes = [...s].reverse().find(x => x.d <= objetivo && x.d >= new Date(Date.parse(objetivo + 'T12:00:00Z') - 3 * 864e5).toISOString().slice(0, 10));
  if (!antes) return null;
  const hoy = s.at(-1).v;
  return { d: antes.d, g95: hoy[0] - antes.v[0], diesel: hoy[1] - antes.v[1] };
}

/* ---------- piezas de HTML ---------- */
const LOGO = '<svg viewBox="340 180 345 440" aria-hidden="true"><path d="M640 382 L512 205 L393 360 A146 146 0 1 0 657 462" fill="none" stroke="#fff" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/><path fill="#22B866" d="M518 437 H560 V483 H518 A23 23 0 0 1 518 437 Z"/><rect fill="#FFC531" x="567" y="437" width="41" height="46"/><path fill="#FF515B" d="M615 437 H657 A23 23 0 0 1 657 483 H615 Z"/></svg>';
const APPLE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.7-1-2.7-4.1zM13.9 5c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.6 1.8 13.4 12l-9.8 10.2c-.4-.2-.6-.7-.6-1.2V3c0-.5.2-1 .6-1.2zm11 11.4 2.6 2.6-11.3 6.4 8.7-9zm0-2.4-8.7-9 11.3 6.4-2.6 2.6zm3.8-2 3 1.7c.8.5.8 1.6 0 2.1l-3 1.7-2.8-2.8 2.8-2.7z"/></svg>';
const mapa = s => `https://www.google.com/maps/search/?api=1&query=${s.lat.toFixed(6)},${s.lon.toFixed(6)}`;
const precio = (v, unidad = true) => `<span class="num">${eur(v)}${unidad ? ' €' : ''}</span>`;
// la localidad solo si no es el propio municipio (en los datos oficiales suele venir sin tildes)
const sitio = s => `${s.dir}${s.loc && slug(s.loc) !== slug(s.munName || '') && !slug(s.dir).includes(slug(s.loc)) ? ', ' + s.loc : ''}`;

function stores(lugar) {
  return `<div class="stores"><a href="${IOS}" data-goatcounter-click="descarga-${lugar}-iphone">${APPLE}App Store</a><a href="${ANDROID}" data-goatcounter-click="descarga-${lugar}-android">${PLAY}Google Play</a></div>`;
}
function ctaGrande(donde) {
  return `<div class="cta"><div><h2>Gasolineras baratas en ${esc(donde)}, siempre a mano</h2><p>GasolCitys te enseña en el mapa las gasolineras de ${esc(donde)} con un semáforo de precios, las que están abiertas ahora y las de tu ruta, y te avisa del mejor día para repostar. Gratis, con los precios oficiales.</p></div>${stores('precios')}</div>`;
}
// Botón de arriba, con el nombre de la ciudad. En Android avisa cuando baja el precio (alertas); en iPhone, el aviso
// semanal del mejor día para repostar. Cada móvil ve solo su tienda (clases ios / and en <html>); en ordenador, las dos.
function ctaHero(donde) {
  const d = esc(donde);
  return `<div class="cta-hero"><p><span class="t-gen">🔔 Avisos de precio en ${d}: cuándo baja y qué día repostar</span><span class="t-and">🔔 Recibe un aviso cuando baje la gasolina en ${d}</span><span class="t-ios">🔔 Que te avise del mejor día para repostar en ${d}</span></p><div class="btns"><a class="b-ios" href="${IOS}" data-goatcounter-click="descarga-hero-iphone">${APPLE}<span class="l-pc">App Store</span><span class="l-mv">Descargar GasolCitys</span></a><a class="b-and" href="${ANDROID}" data-goatcounter-click="descarga-hero-android">${PLAY}<span class="l-pc">Google Play</span><span class="l-mv">Descargar GasolCitys</span></a></div></div>`;
}
function ctaMini() {
  return `<p class="cta-mini">📍 ¿Vas en el coche? En la app <b>GasolCitys</b> ves estas gasolineras en el mapa, con semáforo de precios y cómo llegar. <a href="${IOS}" data-goatcounter-click="descarga-precios-iphone">iPhone</a> · <a href="${ANDROID}" data-goatcounter-click="descarga-precios-android">Android</a></p>`;
}
function kpis(r, ref) {
  return '<div class="kpis">' + FUELS.filter(([id]) => r.f[id]).map(([id, n]) => {
    const f = r.f[id];
    const d = ref && ref.f[id] ? f.avg - ref.f[id].avg : null;
    const extra = d === null ? `de ${eur(f.min)} a ${eur(f.max)} €` : Math.abs(d) < 0.0005 ? 'igual que la media' : `${cts(d)} cts ${d < 0 ? 'menos' : 'más'} que la media`;
    return `<div class="kpi"><small>${n}</small><strong class="num">${eur(f.avg)}<span>€/l</span></strong><p>${extra}</p></div>`;
  }).join('') + '</div>';
}
function ranking(r, id, conMunicipio) {
  const f = r.f[id]; if (!f) return '';
  const lista = f.baratas.slice(0, conMunicipio ? 10 : 5);
  return `<div class="card"><h3>${FUELS.find(x => x[0] === id)[1]}: las más baratas</h3><ol class="rank">${lista.map(s => {
    const m = municipios.find(x => x.id === s.mun);
    const lugar = conMunicipio ? (m.pagina ? `<a href="${m.url}">${esc(m.name)}</a>` : esc(m.name)) + ' · ' : '';
    return `<li><span class="who"><b>${esc(nombre(s))}</b><small>${lugar}${esc(sitio(s))}</small></span><span class="p">${precio(s.p[id], false)}<span> €/l</span></span></li>`;
  }).join('')}</ol></div>`;
}
function semaforo(r, id, v) {
  const f = r.f[id]; if (!f || f.n < 3 || f.min === f.max) return '';
  return `<i class="dot ${v <= f.p33 ? 's1' : v <= f.p67 ? 's2' : 's3'}" aria-hidden="true"></i>`;
}
function tablaGasolineras(m) {
  const cols = FUELS.filter(([id]) => m.r.f[id] && (MAIN.includes(id) || m.r.f[id].n >= 2));
  const filas = [...m.lista].sort((a, b) => (a.p.g95 ?? 9) - (b.p.g95 ?? 9) || (a.p.diesel ?? 9) - (b.p.diesel ?? 9));
  const th = cols.map(([id, n]) => `<th class="n"><button type="button" data-k="${id}"${id === 'g95' ? ' aria-sort="ascending"' : ''}>${n}</button></th>`).join('');
  const tr = filas.map(s => `<tr${cols.map(([id]) => ` data-${id}="${s.p[id] ?? ''}"`).join('')}><td><a href="${mapa(s)}" target="_blank" rel="nofollow noopener">${esc(nombre(s))}</a>${s.h24 ? '<span class="tag">24 h</span>' : ''}<small>${esc(sitio(s))}${s.cp ? ' · ' + esc(s.cp) : ''}</small><small>${esc(s.horario)}</small></td>${cols.map(([id]) => `<td class="n">${s.p[id] ? semaforo(m.r, id, s.p[id]) + precio(s.p[id], false) : '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('');
  return `<div class="tbl-wrap"><table class="sortable"><thead><tr><th>Gasolinera</th>${th}</tr></thead><tbody>${tr}</tbody></table></div><p class="legend"><span><i class="dot s1"></i>Barata para ${esc(m.label)}</span><span><i class="dot s2"></i>Precio medio</span><span><i class="dot s3"></i>Cara</span><span>Precios en €/litro. Toca el nombre para verla en el mapa.</span></p>`;
}
function tablaMunicipios(P) {
  const filas = [...P.munis].map(m => ({ m, r: m.r || resumen(m.lista) })).sort((a, b) => (a.r.f.g95?.avg ?? 9) - (b.r.f.g95?.avg ?? 9));
  const tr = filas.map(({ m, r }) => `<tr data-g95="${r.f.g95?.avg ?? ''}" data-diesel="${r.f.diesel?.avg ?? ''}" data-n="${m.lista.length}"><td>${m.pagina ? `<a href="${m.url}">${esc(m.name)}</a>` : esc(m.name)}${m.capital ? '<span class="tag">capital</span>' : ''}</td><td class="n">${r.f.g95 ? semaforo(P.r, 'g95', r.f.g95.avg) + precio(r.f.g95.avg, false) : '—'}${r.f.g95 && r.f.g95.n > 1 ? `<small>desde ${eur(r.f.g95.min)}</small>` : ''}</td><td class="n">${r.f.diesel ? semaforo(P.r, 'diesel', r.f.diesel.avg) + precio(r.f.diesel.avg, false) : '—'}${r.f.diesel && r.f.diesel.n > 1 ? `<small>desde ${eur(r.f.diesel.min)}</small>` : ''}</td><td class="n num">${m.lista.length}</td></tr>`).join('');
  return `<div class="tbl-wrap"><table class="sortable"><thead><tr><th>Municipio</th><th class="n"><button type="button" data-k="g95" aria-sort="ascending">Gasolina 95</button></th><th class="n"><button type="button" data-k="diesel">Diésel</button></th><th class="n"><button type="button" data-k="n" data-desc="1">Gasolineras</button></th></tr></thead><tbody>${tr}</tbody></table></div><p class="legend"><span>Precio medio de cada municipio en €/litro.</span><span><i class="dot s1"></i>Por debajo de lo normal en ${esc(P.name)}</span><span><i class="dot s3"></i>Por encima</span></p>`;
}
function tablaProvincias() {
  const filas = [...provincias].sort((a, b) => a.r.f.g95.avg - b.r.f.g95.avg);
  const tr = filas.map((P, i) => `<tr data-g95="${P.r.f.g95.avg}" data-diesel="${P.r.f.diesel.avg}" data-n="${P.lista.length}"><td><a href="${P.url}">${esc(P.name)}</a></td><td class="n">${semaforo(ES, 'g95', P.r.f.g95.avg)}${precio(P.r.f.g95.avg, false)}<small>desde ${eur(P.r.f.g95.min)}</small></td><td class="n">${semaforo(ES, 'diesel', P.r.f.diesel.avg)}${precio(P.r.f.diesel.avg, false)}<small>desde ${eur(P.r.f.diesel.min)}</small></td><td class="n num">${miles(P.lista.length)}</td></tr>`).join('');
  return `<div class="tbl-wrap"><table class="sortable"><thead><tr><th>Provincia</th><th class="n"><button type="button" data-k="g95" aria-sort="ascending">Gasolina 95</button></th><th class="n"><button type="button" data-k="diesel">Diésel</button></th><th class="n"><button type="button" data-k="n" data-desc="1">Gasolineras</button></th></tr></thead><tbody>${tr}</tbody></table></div><p class="legend"><span>Precio medio de cada provincia en €/litro y el más barato que hay.</span></p>`;
}
function grafica(clave, donde) {
  const s = serie(clave).slice(-45);
  if (s.length < 3) return '';
  const W = 640, H = 170, pl = 44, pr = 10, pt = 12, pb = 26;
  const vals = s.flatMap(x => x.v), lo = Math.min(...vals) - 0.005, hi = Math.max(...vals) + 0.005;
  const X = i => pl + (i / (s.length - 1)) * (W - pl - pr), Y = v => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  const linea = k => s.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(x.v[k]).toFixed(1)}`).join(' ');
  const ticks = [lo + 0.005, (lo + hi) / 2, hi - 0.005].map(v => `<text x="${pl - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#5B6B88">${eur(v)}</text><line x1="${pl}" x2="${W - pr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="rgba(31,79,156,.12)"/>`).join('');
  const fecha = d => { const [, mm, dd] = d.split('-'); return `${+dd}/${+mm}`; };
  const ini = s[0], fin = s.at(-1);
  const resumenTxt = `Del ${fecha(ini.d)} al ${fecha(fin.d)}, la gasolina 95 en ${donde} pasó de ${eur(ini.v[0])} a ${eur(fin.v[0])} €/l y el diésel de ${eur(ini.v[1])} a ${eur(fin.v[1])} €/l.`;
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(resumenTxt)}">${ticks}<path d="${linea(0)}" fill="none" stroke="#2F6FD6" stroke-width="2.5" stroke-linejoin="round"/><path d="${linea(1)}" fill="none" stroke="#22B866" stroke-width="2.5" stroke-linejoin="round"/><text x="${pl}" y="${H - 6}" font-size="11" fill="#5B6B88">${fecha(ini.d)}</text><text x="${W - pr}" y="${H - 6}" font-size="11" fill="#5B6B88" text-anchor="end">${fecha(fin.d)}</text></svg><div class="k"><span><i style="background:#2F6FD6"></i>Gasolina 95</span><span><i style="background:#22B866"></i>Diésel</span></div></div><p class="intro">${esc(resumenTxt)}</p>`;
}
function comparar(nombreA, a, refs) {
  return `<div class="cmp">${MAIN.filter(id => a.f[id]).map(id => {
    const n = FUELS.find(x => x[0] === id)[1];
    return `<div><small>${n} en ${esc(nombreA)}</small><strong class="num">${eur(a.f[id].avg)} €</strong>${refs.filter(([, r]) => r.f[id]).map(([lbl, r]) => { const d = a.f[id].avg - r.f[id].avg; return `<p class="${d > 0.0005 ? 'up' : d < -0.0005 ? 'down' : 'muted'}">${Math.abs(d) < 0.0005 ? 'Igual' : `${cts(d)} cts ${d < 0 ? 'más barata' : 'más cara'}`} que ${esc(lbl)} (${eur(r.f[id].avg)} €)</p>`; }).join('')}</div>`;
  }).join('')}</div>`;
}
function cercanos(m, n = 10) {
  if (!m.c) return [];
  return conPagina.filter(x => x !== m && x.c).map(x => ({ x, d: km(m.c, x.c) })).sort((a, b) => a.d - b.d).slice(0, n);
}
function enlaces(items) {
  return `<ul class="links">${items.map(([url, txt, extra]) => `<li><a href="${url}">${esc(txt)}${extra ? ` <small>${extra}</small>` : ''}</a></li>`).join('')}</ul>`;
}
function faq(preguntas) {
  return preguntas.map(([p, r]) => `<details><summary>${esc(p)}</summary><p>${esc(r)}</p></details>`).join('');
}
const SCRIPT_TABLAS = `<script>document.querySelectorAll('table.sortable').forEach(function(t){t.querySelectorAll('th button').forEach(function(b){b.addEventListener('click',function(){var k=b.dataset.k,d=!!b.dataset.desc,tb=t.tBodies[0],rows=[].slice.call(tb.rows);rows.sort(function(x,y){var a=parseFloat(x.dataset[k]),c=parseFloat(y.dataset[k]);if(isNaN(a))return 1;if(isNaN(c))return-1;return d?c-a:a-c});rows.forEach(function(r){tb.appendChild(r)});t.querySelectorAll('th button').forEach(function(o){o.removeAttribute('aria-sort')});b.setAttribute('aria-sort',d?'descending':'ascending')})})});</script>`;

function piePagina() {
  return `<footer><div class="wrap"><h2>Precio de la gasolina hoy por provincias</h2><ul class="provs">${[...provincias].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(P => `<li><a href="${P.url}">${esc(P.name)}</a></li>`).join('')}</ul><div class="legal"><span>Fuente: Ministerio para la Transición Ecológica y el Reto Demográfico (Geoportal de Gasolineras). GasolCitys no está vinculada al Ministerio. Los precios pueden cambiar a lo largo del día.</span><span><a href="/">GasolCitys</a> · <a href="/${BASE}/">Precios de hoy</a> · <a href="/estadisticas.html">Estadísticas</a> · <a href="/privacidad.html">Privacidad</a></span></div></div></footer>`;
}

function pagina({ url, title, desc, crumbs, h1, sub, hero, body, ld, ogTitle }) {
  const canon = SITE + url;
  const migas = crumbs.map(([u, t], i) => (i < crumbs.length - 1 ? `<a href="${u}">${esc(t)}</a><span aria-hidden="true">›</span>` : `<span>${esc(t)}</span>`)).join('');
  const graph = [
    { '@type': 'WebPage', '@id': canon, url: canon, name: title, description: desc, inLanguage: 'es-ES', dateModified: ISO, isPartOf: { '@type': 'WebSite', name: 'GasolCitys', url: SITE + '/' }, publisher: { '@type': 'Organization', name: 'GasolCitys', url: SITE + '/', logo: SITE + '/icon-512.png' } },
    { '@type': 'BreadcrumbList', itemListElement: crumbs.map(([u, t], i) => ({ '@type': 'ListItem', position: i + 1, name: t, item: SITE + u })) },
    ...ld
  ];
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canon}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<meta name="theme-color" content="#1F4F9C">
<meta name="apple-itunes-app" content="app-id=6823373113, affiliate-data=ct=web_precios&pt=129624813">
<meta property="og:type" content="website">
<meta property="og:site_name" content="GasolCitys">
<meta property="og:locale" content="es_ES">
<meta property="og:url" content="${canon}">
<meta property="og:title" content="${esc(ogTitle || title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${SITE}/icon-512.png">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/${BASE}/estilo.css">
<script>(function(u,h){h.className+=/iPhone|iPad|iPod/.test(u)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1?' ios':/Android/.test(u)?' and':''})(navigator.userAgent,document.documentElement)</script>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>
</head>
<body>
<header class="top"><div class="wrap">
<div class="nav"><a href="/" class="brand" aria-label="GasolCitys, inicio">${LOGO}<span><b>Gasol</b>Citys</span></a><nav><a href="/${BASE}/" class="opt">Precios de hoy</a><a href="/estadisticas.html" class="opt">Estadísticas</a><a href="/#descargar" class="dl">Descargar la app</a></nav></div>
<div class="hero"><nav class="crumbs" aria-label="Estás en">${migas}</nav><h1>${h1}</h1><p class="sub">${sub}</p><p class="live"><i></i>Precios oficiales del ${FECHA_LARGA}, a las <!--t-->${hora}<!--/t--></p>${hero}</div>
</div></header>
<main class="wrap">
${body}
</main>
${piePagina()}
${SCRIPT_TABLAS}
<script src="/barra.js"></script>
<script src="/campanas.js"></script>
<script src="/meta.js"></script>
<script data-goatcounter="https://gasolcitys.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
</body>
</html>
`;
}
const ldFAQ = preguntas => ({ '@type': 'FAQPage', mainEntity: preguntas.map(([p, r]) => ({ '@type': 'Question', name: p, acceptedAnswer: { '@type': 'Answer', text: r } })) });
function ldLista(nombreLista, lista, id) {
  return {
    '@type': 'ItemList', name: nombreLista, itemListOrder: 'https://schema.org/ItemListOrderAscending', numberOfItems: lista.length,
    itemListElement: lista.map((s, i) => ({
      '@type': 'ListItem', position: i + 1,
      item: {
        '@type': 'GasStation', name: `${nombre(s)} ${s.dir}`.trim(),
        address: { '@type': 'PostalAddress', streetAddress: s.dir, postalCode: s.cp, addressLocality: s.loc, addressRegion: PROVM.get(s.prov).name, addressCountry: 'ES' },
        geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lon },
        ...(s.h24 ? { openingHours: 'Mo-Su 00:00-23:59' } : {}),
        // el precio va como texto: con Offer/Product, Google lo trata como ficha de producto y pide reseñas, imagen…
        description: `${FUELS.find(x => x[0] === id)[1]} a ${eur(s.p[id])} €/l (${FECHA})`
      }
    }))
  };
}

/* ---------- textos ---------- */
function frasesZona(nombreZona, r, ref, refNombre, clave) {
  const g = r.f.g95, d = r.f.diesel, out = [];
  if (g && d) out.push(`Hoy, ${FECHA_LARGA}, llenar el depósito en ${nombreZona} cuesta de media <strong>${eur(g.avg)} € el litro de gasolina 95</strong> y <strong>${eur(d.avg)} € el de diésel</strong>, según los precios oficiales que las ${r.n === 1 ? 'gasolinera' : `${miles(r.n)} gasolineras`} de la zona comunican al Ministerio.`);
  else if (g) out.push(`Hoy, ${FECHA_LARGA}, la gasolina 95 cuesta de media <strong>${eur(g.avg)} €/l</strong> en ${nombreZona}.`);
  else if (d) out.push(`Hoy, ${FECHA_LARGA}, el diésel cuesta de media <strong>${eur(d.avg)} €/l</strong> en ${nombreZona}.`);
  if (g && g.n > 1) {
    const b = g.baratas[0];
    out.push(`La gasolina 95 más barata está en <strong>${esc(nombre(b))}</strong> (${esc(sitio(b))}), a ${eur(b.p.g95)} €/l, y la más cara llega a ${eur(g.max)} €/l: ${cts(g.max - g.min)} céntimos de diferencia por litro, <strong>${eur2((g.max - g.min) * 50)} € en un depósito de 50 litros</strong>.`);
  }
  if (d && d.n > 1) { const b = d.baratas[0]; out.push(`Para diésel, la más económica es <strong>${esc(nombre(b))}</strong> (${esc(sitio(b))}), a ${eur(b.p.diesel)} €/l.`); }
  if (ref && g && ref.f.g95) {
    const dg = g.avg - ref.f.g95.avg;
    out.push(Math.abs(dg) < 0.002 ? `El precio está en línea con la media de ${refNombre}.` : `Repostar aquí sale ${dg < 0 ? 'más barato' : 'más caro'} que en ${refNombre}: ${cts(dg)} céntimos por litro de gasolina 95 ${dg < 0 ? 'menos' : 'más'} que la media (${eur(ref.f.g95.avg)} €).`);
  }
  const v = clave && variacion(clave, 7);
  if (v) {
    const t = x => Math.abs(x) < 0.0015 ? 'se mantiene' : `${x < 0 ? 'ha bajado' : 'ha subido'} ${cts(x)} céntimos`;
    out.push(`En la última semana la gasolina 95 ${t(v.g95)} y el diésel ${t(v.diesel)}.`);
  }
  if (r.h24) out.push(`${r.h24 === 1 ? 'Hay 1 gasolinera abierta' : `Hay ${r.h24} gasolineras abiertas`} las 24 horas.`);
  return out.map(p => `<p>${p}</p>`).join('');
}
function preguntasZona(nombreZona, r, extra = []) {
  const g = r.f.g95, d = r.f.diesel, P = [];
  if (g || d) {
    const partes = [];
    if (g) partes.push(`la gasolina 95 está en ${nombre(g.baratas[0])} (${sitio(g.baratas[0])}) a ${eur(g.baratas[0].p.g95)} €/l`);
    if (d) partes.push(`el diésel, en ${nombre(d.baratas[0])} (${sitio(d.baratas[0])}) a ${eur(d.baratas[0].p.diesel)} €/l`);
    P.push([`¿Cuál es la gasolinera más barata de ${nombreZona} hoy?`, `Con los precios oficiales del ${FECHA}, ${partes.join(', y ')}.`]);
    P.push([`¿Cuánto cuesta hoy el litro de gasolina y de diésel en ${nombreZona}?`, `De media, ${g ? `${eur(g.avg)} € la gasolina 95` : ''}${g && d ? ' y ' : ''}${d ? `${eur(d.avg)} € el diésel` : ''}${r.f.g98 ? `; la gasolina 98 sale a ${eur(r.f.g98.avg)} €` : ''}. Son precios por litro del ${FECHA}.`]);
  }
  if (g && g.n > 1) P.push([`¿Cuánto me ahorro si lleno el depósito en la gasolinera más barata?`, `Entre la gasolina 95 más barata (${eur(g.min)} €/l) y la más cara (${eur(g.max)} €/l) de ${nombreZona} hay ${eur2((g.max - g.min) * 50)} € en un depósito de 50 litros. Al año, repostando una vez por semana, son más de ${miles(Math.round((g.max - g.min) * 50 * 52 / 10) * 10)} €.`]);
  P.push([`¿Hay gasolineras abiertas 24 horas en ${nombreZona}?`, r.h24 ? `Sí, ${r.h24 === 1 ? 'hay 1 gasolinera' : `hay ${r.h24} gasolineras`} que abren las 24 horas todos los días. En la app GasolCitys puedes ver cuáles están abiertas ahora mismo.` : `Según los horarios oficiales, ninguna abre las 24 horas todos los días. En la app GasolCitys puedes ver cuáles están abiertas ahora mismo.`]);
  P.push(...extra);
  P.push([`¿De dónde salen estos precios y cada cuánto se actualizan?`, `Son los precios oficiales que cada gasolinera está obligada a comunicar al Ministerio para la Transición Ecológica. Esta página se actualiza varias veces al día y la app GasolCitys, cada 30 minutos.`]);
  return P;
}

/* ---------- generación ---------- */
const paginas = [];   // { url, html, prioridad }

// Municipios
for (const m of conPagina) {
  const P = m.prov, r = m.r;
  const enDonde = m.label;
  const g = r.f.g95, d = r.f.diesel;
  const titleT = g ? `Gasolina más barata en ${enDonde} hoy: desde ${eur(g.min)} €` : d ? `Diésel más barato en ${enDonde} hoy: desde ${eur(d.min)} €` : `Precio gasolina hoy en ${enDonde} (${FECHA_CORTA}): gasolineras más baratas`;
  const desc = `${FECHA_CORTA[0].toUpperCase() + FECHA_CORTA.slice(1)}: ${g ? `gasolina 95 a ${eur(g.avg)} €/l de media` : ''}${g && d ? ' y ' : ''}${d ? `diésel a ${eur(d.avg)} €/l` : ''} en ${enDonde}.${g ? ` La más barata, ${nombre(g.baratas[0])} (${sitio(g.baratas[0])}), a ${eur(g.min)} €.` : ''} ${r.n} gasolineras con precios oficiales.`;
  const cerca = cercanos(m);
  const extra = [];
  if (cerca.length && g) {
    const mejor = cerca.filter(c => c.x.r.f.g95 && c.d < 25).sort((a, b) => a.x.r.f.g95.min - b.x.r.f.g95.min)[0];
    if (mejor && mejor.x.r.f.g95.min < g.min) extra.push([`¿Hay gasolina más barata cerca de ${enDonde}?`, `Sí: en ${mejor.x.name}, a unos ${Math.round(mejor.d)} km, la gasolina 95 más barata está a ${eur(mejor.x.r.f.g95.min)} €/l (${nombre(mejor.x.r.f.g95.baratas[0])}, ${sitio(mejor.x.r.f.g95.baratas[0])}), frente a ${eur(g.min)} €/l en ${enDonde}.`]);
  }
  const preguntas = preguntasZona(enDonde, r, extra);
  const body = `
<section><h2>Las gasolineras más baratas de ${esc(enDonde)} hoy</h2><p class="intro">Ordenadas por precio del litro, con los datos oficiales del ${FECHA}.</p><div class="grid2">${ranking(r, 'g95')}${ranking(r, 'diesel')}</div>${ctaMini()}</section>
<section><h2>Precio de la gasolina en ${esc(enDonde)}: resumen de hoy</h2><div class="prose">${frasesZona(esc(enDonde), r, P.r, `la media de ${P.label}`, 'm' + m.id)}</div>${comparar(enDonde, r, [[`la media de ${P.name}`, P.r], ['la media de España', ES]])}</section>
<section><h2>Todas las gasolineras de ${esc(enDonde)} y sus precios</h2><p class="intro">${r.n} gasolineras${m.alt ? ` en ${esc(m.name)} (${esc(m.alt)})` : ''}. Toca la cabecera de cada combustible para ordenar.</p>${tablaGasolineras(m)}</section>
${serie('m' + m.id).length >= 3 ? `<section><h2>Evolución del precio en ${esc(enDonde)}</h2>${grafica('m' + m.id, enDonde)}</section>` : serie('p' + P.id).length >= 3 ? `<section><h2>Evolución del precio medio en ${esc(P.label)}</h2><p class="intro">Todavía no hay histórico propio de ${esc(enDonde)}; esta es la media de ${esc(P.label)}.</p>${grafica('p' + P.id, P.label)}</section>` : ''}
${cerca.length ? `<section><h2>Gasolina en municipios cercanos a ${esc(enDonde)}</h2><p class="intro">A veces compensa repostar en el pueblo de al lado. Precio medio de la gasolina 95 y distancia aproximada.</p>${enlaces(cerca.map(({ x, d }) => [x.url, x.name, `${x.r.f.g95 ? eur(x.r.f.g95.avg) + ' € · ' : ''}${Math.round(d)} km`]))}<p class="intro" style="margin-top:14px">Ver todos los precios de <a href="${P.url}">${esc(P.label)}</a>.</p></section>` : ''}
<section>${ctaGrande(enDonde)}</section>
<section><h2>Preguntas frecuentes sobre la gasolina en ${esc(enDonde)}</h2>${faq(preguntas)}</section>`;
  paginas.push({
    url: m.url, prioridad: m.capital ? 0.8 : 0.6, html: pagina({
      url: m.url, title: titleT, desc, ogTitle: `Precio de la gasolina hoy en ${enDonde}`,
      crumbs: [['/', 'GasolCitys'], [`/${BASE}/`, 'Precio de la gasolina hoy'], [P.url, P.name], [m.url, m.name]],
      h1: `Precio de la gasolina hoy en ${esc(enDonde)}`,
      sub: `Gasolina 95, diésel y el resto de combustibles en las <b>${r.n} gasolineras de ${esc(enDonde)}</b>${P.tipo === 2 ? '' : ` (${esc(P.name)})`}, de la más barata a la más cara.`,
      hero: kpis(r, P.r) + ctaHero(enDonde), body,
      ld: [ldFAQ(preguntas), ...(g ? [ldLista(`Gasolineras con la gasolina 95 más barata de ${enDonde}`, g.baratas.slice(0, 5), 'g95')] : [])]
    })
  });
}

// Provincias
for (const P of provincias) {
  const r = P.r, g = r.f.g95, d = r.f.diesel;
  const top = P.munis.filter(m => m.pagina).sort((a, b) => b.lista.length - a.lista.length);
  const rank = provincias.filter(x => x.r.f.g95).sort((a, b) => a.r.f.g95.avg - b.r.f.g95.avg);
  const pos = rank.indexOf(P) + 1;
  const vecinas = P.c ? provincias.filter(x => x !== P && x.c).map(x => ({ x, d: km(P.c, x.c) })).sort((a, b) => a.d - b.d).slice(0, 6) : [];
  const enDonde = P.label;
  const mBarato = P.munis.filter(m => m.pagina && m.r.f.g95 && m.r.f.g95.n >= 2).sort((a, b) => a.r.f.g95.avg - b.r.f.g95.avg);
  const extra = [];
  if (pos) extra.push([`¿${P.tipo === 2 ? P.name : `La provincia de ${P.name}`} es de las más baratas para repostar?`, `Hoy ocupa el puesto ${pos} de ${rank.length} en precio medio de la gasolina 95 (1 es la más barata): ${eur(g.avg)} €/l frente a ${eur(ES.f.g95.avg)} €/l de media en España.`]);
  if (mBarato.length > 2) extra.push([`¿En qué municipio de ${enDonde} está más barata la gasolina?`, `De los municipios con varias gasolineras, hoy el más barato es ${mBarato[0].name} (${eur(mBarato[0].r.f.g95.avg)} €/l de media en gasolina 95) y el más caro, ${mBarato.at(-1).name} (${eur(mBarato.at(-1).r.f.g95.avg)} €/l).`]);
  const preguntas = preguntasZona(enDonde, r, extra);
  const titleT = `Gasolina más barata en ${P.tipo ? P.name : `la provincia de ${P.name}`} hoy: desde ${eur(g.min)} €`;
  const desc = `Precio de la gasolina hoy, ${FECHA_CORTA}, en ${enDonde}: gasolina 95 a ${eur(g.avg)} €/l y diésel a ${eur(d.avg)} €/l de media. Las gasolineras más baratas de cada municipio, con precios oficiales.`;
  const body = `
<section><h2>Las gasolineras más baratas de ${esc(enDonde)} hoy</h2><p class="intro">Las 10 con el litro más barato de toda ${P.tipo ? esc(P.name) : 'la provincia'}, con los datos oficiales del ${FECHA}.</p><div class="grid2">${ranking(r, 'g95', true)}${ranking(r, 'diesel', true)}</div>${ctaMini()}</section>
<section><h2>Precio de la gasolina en ${esc(enDonde)}: resumen de hoy</h2><div class="prose">${frasesZona(esc(enDonde), r, ES, 'la media de España', 'p' + P.id)}${pos ? `<p>En el ranking de las 52 provincias, ${esc(P.name)} es hoy la <strong>número ${pos}</strong> en gasolina 95 más barata.</p>` : ''}</div>${comparar(P.name, r, [['la media de España', ES]])}</section>
${top.length ? `<section><h2>Precio de la gasolina por municipios de ${esc(enDonde)}</h2><p class="intro">Precio medio en cada municipio con gasolinera. Entra en cada uno para ver todas sus gasolineras.</p>${tablaMunicipios(P)}</section>` : ''}
${serie('p' + P.id).length >= 3 ? `<section><h2>Evolución del precio en ${esc(enDonde)}</h2>${grafica('p' + P.id, enDonde)}</section>` : ''}
${top.length ? `<section><h2>Ciudades y pueblos de ${esc(enDonde)}</h2>${enlaces(top.map(m => [m.url, m.name, m.r.f.g95 ? eur(m.r.f.g95.avg) + ' €' : '']))}</section>` : ''}
${vecinas.length ? `<section><h2>Provincias cercanas</h2>${enlaces(vecinas.map(({ x }) => [x.url, x.name, eur(x.r.f.g95.avg) + ' €']))}</section>` : ''}
<section>${ctaGrande(P.name)}</section>
<section><h2>Preguntas frecuentes sobre la gasolina en ${esc(enDonde)}</h2>${faq(preguntas)}</section>`;
  paginas.push({
    url: P.url, prioridad: 0.9, html: pagina({
      url: P.url, title: titleT, desc, ogTitle: `Precio de la gasolina hoy en ${enDonde}`,
      crumbs: [['/', 'GasolCitys'], [`/${BASE}/`, 'Precio de la gasolina hoy'], [P.url, P.name]],
      h1: `Precio de la gasolina hoy en ${esc(enDonde)}`,
      sub: `Las <b>${miles(r.n)} gasolineras de ${esc(enDonde)}</b>${P.alt ? ` (${esc(P.alt)})` : ''} con su precio de hoy: las más baratas, el precio por municipios y la evolución.`,
      hero: kpis(r, ES) + ctaHero(P.name), body,
      ld: [ldFAQ(preguntas), ldLista(`Gasolineras con la gasolina 95 más barata de ${enDonde}`, g.baratas.slice(0, 5), 'g95')]
    })
  });
}

// España
{
  const r = ES, g = r.f.g95, d = r.f.diesel;
  const rank = [...provincias].sort((a, b) => a.r.f.g95.avg - b.r.f.g95.avg);
  const grandes = [...conPagina].sort((a, b) => b.lista.length - a.lista.length).slice(0, 60).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const buscador = [...conPagina.map(m => [m.name + (m.alt ? ` ${m.alt}` : ''), m.prov.name, m.url]), ...provincias.filter(P => P.tipo === 2).map(P => [P.name, P.name, P.url])].sort((a, b) => a[0].localeCompare(b[0], 'es'));
  const preguntas = [
    ['¿Cuál es el precio medio de la gasolina hoy en España?', `Con los precios oficiales del ${FECHA}, la gasolina 95 cuesta de media ${eur(g.avg)} €/l y el diésel ${eur(d.avg)} €/l en las ${miles(r.n)} gasolineras de España.`],
    ['¿Dónde está la gasolina más barata de España?', `Por provincias, hoy la más barata es ${rank[0].name} (${eur(rank[0].r.f.g95.avg)} €/l de media en gasolina 95) y la más cara, ${rank.at(-1).name} (${eur(rank.at(-1).r.f.g95.avg)} €/l). Por gasolineras, la más barata está en ${PROVM.get(g.baratas[0].prov).name}: ${nombre(g.baratas[0])} (${sitio(g.baratas[0])}), a ${eur(g.min)} €/l.`],
    ['¿Por qué Canarias, Ceuta y Melilla tienen la gasolina más barata?', 'Porque allí no se aplican el IVA ni el impuesto especial sobre hidrocarburos de la península: tienen sus propios impuestos (IGIC en Canarias, IPSI en Ceuta y Melilla), mucho más bajos.'],
    ['¿Qué día de la semana es más barato repostar?', 'Muchas gasolineras cambian sus precios varias veces por semana y suelen subirlos antes de los fines de semana y los puentes. La app GasolCitys calcula con el histórico de cada zona cuál es el mejor día para llenar el depósito.'],
    ['¿De dónde salen estos precios y cada cuánto se actualizan?', 'Son los precios oficiales que cada gasolinera está obligada a comunicar al Ministerio para la Transición Ecológica. Esta página se actualiza varias veces al día y la app GasolCitys, cada 30 minutos.']
  ];
  const body = `
<section><h2>Las gasolineras más baratas de España hoy</h2><div class="grid2">${ranking(r, 'g95', true)}${ranking(r, 'diesel', true)}</div>${ctaMini()}</section>
<section><h2>Busca tu ciudad o tu pueblo</h2><p class="intro">${conPagina.length} municipios con su precio de hoy, gasolinera a gasolinera.</p><input class="search" id="q" type="search" placeholder="Escribe tu municipio…" aria-label="Buscar municipio" autocomplete="off" list="mun"><datalist id="mun">${buscador.map(([n, p]) => `<option value="${esc(n)} (${esc(p)})">`).join('')}</datalist><ul class="links" id="res"></ul></section>
<section><h2>Precio de la gasolina hoy por provincias</h2><p class="intro">De la más barata a la más cara en gasolina 95. Toca una provincia para ver sus gasolineras y municipios.</p>${tablaProvincias()}</section>
<section><h2>Resumen de hoy en España</h2><div class="prose">${frasesZona('España', r, null, '', 'es')}<p>La provincia con la gasolina 95 más barata es <strong><a href="${rank[0].url}">${esc(rank[0].name)}</a></strong> (${eur(rank[0].r.f.g95.avg)} €/l) y la más cara, <strong><a href="${rank.at(-1).url}">${esc(rank.at(-1).name)}</a></strong> (${eur(rank.at(-1).r.f.g95.avg)} €/l).</p></div></section>
${serie('es').length >= 3 ? `<section><h2>Evolución del precio en España</h2>${grafica('es', 'España')}</section>` : ''}
<section><h2>Precio de la gasolina en las principales ciudades</h2>${enlaces(grandes.map(m => [m.url, m.label, m.r.f.g95 ? eur(m.r.f.g95.avg) + ' €' : '']))}</section>
<section>${ctaGrande('toda España')}</section>
<section><h2>Preguntas frecuentes</h2>${faq(preguntas)}</section>
<script>(function(){var d=${JSON.stringify(buscador.map(([n, p, u]) => [n, p, u]))},q=document.getElementById('q'),o=document.getElementById('res');function n(s){return s.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase()}function go(){var t=n(q.value.replace(/\\s*\\(.*$/,'')).trim();if(t.length<2){o.innerHTML='';return}var r=d.filter(function(x){return n(x[0]).indexOf(t)===0}).concat(d.filter(function(x){var a=n(x[0]);return a.indexOf(t)>0})).slice(0,12);o.innerHTML=r.map(function(x){return '<li><a href="'+x[2]+'">'+x[0]+' <small>'+x[1]+'</small></a></li>'}).join('')}q.addEventListener('input',go);q.addEventListener('change',function(){var t=n(q.value.replace(/\\s*\\(.*$/,''));var x=d.find(function(x){return n(x[0])===t});if(x)location.href=x[2]})})();</script>`;
  paginas.push({
    url: `/${BASE}/`, prioridad: 1, html: pagina({
      url: `/${BASE}/`, title: `Precio de la gasolina hoy en España (${FECHA_CORTA}): por provincias y ciudades`,
      desc: `Precio de la gasolina hoy, ${FECHA_CORTA}: gasolina 95 a ${eur(g.avg)} €/l y diésel a ${eur(d.avg)} €/l de media en España. Las gasolineras más baratas de cada provincia y municipio, con precios oficiales.`,
      ogTitle: 'Precio de la gasolina hoy en España',
      crumbs: [['/', 'GasolCitys'], [`/${BASE}/`, 'Precio de la gasolina hoy']],
      h1: 'Precio de la gasolina hoy en España',
      sub: `Gasolina 95, diésel y el resto de combustibles en las <b>${miles(r.n)} gasolineras de España</b>: las más baratas, por provincias y en ${conPagina.length} ciudades y pueblos.`,
      hero: kpis(r) + ctaHero('tu zona'), body,
      ld: [ldFAQ(preguntas), ldLista('Gasolineras con la gasolina 95 más barata de España', g.baratas.slice(0, 5), 'g95')]
    })
  });
}

/* ---------- escritura: solo lo que cambia (la hora del día no cuenta) ---------- */
const huella = html => createHash('sha1').update(html.replace(/<!--t-->.*?<!--\/t-->/g, '').replace(/"dateModified":"[^"]*"/g, '')).digest('hex').slice(0, 16);
const cambiadas = [];
const ahora = new Date().toISOString();
for (const p of paginas) {
  const f = new URL('.' + p.url + 'index.html', ROOT);
  const h = huella(p.html);
  const prev = estado.paginas[p.url];
  if (prev && prev.h === h && await existe(f)) continue;
  await mkdir(new URL('.', f), { recursive: true });
  await writeFile(f, p.html);
  estado.paginas[p.url] = { ...(prev || {}), h, mod: ISO, pr: p.prioridad };
  cambiadas.push(p.url);
}

/* ---------- sitemap ---------- */
const fijas = [['/', 1], ['/estadisticas.html', 0.7]];
const urls = [...fijas.map(([u, pr]) => ({ u, pr, mod: ISO.slice(0, 10) })), ...paginas.map(p => ({ u: p.url, pr: p.prioridad, mod: estado.paginas[p.url].mod }))];
await writeFile(new URL('sitemap.xml', ROOT), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(x => `  <url><loc>${SITE}${x.u}</loc><lastmod>${x.mod}</lastmod><changefreq>${x.u === '/' ? 'weekly' : 'daily'}</changefreq><priority>${x.pr.toFixed(1)}</priority></url>`).join('\n')}
</urlset>
`);

/* ---------- IndexNow (Bing, DuckDuckGo, Yahoo, Ecosia, Yandex, Seznam, Naver…) ---------- */
if (process.env.INDEXNOW === '1') {
  // cada página como mucho una vez cada 20 h: los precios cambian a diario y así no se abusa del servicio
  const limite = Date.now() - 20 * 3600e3;
  const avisar = paginas.map(p => p.url).filter(u => !estado.paginas[u].aviso || (cambiadas.includes(u) && Date.parse(estado.paginas[u].aviso) < limite));
  if (avisar.length) {
    try {
      const r = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ host: 'gasolcitys.com', key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: avisar.map(u => SITE + u) })
      });
      console.log(`IndexNow: ${avisar.length} páginas → HTTP ${r.status}`);
      if (r.ok) avisar.forEach(u => { estado.paginas[u].aviso = ahora; });
    } catch (e) { console.warn('IndexNow no respondió:', e.message); }
  }
}

await writeFile(F_ESTADO, JSON.stringify(estado));
await writeFile(F_HIST, JSON.stringify(hist));
console.log(`páginas: ${paginas.length} (${provincias.length} provincias, ${conPagina.length} municipios) · cambiadas ${cambiadas.length} · ${raw.Fecha}`);
