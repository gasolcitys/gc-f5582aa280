// Publica en Telegram, en el grupo de cada comunidad autónoma, las 3 gasolineras más baratas
// de cada provincia para los combustibles más repostados. Los mensajes no citan la fuente de los datos (lo pidió el usuario).
// Se publica en el grupo de cada comunidad (data/telegram-canales.json), donde el bot es administrador;
// si la comunidad aún no tiene grupo, en su canal.
//
// Uso: node scripts/telegram-ccaa.mjs [--json ruta-oficial] [--prueba] [--ccaa 13,08] [--horas 7,19] [--a @destino]
//   --prueba      no envía nada: escribe los mensajes en la consola
//   --ccaa        solo esas comunidades (IDCCAA del Ministerio)
//   --horas       solo publica si en Madrid es una de esas horas (para el cron de GitHub, que va en UTC)
//   --a           envía los mensajes de todas las comunidades a ese chat en vez de a su canal (para probar)
// El token del bot va en la variable de entorno TELEGRAM_BOT_TOKEN. Los canales, en data/telegram-canales.json.
import { readFile } from 'node:fs/promises';

const API = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';
const CANALES = new URL('../data/telegram-canales.json', import.meta.url);
const WEB = 'https://gasolcitys.com';
const MADRID = 'Europe/Madrid';
const TOP = 3;
const MAX_CHARS = 3900;      // Telegram admite 4096
const MAX_ENTIDADES = 90;    // negritas + enlaces por mensaje (Telegram corta a partir de 100)

// Los 7 combustibles más repostados en España (por número de gasolineras que los venden)
const FUELS = [
  ['Precio Gasolina 95 E5', 'Gasolina 95', '🟢'],
  ['Precio Gasoleo A', 'Diésel', '⚫'],
  ['Precio Gasolina 98 E5', 'Gasolina 98', '🔵'],
  ['Precio Gasoleo Premium', 'Diésel Premium', '🟤'],
  ['Precio Gasolina 95 E5 Premium', 'Gasolina 95 Premium', '🟡'],
  ['Precio Gases licuados del petróleo', 'GLP (autogás)', '🟠'],
  ['Precio Diésel Renovable', 'Diésel renovable (HVO)', '🌱']
];

const CCAA = {
  '01': 'Andalucía', '02': 'Aragón', '03': 'Asturias', '04': 'Illes Balears', '05': 'Canarias', '06': 'Cantabria',
  '07': 'Castilla-La Mancha', '08': 'Castilla y León', '09': 'Cataluña', '10': 'Comunitat Valenciana', '11': 'Extremadura',
  '12': 'Galicia', '13': 'Comunidad de Madrid', '14': 'Región de Murcia', '15': 'Navarra', '16': 'País Vasco',
  '17': 'La Rioja', '18': 'Ceuta', '19': 'Melilla'
};

// IDCCAA -> nombre corto del enlace de descarga (gasolcitys.com/tg/?c=...), para medir cada grupo en GoatCounter
const SLUG = {
  '01': 'andalucia', '02': 'aragon', '03': 'asturias', '04': 'baleares', '05': 'canarias', '06': 'cantabria',
  '07': 'castilla-la-mancha', '08': 'castilla-y-leon', '09': 'cataluna', '10': 'valenciana', '11': 'extremadura',
  '12': 'galicia', '13': 'madrid', '14': 'murcia', '15': 'navarra', '16': 'pais-vasco', '17': 'la-rioja',
  '18': 'ceuta', '19': 'melilla'
};

