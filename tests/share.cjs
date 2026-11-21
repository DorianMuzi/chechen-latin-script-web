// Test du partage du site (2.7) dans un VRAI Chrome (sans fenêtre) : menu, liens des services, lien « avec le texte »,
// lecture d'un lien reçu (dont les liens piégés), téléphone (menu du système), 8 langues, droite à gauche, débordements.
// Usage : node tests/share.cjs
'use strict';
const path = require('path'), fs = require('fs');
const { launch, sleep } = require('./cdp-client.cjs');
const { start } = require('./serve.cjs');

const URL_SITE = 'http://localhost:8097/';
const PROJECT = 'https://dorianmuzi.github.io/chechen-latin-script-web/';
const OUT = process.env.CLS_SHOTS || __dirname;
let ok = 0, ko = 0;
const L = (...a) => console.log(a.join(' '));
const ck = (name, cond, extra) => { if (cond) { ok++; L('  OK   ' + name); } else { ko++; L('  ECHEC ' + name + (extra !== undefined ? ' | ' + extra : '')); } };
const b64u = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

(async () => {
  const server = await start(8097);
  const chrome = await launch(9335);
  const br = chrome.br;
  const errors = [];
  br.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map((a) => a.value || a.description).join(' '));
  });
  try {
    L('Chrome', chrome.version);
    await br.send('Browser.grantPermissions', { origin: 'http://localhost:8097', permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
    const open = async (url, w, h, mobile) => {
      const t = await br.send('Target.createTarget', { url: 'about:blank' });
      const s = (await br.send('Target.attachToTarget', { targetId: t.targetId, flatten: true })).sessionId;
      await br.send('Runtime.enable', {}, s); await br.send('Page.enable', {}, s);
      if (w) await br.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile }, s);
      await br.send('Target.activateTarget', { targetId: t.targetId });
      await br.send('Page.navigate', { url }, s); await sleep(1800);
      return { t, s };
    };
    const ev = (s, expr) => Promise.race([br.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, s).then((r) => r.result.value), sleep(9000).then(() => 'TIMEOUT')]);
    const mouse = async (s, x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await br.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, s); await sleep(250); };
    const click = async (s, sel) => { const r = await ev(s, `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`); if (!r || r === 'TIMEOUT') throw new Error('introuvable ' + sel); await mouse(s, r.x, r.y); };
    const key = async (s, k, code, text) => { await br.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code, text }, s); await br.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code }, s); await sleep(250); };
    const setText = async (s, text) => { await ev(s, `(()=>{const i=document.getElementById('input');i.value=${JSON.stringify(text)};i.dispatchEvent(new Event('input',{bubbles:true}));})()`); await sleep(900); };
    const setLang = async (s, l) => { await ev(s, `document.querySelector('.lang-item[data-lang="${l}"]').click()`); await sleep(200); };
    const stubOpen = (s) => ev(s, "window.__opened=[];window.open=function(u,t,f){window.__opened.push([u,t,f]);return null};1");
    const opened = async (s) => JSON.parse(await ev(s, 'JSON.stringify(window.__opened||[])'));
    const menuInfo = (s, id) => ev(s, `JSON.stringify((()=>{const m=document.getElementById('${id}');const r=m.getBoundingClientRect();const items=[...m.querySelectorAll('.share-item')];const last=items[items.length-1];let top=null;if(last){const lr=last.getBoundingClientRect();const e=document.elementFromPoint(lr.left+lr.width/2,lr.top+lr.height/2);top=!!(e&&e.closest('.share-item')===last)}return {hidden:m.hidden,ids:items.map(i=>i.getAttribute('data-share')),labels:items.map(i=>i.textContent),inView:r.left>=0&&r.right<=document.documentElement.clientWidth&&r.top>=0&&r.bottom<=innerHeight,r:[Math.round(r.left),Math.round(r.top),Math.round(r.right),Math.round(r.bottom)],lastOnTop:top,focus:document.activeElement&&(document.activeElement.getAttribute('data-share')||document.activeElement.id)}})())`).then((x) => JSON.parse(x));
    const q = (s) => decodeURIComponent(s);

    L('== 1. Bouton « Partager » du résultat (ordinateur)');
    let { t, s } = await open(URL_SITE, 1000, 800);
    await setLang(s, 'en');
    await setText(s, 'Нохчийн мотт');
    const result = await ev(s, "document.getElementById('output').textContent");
    await stubOpen(s);
    const lay = JSON.parse(await ev(s, "JSON.stringify((()=>{const r=id=>document.getElementById(id).getBoundingClientRect();return {order:r('btnReport').left<r('btnShare').left&&r('btnShare').left<r('btnCopy').left,vis:r('btnShare').width>0,label:document.getElementById('lblShare').textContent,exp:document.getElementById('btnShare').getAttribute('aria-expanded')}})())"));
    ck('bouton « Share » visible entre Signaler et Copier', lay.order && lay.vis && lay.label === 'Share', JSON.stringify(lay));
    await click(s, '#btnShare');
    let m = await menuInfo(s, 'shareMenu');
    ck('clic : menu ouvert avec Telegram, WhatsApp, X, Copier le lien (pas de Facebook pour un texte)', !m.hidden && m.ids.join() === 'telegram,whatsapp,x,copy' && m.labels[3] === '⧉ Copy link', JSON.stringify(m));
    ck('le menu est entièrement visible, rien n\'est rogné', m.inView && m.lastOnTop === true, JSON.stringify(m));
    ck('focus sur le premier choix, aria-expanded', m.focus === 'telegram' && (await ev(s, "document.getElementById('btnShare').getAttribute('aria-expanded')")) === 'true', JSON.stringify(m));
    { const sh = await br.send('Page.captureScreenshot', { format: 'png' }, s); fs.writeFileSync(path.join(OUT, 'share-menu.png'), Buffer.from(sh.data, 'base64')); }
    await click(s, '[data-share="telegram"]');
    let o = await opened(s);
    ck('Telegram : adresse de partage avec le texte latin et l\'adresse du projet', o.length === 1 && o[0][0].startsWith('https://t.me/share/url?') && q(new URL(o[0][0]).searchParams.get('url')) === PROJECT && new URL(o[0][0]).searchParams.get('text') === result && o[0][1] === '_blank' && /noopener/.test(o[0][2]), JSON.stringify(o));
    ck('le menu se referme après le choix', (await menuInfo(s, 'shareMenu')).hidden === true);
    await click(s, '#btnShare'); await click(s, '[data-share="whatsapp"]');
    o = await opened(s);
    ck('WhatsApp : texte + adresse du projet sur la ligne suivante', o.length === 2 && o[1][0].startsWith('https://wa.me/?text=') && new URL(o[1][0]).searchParams.get('text') === result + '\n' + PROJECT, JSON.stringify(o[1]));
    await click(s, '#btnShare'); await click(s, '[data-share="x"]');
    o = await opened(s);
    ck('X : texte latin + adresse du projet', o.length === 3 && o[2][0].startsWith('https://x.com/intent/post?') && new URL(o[2][0]).searchParams.get('text') === result && new URL(o[2][0]).searchParams.get('url') === PROJECT, JSON.stringify(o[2]));
    await click(s, '#btnShare'); await click(s, '[data-share="copy"]'); await sleep(300);
    const clip = await ev(s, 'navigator.clipboard.readText()');
    ck('« Copier le lien » : lien du projet avec le texte d\'origine dans la partie « # »', clip.startsWith(PROJECT + '#t=') && unb64u(clip.slice((PROJECT + '#t=').length)) === 'Нохчийн мотт', clip);
    await sleep(900);
    ck('le menu se referme après la copie', (await menuInfo(s, 'shareMenu')).hidden === true);

    L('== 2. Longs textes');
    const long1 = ('Нохчийн мотт ').repeat(30).trim();           // ~389 lettres : lien possible, X coupé
    await setText(s, long1);
    await click(s, '#btnShare'); await click(s, '[data-share="x"]');
    o = await opened(s); const xt = new URL(o[o.length - 1][0]).searchParams.get('text');
    ck('X : texte coupé à 220 lettres avec « … »', xt.length <= 220 && xt.endsWith('…'), String(xt.length));
    await click(s, '#btnShare');
    m = await menuInfo(s, 'shareMenu'); ck('texte de 389 lettres : le lien avec le texte est proposé', m.ids.includes('copy'), JSON.stringify(m.ids));
    await click(s, '#sub');
    const long2 = ('Нохчийн мотт ').repeat(60).trim();           // ~779 lettres : au-delà de 600
    await setText(s, long2);
    await click(s, '#btnShare'); m = await menuInfo(s, 'shareMenu');
    ck('texte de plus de 600 lettres : pas de lien avec le texte, les autres services restent', m.ids.join() === 'telegram,whatsapp,x', JSON.stringify(m.ids));
    await click(s, '#sub');

    L('== 3. Clavier, clic ailleurs, menus exclusifs');
    await setText(s, 'Нохчийн мотт');
    await ev(s, "document.getElementById('btnShare').focus()"); await key(s, 'ArrowDown', 40);
    m = await menuInfo(s, 'shareMenu'); ck('flèche bas sur le bouton : ouvre, focus sur Telegram', !m.hidden && m.focus === 'telegram', JSON.stringify(m));
    await key(s, 'ArrowDown', 40); m = await menuInfo(s, 'shareMenu'); ck('flèche bas : WhatsApp', m.focus === 'whatsapp', m.focus);
    await key(s, 'End', 35); m = await menuInfo(s, 'shareMenu'); ck('Fin : dernier choix (copier le lien)', m.focus === 'copy', m.focus);
    await key(s, 'Home', 36); m = await menuInfo(s, 'shareMenu'); ck('Début : premier choix', m.focus === 'telegram', m.focus);
    await key(s, 'Escape', 27); m = await menuInfo(s, 'shareMenu');
    ck('Échap : ferme et rend le focus au bouton', m.hidden && (await ev(s, 'document.activeElement.id')) === 'btnShare', JSON.stringify(m));
    await key(s, 'ArrowDown', 40); await key(s, 'Tab', 9); ck('Tab : ferme', (await menuInfo(s, 'shareMenu')).hidden);
    await click(s, '#btnShare'); await click(s, '#sub'); ck('clic ailleurs : ferme', (await menuInfo(s, 'shareMenu')).hidden);
    await click(s, '#btnShare'); await click(s, '#langBtn');
    ck('ouvrir la langue ferme le partage', (await menuInfo(s, 'shareMenu')).hidden && (await ev(s, "!document.getElementById('langMenu').hidden")) === true);
    await click(s, '#sub');
    await click(s, '#btnShare'); await click(s, '#btnShareProject');
    ck('ouvrir « Partager le projet » ferme l\'autre menu', (await menuInfo(s, 'shareMenu')).hidden && !(await menuInfo(s, 'shareMenuProject')).hidden);
    await click(s, '#sub');

    L('== 4. « Partager le projet » (pied de page)');
    await stubOpen(s);
    await click(s, '#btnShareProject');
    m = await menuInfo(s, 'shareMenuProject');
    ck('menu : Telegram, WhatsApp, X, Facebook, Copier le lien', m.ids.join() === 'telegram,whatsapp,x,facebook,copy', JSON.stringify(m));
    ck('le menu s\'ouvre vers le haut, entièrement visible', m.inView && m.lastOnTop === true, JSON.stringify(m));
    { const sh = await br.send('Page.captureScreenshot', { format: 'png' }, s); fs.writeFileSync(path.join(OUT, 'share-project-menu.png'), Buffer.from(sh.data, 'base64')); }
    await click(s, '#shareMenuProject [data-share="facebook"]');
    o = await opened(s);
    ck('Facebook : adresse du projet seulement', o.length === 1 && o[0][0] === 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(PROJECT), JSON.stringify(o));
    await click(s, '#btnShareProject'); await click(s, '#shareMenuProject [data-share="telegram"]');
    o = await opened(s); const tp = new URL(o[1][0]).searchParams;
    ck('Telegram : nom du projet + sous-titre traduit', tp.get('text').startsWith('Chechen Latin Script — ') && tp.get('text').length > 30 && tp.get('url') === PROJECT, tp.get('text'));
    await click(s, '#btnShareProject'); await click(s, '#shareMenuProject [data-share="copy"]'); await sleep(300);
    ck('Copier le lien du projet : adresse simple, sans texte', (await ev(s, 'navigator.clipboard.readText()')) === PROJECT);
    await sleep(900);

    L('== 5. Lien reçu avec un texte');
    await br.send('Target.closeTarget', { targetId: t.targetId });
    const SRC = 'Нохчийн мотт — 😀 «къа»';
    ({ t, s } = await open(URL_SITE + '#t=' + b64u(SRC), 1000, 800));
    await ev(s, "localStorage.setItem('cls_draft','ANCIEN BROUILLON')"); // trop tard : la page est déjà chargée ; on revérifie ci-dessous
    let got = JSON.parse(await ev(s, "JSON.stringify({input:document.getElementById('input').value,out:document.getElementById('output').textContent,hash:location.hash,draft:localStorage.getItem('cls_draft')})"));
    ck('le texte du lien remplit le champ et la conversion apparaît', got.input === SRC && got.out.length > 5 && got.out !== SRC, JSON.stringify(got));
    ck('l\'adresse est nettoyée (plus de « # »)', got.hash === '', got.hash);
    await br.send('Target.closeTarget', { targetId: t.targetId });
    // brouillon existant remplacé par le texte du lien
    ({ t, s } = await open(URL_SITE, 1000, 800));
    await ev(s, "localStorage.setItem('cls_draft','ANCIEN BROUILLON')"); await br.send('Target.closeTarget', { targetId: t.targetId });
    ({ t, s } = await open(URL_SITE + '#t=' + b64u('Нохчийн'), 1000, 800));
    got = JSON.parse(await ev(s, "JSON.stringify({input:document.getElementById('input').value,draft:localStorage.getItem('cls_draft')})"));
    ck('le texte du lien remplace l\'ancien brouillon', got.input === 'Нохчийн' && got.draft === 'Нохчийн', JSON.stringify(got));
    await br.send('Target.closeTarget', { targetId: t.targetId });
    // liens piégés ou invalides
    ({ t, s } = await open(URL_SITE + '#t=' + b64u('<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>'), 1000, 800));
    got = JSON.parse(await ev(s, "JSON.stringify({input:document.getElementById('input').value,pwned:window.__pwned||null,img:!!document.querySelector('#output img, #output script, #input img'),outHasTag:document.getElementById('output').textContent.indexOf('<img')>=0})"));
    ck('texte piégé : affiché comme simple texte, rien n\'est exécuté', got.input.startsWith('<img src=x') && got.pwned === null && got.img === false, JSON.stringify(got));
    await br.send('Target.closeTarget', { targetId: t.targetId });
    ({ t, s } = await open(URL_SITE, 1000, 800)); await ev(s, "localStorage.clear()"); await br.send('Target.closeTarget', { targetId: t.targetId });
    for (const [name, h] of [['octets invalides (UTF-8 cassé)', '#t=_w'], ['caractères interdits', '#t=%3Cb%3E'], ['vide', '#t='], ['trop long (> 4000)', '#t=' + 'A'.repeat(4100)]]) {
      ({ t, s } = await open(URL_SITE + h, 1000, 800));
      got = JSON.parse(await ev(s, "JSON.stringify({input:document.getElementById('input').value})"));
      ck('lien ignoré : ' + name, got.input === '', JSON.stringify(got));
      await br.send('Target.closeTarget', { targetId: t.targetId });
    }
    ({ t, s } = await open(URL_SITE + '#t=' + b64u('x'.repeat(3000)), 1000, 800));
    got = JSON.parse(await ev(s, "JSON.stringify({n:document.getElementById('input').value.length})"));
    ck('texte très long : coupé à 2000 lettres', got.n === 2000, JSON.stringify(got));
    await br.send('Target.closeTarget', { targetId: t.targetId });

    L('== 6. Téléphone : menu de partage du système');
    ({ t, s } = await open(URL_SITE, 375, 700, true));
    await ev(s, "localStorage.clear();1");
    await ev(s, "(()=>{const mm=window.matchMedia.bind(window);window.matchMedia=(q)=>q==='(pointer: coarse)'?{matches:true,media:q,addEventListener(){},removeEventListener(){}}:mm(q);window.__shared=[];navigator.share=(d)=>{window.__shared.push(d);return Promise.resolve()};1})()");
    await setLang(s, 'fr'); await setText(s, 'Нохчийн мотт');
    const res2 = await ev(s, "document.getElementById('output').textContent");
    await click(s, '#btnShare');
    got = JSON.parse(await ev(s, "JSON.stringify({shared:window.__shared,menuHidden:document.getElementById('shareMenu').hidden})"));
    ck('téléphone : le menu du système reçoit le texte latin et l\'adresse ; notre menu reste fermé', got.shared.length === 1 && got.shared[0].text === res2 && got.shared[0].url === PROJECT && got.menuHidden === true, JSON.stringify(got));
    await click(s, '#btnShareProject');
    got = JSON.parse(await ev(s, "JSON.stringify({shared:window.__shared})"));
    ck('téléphone : « Partager le projet » passe aussi par le menu du système', got.shared.length === 2 && got.shared[1].url === PROJECT && /^Chechen Latin Script — /.test(got.shared[1].text), JSON.stringify(got));
    await br.send('Target.closeTarget', { targetId: t.targetId });
    // ordinateur avec navigator.share présent (Chrome/Edge sous Windows) : nos boutons sont gardés
    ({ t, s } = await open(URL_SITE, 1000, 800));
    await ev(s, "window.__shared=[];navigator.share=(d)=>{window.__shared.push(d);return Promise.resolve()};1");
    await setText(s, 'Нохчийн мотт'); await click(s, '#btnShare');
    got = JSON.parse(await ev(s, "JSON.stringify({shared:window.__shared.length,menuHidden:document.getElementById('shareMenu').hidden})"));
    ck('ordinateur : même si navigator.share existe, c\'est notre menu qui s\'ouvre', got.shared === 0 && got.menuHidden === false, JSON.stringify(got));
    await br.send('Target.closeTarget', { targetId: t.targetId });

    L('== 7. Huit langues, droite à gauche, petits écrans');
    const EXPECT = { ce: ['Deq̇a', 'Proekt deq̇a', 'Ẋaƶorg sẋaeca'], en: ['Share', 'Share the project', 'Copy link'], fr: ['Partager', 'Partager le projet', 'Copier le lien'],
      ru: ['Поделиться', 'Поделиться проектом', 'Копировать ссылку'], de: ['Teilen', 'Projekt teilen', 'Link kopieren'], tr: ['Paylaş', 'Projeyi paylaş', 'Bağlantıyı kopyala'],
      es: ['Compartir', 'Compartir el proyecto', 'Copiar enlace'], ar: ['مشاركة', 'مشاركة المشروع', 'نسخ الرابط'] };
    ({ t, s } = await open(URL_SITE, 375, 700, true));
    await ev(s, "localStorage.clear();1");
    await setText(s, 'Нохчийн мотт');
    for (const l of Object.keys(EXPECT)) {
      await setLang(s, l);
      const g = JSON.parse(await ev(s, "JSON.stringify({a:document.getElementById('lblShare').textContent,b:document.getElementById('btnShareProject').textContent,sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,dir:document.documentElement.dir})"));
      await click(s, '#btnShare'); const mi = await menuInfo(s, 'shareMenu');
      const copyLbl = (mi.labels[mi.labels.length - 1] || '').replace(/^⧉ /, '');
      await click(s, '#sub');
      await click(s, '#btnShareProject'); const mp = await menuInfo(s, 'shareMenuProject'); await click(s, '#sub');
      ck(l + ' : libellés, pas de défilement horizontal, menus dans la fenêtre', g.a === EXPECT[l][0] && g.b === EXPECT[l][1] && copyLbl === EXPECT[l][2] && g.sw <= g.cw && mi.inView && mp.inView && (l !== 'ar' || g.dir === 'rtl'), JSON.stringify({ g, copyLbl, mi: mi.r, mp: mp.r }));
      if (l === 'ar') { await click(s, '#btnShare'); const sh = await br.send('Page.captureScreenshot', { format: 'png' }, s); fs.writeFileSync(path.join(OUT, 'share-ar-375.png'), Buffer.from(sh.data, 'base64')); await click(s, '#sub'); }
      if (l === 'ru') { await click(s, '#btnShare'); const sh = await br.send('Page.captureScreenshot', { format: 'png' }, s); fs.writeFileSync(path.join(OUT, 'share-ru-375.png'), Buffer.from(sh.data, 'base64')); await click(s, '#sub'); }
    }
    await br.send('Target.closeTarget', { targetId: t.targetId });
    L('== 8. Erreurs');
    ck('aucune exception ni erreur de console', errors.length === 0, errors.join(' || '));
    L('TOTAL : ' + ok + ' OK, ' + ko + ' échec(s)');
  } catch (e) { L('ERREUR', e.stack || e.message); ko++; }
  await chrome.close(); server.close();
  process.exit(ko ? 1 : 0);
})();
