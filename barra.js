/* ===== Barra de descarga: solo para quien llega desde un anuncio de Meta =====
   Un botón grande a su tienda (iPhone o Android) siempre a mano, porque casi todos se van en los primeros segundos.
   Va antes de campanas.js, que etiqueta sus enlaces con el anuncio, y de embudo.js, que cuenta sus clics en GoatCounter
   (aparecen como descarga-barra-iphone / descarga-barra-android). */
(function () {
  let deMeta = new URLSearchParams(location.search).get('utm_source') === 'meta';
  try { deMeta = deMeta || (JSON.parse(sessionStorage.getItem('gc-origen')) || {}).source === 'meta'; } catch (e) {}
  if (!deMeta || document.getElementById('gc-barra')) return;

  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const TIENDAS = {
    iphone: ['https://apps.apple.com/es/app/id6823373113', 'App Store', 'Descargar GasolCitys en el App Store'],
    android: ['https://play.google.com/store/apps/details?id=com.gasolcity.app', 'Google Play', 'Descargar GasolCitys en Google Play']
  };
  const boton = t => '<a class="gc-barra-b" data-goatcounter-click="descarga-barra-' + t + '" href="' + TIENDAS[t][0] + '" aria-label="' + TIENDAS[t][2] + '">Descargar gratis<small>' + TIENDAS[t][1] + '</small></a>';
  const botones = ios ? boton('iphone') : android ? boton('android') : boton('iphone') + boton('android');

  const css = document.createElement('style');
  css.textContent = '#gc-barra{position:fixed;left:0;right:0;bottom:0;z-index:9998;display:flex;align-items:center;gap:10px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:#fff;color:#10233f;box-shadow:0 -6px 24px rgba(0,0,0,.25);font:14px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}'
    + '#gc-barra img{width:42px;height:42px;border-radius:10px;flex:none}'
    + '#gc-barra span{flex:1;min-width:0}#gc-barra b{display:block;font-size:15px}#gc-barra span small{display:block;color:#4a5a73;font-size:12px;margin-top:2px}'
    + '.gc-barra-b{flex:none;display:flex;flex-direction:column;align-items:center;padding:8px 16px;border-radius:12px;background:#22B866;color:#fff!important;font-weight:700;font-size:15px;text-decoration:none}'
    + '.gc-barra-b small{font-weight:500;font-size:11px;opacity:.9}'
    + 'body{padding-bottom:calc(66px + env(safe-area-inset-bottom))}';
  const barra = document.createElement('div');
  barra.id = 'gc-barra';
  barra.innerHTML = '<img src="/apple-touch-icon.png" alt=""><span><b>GasolCitys</b><small>Gratis · precios oficiales</small></span>' + botones;
  document.head.appendChild(css);
  document.body.appendChild(barra);
})();