// IDProvincia -> [nombre, ruta de su página en la web]
const PROV = {
  '01': ['Álava', 'alava'], '02': ['Albacete', 'albacete'], '03': ['Alicante', 'alicante'], '04': ['Almería', 'almeria'],
  '05': ['Ávila', 'avila'], '06': ['Badajoz', 'badajoz'], '07': ['Illes Balears', 'baleares'], '08': ['Barcelona', 'barcelona'],
  '09': ['Burgos', 'burgos'], '10': ['Cáceres', 'caceres'], '11': ['Cádiz', 'cadiz'], '12': ['Castellón', 'castellon'],
  '13': ['Ciudad Real', 'ciudad-real'], '14': ['Córdoba', 'cordoba'], '15': ['A Coruña', 'a-coruna'], '16': ['Cuenca', 'cuenca'],
  '17': ['Girona', 'girona'], '18': ['Granada', 'granada'], '19': ['Guadalajara', 'guadalajara'], '20': ['Guipúzcoa', 'guipuzcoa'],
  '21': ['Huelva', 'huelva'], '22': ['Huesca', 'huesca'], '23': ['Jaén', 'jaen'], '24': ['León', 'leon'], '25': ['Lleida', 'lleida'],
  '26': ['La Rioja', 'la-rioja'], '27': ['Lugo', 'lugo'], '28': ['Madrid', 'madrid'], '29': ['Málaga', 'malaga'],
  '30': ['Murcia', 'murcia'], '31': ['Navarra', 'navarra'], '32': ['Ourense', 'ourense'], '33': ['Asturias', 'asturias'],
  '34': ['Palencia', 'palencia'], '35': ['Las Palmas', 'las-palmas'], '36': ['Pontevedra', 'pontevedra'],
  '37': ['Salamanca', 'salamanca'], '38': ['Santa Cruz de Tenerife', 'santa-cruz-de-tenerife'], '39': ['Cantabria', 'cantabria'],
  '40': ['Segovia', 'segovia'], '41': ['Sevilla', 'sevilla'], '42': ['Soria', 'soria'], '43': ['Tarragona', 'tarragona'],
  '44': ['Teruel', 'teruel'], '45': ['Toledo', 'toledo'], '46': ['Valencia', 'valencia'], '47': ['Valladolid', 'valladolid'],
  '48': ['Vizcaya', 'vizcaya'], '49': ['Zamora', 'zamora'], '50': ['Zaragoza', 'zaragoza'], '51': ['Ceuta', 'ceuta'],
  '52': ['Melilla', 'melilla']
};

/* ---------- argumentos ---------- */
const args = process.argv.slice(2);
const arg = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const PRUEBA = args.includes('--prueba');
const SOLO = arg('--ccaa')?.split(',').map(s => s.trim().padStart(2, '0'));
const HORAS = arg('--horas')?.split(',').map(Number);
const DESTINO = arg('--a');

const ahora = new Date();
const horaMadrid = +new Intl.DateTimeFormat('es-ES', { timeZone: MADRID, hour: 'numeric', hourCycle: 'h23' }).format(ahora);
if (HORAS && !HORAS.includes(horaMadrid)) {
  console.log(`En Madrid son las ${horaMadrid}h; solo se publica a las ${HORAS.join(', ')}h. Nada que hacer.`);
  process.exit(0);
}

