/* ===== Embudo: qué ve, qué abre y qué pulsa cada visita (eventos de GoatCounter) =====
   Nombres que verás en GoatCounter → Páginas (filtra por la primera palabra):
   embudo-*            hasta qué sección de la portada llega
   movil-*             qué pantallas del móvil de «Así funciona la app» ve
   ventaja-*           qué tarjetas de «Ventajas» llega a ver
   duda-*              qué preguntas frecuentes abre
   ir-estadisticas-*   desde qué botón pasa a la página de estadísticas
   boton-* / menu-* / pie-*   resto de botones y enlaces
   tiempo-*            cuánto se queda con la página a la vista
   estad-*             lo mismo, pero en la página de estadísticas
   qr-*                copia de todo lo anterior, solo de quienes entraron por el código QR
                       (qr-0-escaneo son los escaneos; qr-descarga-* los botones de descarga) */
(function () {
  const ESTAD = /estadisticas/.test(location.pathname);
  const P = ESTAD ? 'estad-' : '';
  const enviados = new Set();
  let origen = '';
  try { origen = (JSON.parse(sessionStorage.getItem('gc-origen')) || {}).source || ''; } catch (e) {}
  const slug = t => t.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const $$ = s => document.querySelectorAll(s);

  /* Visitas del código QR: además del evento general sale una copia «qr-», para verlas aparte en GoatCounter.
     Son el doble de envíos y GoatCounter solo admite 4 por segundo, así que salen en fila */
  const DESDE_QR = origen === 'qr';
  const fila = [];
  let filaOcupada = false, esperas = 0;
  function avanzarFila() {
    if (filaOcupada || !fila.length) return;
    const gc = window.goatcounter, listo = gc && gc.count;
    if (!listo && esperas++ >= 20) return;
    if (listo) gc.count(fila.shift());
    filaOcupada = true;
    setTimeout(() => { filaOcupada = false; avanzarFila(); }, listo ? 400 : 500);
  }
  function aFila(...datos) { fila.push(...datos); avanzarFila(); }
  function vaciarFila() { const gc = window.goatcounter; if (gc && gc.count) while (fila.length) gc.count(fila.shift()); }
  const copiaQR = (path, title) => ({ path: 'qr-' + path, title: 'QR · ' + title, event: true, referrer: 'qr' });

  /* cada evento se cuenta una sola vez por visita; espera a que cargue el contador */
  function enviar(path, title, intentos = 0) {
    if (enviados.has(path) && !intentos) return;
    enviados.add(path);
    const evento = { path, title, event: true, referrer: origen || 'web' };
    if (DESDE_QR) return aFila(evento, copiaQR(path, title));
    const gc = window.goatcounter;
    if (gc && gc.count) gc.count(evento);
    else if (intentos < 20) setTimeout(() => enviar(path, title, intentos + 1), 500);
  }
  function alPulsar(sel, path, title) { $$(sel).forEach(a => a.addEventListener('click', () => enviar(path, title))); }

  /* se cuenta cuando la parte de arriba del elemento pasa por la mitad de la pantalla */
  const io = 'IntersectionObserver' in window && new IntersectionObserver(entradas => entradas.forEach(e => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    enviar(e.target.dataset.gcPath, e.target.dataset.gcTitulo);
    if (e.target.gcAlVer) e.target.gcAlVer();
  }), { rootMargin: '0px 0px -50% 0px' });
  function alVer(el, path, title, extra) {
    if (!io || !el) return;
    el.dataset.gcPath = path;
    el.dataset.gcTitulo = title;
    el.gcAlVer = extra;
    io.observe(el);
  }

  /* ---------- Entrada por el código QR ---------- */
  if (DESDE_QR) {
    /* un escaneo por sesión, aunque recargue la portada */
    try {
      if (new URLSearchParams(location.search).get('utm_source') === 'qr' && !sessionStorage.getItem('gc-qr-escaneo')) {
        sessionStorage.setItem('gc-qr-escaneo', '1');
        aFila(copiaQR('0-escaneo', 'Escaneo'));
      }
    } catch (e) {}
    /* GoatCounter ya cuenta estos botones por su cuenta; aquí va su copia, sin fila porque la página puede cerrarse al instante */
    $$('[data-goatcounter-click]').forEach(a => a.addEventListener('click', () => {
      const gc = window.goatcounter;
      if (gc && gc.count) gc.count(copiaQR(a.dataset.goatcounterClick, 'Botón · ' + a.dataset.goatcounterClick));
    }));
    addEventListener('pagehide', vaciarFila);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') vaciarFila(); });
  }

  /* ---------- Portada ---------- */
  if (!ESTAD) {
    const PASOS = [
      ['#hero', 'portada', 'Portada'],
      ['#manifesto', 'problema', 'Frase de los dolores'],
      ['#app', 'como-funciona', 'Cómo funciona (móvil)'],
      ['.trio', 'valores', 'Fiable · Al día · Para tu coche'],
      ['#ventajas', 'ventajas', 'Ventajas'],
      ['#liveStations', 'datos', 'Datos en directo'],
      ['#preguntas', 'preguntas', 'Preguntas'],
      ['#descargar', 'descarga-final', 'Descarga final']
    ];
    const pantallas = [...$$('#app .step')];
    const nombrePantalla = i => pantallas[i].querySelector('h3').textContent.trim();
    const verPantalla = i => enviar('movil-' + (i + 1) + '-' + slug(nombrePantalla(i)), 'Móvil ' + (i + 1) + ' · ' + nombrePantalla(i));
    PASOS.forEach(([sel, path, title], i) => {
      const el = document.querySelector(sel);
      if (el) alVer(el.closest('section') || el, 'embudo-' + (i + 1) + '-' + path, 'Embudo ' + (i + 1) + ' · ' + title,
        path === 'como-funciona' && pantallas.length ? () => verPantalla(0) : null);
    });

    /* pantallas del móvil: la animación marca con «on» la que se está viendo */
    if ('MutationObserver' in window) {
      const mo = new MutationObserver(() => pantallas.forEach((p, i) => { if (i && p.classList.contains('on')) verPantalla(i); }));
      pantallas.forEach(p => mo.observe(p, { attributes: true, attributeFilter: ['class'] }));
    }

    /* tarjetas de ventajas que llegan a verse */
    $$('#ventajas .card').forEach(c => {
      const h = c.querySelector('h3');
      if (h) alVer(c, 'ventaja-' + slug(h.textContent), 'Ventaja vista · ' + h.textContent.trim());
    });

    /* preguntas frecuentes abiertas */
    $$('#preguntas details').forEach(d => d.addEventListener('toggle', () => {
      if (!d.open) return;
      const q = d.querySelector('summary').textContent.trim();
      enviar('duda-' + slug(q.replace(/^¿/, '')), 'Duda abierta · ' + q);
    }));

    /* botones intermedios */
    alPulsar('#hero .btn-ghost', 'boton-descubre-como-funciona', 'Botón «Descubre cómo funciona»');
    alPulsar('#solved', 'boton-dudas-resueltas', 'Botón «dudas resueltas»');
    alPulsar('#app .step a.more', 'ir-estadisticas-desde-movil', 'Ir a estadísticas · desde el móvil');
    alPulsar('.stats-more a', 'ir-estadisticas-desde-datos', 'Ir a estadísticas · desde datos en directo');
  }

  /* ---------- Página de estadísticas ---------- */
  if (ESTAD) {
    const SECS = [['.hero', 'portada'], ['#precios', 'precios'], ['#mapa', 'mapa'], ['#provincias', 'provincias'], ['#marcas', 'marcas'],
      ['#extremos', 'mas-baratas-y-caras'], ['#evolucion', 'evolucion'], ['#por-que', 'por-que'], ['.cta', 'descarga-final']];
    SECS.forEach(([sel, path], i) => alVer(document.querySelector(sel), 'estad-embudo-' + (i + 1) + '-' + path, 'Estadísticas · embudo ' + (i + 1) + ' · ' + path.replace(/-/g, ' ')));
    /* botones que se crean al cargar los datos: se escuchan en todo el documento */
    document.addEventListener('click', e => {
      const f = e.target.closest('[data-f]');
      if (f) enviar('estad-combustible-' + slug(f.dataset.f), 'Estadísticas · elige combustible · ' + (f.querySelector('small') || f).textContent.trim());
      const s = e.target.closest('[data-sort]');
      if (s) enviar('estad-ordenar-' + s.dataset.sort, 'Estadísticas · ordenar provincias · ' + s.textContent.trim());
      if (e.target.closest('#provMore')) enviar('estad-ver-52-provincias', 'Estadísticas · ver las 52 provincias');
    });
    alPulsar('.nav .btn-primary', 'estad-boton-descargar-menu', 'Estadísticas · botón Descargar del menú');
  }

  /* ---------- Las dos páginas ---------- */
  $$('.nav-links a').forEach(a => a.addEventListener('click', () => enviar(P + 'menu-' + slug(a.textContent), (ESTAD ? 'Estadísticas · ' : '') + 'Menú · ' + a.textContent.trim())));
  $$('footer a').forEach(a => a.addEventListener('click', () => {
    const t = a.textContent.trim() || (a.href.includes('instagram') ? 'instagram' : 'logo');
    enviar(P + 'pie-' + slug(t), (ESTAD ? 'Estadísticas · ' : '') + 'Pie · ' + t);
  }));

  /* cuánto tiempo se queda con la página a la vista */
  let visible = 0;
  const marcas = [[10, '10s', 'más de 10 s'], [30, '30s', 'más de 30 s'], [60, '1min', 'más de 1 min'], [120, '2min', 'más de 2 min']];
  const reloj = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    visible++;
    marcas.forEach(([s, path, title]) => { if (visible === s) enviar(P + 'tiempo-' + path, (ESTAD ? 'Estadísticas · ' : '') + 'Tiempo · ' + title); });
    if (visible >= 120) clearInterval(reloj);
  }, 1000);
})();
