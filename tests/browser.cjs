// Test du site dans un VRAI Chrome (sans fenêtre) : saisie, résultat, exemple, copie, palette, langues, mémorisation,
// affichage sur téléphone, installation (PWA), mode hors ligne, ouverture depuis un fichier local, erreurs de console.
// Usage : node tests/browser.cjs
'use strict';
const path = require('path'), fs = require('fs');
const { launch, sleep } = require('./cdp-client.cjs');
const { start } = require('./serve.cjs');

const URL_SITE = 'http://localhost:8099/';
const FILE_SITE = 'file:///' + path.resolve(__dirname, '..', 'docs', 'index.html').replace(/\\/g, '/');
let ok = 0, ko = 0;
const L = (...a) => console.log(a.join(' '));
const ck = (name, cond, extra) => { if (cond) { ok++; L('  OK   ' + name); } else { ko++; L('  ECHEC ' + name + (extra !== undefined ? ' | ' + extra : '')); } };

(async () => {
  const server = await start(8099);
  const chrome = await launch(9334, ['--host-resolver-rules=MAP stats.test 127.0.0.1']);
  const br = chrome.br;
  const errors = [];
  let googleRequests = 0;
  const externalUrls = [];
  const statsReq = [];
  br.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map((a) => a.value || a.description).join(' '));
    if (m.method === 'Network.requestWillBeSent' && /docs\.google\.com/.test(m.params.request.url)) googleRequests++;
    if (m.method === 'Network.requestWillBeSent') { const u = m.params.request.url; if (/^https?:/.test(u) && !/^https?:\/\/(localhost|127\.0\.0\.1|stats\.test)(:|\/)/.test(u)) externalUrls.push(u); }
    if (m.method === 'Fetch.requestPaused') {
      statsReq.push({ url: m.params.request.url, post: m.params.request.postData || '' });
      const isScript = /count\.js/.test(m.params.request.url);
      br.send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: isScript ? 'text/javascript' : 'text/plain' }, { name: 'Access-Control-Allow-Origin', value: '*' }],
        body: Buffer.from(isScript ? 'window.__gcStub = true;' : 'ok').toString('base64') }, m.sessionId).catch(() => {});
    }
    if (m.method === 'Network.loadingFailed' && !m.params.canceled) errors.push('réseau: ' + m.params.errorText + ' ' + (m.params.blockedReason || ''));
  });
  try {
    L('Chrome', chrome.version);
    await br.send('Browser.grantPermissions', { origin: 'http://localhost:8099', permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
    const open = async (url, w, h, mobile) => {
      const t = await br.send('Target.createTarget', { url: 'about:blank' });
      const s = (await br.send('Target.attachToTarget', { targetId: t.targetId, flatten: true })).sessionId;
      await br.send('Runtime.enable', {}, s); await br.send('Page.enable', {}, s); await br.send('Network.enable', {}, s);
      if (w) await br.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile }, s);
      await br.send('Target.activateTarget', { targetId: t.targetId });
      await br.send('Page.navigate', { url }, s); await sleep(1800);
      return { t, s };
    };
    const ev = (s, expr) => Promise.race([br.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, s).then((r) => r.result.value), sleep(9000).then(() => 'TIMEOUT')]);
    const mouse = async (s, x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await br.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, s); await sleep(120); };
    const click = async (s, sel) => { const r = await ev(s, `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`); if (!r || r === 'TIMEOUT') throw new Error('introuvable ' + sel); await mouse(s, r.x, r.y); };
    const type = async (s, text) => { await ev(s, "document.getElementById('input').focus()"); await br.send('Input.insertText', { text }, s); await sleep(500); };
    const val = (s, id) => ev(s, `document.getElementById('${id}').value`);
    const out = (s) => ev(s, "document.getElementById('output').textContent");

    L('== 1. Conversion');
    let { t, s } = await open(URL_SITE, 900, 800);
    ck('le moteur démarre et la page affiche le titre', (await ev(s, 'document.title')) === 'Chechen Latin Script');
    ck('résultat masqué tant que le champ est vide', (await ev(s, "document.getElementById('outBlock').style.maxHeight"))==='0px' || (await ev(s, "document.getElementById('outBlock').style.maxHeight"))==='0');
    await type(s, 'Нохчийн мотт');
    ck('saisie « Нохчийн мотт » -> Noxçiyŋ mott', (await out(s)).trim() === 'Noxçiyŋ mott', await out(s));
    await ev(s, "(()=>{const i=document.getElementById('input');i.value='';i.dispatchEvent(new Event('input',{bubbles:true}))})()"); await sleep(300);
    ck('champ vidé : le résultat se replie', (await ev(s, "document.getElementById('output').textContent"))==='');
    await click(s, '#misalHint'); await sleep(400);
    ck('bouton exemple : texte inséré et converti', (await val(s, 'input')).startsWith('Нохчийн мотт') && /Noxçiyŋ mott/.test(await out(s)), await out(s));
    // mots validés avec l'utilisateur (correctif des mots en « е ») et règle du ŋ
    await ev(s, "(()=>{const i=document.getElementById('input');i.value='ехьа екъа ехьалха ешаь къоман';i.dispatchEvent(new Event('input',{bubbles:true}))})()"); await sleep(400);
    ck('mots en « е » : yeẋa yeq̇a yeẋalxa yeşä q̇omaŋ', (await out(s)).trim() === 'yeẋa yeq̇a yeẋalxa yeşä q̇omaŋ', await out(s));
    // gros texte
    const big = 'Нохчийн мотт — Маршалла хуьлда шуьга! '.repeat(400);
    const t0 = Date.now(); await ev(s, `(()=>{const i=document.getElementById('input');i.value=${JSON.stringify(big)};i.dispatchEvent(new Event('input',{bubbles:true}))})()`); await sleep(300);
    const bigOut = await out(s); const dt = Date.now() - t0;
    ck('texte de ' + big.length + ' caractères converti en moins de 5 s (' + dt + ' ms)', bigOut.length > 10000 && dt < 5000);
    ck('la page reste utilisable (hauteur du champ plafonnée)', (await ev(s, "document.getElementById('input').getBoundingClientRect().height")) <= 0.5 * 800 + 5);

    L('== 2. Copie');
    await ev(s, "(()=>{const i=document.getElementById('input');i.value='Нохчийн мотт';i.dispatchEvent(new Event('input',{bubbles:true}))})()"); await sleep(400);
    await click(s, '#btnCopy'); await sleep(400);
    const clip = await ev(s, "navigator.clipboard.readText().catch(e=>'ERR '+e.message)");
    ck('bouton Copier : le presse-papiers contient le résultat', clip === 'Noxçiyŋ mott', clip);
    ck('retour visuel du bouton (classe done)', (await ev(s, "document.getElementById('btnCopy').classList.contains('done')")) === true);

    L('== 2b. Signalement (formulaire Google prérempli)');
    const targetsNow = async () => (await br.send('Target.getTargets')).targetInfos;
    const waitForm = async (known) => { for (let i = 0; i < 30; i++) { await sleep(300); const n = (await targetsNow()).find((x) => !known.has(x.targetId) && /docs\.google\.com/.test(x.url)); if (n) return n; } return null; };
    const knownIds = () => targetsNow().then((a) => new Set(a.map((x) => x.targetId)));
    ck('avant tout clic : aucune requête vers Google', googleRequests === 0, googleRequests);
    ck('sur localhost (même avec un code de site configuré) : aucune requête vers un autre site', externalUrls.length === 0, externalUrls.join(' '));
    await ev(s, "document.querySelector('.lang-item[data-lang=\"fr\"]').click()"); await sleep(200);
    await ev(s, "(()=>{const i=document.getElementById('input');i.value='Нохчийн мотт';i.dispatchEvent(new Event('input',{bubbles:true}))})()"); await sleep(400);
    let known = await knownIds();
    await click(s, '#btnReport');
    let form = await waitForm(known);
    ck('bouton Signaler : le formulaire s\'ouvre dans un nouvel onglet', !!form, form && form.url);
    if (form) {
      const u = new URL(form.url.replace('/viewform?', '/viewform?'));
      const fr = 'forms/d/e/1FAIpQLSfVSkAaMIyE_belZgydpewYsKwKieg1T8ciODDK8LaUKbcuwQ';
      ck('formulaire de la langue (français), interface Google en français', form.url.includes(fr) && /[?&]hl=fr/.test(form.url), form.url.slice(0, 120));
      const dec = decodeURIComponent(form.url.replace(/\+/g, ' '));
      ck('prérempli : type « Mauvaise translittération », texte source, résultat', dec.includes('entry.1685349041=Mauvaise translittération') && dec.includes('entry.1447841949=Нохчийн мотт') && dec.includes('entry.1248358464=Noxçiyŋ mott'), dec.slice(100, 400));
      ck('prérempli : version « web 1.0.0 (engine … ) »', /entry\.315142135=web \d+\.\d+\.\d+ \(engine \d+\.\d+\.\d+\)/.test(dec), dec.slice(-80));
      await br.send('Target.closeTarget', { targetId: form.targetId });
    }
    // sans texte : lien « Signaler un problème » -> type Bug, sans texte
    known = await knownIds(); await click(s, '#btnReportProblem'); form = await waitForm(known);
    ck('lien « Signaler un problème » : formulaire ouvert', !!form);
    if (form) { const dec = decodeURIComponent(form.url.replace(/\+/g, ' ')); ck('sans texte : type « Bug », rien de prérempli', dec.includes('entry.1685349041=Bug') && !dec.includes('entry.1447841949'), dec.slice(100, 300)); await br.send('Target.closeTarget', { targetId: form.targetId }); }
    // texte trop long : plafonné à 300 caractères
    await ev(s, "(()=>{const i=document.getElementById('input');i.value='мотт '.repeat(200);i.dispatchEvent(new Event('input',{bubbles:true}))})()"); await sleep(500);
    known = await knownIds(); await click(s, '#btnReport'); form = await waitForm(known);
    if (form) { const q = new URL(form.url).searchParams; const src = q.get('entry.1447841949'); ck('texte long plafonné à 300 caractères + « … » (' + (src ? src.length : '?') + ')', src && src.length === 301 && src.endsWith('…')); await br.send('Target.closeTarget', { targetId: form.targetId }); } else ck('texte long : formulaire ouvert', false);
    // tchétchène : formulaire tchétchène, interface Google en anglais
    await ev(s, "document.querySelector('.lang-item[data-lang=\"ce\"]').click()"); await sleep(200);
    known = await knownIds(); await click(s, '#btnReport'); form = await waitForm(known);
    ck('tchétchène : formulaire tchétchène, interface Google en anglais', !!form && form.url.includes('1FAIpQLSc6kTtn4gUsLOdCy2HJs3bMWyDa0UeFSILPvtY7NZVgKB81Bg') && /[?&]hl=en/.test(form.url), form && form.url.slice(0, 120));
    if (form) await br.send('Target.closeTarget', { targetId: form.targetId });
    await ev(s, "(()=>{const i=document.getElementById('input');i.value='';i.dispatchEvent(new Event('input',{bubbles:true}))})()");
    ck('la précision sur le signalement s\'affiche dans chaque langue', (await ev(s, "(()=>{const b=[];for(const l of ['ce','en','fr','ru','de','tr','es','ar']){document.querySelector('.lang-item[data-lang=\"'+l+'\"]').click();if(document.getElementById('reportNote').textContent.trim().length<30)b.push(l)}document.querySelector('.lang-item[data-lang=\"ce\"]').click();return b.join(',')})()")) === '');

    L('== 3. Palette de lettres latines');
    const open0 = await ev(s, "document.getElementById('alphaBody').hidden");
    ck('palette ouverte par défaut sur grand écran', open0 === false);
    ck('42 touches', (await ev(s, "document.querySelectorAll('.alpha-key').length")) === 42);
    await click(s, '.alpha-key[data-idx="0"]'); await click(s, '#alphaShift'); await click(s, '.alpha-key[data-idx="16"]'); await click(s, '.alpha-key[data-idx="14"]');
    ck('clics : ä, puis A (majuscule à usage unique), puis ŋ', (await val(s, 'latInput')) === 'äAŋ', JSON.stringify(await val(s, 'latInput')));
    ck('infobulle de ŋ = texte de la langue de la page', (await ev(s, "(()=>{const l=document.documentElement.lang;return document.querySelectorAll('.alpha-key')[14].title===window.CLS_I18N.T[l].alphaEng})()")) === true);
    await click(s, '#alphaCopy'); await sleep(300);
    ck('copie de la zone latine', (await ev(s, "navigator.clipboard.readText().catch(e=>'ERR')")) === 'äAŋ');
    await click(s, '#alphaClear'); ck('bouton ✕ : zone vidée', (await val(s, 'latInput')) === '');
    await click(s, '#alphaToggle'); ck('en-tête : palette repliée', (await ev(s, "document.getElementById('alphaBody').hidden")) === true);

    L('== 4. Langues');
    await click(s, '#langBtn'); await sleep(200);
    ck('menu des langues ouvert', (await ev(s, "document.getElementById('langMenu').hidden")) === false);
    await click(s, '.lang-item[data-lang="fr"]'); await sleep(300);
    ck('français : sous-titre et libellés', (await ev(s, "document.getElementById('sub').textContent")) === 'Cyrillique tchétchène → latin · 1992' && (await ev(s, "document.getElementById('lblCopy').textContent")) === 'Copier');
    ck('français : phrase de confidentialité', (await ev(s, "document.getElementById('privacy').textContent")).startsWith('Tout est converti dans votre navigateur'));
    ck('html lang = fr', (await ev(s, 'document.documentElement.lang')) === 'fr');
    await click(s, '#langBtn'); await click(s, '.lang-item[data-lang="ar"]'); await sleep(300);
    ck('arabe : page de droite à gauche, touches de gauche à droite', (await ev(s, 'document.documentElement.dir')) === 'rtl' && (await ev(s, "getComputedStyle(document.getElementById('alphaKeys')).direction")) === 'ltr');
    await ev(s, 'location.reload()'); await sleep(1500);
    ck('la langue choisie est mémorisée (rechargement)', (await ev(s, 'document.documentElement.lang')) === 'ar');
    // chaque langue : aucun libellé vide
    const empties = await ev(s, "(()=>{const bad=[];for(const l of ['ce','en','fr','ru','de','tr','es','ar']){document.querySelector('.lang-item[data-lang=\"'+l+'\"]').click();for(const id of ['sub','lblCyr','lblLat','lblMisal','lblCopy','lblAlpha','privacy','verFoot','lblLicense','lblContact']){if(!document.getElementById(id).textContent.trim())bad.push(l+':'+id)}if(!document.getElementById('input').placeholder)bad.push(l+':placeholder')}return bad.join(',')})()");
    ck('8 langues : aucun libellé vide', empties === '', empties);
    await ev(s, "document.querySelector('.lang-item[data-lang=\"ce\"]').click()");

    L('== 5. Mémorisation du texte (brouillon)');
    await type(s, 'Нохчийн'); await sleep(700);
    await ev(s, 'location.reload()'); await sleep(1500);
    ck('le texte tapé revient après rechargement', (await val(s, 'input')).includes('Нохчийн'), await val(s, 'input'));
    await ev(s, "localStorage.clear()");

    L('== 6. Téléphone (375 x 700)');
    await br.send('Target.closeTarget', { targetId: t.targetId });
    ({ t, s } = await open(URL_SITE, 375, 700, true));
    await type(s, 'Нохчийн мотт');
    const m = JSON.parse(await ev(s, "JSON.stringify({ox:document.documentElement.scrollWidth>document.documentElement.clientWidth,sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,alphaOpen:!document.getElementById('alphaBody').hidden,nameScript:getComputedStyle(document.querySelector('.name-script')).display})"));
    ck('pas de défilement horizontal (' + m.sw + ' / ' + m.cw + ')', m.ox === false);
    ck('palette repliée par défaut sur téléphone', m.alphaOpen === false);
    ck('résultat affiché', (await out(s)).trim() === 'Noxçiyŋ mott');
    await click(s, '#alphaToggle'); await sleep(300);
    const keyW = await ev(s, "Math.round(document.querySelector('.alpha-key').getBoundingClientRect().width)");
    ck('touches de la palette assez grandes pour le doigt (' + keyW + ' px)', keyW >= 36);
    const shot = await br.send('Page.captureScreenshot', { format: 'png' }, s);
    fs.writeFileSync(path.join(__dirname, 'capture-telephone.png'), Buffer.from(shot.data, 'base64'));
    await ev(s, 'localStorage.clear()');

    L('== 7. Installation et hors ligne');
    await br.send('Target.closeTarget', { targetId: t.targetId });
    ({ t, s } = await open(URL_SITE, 900, 800));
    await ev(s, 'navigator.serviceWorker.ready.then(()=>true)'); await sleep(800);
    const inst = await br.send('Page.getInstallabilityErrors', {}, s).catch((e) => ({ err: String(e) }));
    ck('installable (aucune erreur du navigateur)', inst.installabilityErrors && inst.installabilityErrors.length === 0, JSON.stringify(inst));
    const cached = await ev(s, "caches.keys().then(async k=>{const c=await caches.open(k[0]);const r=await c.keys();return k.length+' cache(s), '+r.length+' fichiers'})");
    L('    ', cached);
    ck('fichiers mis en cache', /^1 cache\(s\), (\d+) fichiers/.test(cached) && Number(cached.match(/(\d+) fichiers/)[1]) >= 30, cached);
    ck('service worker actif', (await ev(s, "navigator.serviceWorker.getRegistration().then(r=>!!(r&&r.active))")) === true);
    await br.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }, s);
    await ev(s, 'location.reload()'); await sleep(2200);
    ck('hors ligne : la page se recharge', (await ev(s, 'document.title')) === 'Chechen Latin Script');
    await type(s, 'Нохчийн мотт');
    ck('hors ligne : la conversion fonctionne', (await out(s)).trim() === 'Noxçiyŋ mott', await out(s));
    await br.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, s);
    await br.send('Target.closeTarget', { targetId: t.targetId });

    L('== 8. Ouverture depuis un fichier local (sans serveur)');
    ({ t, s } = await open(FILE_SITE, 900, 800));
    await type(s, 'Нохчийн мотт');
    ck('depuis file:// : la conversion fonctionne', (await out(s)).trim() === 'Noxçiyŋ mott', await out(s));
    await br.send('Target.closeTarget', { targetId: t.targetId });

    L('== 8b. Mesure d\'audience (GoatCounter) : désactivée par défaut, respectueuse quand elle est activée');
    const statsPage = async (url, initScript) => {
      const tt = await br.send('Target.createTarget', { url: 'about:blank' });
      const ss = (await br.send('Target.attachToTarget', { targetId: tt.targetId, flatten: true })).sessionId;
      await br.send('Runtime.enable', {}, ss); await br.send('Page.enable', {}, ss); await br.send('Network.enable', {}, ss);
      await br.send('Fetch.enable', { patterns: [{ urlPattern: 'https://gc.zgo.at/*' }, { urlPattern: 'https://*.goatcounter.com/*' }] }, ss);
      if (initScript) await br.send('Page.addScriptToEvaluateOnNewDocument', { source: initScript }, ss);
      await br.send('Target.activateTarget', { targetId: tt.targetId });
      await br.send('Page.navigate', { url }, ss); await sleep(2600);
      return { tt, ss };
    };
    const gcCount = () => statsReq.filter((r) => /gc\.zgo\.at\/count\.js/.test(r.url)).length;
    let before = statsReq.length;
    let p1 = await statsPage('http://stats.test:8099/');
    ck('activée (code de test, domaine non local) : le compteur est chargé une seule fois', gcCount() === 1, JSON.stringify(statsReq.map((r) => r.url)));
    ck('le script porte l\'adresse du site de comptage', (await ev(p1.ss, "(()=>{const s=document.querySelector('script[data-goatcounter]');return s?s.getAttribute('data-goatcounter'):null})()")) === 'https://testsite.goatcounter.com/count');
    await ev(p1.ss, "document.querySelector('.lang-item[data-lang=\"en\"]').click()"); await sleep(200);
    ck('le texte de confidentialité annonce le comptage anonyme', /counted, anonymously/.test(await ev(p1.ss, "document.getElementById('privacy').textContent")), await ev(p1.ss, "document.getElementById('privacy').textContent"));
    await ev(p1.ss, "(()=>{const i=document.getElementById('input');i.value='Нохчийн мотт';i.dispatchEvent(new Event('input',{bubbles:true}))})()"); await sleep(500);
    ck('le texte saisi n\'apparaît dans aucune requête du compteur', !statsReq.some((r) => /%D0%9D%D0%BE%D1%85|Noxç|Нохч/.test(r.url + r.post)));
    await br.send('Target.closeTarget', { targetId: p1.tt.targetId });
    before = gcCount();
    let p2 = await statsPage('http://stats.test:8099/', "Object.defineProperty(navigator,'doNotTrack',{get:()=>'1'})");
    ck('« Ne pas me suivre » (DNT) : rien n\'est compté', gcCount() === before, gcCount() + ' vs ' + before);
    await br.send('Target.closeTarget', { targetId: p2.tt.targetId });
    let p3 = await statsPage('http://stats.test:8099/', "Object.defineProperty(navigator,'globalPrivacyControl',{get:()=>true})");
    ck('« Global Privacy Control » : rien n\'est compté', gcCount() === before);
    await br.send('Target.closeTarget', { targetId: p3.tt.targetId });
    let p4 = await statsPage('http://127.0.0.1:8099/');
    ck('poste local (127.0.0.1), même avec un code : rien n\'est compté', gcCount() === before);
    await br.send('Target.closeTarget', { targetId: p4.tt.targetId });

    L('== 9. Erreurs');
    const real = errors.filter((e) => !/favicon/i.test(e));
    ck('aucune exception ni erreur de console ni requête en échec', real.length === 0, real.slice(0, 4).join(' || '));
  } catch (e) { ko++; L('ERREUR', e.stack || e.message); }
  finally { await chrome.close(); server.close(); L('\nTOTAL : ' + ok + ' OK, ' + ko + ' échec(s)'); process.exit(ko ? 1 : 0); }
})();
