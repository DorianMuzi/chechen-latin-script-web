// Test du mode clair / sombre du site dans un VRAI Chrome (sans fenêtre).
// Usage : node tests/theme.cjs
'use strict';
const { launch, sleep } = require('./cdp-client.cjs');
const { start } = require('./serve.cjs');

const PORT_SITE = 8097, PORT_CHROME = 9344;
let ok = 0, ko = 0;
const L = (...a) => console.log(a.join(' '));
const ck = (name, cond, extra) => { if (cond) { ok++; L('  OK   ' + name); } else { ko++; L('  ECHEC ' + name + (extra !== undefined ? ' | ' + extra : '')); } };
const LIGHT_BG = 'rgb(241, 237, 224)';   // #F1EDE0
const DARK_BG = 'rgb(20, 23, 15)';       // #14170F

(async () => {
  const server = await start(PORT_SITE);
  const chrome = await launch(PORT_CHROME);
  const br = chrome.br;
  const errors = [];
  br.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map((a) => a.value || a.description).join(' '));
  });
  try {
    const url = 'http://127.0.0.1:' + PORT_SITE + '/';
    const open = async () => {
      const t = await br.send('Target.createTarget', { url });
      const s = (await br.send('Target.attachToTarget', { targetId: t.targetId, flatten: true })).sessionId;
      await br.send('Runtime.enable', {}, s); await br.send('Page.enable', {}, s);
      await br.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1000, deviceScaleFactor: 1, mobile: false }, s);
      await br.send('Target.activateTarget', { targetId: t.targetId }); await sleep(1500);
      return { t, s };
    };
    const ev = (s, e) => Promise.race([br.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }, s).then((r) => r.result.value), sleep(9000).then(() => 'TIMEOUT')]);
    const media = (s, scheme) => br.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] }, s);
    const st = "JSON.stringify((()=>{const seg=document.getElementById('themeSeg');const bs=[...seg.querySelectorAll('[data-theme-val]')];return {attr:document.documentElement.getAttribute('data-theme'),checked:bs.filter(b=>b.getAttribute('aria-checked')==='true').map(b=>b.getAttribute('data-theme-val')),i:seg.style.getPropertyValue('--i'),bg:getComputedStyle(document.body).backgroundColor,meta:document.querySelector('meta[name=theme-color]').getAttribute('content'),n:bs.length,ls:(()=>{try{return localStorage.getItem('clsTheme')}catch(e){return null}})()}})())";
    const click = async (s, val) => { const p = JSON.parse(await ev(s, "JSON.stringify((()=>{const b=document.querySelector('[data-theme-val=\"" + val + "\"]').getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2}})())")); for (const type of ['mousePressed', 'mouseReleased']) await br.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 }, s); await sleep(500); };
    const key = async (s, k, code) => { for (const type of ['keyDown', 'keyUp']) await br.send('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: code }, s); await sleep(400); };
    const scroll = (s) => ev(s, 'window.scrollTo(0, document.body.scrollHeight)');

    L('== 1. Sélecteur et suivi du système');
    let { t, s } = await open();
    await media(s, 'light'); await sleep(300);
    await scroll(s);
    let a = JSON.parse(await ev(s, st)); L('    ', JSON.stringify(a));
    ck('trois boutons visibles, « automatique » coché au départ', a.n === 3 && a.checked.join() === 'auto' && a.attr === null && a.i === '0', JSON.stringify(a));
    ck('système clair : fond crème', a.bg === LIGHT_BG, a.bg);
    ck('barre du navigateur (theme-color) claire', a.meta === '#E3EBD3', a.meta);
    await media(s, 'dark'); await sleep(400);
    a = JSON.parse(await ev(s, st));
    ck('automatique + système sombre : fond sombre', a.bg === DARK_BG, a.bg);
    ck('barre du navigateur sombre en automatique', a.meta === '#2A3322', a.meta);
    L('== 2. Choix direct');
    await media(s, 'light'); await sleep(300);
    await click(s, 'dark'); a = JSON.parse(await ev(s, st));
    ck('« sombre » : fond sombre malgré le système clair, curseur en position 2, choix mémorisé', a.attr === 'dark' && a.bg === DARK_BG && a.i === '2' && a.ls === 'dark', JSON.stringify(a));
    await media(s, 'dark'); await sleep(300);
    await click(s, 'light'); a = JSON.parse(await ev(s, st));
    ck('« clair » : fond clair malgré le système sombre', a.attr === 'light' && a.bg === LIGHT_BG && a.i === '1' && a.ls === 'light', JSON.stringify(a));
    await click(s, 'auto'); a = JSON.parse(await ev(s, st));
    ck('« automatique » : attribut retiré', a.attr === null && a.i === '0', JSON.stringify(a));
    L('== 3. Clavier');
    await ev(s, "document.querySelector('[data-theme-val=\"auto\"]').focus()"); await media(s, 'light'); await sleep(200);
    await key(s, 'ArrowRight', 39); a = JSON.parse(await ev(s, st)); ck('flèche droite : auto -> clair', a.checked.join() === 'light', JSON.stringify(a));
    await key(s, 'ArrowRight', 39); a = JSON.parse(await ev(s, st)); ck('flèche droite : clair -> sombre', a.checked.join() === 'dark' && a.bg === DARK_BG, JSON.stringify(a));
    await key(s, 'ArrowRight', 39); a = JSON.parse(await ev(s, st)); ck('flèche droite : sombre -> automatique (boucle)', a.checked.join() === 'auto', JSON.stringify(a));
    await key(s, 'ArrowLeft', 37); a = JSON.parse(await ev(s, st)); ck('flèche gauche : automatique -> sombre', a.checked.join() === 'dark', JSON.stringify(a));
    L('== 4. Le choix survit au rechargement, sans éclair clair');
    await br.send('Target.closeTarget', { targetId: t.targetId });
    ({ t, s } = await open()); await media(s, 'light'); await sleep(500);
    a = JSON.parse(await ev(s, st));
    ck('après rechargement : toujours sombre (système clair)', a.attr === 'dark' && a.bg === DARK_BG && a.checked.join() === 'dark', JSON.stringify(a));
    L('== 5. Lisibilité en mode sombre');
    const ctr = JSON.parse(await ev(s, "JSON.stringify((()=>{const lum=(c)=>{const m=c.match(/[\\d.]+/g).map(Number);const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(m[0])+0.7152*f(m[1])+0.0722*f(m[2])};const cr=(a,b)=>{const x=[lum(a),lum(b)].sort((p,q)=>q-p);return (x[0]+0.05)/(x[1]+0.05)};const bg=getComputedStyle(document.querySelector('.card-transcriber')).backgroundColor;const out={};[['saisie','#input'],['pied','.web-foot'],['étiquette','label.label-upper'],['palette','.alpha-toggle']].forEach(([n,sel])=>{const e=document.querySelector(sel);out[n]=+cr(getComputedStyle(e).color,n==='pied'?getComputedStyle(document.body).backgroundColor:bg).toFixed(2)});return out})())"));
    L('     contrastes :', JSON.stringify(ctr));
    ck('texte de la saisie lisible (contraste >= 7)', ctr['saisie'] >= 7, JSON.stringify(ctr));
    ck('pied de page lisible (contraste >= 4,5)', ctr['pied'] >= 4.5, JSON.stringify(ctr));
    ck('étiquette « CYRILLIQUE » lisible (contraste >= 4,5)', ctr['étiquette'] >= 4.5, JSON.stringify(ctr));
    ck('bouton de la palette lisible (contraste >= 4,5)', ctr['palette'] >= 4.5, JSON.stringify(ctr));
    L('== 6. Langues');
    const names2 = await ev(s, "(()=>{try{return JSON.stringify(['ce','en','fr','ru','de','tr','ar','es'].map(l=>{var b=document.querySelector('.lang-item[data-lang=\"'+l+'\"]');var m=document.getElementById('langBtn');m&&m.click();b&&b.click();return l+':'+[...document.querySelectorAll('[data-theme-val]')].map(x=>x.title).join('/')}))}catch(e){return 'ERR '+e}})()");
    L('    ', names2);
    ck('8 langues : chaque position a une infobulle (tchétchène : Şa-şa / Serla / Boda)', typeof names2 === 'string' && /ce:Şa-şa\/Serla\/Boda/.test(names2) && names2.split(';').length >= 1 && !/ERR/.test(names2));
    L('== 7. Aucune erreur');
    ck('aucune exception ni erreur de console', errors.length === 0, errors.join(' | '));
    await br.send('Target.closeTarget', { targetId: t.targetId });
  } catch (e) { ko++; L('ERREUR', e.stack || e.message); }
  L('TOTAL : ' + ok + ' OK, ' + ko + ' échec(s)');
  await chrome.close(); server.close();
  process.exit(ko ? 1 : 0);
})();
