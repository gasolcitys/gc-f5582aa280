// Pines de Pinterest automáticos: una vez al día crea las imágenes (1000×1500) de las provincias y municipios
// que tocan y los feeds RSS por comunidad (gasolcitys.com/pinterest/<comunidad>.xml). Pinterest lee cada feed
// a diario y publica sus entradas nuevas como pines en el tablero conectado a ese feed.
//
// Uso: node scripts/build-pinterest.mjs --toca                         sale con 0 si hoy toca generar (si no, con 1)
//      node scripts/build-pinterest.mjs <pin-datos.json> <dir-imagenes> [--forzar]
// pin-datos.json lo escribe build-seo.mjs con PIN_DATOS=<ruta>. Las imágenes se suben a la rama «pinterest-img»
// (ver .github/workflows/stats.yml) y Pinterest las copia al crear el pin.
// Necesita @resvg/resvg-js; RESVG_DIR = carpeta donde está instalado (npm i --prefix <carpeta>).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://gasolcitys.com';
const IMG_BASE = 'https://raw.githubusercontent.com/gasolcitys/gc-f5582aa280/pinterest-img';
const ROOT = new URL('../', import.meta.url);
const F_ESTADO = new URL('data/pinterest-estado.json', ROOT);
const DIR_FEEDS = new URL('pinterest/', ROOT);
const FUENTES = new URL('scripts/fuentes/', ROOT);
const HORA_MIN = 8;              // no antes de las 8:00 de Madrid (los precios del día ya están asentados)
const DIAS_FEED = 4;             // días que se queda cada entrada en el feed: así ninguna comunidad se queda con el feed vacío
const ARRANQUE = 14;             // días de arranque suave con la cuenta nueva
// 25 pines al día como máximo: cabe en las 1.000 operaciones al mes del plan gratuito de Make (≈ pines + 2 por día)
const RITMO = { arranque: { prov: 15, mun: 0 }, normal: { prov: 18, mun: 7 } };

// IDCCAA del Ministerio -> [nombre del tablero, feed]. Ceuta y Melilla comparten tablero.
const CCAA = {
  '01': ['Andalucía', 'andalucia'], '02': ['Aragón', 'aragon'], '03': ['Asturias', 'asturias'], '04': ['Baleares', 'baleares'],
  '05': ['Canarias', 'canarias'], '06': ['Cantabria', 'cantabria'], '07': ['Castilla-La Mancha', 'castilla-la-mancha'],
  '08': ['Castilla y León', 'castilla-y-leon'], '09': ['Cataluña', 'cataluna'], '10': ['Comunidad Valenciana', 'comunidad-valenciana'],
  '11': ['Extremadura', 'extremadura'], '12': ['Galicia', 'galicia'], '13': ['Madrid', 'madrid'], '14': ['Región de Murcia', 'murcia'],
  '15': ['Navarra', 'navarra'], '16': ['País Vasco', 'pais-vasco'], '17': ['La Rioja', 'la-rioja'],
  '18': ['Ceuta y Melilla', 'ceuta-y-melilla'], '19': ['Ceuta y Melilla', 'ceuta-y-melilla']
};

const RSS_HASTA = '2026-11-26';
// IDCCAA -> id del tablero de Pinterest (lo usa Make para crear el pin)
const TABLERO = {};

