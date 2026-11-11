/* ===== Píxel de Meta: solo para quien llega desde un anuncio y lo acepta =====
   Sin aceptar no se carga nada de Meta ni se escribe ninguna cookie (art. 22.2 LSSI).
   Las visitas y los clics se cuentan igual en GoatCounter, que no usa cookies. */
(function () {
  /* Administrador de eventos de Meta → tu conjunto de datos (píxel) → Identificador. Vacío: la web sigue como antes, sin aviso ni píxel */
  const PIXEL_ID = '1672274640949475';
  const CLAVE = 'gc-cookies-meta';
  if (!PIXEL_ID) return;

  function eleccion() { try { return localStorage.getItem(CLAVE); } catch (e) { return null; } }
  function guardar(v) { try { localStorage.setItem(CLAVE, v); } catch (e) {} }
  let origen = {};
  try { origen = JSON.parse(sessionStorage.getItem('gc-origen')) || {}; } catch (e) {}

  let activo = false;
  function activar() {
    if (activo) return;
    activo = true;
    /* código oficial de Meta */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    /* sin rastreo automático de botones ni de los datos de la página: solo lo que se envía aquí */
    fbq('set', 'autoConfig', false, PIXEL_ID);
    fbq('init', PIXEL_ID);
    fbq('track', 'PageView');
    document.addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('a[href*="apps.apple.com/"], a[href*="play.google.com/store/"]');
      if (!a) return;
      /* tienda: iphone | android · boton: dónde estaba (barra, inicio, final…) · anuncio: el anuncio del que vino */
      const lugar = ((a.dataset && a.dataset.goatcounterClick) || '').split('-')[1] || 'otro';
      fbq('trackCustom', 'ClicTienda', { tienda: a.href.includes('apple') ? 'iphone' : 'android', boton: lugar, anuncio: origen.content || '' });
    }, true);
  }

  function borrarCookies() {
    ['_fbp', '_fbc'].forEach(n => ['', ';domain=' + location.hostname, ';domain=.' + location.hostname.replace(/^www\./, '')].forEach(d => {
      document.cookie = n + '=;path=/;max-age=0' + d;
    }));
  }

  function contar(path, title) {
    const gc = window.goatcounter;
    if (gc && gc.count) gc.count({ path, title, event: true, referrer: origen.source || 'web' });
  }

  function mostrarAviso() {
    if (document.getElementById('gc-cookies')) return;
    /* compacto y encima de la barra de descarga si la hay. «Aceptar» y «Rechazar» con el mismo peso (exigencia de la AEPD) */
    const sobreBarra = document.getElementById('gc-barra') ? '84px' : '12px';
    const css = document.createElement('style');
    css.textContent = '#gc-cookies{position:fixed;left:10px;right:10px;bottom:calc(' + sobreBarra + ' + env(safe-area-inset-bottom));z-index:9999;max-width:460px;margin:0 auto;padding:10px 12px;border-radius:14px;background:#fff;color:#10233f;border:2px solid #1F4F9C;font:13px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35);animation:gcSube .35s ease-out}'
      + '@keyframes gcSube{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}'
      + '#gc-cookies p{margin:0 0 8px}#gc-cookies a{color:#1F4F9C;text-decoration:underline}'
      + '#gc-cookies div{display:flex;gap:8px}#gc-cookies button{flex:1;padding:8px 6px;border:0;border-radius:9px;background:#1F4F9C;color:#fff;font:600 14px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;cursor:pointer}';
    const aviso = document.createElement('div');
    aviso.id = 'gc-cookies';
    aviso.setAttribute('role', 'dialog');
    aviso.setAttribute('aria-label', 'Cookies de publicidad');
    aviso.innerHTML = '<p>🍪 Usamos cookies para mejorar tu experiencia y personalizar el contenido y los anuncios que ves. <a href="/privacidad.html#cookies">Más info</a></p><div><button type="button" data-v="no">Solo necesarias</button><button type="button" data-v="si">Aceptar todas</button></div>';
    aviso.addEventListener('click', e => {
      const v = e.target.dataset && e.target.dataset.v;
      if (!v) return;
      const antes = eleccion();
      guardar(v);
      aviso.remove();
      css.remove();
      contar('anuncio-cookies-' + (v === 'si' ? 'acepta' : 'rechaza'), 'Anuncio · cookies · ' + (v === 'si' ? 'acepta' : 'rechaza'));
      if (v === 'si') activar();
      else { borrarCookies(); if (antes === 'si') location.reload(); }
    });
    document.head.appendChild(css);
    document.body.appendChild(aviso);
  }

  const elegido = eleccion();
  if (elegido === 'si') activar();
  else if (!elegido && origen.source === 'meta') mostrarAviso();

  /* botón «Cambiar mi elección» de la política de privacidad */
  const cambiar = document.getElementById('gc-cookies-cambiar');
  if (cambiar) { cambiar.hidden = false; cambiar.addEventListener('click', mostrarAviso); }
})();
