// Test du site sur TÉLÉPHONE (2.8) dans un VRAI Chrome émulant un écran tactile (360 x 740 et 390 x 844) :
// zones tactiles d'au moins 44 px, pas de défilement horizontal, double cadre retiré, et « Partager vers Chechen Latin Script »
// (cible de partage du site installé : adresse « ?text=… ») avec ses cas limites. Usage : node tests/phone.cjs
// Limite : un Chrome de bureau émule le tactile, il ne remplace pas un essai sur un vrai téléphone.
'use strict';
const path = require('path'), fs = require('fs');
const { launch, sleep } = require('./cdp-client.cjs');
const { start } = require('./serve.cjs');

const URL_SITE = 'http://localhost:8095/';
const OUT = process.env.CLS_SHOTS || __dirname;
let ok = 0, ko = 0;
const L = (...a) => console.log(a.join(' '));
const ck = (name, cond, extra) => { if (cond) { ok++; L('  OK   ' + name); } else { ko++; L('  ECHEC ' + name + (extra !== undefined ? ' | ' + extra : '')); } };

(async () => {
  const server = await start(8095);
  const chrome = await launch(9337);
  const br = chrome.br;
  const errors = [];
  br.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text));
  });
  try {
    L('Chrome', chrome.version);
    const open = async (url, w, h, touch) => {
      const t = await br.send('Target.createTarget', { url: 'about:blank' });
      const s = (await br.send('Target.attachToTarget', { targetId: t.targetId, flatten: true })).sessionId;
      await br.send('Runtime.enable', {}, s); await br.send('Page.enable', {}, s);
      await br.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: !!touch }, s);
      if (touch) await br.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, s);
      await br.send('Target.activateTarget', { targetId: t.targetId });
      await br.send('Page.navigate', { url }, s); await sleep(2200);
      return { t, s };
    };
    const ev = (s, expr) => Promise.race([br.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, s).then((r) => r.result.exceptionDetails ? 'EXC ' + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) : r.result.value), sleep(9000).then(() => 'TIMEOUT')]);
    const setIn = (s, id, text) => ev(s, `(()=>{const i=document.getElementById(${JSON.stringify(id)});i.value=${JSON.stringify(text)};i.dispatchEvent(new Event('input',{bubbles:true}));})()`).then(() => sleep(700));
    const small = (s) => ev(s, `JSON.stringify([...document.querySelectorAll('button,a,[role=button],[role=radio],[role=menuitem],textarea,input,.lang-item')].filter(e=>{const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return r.width>0&&r.height>0&&cs.visibility!=='hidden'&&!e.closest('[hidden]')&&!e.classList.contains('alpha-key')}).map(e=>{const r=e.getBoundingClientRect();return {t:(e.id||e.className||e.tagName).toString().slice(0,26),txt:(e.textContent||'').trim().slice(0,12),w:Math.round(r.width),h:Math.round(r.height)}}).filter(x=>Math.min(x.w,x.h)<44))`).then(JSON.parse);

    for (const [w, h] of [[360, 740], [390, 844]]) {
      L('== Téléphone ' + w + ' x ' + h);
      const { t, s } = await open(URL_SITE, w, h, true);
      await ev(s, "document.querySelector('.lang-item[data-lang=\"en\"]').click()");
      await setIn(s, 'input', 'Нохчийн мотт, къа, ехьа, цӀе');
      await ev(s, "document.getElementById('alphaToggle').getAttribute('aria-expanded')==='true'||document.getElementById('alphaToggle').click();1"); await sleep(300);
      await setIn(s, 'latInput', 'şarax mott ezar Noxçiyŋ');
      let sm = await small(s);
      ck('zones tactiles : tout élément cliquable fait au moins 44 px dans sa plus petite dimension', sm.length === 0, sm.map((x) => `${x.t}[${x.txt}] ${x.w}x${x.h}`).join(' | '));
      // menus ouverts : langue et partage
      await ev(s, "document.getElementById('langBtn').click()"); await sleep(250);
      sm = await small(s); ck('menu des langues ouvert : lignes d\'au moins 44 px', sm.length === 0, sm.map((x) => `${x.t}[${x.txt}] ${x.w}x${x.h}`).join(' | '));
      await ev(s, "document.getElementById('langBtn').click()"); await sleep(200);
      await ev(s, "navigator.share=undefined;document.getElementById('btnShare').click()"); await sleep(300);
      sm = await small(s); ck('menu de partage ouvert : lignes d\'au moins 44 px', sm.length === 0, sm.map((x) => `${x.t}[${x.txt}] ${x.w}x${x.h}`).join(' | '));
      await ev(s, "document.getElementById('btnShare').click()");
      const g = JSON.parse(await ev(s, "JSON.stringify({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,revBorder:getComputedStyle(document.getElementById('revBlock')).borderTopWidth,revBg:getComputedStyle(document.getElementById('revBlock')).backgroundColor})"));
      ck('pas de défilement horizontal ; le résultat cyrillique n\'a plus de double cadre', g.sw <= g.cw && g.revBorder === '0px' && g.revBg === 'rgba(0, 0, 0, 0)', JSON.stringify(g));
      const keys = JSON.parse(await ev(s, "JSON.stringify((()=>{const k=[...document.querySelectorAll('.alpha-key')].map(e=>e.getBoundingClientRect());const ar=document.getElementById('alphaKeys').getBoundingClientRect();return {n:k.length,minW:Math.round(Math.min(...k.map(r=>r.width))),minH:Math.round(Math.min(...k.map(r=>r.height))),areaH:Math.round(ar.height),cols:Math.round(ar.width/(k[0].width+6))}})())"));
      ck('touches de la palette : compactes (au moins 36 x 40 px) et la palette ne prend pas tout l\'écran (moins de 55 % de la hauteur)', keys.n === 42 && keys.minW >= 36 && keys.minH >= 40 && keys.areaH <= Math.round(h * 0.55), JSON.stringify(Object.assign({ h }, keys)));
      const seg = JSON.parse(await ev(s, "JSON.stringify((()=>{const b=[...document.querySelectorAll('#themeSeg button')].map(e=>e.getBoundingClientRect());const th=document.querySelector('#themeSeg .thumb').getBoundingClientRect();return {w:Math.round(b[0].width),h:Math.round(b[0].height),thumbW:Math.round(th.width),thumbH:Math.round(th.height)}})())"));
      ck('sélecteur de thème : boutons de 44 px et curseur de la même taille', seg.h >= 44 && seg.w >= 44 && Math.abs(seg.thumbW - seg.w) <= 2 && Math.abs(seg.thumbH - seg.h) <= 2, JSON.stringify(seg));
      await ev(s, "window.scrollTo(0, document.getElementById('alphaBody').getBoundingClientRect().top + scrollY - 20)"); await sleep(300);
      { const sh = await br.send('Page.captureScreenshot', { format: 'png' }, s); fs.writeFileSync(path.join(OUT, `phone-after-${w}-palette.png`), Buffer.from(sh.data, 'base64')); }
      await br.send('Target.closeTarget', { targetId: t.targetId });
    }

    L('== Partager vers Chechen Latin Script (adresse « ?text=… »)');
    const enc = encodeURIComponent;
    let { t, s } = await open(URL_SITE + '?text=' + enc('Нохчийн мотт, къа'), 390, 844, true);
    let st = JSON.parse(await ev(s, "JSON.stringify({input:document.getElementById('input').value,out:document.getElementById('output').textContent,search:location.search,lat:document.getElementById('latInput').value})"));
    ck('texte cyrillique reçu : il remplit le champ principal et la conversion latine apparaît', st.input === 'Нохчийн мотт, къа' && st.out.length > 5 && st.lat === '', JSON.stringify(st));
    ck('l\'adresse est nettoyée (plus de « ?text=… »)', st.search === '', st.search);
    await ev(s, 'localStorage.clear()'); await br.send('Target.closeTarget', { targetId: t.targetId });
    ({ t, s } = await open(URL_SITE + '?text=' + enc('Noxçiyŋ mott'), 390, 844, true));
    st = JSON.parse(await ev(s, "JSON.stringify({input:document.getElementById('input').value,lat:document.getElementById('latInput').value,open:!document.getElementById('alphaBody').hidden,rev:document.getElementById('revOut').textContent,search:location.search})"));
    ck('texte latin reçu : il va dans « Lettres latines » (palette ouverte) et le cyrillique s\'affiche', st.input === '' && st.lat === 'Noxçiyŋ mott' && st.open === true && st.rev === 'Нохчийн мотт' && st.search === '', JSON.stringify(st));
    await ev(s, 'localStorage.clear()'); await br.send('Target.closeTarget', { targetId: t.targetId });
    ({ t, s } = await open(URL_SITE + '?title=' + enc('Нохчийн') + '&url=' + enc('https://example.org/a'), 390, 844, true));
    st = JSON.parse(await ev(s, "JSON.stringify({input:document.getElementById('input').value})"));
    ck('sans « text » : le titre reçu est utilisé (l\'adresse seule n\'est jamais prise pour du texte)', st.input === 'Нохчийн', JSON.stringify(st));
    await ev(s, 'localStorage.clear()'); await br.send('Target.closeTarget', { targetId: t.targetId });
    ({ t, s } = await open(URL_SITE + '?text=' + enc('https://example.org/page'), 390, 844, true));
    st = JSON.parse(await ev(s, "JSON.stringify({input:document.getElementById('input').value,lat:document.getElementById('latInput').value})"));
    ck('une adresse web seule est ignorée', st.input === '' && st.lat === '', JSON.stringify(st));
    await ev(s, 'localStorage.clear()'); await br.send('Target.closeTarget', { targetId: t.targetId });
    ({ t, s } = await open(URL_SITE + '?text=' + enc('<img src=x onerror="window.__pwned=1"> Нохчийн'), 390, 844, true));
    st = JSON.parse(await ev(s, "JSON.stringify({input:document.getElementById('input').value,pwned:window.__pwned||null,img:!!document.querySelector('#output img, #input img')})"));
    ck('texte piégé : traité comme du simple texte, rien n\'est exécuté', st.input.indexOf('<img') === 0 && st.pwned === null && st.img === false, JSON.stringify(st));
    await ev(s, 'localStorage.clear()'); await br.send('Target.closeTarget', { targetId: t.targetId });
    ({ t, s } = await open(URL_SITE + '?text=' + enc('а'.repeat(3000)), 390, 844, true));
    st = JSON.parse(await ev(s, "JSON.stringify({n:document.getElementById('input').value.length})"));
    ck('texte très long : coupé à 2000 lettres', st.n === 2000, JSON.stringify(st));
    await ev(s, 'localStorage.clear()'); await br.send('Target.closeTarget', { targetId: t.targetId });
    ({ t, s } = await open(URL_SITE, 390, 844, true));
    const mf = await br.send('Page.getAppManifest', {}, s);
    let data = {}; try { data = JSON.parse(mf.data); } catch (e) { /* manifeste illisible */ }
    ck('le manifeste de l\'application déclare la cible de partage (GET, text / title / url) sans erreur', !!data.share_target && data.share_target.method === 'GET' && data.share_target.params && data.share_target.params.text === 'text' && (mf.errors || []).filter((e) => e.critical).length === 0, JSON.stringify({ st: data.share_target, errors: mf.errors }));
    await ev(s, 'localStorage.clear()'); await br.send('Target.closeTarget', { targetId: t.targetId });
    L('== Erreurs');
    ck('aucune exception', errors.length === 0, errors.join(' || '));
    L('TOTAL : ' + ok + ' OK, ' + ko + ' échec(s)');
  } catch (e) { L('ERREUR', e.stack || e.message); ko++; }
  await chrome.close(); server.close();
  process.exit(ko ? 1 : 0);
})();
