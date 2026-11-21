// Test du prototype « écrire en latin → cyrillique » (2.7) dans un VRAI Chrome (sans fenêtre) : règles du convertisseur, majuscules,
// dictionnaire inversé du moteur, aller-retour sur les mots irréguliers, interface (résultat en direct, copie, 8 langues, téléphone).
// Usage : node tests/reverse.cjs
'use strict';
const path = require('path'), fs = require('fs');
const { launch, sleep } = require('./cdp-client.cjs');
const { start } = require('./serve.cjs');

const URL_SITE = 'http://localhost:8096/';
const OUT = process.env.CLS_SHOTS || __dirname;
let ok = 0, ko = 0;
const L = (...a) => console.log(a.join(' '));
const ck = (name, cond, extra) => { if (cond) { ok++; L('  OK   ' + name); } else { ko++; L('  ECHEC ' + name + (extra !== undefined ? ' | ' + extra : '')); } };

(async () => {
  const server = await start(8096);
  const chrome = await launch(9336);
  const br = chrome.br;
  const errors = [];
  br.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map((a) => a.value || a.description).join(' '));
  });
  try {
    L('Chrome', chrome.version);
    const open = async (url, w, h, mobile) => {
      const t = await br.send('Target.createTarget', { url: 'about:blank' });
      const s = (await br.send('Target.attachToTarget', { targetId: t.targetId, flatten: true })).sessionId;
      await br.send('Runtime.enable', {}, s); await br.send('Page.enable', {}, s);
      if (w) await br.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile }, s);
      await br.send('Target.activateTarget', { targetId: t.targetId });
      await br.send('Page.navigate', { url }, s); await sleep(2200);
      return { t, s };
    };
    const ev = (s, expr) => Promise.race([br.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, s).then((r) => r.result.exceptionDetails ? 'EXC ' + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) : r.result.value), sleep(9000).then(() => 'TIMEOUT')]);
    const mouse = async (s, x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await br.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, s); await sleep(250); };
    const click = async (s, sel) => { const r = await ev(s, `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`); if (!r || r === 'TIMEOUT') throw new Error('introuvable ' + sel); await mouse(s, r.x, r.y); };
    const lat = async (s, text) => { await ev(s, `(()=>{const i=document.getElementById('latInput');i.value=${JSON.stringify(text)};i.dispatchEvent(new Event('input',{bubbles:true}));})()`); await sleep(400); };
    const rev = (s) => ev(s, "document.getElementById('revOut').textContent");
    const U = (s) => s.replace(/\\u([0-9a-f]{4})/gi, (m, h) => String.fromCharCode(parseInt(h, 16)));

    L('== 1. Règles du convertisseur (reverse.js dans la page)');
    let { t, s } = await open(URL_SITE, 1000, 900);
    await ev(s, "document.querySelector('.lang-item[data-lang=\"en\"]').click()");
    const conv = (x) => ev(s, `CLS_REV.convert(${JSON.stringify(x)}).text`);
    const CASES = [
      ['lettres simples', 'abdfgklmoprstuvxz', 'абдфгклмопрстувхз'],
      ['q = кх, h = хӀ, j = Ӏ, c = ц, ç = ч, ƶ = ж, w = в', 'q h j c ç ƶ w', 'кх хӀ Ӏ ц ч ж в'],
      ['lettres à point : ẋ ġ ċ ṗ ṫ → хь гӀ цӀ пӀ тӀ', 'ẋ ġ ċ ṗ ṫ', 'хь гӀ цӀ пӀ тӀ'],
      ['lettres à point combinant : q̇ k̇ ç̇ → къ кӀ чӀ', 'q̇ k̇ ç̇', 'къ кӀ чӀ'],
      ['ä ö ü → аь оь уь', 'ä ö ü', 'аь оь уь'],
      ['ŋ → н, ə → ъ, ş → ш', 'ŋ ə ş', 'н ъ ш'],
      ['y seul → й ; yä, yü → яь, юь', 'y yä yü', 'й яь юь'],
      ['majuscule initiale', 'Noxçiyŋ Mott', 'Нохчийн Мотт'],
      ['tout en majuscules', 'QIŊ', 'КХИН'],
      ['majuscule + lettre composée : Ẋ Ġ Q̇', 'Ẋa Ġa Q̇a', 'Хьа Гӏа Къа'],
      ['chiffres, ponctuation et cyrillique conservés', '12, a! Нохчийн?', '12, а! Нохчийн?'],
      ['phrase', 'Noxçiyŋ mott — 1992 şarax latinaŋ abat.', 'Нохчийн мотт — 1992 шарах латинан абат.']
    ];
    for (const [name, input, exp] of CASES) {
      const got = await conv(input);
      // la palochka peut s'écrire Ӏ (U+04C0) ; on compare sans tenir compte de la casse de Ӏ/ӏ
      const norm = (x) => x.replace(/ӏ/g, 'Ӏ');
      ck(name, norm(got) === norm(exp), JSON.stringify({ input, got, exp }));
    }
    ck('y positionnel : « yara » (début de mot) → йара ; « oẋayala » (après voyelle) → охьайала', (await conv('yara')) === 'йара' && (await conv('oẋayala')) === 'охьайала');
    ck('y positionnel : après une consonne (mots russes) « byudƶete » → бюджете, « Styuart » → Стюарт', (await conv('byudƶete')) === 'бюджете' && (await conv('Styuart')) === 'Стюарт');
    ck('e en début de mot → э (« ezar » → эзар) ; e ailleurs → е (« mott », « eşar » plus loin)', (await conv('ezar')) === 'эзар' && (await conv('vezar')) === 'везар');

    L('== 2. Dictionnaire inversé construit à partir du moteur');
    const size = await ev(s, 'CLS_REV.size()');
    ck('le dictionnaire contient plus de 500 mots irréguliers', size > 500, String(size));
    const rt = JSON.parse(await ev(s, `(()=>{ const lines=window.CLS_DATA['replacements.txt'].split('\\n'); let n=0,okc=0,bad=[]; const seen=new Map(); lines.forEach(l=>{ const p=l.split(','); if(p.length<2) return; const cyr=p[0].trim(), lat=p[1].trim(); if(!cyr||!lat) return; const key=lat.normalize('NFC').toLowerCase(); if(seen.has(key)&&seen.get(key)!==cyr.toLowerCase()) return; seen.set(key,cyr.toLowerCase()); if(!/^[\\p{Script=Latin}\\u0300-\\u036F'-]+$/u.test(lat)) return; n++; const back=CLS_REV.convert(lat).text.toLowerCase().replace(/\\u04CF/g,'\\u04C0'); if(back===cyr.toLowerCase().replace(/\\u04CF/g,'\\u04C0')) okc++; else if(bad.length<5) bad.push([cyr,lat,back]); }); return JSON.stringify({n,okc,bad}); })()`));
    ck('aller-retour sur les mots irréguliers de replacements.txt : au moins 98 % retrouvés', rt.n > 200 && rt.okc / rt.n >= 0.98, JSON.stringify(rt));
    ck('mot irrégulier : « vövza » → вевза (le moteur écrit « ev » → « öv »)', (await conv('vövza')) === 'вевза');
    ck('mot irrégulier avec majuscule initiale : « Nörd » → Нерд', (await conv('Nörd')) === 'Нерд');

    L('== 3. Interface : résultat en direct sous « Lettres latines »');
    ck('rien n\'est affiché tant que le champ est vide', (await ev(s, "document.getElementById('revBlock').hidden")) === true);
    await lat(s, 'Noxçiyŋ mott');
    ck('le résultat cyrillique apparaît dès la saisie', (await rev(s)) === 'Нохчийн мотт' && (await ev(s, "document.getElementById('revBlock').hidden")) === false, await rev(s));
    ck('le résultat est placé juste sous le champ latin, avant les touches', (await ev(s, "(()=>{const f=document.querySelector('.alpha-field').getBoundingClientRect();const b=document.getElementById('revBlock').getBoundingClientRect();const k=document.getElementById('alphaKeys').getBoundingClientRect();return b.top>=f.bottom-1&&b.bottom<=k.top+1})()")) === true);
    await lat(s, 'Noxçiyŋ mottaş');
    ck('il suit la saisie', (await rev(s)).startsWith('Нохчийн мотт'), await rev(s));
    await click(s, '[data-idx="0"]');   // une touche de la palette ajoute une lettre : le résultat se met à jour
    await sleep(300);
    ck('une touche de la palette met aussi le résultat à jour', (await ev(s, "document.getElementById('latInput').value")) !== 'Noxçiyŋ mottaş' && (await rev(s)).length > 5, await rev(s));
    await lat(s, '');
    ck('champ vidé : le résultat disparaît', (await ev(s, "document.getElementById('revBlock').hidden")) === true);
    await lat(s, 'Noxçiyŋ');
    await ev(s, "window.__clip=[];navigator.clipboard.writeText=(x)=>{window.__clip.push(x);return Promise.resolve()};1");
    await click(s, '#revCopy'); await sleep(200);
    ck('« Kopi yaŋ » du résultat copie le cyrillique', JSON.stringify(JSON.parse(await ev(s, 'JSON.stringify(window.__clip)'))) === JSON.stringify(['Нохчийн']));
    { const sh = await br.send('Page.captureScreenshot', { format: 'png' }, s); fs.writeFileSync(path.join(OUT, 'rev-desktop.png'), Buffer.from(sh.data, 'base64')); }
    const lbl = await ev(s, "document.getElementById('lblRevCyr').textContent");
    ck('étiquette traduite (anglais : « Cyrillic »)', lbl === 'Cyrillic', lbl);

    L('== 4. Huit langues, téléphone (375 px), sans défilement horizontal');
    await br.send('Target.closeTarget', { targetId: t.targetId });
    ({ t, s } = await open(URL_SITE, 375, 700, true));
    await ev(s, "localStorage.clear();1");
    await ev(s, "document.getElementById('alphaToggle').getAttribute('aria-expanded')==='true'||document.getElementById('alphaToggle').click();1"); await sleep(300);
    await lat(s, 'Noxçiyŋ mott ẋaƶorg sẋaeca');
    for (const l of ['ce', 'en', 'fr', 'ru', 'de', 'tr', 'es', 'ar']) {
      await ev(s, `document.querySelector('.lang-item[data-lang="${l}"]').click()`); await sleep(200);
      const g = JSON.parse(await ev(s, "JSON.stringify({lab:document.getElementById('lblRevCyr').textContent,cp:document.querySelector('#revCopy span').textContent,sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,t:document.getElementById('revOut').textContent.length})"));
      ck(l + ' : étiquette et « copier » non vides, résultat présent, pas de défilement horizontal', g.lab.length > 0 && g.cp.length > 0 && g.t > 5 && g.sw <= g.cw, JSON.stringify(g));
      if (l === 'ru') { const sh = await br.send('Page.captureScreenshot', { format: 'png' }, s); fs.writeFileSync(path.join(OUT, 'rev-phone.png'), Buffer.from(sh.data, 'base64')); }
    }
    await br.send('Target.closeTarget', { targetId: t.targetId });
    L('== 5. Erreurs');
    ck('aucune exception ni erreur de console', errors.length === 0, errors.join(' || '));
    L('TOTAL : ' + ok + ' OK, ' + ko + ' échec(s)');
  } catch (e) { L('ERREUR', e.stack || e.message); ko++; }
  await chrome.close(); server.close();
  process.exit(ko ? 1 : 0);
})();