/* ---------- utilidades ---------- */
const num = s => (s ? parseFloat(s.replace(',', '.')) : NaN);
const ok = v => v > 0.3 && v < 5;
const eur = v => v.toFixed(3).replace('.', ',');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const PEQ = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'a', 'en', 'al', 'i', 'les', 'dels', 'da', 'do', 'das', 'dos', 'o', 'e']);
const titulo = s => s.toLowerCase().replace(/\s+/g, ' ').trim()
  .replace(/[^\s]+/g, (w, i) => (i > 0 && PEQ.has(w) ? w : w.replace(/(^|[-'’(\/.])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())));
function marca(r) {
  r = (r || '').trim().replace(/\s+/g, ' ');
  if (!r || /^N[º°o]\s?[\d.]+$/i.test(r) || /^sin r[óo]tulo$/i.test(r)) return 'Gasolinera';
  r = r.replace(/^[^\p{L}\d]+|[^\p{L}\d.)]+$/gu, '').replace(/^cepsa\b/i, 'MOEVE');
  return r.split(' ').map((w, i) => (i > 0 && PEQ.has(w.toLowerCase()) ? w.toLowerCase()
    : w.length <= 2 || /\d/.test(w) || /\./.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join(' ') || 'Gasolinera';
}
// «Palmas de Gran Canaria (Las)» → «Las Palmas de Gran Canaria»; «Alicante/Alacant» → «Alicante»
const municipio = m => titulo(m.split('/')[0].trim().replace(/^(.*) \(([^)]{1,4})\)$/, (x, base, a) => (/'$/.test(a) ? a + base : `${a} ${base}`)));
// Telegram cuenta los caracteres visibles, sin las etiquetas ni las direcciones de los enlaces
const visible = h => h.replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot);/g, '_').length;
const mapa = e => `https://www.google.com/maps/search/?api=1&query=${num(e.Latitud).toFixed(6)},${num(e['Longitud (WGS84)']).toFixed(6)}`;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

async function datos() {
  const ruta = arg('--json');
  if (ruta) return JSON.parse(await readFile(ruta, 'utf8'));
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch(API, { headers: { Accept: 'application/json' } }); if (r.ok) return await r.json(); } catch (e) { console.warn('intento', i + 1, e.message); }
    await new Promise(r => setTimeout(r, 10000));
  }
  throw new Error('No se han podido descargar los precios oficiales');
}

/* ---------- mensajes ---------- */
// Bloque de una provincia: las 3 más baratas de cada combustible (solo gasolineras de venta al público)
function bloqueProvincia(idProv, estaciones) {
  const [nombre, ruta] = PROV[idProv] || [titulo(estaciones[0].Provincia), ''];
  const lineas = [`📍 <b>${esc(nombre.toUpperCase())}</b>`];
  let entidades = 1;
  for (const [campo, fuel, icono] of FUELS) {
    const todas = estaciones.map(e => ({ e, p: num(e[campo]) })).filter(x => ok(x.p)).sort((a, b) => a.p - b.p || a.e.IDEESS - b.e.IDEESS);
    if (!todas.length) continue;
    // Fuera precios anómalos (errores de carga o tarifas de flota): más de un 20 % por debajo de la mediana
    const mediana = todas[Math.floor(todas.length / 2)].p;
    const top = todas.filter(x => x.p >= mediana * 0.8).slice(0, TOP);
    lineas.push(`${icono} <b>${fuel}</b>`);
    entidades++;
    top.forEach(({ e, p }, i) => {
      lineas.push(`${i + 1}. ${eur(p)} € · <a href="${mapa(e)}">${esc(marca(e['Rótulo']))}</a>, ${esc(municipio(e.Municipio))}`);
      entidades++;
    });
  }
  if (ruta) { lineas.push(`🔎 <a href="${WEB}/precio-gasolina/${ruta}/">Todas las de ${esc(nombre)}</a>`); entidades++; }
  return { texto: lineas.join('\n'), entidades };
}

function mensajesComunidad(idCcaa, estaciones, fecha) {
  const porProv = new Map();
  for (const e of estaciones) { if (!porProv.has(e.IDProvincia)) porProv.set(e.IDProvincia, []); porProv.get(e.IDProvincia).push(e); }
  const bloques = [...porProv.keys()].sort((a, b) => (PROV[a]?.[0] || a).localeCompare(PROV[b]?.[0] || b, 'es'))
    .map(id => bloqueProvincia(id, porProv.get(id)));

  const [d, m, a] = fecha.split(' ')[0].split('/').map(Number);
  const hora = fecha.split(' ')[1].slice(0, 5);
  const dia = new Date(Date.UTC(a, m - 1, d, 12));
  const cabecera = `⛽ <b>Gasolineras más baratas · ${esc(CCAA[idCcaa])}</b>\n` +
    `📅 ${DIAS[dia.getUTCDay()]} ${d} de ${MESES[m - 1]} · precios de las ${hora}`;
  // El fin de los grupos es que se descarguen la app: /tg/ lleva a la tienda según el móvil y lo cuenta por comunidad.
  // Sin prometer avisos con la app cerrada (en iPhone no llegan).
  // Para crecer: invitar a reenviar el mensaje (el reenvío lleva el nombre del grupo, que se puede tocar) y
  // hashtags que Telegram y los buscadores de Telegram (TGStat, Lyzem…) indexan.
  const grupo = canales[idCcaa]?.grupo?.startsWith('@') ? canales[idCcaa].grupo.slice(1) : '';
  const etiqueta = CCAA[idCcaa].normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^(Comunidad de|Region de|Comunitat|Illes)\s+/i, '').replace(/[^A-Za-z]/g, '');
  const pie = `📲 <b>Todas las gasolineras en el mapa y la previsión de la semana</b>, en la app gratis → ` +
    `<a href="${WEB}/tg/?c=${SLUG[idCcaa]}">Descargar GasolCitys</a>` +
    (grupo ? `\n👥 ¿Conoces a alguien que reposte en ${esc((/^(Comunidad|Región|Comunitat)/.test(CCAA[idCcaa]) ? 'la ' : /^País/.test(CCAA[idCcaa]) ? 'el ' : '') + CCAA[idCcaa])}? Reenvíale este mensaje o pásale t.me/${grupo}` : '') +
    `\n#gasolina #diesel #Gasolina${etiqueta} #GasolinerasBaratas`;

  // Se agrupan provincias enteras en cada mensaje sin pasar de los límites de Telegram
  const partes = [];
  let actual = { texto: cabecera, entidades: 2 };
  for (const b of bloques) {
    const junto = actual.texto + '\n\n' + b.texto;
    if (actual.texto !== cabecera && (visible(junto) > MAX_CHARS || actual.entidades + b.entidades > MAX_ENTIDADES)) {
      partes.push(actual.texto);
      actual = { texto: b.texto, entidades: b.entidades };
    } else actual = { texto: junto, entidades: actual.entidades + b.entidades };
  }
  const conPie = actual.texto + '\n\n' + pie;
  if (visible(conPie) > MAX_CHARS || actual.entidades + 10 > 100) partes.push(actual.texto, pie);
  else partes.push(conPie);
  if (partes.length > 1) partes.forEach((t, i) => { partes[i] = t + `\n\n<i>(${i + 1}/${partes.length})</i>`; });
  return partes;
}

/* ---------- Telegram ---------- */
async function enviar(token, chat, texto) {
  for (let intento = 0; intento < 5; intento++) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: texto, parse_mode: 'HTML', link_preview_options: { is_disabled: true } })
    });
    const j = await r.json();
    if (j.ok) return;
    if (j.error_code === 429) { await new Promise(res => setTimeout(res, ((j.parameters?.retry_after || 5) + 1) * 1000)); continue; }
    throw new Error(`${chat}: ${j.error_code} ${j.description}`);
  }
  throw new Error(`${chat}: demasiados reintentos`);
}