const leerJSON = async (f, d) => { try { return JSON.parse(await readFile(f, 'utf8')); } catch { return d; } };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const eur = v => v.toFixed(3).replace('.', ',');
const eur2 = v => v.toFixed(2).replace('.', ',');
const madrid = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: +p.hour };
};
const diasEntre = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const idDe = url => url.replace(/^\/precio-gasolina\/?/, '').replace(/\/$/, '').replace(/\//g, '-') || 'espana';

const estado = await leerJSON(F_ESTADO, { inicio: null, dia: null, ip: 0, im: 0, items: [] });
const hoy = madrid();
const toca = estado.dia !== hoy.dia && hoy.hora >= HORA_MIN;

if (process.argv[2] === '--toca') process.exit(toca ? 0 : 1);

const [, , fDatos, dirImg] = process.argv;
if (!fDatos || !dirImg) { console.error('Uso: node scripts/build-pinterest.mjs <pin-datos.json> <dir-imagenes> [--forzar]'); process.exit(2); }
const forzar = process.argv.includes('--forzar');
if (!toca && !forzar) { console.log(`Pinterest: hoy (${hoy.dia}) ya está hecho o es antes de las ${HORA_MIN}:00`); process.exit(0); }

const datos = JSON.parse(await readFile(fDatos, 'utf8'));
if (datos.dia !== hoy.dia && !forzar) { console.log(`Pinterest: los datos oficiales son del ${datos.dia}, se espera a los de hoy`); process.exit(0); }

/* ---------- qué toca hoy: provincias y municipios por turnos ---------- */
const inicio = estado.inicio || datos.dia;
// el primer día salen todas las provincias, para que los 18 feeds tengan contenido al conectarlos
const ritmo = !estado.inicio ? { prov: 999, mun: 0 } : diasEntre(inicio, datos.dia) < ARRANQUE ? RITMO.arranque : RITMO.normal;
const provs = datos.lugares.filter(x => x.tipo !== 'municipio').sort((a, b) => a.url.localeCompare(b.url));
const munis = datos.lugares.filter(x => x.tipo === 'municipio').sort((a, b) => b.n - a.n || a.url.localeCompare(b.url));
const turno = (lista, desde, n) => Array.from({ length: Math.min(n, lista.length) }, (_, i) => lista[(desde + i) % lista.length]);
// si hoy ya se generó (repetición), se parte de los mismos contadores del día para no saltarse provincias
const mismoDia = estado.dia === datos.dia && estado.ip0 != null;
const ip0 = mismoDia ? estado.ip0 : estado.ip, im0 = mismoDia ? estado.im0 : estado.im;
const hoyToca = [...turno(provs, ip0, ritmo.prov), ...turno(munis, im0, ritmo.mun)];

/* ---------- textos del pin (van cambiando para no repetir siempre lo mismo) ---------- */
const DIAS_CORTOS = { lunes: 'lun', martes: 'mar', miércoles: 'mié', jueves: 'jue', viernes: 'vie', sábado: 'sáb', domingo: 'dom' };
function quien(x) {
  if (x.tipo === 'municipio') return { corto: x.nombre, largo: x.capital && x.nombre === x.prov ? `${x.nombre} capital` : `${x.nombre} (${x.prov})`, sub: x.capital ? `Capital de provincia` : `Provincia de ${x.prov}` };
  if (x.tipo === 'provincia') return { corto: x.nombre, largo: `la provincia de ${x.nombre}`, sub: 'Toda la provincia' };
  if (x.tipo === 'comunidad') return { corto: x.nombre, largo: x.nombre, sub: 'Toda la comunidad' };
  return { corto: x.nombre, largo: x.nombre, sub: 'Ciudad autónoma' };
}
function textos(x, k) {
  const q = quien(x), g = x.f.g95, d = x.f.diesel, principal = g || d;
  const tipoP = g ? 'gasolina 95' : 'diésel';
  const titulos = [
    `Gasolina más barata hoy en ${q.largo}: ${eur(principal.min)} €/l`,
    `Dónde repostar más barato en ${q.largo} hoy (${datos.fecha})`,
    `Precio de la gasolina hoy en ${q.largo}, ${datos.fecha}`,
    `Gasolineras más baratas de ${q.largo} · ${datos.fecha}`
  ];
  let titulo = titulos[k % titulos.length];
  if (titulo.length > 100) titulo = `Gasolina más barata hoy en ${q.corto}`;
  const partes = [];
  if (g) partes.push(`la gasolina 95 más barata de ${q.largo} está a ${eur(g.min)} €/l en ${g.est.marca} (${g.est.dir}${g.est.mun && g.est.mun !== x.nombre ? ', ' + g.est.mun : ''}), frente a una media de ${eur(g.avg)} €/l`);
  if (d) partes.push(`el diésel más barato, a ${eur(d.min)} €/l (media ${eur(d.avg)} €/l)`);
  const ahorro = (principal.avg - principal.min) * 50;
  let desc = `${datos.diaSemana[0].toUpperCase() + datos.diaSemana.slice(1)} ${datos.fecha}: ${partes.join('; ')}. ` +
    (ahorro >= 1 ? `Llenar un depósito de 50 litros de ${tipoP} en la más barata ahorra ${eur2(ahorro)} € frente a la media. ` : '') +
    `Mira las ${x.n} gasolineras de ${q.largo} con sus precios oficiales de hoy y descarga GasolCitys, la app con el semáforo de precios.`;
  if (desc.length > 490) desc = desc.slice(0, 487).replace(/\s+\S*$/, '') + '…';
  return { titulo, desc };
}

/* ---------- imagen ---------- */
// ancho aproximado de un texto en Poppins (en «em»), para ajustar tamaños y recortar
function ancho(s, peso = 800) {
  let w = 0;
  for (const c of s) {
    if (' .,:;·\'’|!'.includes(c)) w += 0.3;
    else if ('iljtfrI()-/'.includes(c)) w += 0.38;
    else if ('mwMW'.includes(c)) w += 0.92;
    else if (/[A-ZÁÉÍÓÚÑ]/.test(c)) w += 0.72;
    else if (/\d/.test(c)) w += 0.64;
    else w += 0.6;
  }
  return w * (peso >= 800 ? 1.04 : peso >= 700 ? 1 : 0.98);
}
function recorta(s, px, max, peso) {
  if (ancho(s, peso) * px <= max) return s;
  while (s.length > 3 && ancho(s + '…', peso) * px > max) s = s.slice(0, -1);
  return s.trimEnd().replace(/[,·-]$/, '') + '…';
}
// nombre del sitio: lo más grande que quepa, en una o dos líneas
function rotulo(nombre, max = 860) {
  for (let px = 150; px >= 96; px -= 6) if (ancho(nombre) * px <= max) return { px, lineas: [nombre] };
  const pal = nombre.split(/(?<=[\s-])/);
  let mejor = null;
  for (let i = 1; i < pal.length; i++) {
    const a = pal.slice(0, i).join('').trim(), b = pal.slice(i).join('').trim();
    const w = Math.max(ancho(a), ancho(b));
    if (!mejor || w < mejor.w) mejor = { w, lineas: [a, b] };
  }
  if (!mejor) mejor = { w: ancho(nombre), lineas: [nombre] };
  const px = Math.max(60, Math.min(124, Math.floor(max / mejor.w)));
  return { px, lineas: mejor.lineas.map(l => recorta(l, px, max, 800)) };
}
const LOGO = (x, y, h) => {
  const s = h / 440;
  return `<g transform="translate(${x} ${y}) scale(${s}) translate(-340 -180)"><path d="M640 382 L512 205 L393 360 A146 146 0 1 0 657 462" fill="none" stroke="#fff" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/><path fill="#22B866" d="M518 437 H560 V483 H518 A23 23 0 0 1 518 437 Z"/><rect fill="#FFC531" x="567" y="437" width="41" height="46"/><path fill="#FF515B" d="M615 437 H657 A23 23 0 0 1 657 483 H615 Z"/></g>`;
};
function tarjeta(y, etiqueta, color, f, nombreSitio) {
  const est = recorta(`${f.est.marca} · ${f.est.dir}${f.est.mun && f.est.mun !== nombreSitio ? ', ' + f.est.mun : ''}`, 30, 750, 500);
  const dif = f.avg - f.min;
  const pill = dif >= 0.005 ? `${eur2(dif)} € menos que la media` : 'Al precio de la media';
  const pw = Math.round(ancho(pill, 700) * 26 + 44);
  return `<g>
  <rect x="70" y="${y}" width="860" height="300" rx="36" fill="#FFFFFF"/>
  <circle cx="120" cy="${y + 60}" r="13" fill="${color}"/>
  <text x="146" y="${y + 72}" font-size="34" font-weight="700" fill="#5B6B88" letter-spacing="2">${esc(etiqueta)}</text>
  <rect x="${930 - 40 - pw}" y="${y + 32}" width="${pw}" height="54" rx="27" fill="#E3F7EC"/>
  <text x="${930 - 40 - pw / 2}" y="${y + 68}" font-size="26" font-weight="700" fill="#14824A" text-anchor="middle">${esc(pill)}</text>
  <text x="104" y="${y + 196}" font-size="124" font-weight="800" fill="#0B2350">${eur(f.min)}<tspan font-size="58" font-weight="700" dx="14">€/l</tspan></text>
  <text x="106" y="${y + 258}" font-size="30" font-weight="500" fill="#5B6B88">${esc(est)}</text>
</g>`;
}
function svg(x) {
  const q = quien(x), r = rotulo(q.corto);
  const fecha = `${DIAS_CORTOS[datos.diaSemana] || datos.diaSemana} ${datos.fecha}`;
  const fw = Math.round(ancho(fecha, 700) * 32 + 56);
  let y = 300;
  const lineas = r.lineas.map((l, i) => `<text x="70" y="${y + 40 + r.px * 0.82 + i * r.px * 1.02}" font-size="${r.px}" font-weight="800" fill="#FFFFFF">${esc(l)}</text>`).join('');
  y += 40 + r.px * 0.82 + (r.lineas.length - 1) * r.px * 1.02;
  const sub = `${q.sub} · ${x.n} gasolineras`;
  const yc = Math.max(y + 110, 600);
  const cards = [];
  if (x.f.g95) cards.push(['GASOLINA 95', '#22B866', x.f.g95]);
  if (x.f.diesel) cards.push(['DIÉSEL', '#FFC531', x.f.diesel]);
  const principal = x.f.g95 || x.f.diesel;
  const ahorro = (principal.avg - principal.min) * 50;
  const yFin = yc + cards.length * 330;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1500" viewBox="0 0 1000 1500" font-family="Poppins">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#2F6FD6"/><stop offset="0.55" stop-color="#1F4F9C"/><stop offset="1" stop-color="#1A4589"/></linearGradient></defs>
<rect width="1000" height="1500" fill="url(#bg)"/>
<circle cx="930" cy="140" r="260" fill="#FFFFFF" opacity="0.05"/>
${LOGO(70, 66, 86)}
<text x="150" y="124" font-size="46" font-weight="800" fill="#FFFFFF">GasolCitys</text>
<rect x="${930 - fw}" y="76" width="${fw}" height="64" rx="32" fill="#FFC531"/>
<text x="${930 - fw / 2}" y="119" font-size="32" font-weight="700" fill="#0B2350" text-anchor="middle">${esc(fecha)}</text>
<text x="70" y="290" font-size="56" font-weight="700" fill="#CFE0FA">Gasolina más barata hoy en</text>
${lineas}
<text x="72" y="${y + 62}" font-size="36" font-weight="500" fill="#C9D8F2">${esc(recorta(sub, 36, 860, 500))}</text>
${cards.map((c, i) => tarjeta(yc + i * 330, c[0], c[1], c[2], x.nombre)).join('\n')}
${ahorro >= 1 && yFin < 1290 ? `<text x="70" y="${yFin + 40}" font-size="38" font-weight="700" fill="#FFFFFF">Llenar 50 l aquí: <tspan fill="#FFC531">${eur2(ahorro)} € menos</tspan> que la media</text>` : ''}
<rect x="0" y="1330" width="1000" height="170" fill="#0B2350"/>
<text x="70" y="1398" font-size="34" font-weight="500" fill="#C9D8F2">Todas las gasolineras, con el precio de hoy</text>
<text x="70" y="1462" font-size="58" font-weight="800" fill="#FFC531">gasolcitys.com</text>
<text x="930" y="1460" font-size="24" font-weight="500" fill="#8FA6CC" text-anchor="end">Precios oficiales del Ministerio</text>
</svg>`;
}

const req = createRequire(path.join(path.resolve(process.env.RESVG_DIR || '.'), 'noop.js'));
const { Resvg } = req('@resvg/resvg-js');
const fuentes = ['Poppins-Medium.ttf', 'Poppins-Bold.ttf', 'Poppins-ExtraBold.ttf'].map(f => path.join(fileURLToPath(FUENTES), f));
const pinta = s => new Resvg(s, { font: { fontFiles: fuentes, loadSystemFonts: false, defaultFontFamily: 'Poppins' }, fitTo: { mode: 'width', value: 1000 } }).render().asPng();

/* ---------- generar ---------- */
const carpeta = path.join(dirImg, datos.dia);
await mkdir(carpeta, { recursive: true });
const ahoraISO = new Date().toISOString();
const nuevos = [];
const semilla = diasEntre('2026-01-01', datos.dia);
hoyToca.forEach((x, i) => {
  const id = idDe(x.url);
  const png = pinta(svg(x));
  nuevos.push({ x, id, png, ...textos(x, semilla + i) });
});
for (const n of nuevos) await writeFile(path.join(carpeta, n.id + '.png'), n.png);

const limite = new Date(Date.parse(datos.dia + 'T12:00:00Z') - (DIAS_FEED - 1) * 864e5).toISOString().slice(0, 10);
// si el mismo día se genera dos veces, las entradas que ya estaban se quedan tal cual (mismo guid = Pinterest no repite)
const previos = estado.items.filter(it => it.dia >= limite);
const yaEstan = new Set(previos.map(it => it.guid));
const items = [
  ...previos,
  ...nuevos.filter(n => !yaEstan.has(`pin-${datos.dia}-${n.id}`)).map(n => ({
    guid: `pin-${datos.dia}-${n.id}`, dia: datos.dia, fecha: ahoraISO, ccaa: n.x.ccaa, titulo: n.titulo, desc: n.desc,
    // la fecha hace único el enlace de cada día: Pinterest no publica una entrada del RSS con un enlace que ya publicó
    // (la página es la misma y su etiqueta canonical apunta a la URL limpia, así que no afecta al SEO)
    link: `${SITE}${n.x.url}?utm_source=pinterest&utm_medium=pin&utm_campaign=${n.id}&utm_content=${datos.dia}`,
    img: `${IMG_BASE}/${datos.dia}/${n.id}.png`, bytes: n.png.length
  }))
];

/* ---------- pines de hoy para Make (publica en Pinterest con su integración oficial) ---------- */
// Make lee gasolcitys.com/pinterest/hoy.json a diario y crea cada pin en su tablero. El RSS de Pinterest dejó de
// publicar a partir del 27-nov-2026 (descarta entradas sin avisar), así que los feeds se quedan congelados.
await mkdir(DIR_FEEDS, { recursive: true });
await writeFile(new URL('hoy.json', DIR_FEEDS), JSON.stringify({
  dia: datos.dia,
  pines: items.filter(it => it.dia === datos.dia).map(it => ({ tablero: TABLERO[it.ccaa] || '', comunidad: CCAA[it.ccaa][0], titulo: it.titulo.slice(0, 100), descripcion: it.desc.slice(0, 500), enlace: it.link, imagen: it.img }))
}, null, 1));

/* ---------- feeds por comunidad (congelados: solo las entradas que ya publicó Pinterest) ---------- */
await mkdir(DIR_FEEDS, { recursive: true });
const feeds = new Map();
for (const [id, [nombre, slugF]] of Object.entries(CCAA)) if (!feeds.has(slugF)) feeds.set(slugF, { nombre, ids: [] });
for (const [id, [, slugF]] of Object.entries(CCAA)) feeds.get(slugF).ids.push(id);
const rfc822 = iso => new Date(iso).toUTCString();
for (const [slugF, { nombre, ids }] of feeds) {
  const suyos = items.filter(it => it.dia <= RSS_HASTA && ids.includes(it.ccaa)).sort((a, b) => b.fecha.localeCompare(a.fecha) || a.guid.localeCompare(b.guid));
  await writeFile(new URL(`${slugF}.xml`, DIR_FEEDS), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
<title>${esc(`Precio de la gasolina hoy en ${nombre} · GasolCitys`)}</title>
<link>${SITE}/precio-gasolina/</link>
<atom:link href="${SITE}/pinterest/${slugF}.xml" rel="self" type="application/rss+xml"/>
<description>${esc(`Las gasolineras más baratas de ${nombre}, cada día, con los precios oficiales del Ministerio.`)}</description>
<language>es-ES</language>
<lastBuildDate>${rfc822(ahoraISO)}</lastBuildDate>
${suyos.map(it => `<item>
  <title>${esc(it.titulo)}</title>
  <link>${esc(it.link)}</link>
  <guid isPermaLink="false">${esc(it.guid)}</guid>
  <pubDate>${rfc822(it.fecha)}</pubDate>
  <description>${esc(it.desc)}</description>
  <enclosure url="${esc(it.img)}" length="${it.bytes}" type="image/png"/>
  <media:content url="${esc(it.img)}" medium="image" type="image/png" width="1000" height="1500"/>
</item>`).join('\n')}
</channel>
</rss>
`);
}

estado.inicio = inicio;
estado.dia = datos.dia;
estado.ip0 = ip0;
estado.im0 = im0;
estado.ip = provs.length ? (ip0 + Math.min(ritmo.prov, provs.length)) % provs.length : 0;
estado.im = munis.length ? (im0 + ritmo.mun) % munis.length : 0;
estado.items = items;
await writeFile(F_ESTADO, JSON.stringify(estado, null, 1));
console.log(`Pinterest ${datos.dia}: ${nuevos.length} pines (${nuevos.filter(n => n.x.tipo !== 'municipio').length} provincias + ${nuevos.filter(n => n.x.tipo === 'municipio').length} municipios) · ${feeds.size} feeds · ${items.length} entradas en total`);
