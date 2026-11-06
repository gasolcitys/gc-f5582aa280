/* ===== Embudo: hasta dónde llega cada visita, qué dudas abre y cuánto se queda (eventos de GoatCounter) ===== */
(function () {
  const enviados = new Set();
  let origen = '';
  try { origen = (JSON.parse(sessionStorage.getItem('gc-origen')) || {}).source || ''; } catch (e) {}

  /* cada evento se cuenta una sola vez por visita; espera a que cargue el contador */
  function enviar(path, title, intentos = 0) {
    if (enviados.has(path) && !intentos) return;
    enviados.add(path);
    const gc = window.goatcounter;
    if (gc && gc.count) gc.count({ path, title, event: true, referrer: origen || 'web' });
    else if (intentos < 20) setTimeout(() => enviar(path, title, intentos + 1), 500);
  }

  /* secciones en el orden en que se leen: se cuentan cuando su parte de arriba pasa por la mitad de la pantalla */
  const PASOS = [
    ['#hero', 'embudo-1-portada', 'Embudo 1 · Portada'],
    ['#manifesto', 'embudo-2-problema', 'Embudo 2 · Frase de los dolores'],
    ['#app', 'embudo-3-como-funciona', 'Embudo 3 · Cómo funciona'],
    ['#ventajas', 'embudo-4-ventajas', 'Embudo 4 · Ventajas'],
    ['#liveStations', 'embudo-5-datos', 'Embudo 5 · Datos en directo'],
    ['#preguntas', 'embudo-6-preguntas', 'Embudo 6 · Preguntas'],
    ['#descargar', 'embudo-7-descarga-final', 'Embudo 7 · Descarga final']
  ];
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entradas => entradas.forEach(e => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      enviar(e.target.dataset.embudo, e.target.dataset.embudoTitulo);
    }), { rootMargin: '0px 0px -50% 0px' });
    PASOS.forEach(([sel, path, title]) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const sec = el.closest('section') || el;
      sec.dataset.embudo = path;
      sec.dataset.embudoTitulo = title;
      io.observe(sec);
    });
  }

  /* qué dudas abre la gente en las preguntas frecuentes */
  const DUDAS = ['gratis', 'cambia-el-precio', 'perder-tiempo', 'mi-coche', 'donde-vivo', 'mi-marca', 'fiables'];
  document.querySelectorAll('#preguntas details').forEach((d, i) => {
    d.addEventListener('toggle', () => {
      if (d.open) enviar('duda-' + (DUDAS[i] || i + 1), 'Duda abierta · ' + d.querySelector('summary').textContent.trim());
    });
  });

  /* qué enlaces internos se usan */
  document.querySelectorAll('.nav-links a').forEach(a => a.addEventListener('click', () =>
    enviar('menu-' + a.textContent.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-'), 'Menú · ' + a.textContent.trim())));
  const dudas = document.getElementById('solved');
  if (dudas) dudas.addEventListener('click', () => enviar('boton-dudas-resueltas', 'Botón «dudas resueltas»'));
  document.querySelectorAll('.stats-more a').forEach(a => a.addEventListener('click', () => enviar('boton-ver-estadisticas', 'Botón «Ver todas las estadísticas»')));

  /* cuánto tiempo se queda con la página a la vista */
  let visible = 0;
  const marcas = [[30, 'tiempo-30s', 'Tiempo · más de 30 s'], [120, 'tiempo-2min', 'Tiempo · más de 2 min']];
  const reloj = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    visible++;
    marcas.forEach(([s, path, title]) => { if (visible === s) enviar(path, title); });
    if (visible >= 120) clearInterval(reloj);
  }, 1000);
})();
