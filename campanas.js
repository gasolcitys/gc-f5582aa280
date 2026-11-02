/* ===== Campañas: lleva el origen de cada visita hasta los enlaces de las tiendas ===== */
(function () {
  /* Token de proveedor de App Store Connect (el valor de pt= de un enlace de campaña). Vacío: el App Store queda sin etiquetar */
  const APPLE_PT = '';
  const APPLE_ID = '6823373113';
  const CLAVE = 'gc-origen';
  const REDES = { google: /google\./, bing: /bing\./, instagram: /instagram/, facebook: /facebook|fb\.(com|me)/, tiktok: /tiktok/, youtube: /youtube|youtu\.be/, reddit: /reddit/, x: /^t\.co$|^(www\.)?x\.com$|twitter/, whatsapp: /whatsapp/, telegram: /telegram|^t\.me$/, linkedin: /linkedin|lnkd\.in/, pinterest: /pinterest/ };

  const limpio = v => (v || '').toLowerCase().trim().replace(/[^a-z0-9_-]+/g, '-').slice(0, 40);

  function leer() { try { return JSON.parse(sessionStorage.getItem(CLAVE)); } catch (e) { return null; } }
  function guardar(o) { try { sessionStorage.setItem(CLAVE, JSON.stringify(o)); } catch (e) {} }

  function desdeReferencia() {
    try {
      const host = new URL(document.referrer).hostname;
      if (host === location.hostname) return null;
      const red = Object.keys(REDES).find(k => REDES[k].test(host));
      return { source: red || limpio(host.replace(/^www\./, '')), campaign: 'referencia' };
    } catch (e) { return null; }
  }

  /* prioridad: UTM del enlace de entrada, lo ya guardado en esta visita, la web de la que viene */
  const q = new URLSearchParams(location.search);
  let origen = q.get('utm_source') ? { source: limpio(q.get('utm_source')), campaign: limpio(q.get('utm_campaign')) } : (leer() || desdeReferencia());
  if (origen) guardar(origen);
  origen = origen || {};

  document.querySelectorAll('a[href*="apps.apple.com/"], a[href*="play.google.com/store/"]').forEach(a => {
    /* «descarga-inicio-iphone» → inicio: la parte de la web donde está el botón */
    const lugar = (a.dataset.goatcounterClick || '').split('-')[1] || 'web';
    const source = origen.source || 'web';
    const campaign = origen.campaign || lugar;

    if (a.href.includes('play.google.com')) {
      const url = new URL(a.href);
      url.searchParams.set('utm_source', source);
      url.searchParams.set('utm_medium', 'web');
      url.searchParams.set('utm_campaign', campaign);
      url.searchParams.set('utm_content', lugar);
      url.searchParams.set('referrer', 'utm_source=' + source + '&utm_medium=web&utm_campaign=' + campaign + '&utm_content=' + lugar);
      a.href = url.href;
    } else if (APPLE_PT) {
      a.href = 'https://apps.apple.com/app/apple-store/id' + APPLE_ID + '?pt=' + APPLE_PT + '&ct=' + encodeURIComponent((source + '_' + campaign).slice(0, 30)) + '&mt=8';
    }
    /* en GoatCounter, cada clic de descarga queda asociado a su origen */
    a.dataset.goatcounterReferrer = source;
  });
})();