/* ---------- principal ---------- */
const oficial = await datos();
const publicas = oficial.ListaEESSPrecio.filter(e => e['Tipo Venta'] === 'P'); // fuera cooperativas y venta restringida
const canales = JSON.parse(await readFile(CANALES, 'utf8')).canales;
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!PRUEBA && !token) throw new Error('Falta la variable de entorno TELEGRAM_BOT_TOKEN');

const fallos = [];
let enviados = 0;
for (const id of Object.keys(CCAA).sort()) {
  if (SOLO && !SOLO.includes(id)) continue;
  // Se publica directamente en el grupo (el bot es administrador); las comunidades sin grupo, en su canal.
  const chats = DESTINO ? [DESTINO] : [canales[id]?.grupo || canales[id]?.canal].filter(Boolean);
  const mensajes = mensajesComunidad(id, publicas.filter(e => e.IDCCAA === id), oficial.Fecha);
  if (PRUEBA) {
    console.log(`\n==================== ${CCAA[id]} → ${chats.join(' + ') || '(sin canal ni grupo)'} · ${mensajes.length} mensaje(s)`);
    mensajes.forEach(t => console.log(`---- ${visible(t)} caracteres visibles\n${t}`));
    continue;
  }
  if (!chats.length) { console.log(`${CCAA[id]}: sin canal ni grupo configurado, se salta`); continue; }
  for (const chat of chats) {
    try {
      for (const t of mensajes) { await enviar(token, chat, t); enviados++; await new Promise(r => setTimeout(r, 1500)); }
      console.log(`${CCAA[id]} → ${chat}: ${mensajes.length} mensaje(s)`);
    } catch (e) { fallos.push(e.message); console.error('ERROR', e.message); }
  }
}
if (!PRUEBA) console.log(`Enviados ${enviados} mensajes con los precios de las ${oficial.Fecha}`);
if (fallos.length) { console.error(`${fallos.length} comunidad(es) con error`); process.exit(1); }
