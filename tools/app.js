/*
 * Chechen Latin Script (web) — interface du convertisseur.
 * Le moteur de translittération est celui de l'extension (engine/transliterate.js). Les textes d'interface et la liste
 * des lettres de la palette viennent de l'extension (i18n.js, généré par tools/build.cjs).
 *
 * Copyright 2026 LinguaCE — Apache License 2.0
 */
(function () {
  'use strict';

  var I = window.CLS_I18N;
  var T = I.T, LANGS = I.LANGS, ALPHABET = I.ALPHABET;
  var WEB_VERSION = '1.0.0';
  var DEFAULT_LANGUAGE = 'ce';
  var EXAMPLE_TEXT = 'Нохчийн мотт — 1992 шарахь латинан абат.';
  var LS = { lang: 'cls_lang', draft: 'cls_draft', alpha: 'cls_alpha_open' };

  // Phrase de confidentialité de la version web (propre au site, absente de l'extension).
  // ce : PROVISOIRE (anglais) en attendant la formulation tchétchène.
  var PRIVACY = {
    ce: 'Everything is converted in your browser. Nothing is sent to any server.',
    en: 'Everything is converted in your browser. Nothing is sent to any server.',
    fr: 'Tout est converti dans votre navigateur. Rien n’est envoyé à un serveur.',
    ru: 'Всё преобразуется в вашем браузере. Ничего не отправляется на сервер.',
    de: 'Alles wird in Ihrem Browser umgewandelt. Es wird nichts an einen Server gesendet.',
    tr: 'Her şey tarayıcınızda dönüştürülür. Hiçbir şey bir sunucuya gönderilmez.',
    es: 'Todo se convierte en tu navegador. No se envía nada a ningún servidor.',
    ar: 'يتم كل شيء في متصفحك. لا يُرسل أي شيء إلى أي خادم.'
  };
  // Précision sur le bouton « Signaler » (il ouvre une page Google Forms : le texte voyage dans l'adresse de la page).
  // ce : PROVISOIRE (anglais) en attendant la formulation tchétchène.
  var REPORT_NOTE = {
    ce: '« Djaxaiyta » ṫeödaraşa kerlaçu qollamaŋ Google Forms aġo yöllu, cigaẋ şuŋ tekst a, cünaŋ ƶamj a ẋalxa djayazdina xülu. Djaẋoƶiyta ya ca ẋoƶiyta şäş xorƶu.',
    en: 'The “Report” buttons open a Google Forms page in a new tab, pre-filled with your text and its result. You decide whether to submit it.',
    fr: 'Les boutons « Signaler » ouvrent une page Google Forms dans un nouvel onglet, préremplie avec votre texte et son résultat. C’est vous qui décidez de l’envoyer.',
    ru: 'Кнопки «Сообщить» открывают страницу Google Forms в новой вкладке с вашим текстом и результатом. Отправлять форму или нет — решаете вы.',
    de: 'Die Schaltflächen „Melden“ öffnen eine Google-Forms-Seite in einem neuen Tab, mit Ihrem Text und dem Ergebnis vorausgefüllt. Ob Sie sie absenden, entscheiden Sie.',
    tr: '“Bildir” düğmeleri yeni bir sekmede, metniniz ve sonucuyla doldurulmuş bir Google Forms sayfası açar. Göndermek isteyip istemediğinize siz karar verirsiniz.',
    es: 'Los botones «Reportar» abren una página de Google Forms en una pestaña nueva, rellenada con tu texto y su resultado. Tú decides si la envías.',
    ar: 'تفتح أزرار «إبلاغ» صفحة Google Forms في علامة تبويب جديدة، معبأة بنصك ونتيجته. أنت من يقرر إرسالها أم لا.'
  };
  // Titre court au-dessus de la phrase de confidentialité (tchétchène uniquement, fourni par l'utilisateur)
  var PRIVACY_TITLE = { ce: 'Q̇aylaxa laror' };
// Variante quand le compteur de visites est activé (tools/config.json) : même idée, avec la mention du compteur anonyme.
  // ce : PROVISOIRE (anglais) en attendant la formulation tchétchène.
  var PRIVACY_STATS = {
    ce: 'Derrig a şuŋ brauzerax doliyra du: şuŋ tekst cq̇a a djaẋaƶiyna yac. Ẋaƶarş beŋ ca loru, anonimno (moxk, cookie a, şeŋ dolaẋ xaamaş a bocuş).',
    en: 'Everything is converted in your browser: your text is never sent anywhere. Only visits are counted, anonymously (country, no cookies, no personal data).',
    fr: 'Tout est converti dans votre navigateur : votre texte n’est jamais envoyé. Seules les visites sont comptées, de façon anonyme (pays, sans cookie ni donnée personnelle).',
    ru: 'Всё преобразуется в вашем браузере: ваш текст никуда не отправляется. Анонимно подсчитываются только посещения (страна, без файлов cookie и персональных данных).',
    de: 'Alles wird in Ihrem Browser umgewandelt: Ihr Text wird nie gesendet. Es werden nur Besuche anonym gezählt (Land, ohne Cookies, ohne personenbezogene Daten).',
    tr: 'Her şey tarayıcınızda dönüştürülür: metniniz hiçbir yere gönderilmez. Yalnızca ziyaretler anonim olarak sayılır (ülke, çerezsiz, kişisel veri yok).',
    es: 'Todo se convierte en tu navegador: tu texto nunca se envía. Solo se cuentan las visitas de forma anónima (país, sin cookies ni datos personales).',
    ar: 'يتم كل شيء في متصفحك: لا يُرسل نصك إلى أي مكان. تُحسب الزيارات فقط بشكل مجهول (البلد، بلا ملفات تعريف ارتباط ولا بيانات شخصية).'
  };
  var STATS_CODE = (window.CLS_CONFIG && window.CLS_CONFIG.goatcounter) || '';
  var ENGINE_ERROR = 'The converter could not start. Please reload the page.';

  // ---------- Utilitaires ----------
  function lsGet(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } }
  function lsSet(key, value) { try { window.localStorage.setItem(key, value); } catch (e) { /* stockage indisponible */ } }

  var el = {};
  ['input', 'lblCyr', 'lblLat', 'lblMisal', 'lblCopy', 'misalHint', 'outBlock', 'output', 'btnCopy', 'sub', 'privacy',
   'verFoot', 'lblLicense', 'lblContact', 'aboutLicense', 'aboutContact',
   'btnReport', 'lblReport', 'btnReportProblem', 'reportNote',
   'langBtn', 'langMenu', 'langFlag', 'langCode',
   'alphaToggle', 'lblAlpha', 'alphaBody', 'latInput', 'alphaKeys', 'alphaShift', 'alphaClear', 'alphaCopy', 'lblAlphaCopy'
  ].forEach(function (id) { el[id] = document.getElementById(id); });
  el.langItems = Array.prototype.slice.call(document.querySelectorAll('.lang-item'));

  var state = { lang: DEFAULT_LANGUAGE, shift: false };
  var engineReady = null;

  // ---------- Langue ----------
  function pickInitialLang() {
    var saved = lsGet(LS.lang);
    if (saved && T[saved]) return saved;
    var list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
    for (var i = 0; i < list.length; i++) {
      var base = String(list[i] || '').toLowerCase().split('-')[0];
      if (T[base]) return base;
    }
    return DEFAULT_LANGUAGE;
  }

  function applyLanguage(code) {
    var t = T[code] || T[DEFAULT_LANGUAGE];
    state.lang = T[code] ? code : DEFAULT_LANGUAGE;
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';

    el.sub.textContent = t.sub;
    el.lblCyr.textContent = t.cyr;
    el.lblLat.textContent = t.lat;
    el.lblMisal.textContent = t.misal;
    el.lblCopy.textContent = t.copy;
    el.input.placeholder = t.ph;
    el.lblAlpha.textContent = t.alpha;
    el.latInput.placeholder = t.alphaPh;
    el.alphaShift.title = t.alphaShift;
    el.alphaShift.setAttribute('aria-label', t.alphaShift);
    el.alphaClear.title = t.alphaClear;
    el.alphaClear.setAttribute('aria-label', t.alphaClear);
    el.lblAlphaCopy.textContent = t.copy;
    var privacy = STATS_CODE ? PRIVACY_STATS : PRIVACY;
    // Tchétchène : titre court (« Confidentialité ») au-dessus de la phrase
    var ptitle = STATS_CODE ? PRIVACY_TITLE[state.lang] : '';
    el.privacy.textContent = '';
    if (ptitle) {
      var strong = document.createElement('strong');
      strong.className = 'web-note-title';
      strong.textContent = ptitle;
      el.privacy.appendChild(strong);
      el.privacy.appendChild(document.createElement('br'));
    }
    el.privacy.appendChild(document.createTextNode(privacy[state.lang] || privacy.en));
    el.reportNote.textContent = REPORT_NOTE[state.lang] || REPORT_NOTE.en;
    el.lblReport.textContent = t.report;
    el.btnReportProblem.textContent = t.reportProblem;
    // En tchétchène, « Versi » se place après le numéro
    el.verFoot.textContent = state.lang === 'ce' ? WEB_VERSION + ' ' + t.aboutVersion : t.aboutVersion + ' ' + WEB_VERSION;
    el.verFoot.title = 'engine ' + (window.CLS_ENGINE_VERSION || '');
    el.lblLicense.textContent = t.aboutLicense;
    el.lblContact.textContent = t.aboutContact;
    updateLangUI(state.lang);
    refreshAlphabet();
  }

  function updateLangUI(code) {
    var l = LANGS[code] || LANGS[DEFAULT_LANGUAGE];
    var t = T[code] || T[DEFAULT_LANGUAGE];
    el.langFlag.className = 'flag flag-' + code;
    el.langCode.textContent = l.code;
    el.langBtn.setAttribute('aria-label', t.lang + ' : ' + l.name);
    el.langBtn.title = t.lang + ' : ' + l.name;
    el.langItems.forEach(function (item) {
      item.setAttribute('aria-checked', item.getAttribute('data-lang') === code ? 'true' : 'false');
    });
  }

  function openLangMenu() {
    el.langMenu.hidden = false;
    el.langBtn.setAttribute('aria-expanded', 'true');
    var current = el.langItems.filter(function (i) { return i.getAttribute('aria-checked') === 'true'; })[0] || el.langItems[0];
    current.focus();
  }

  function closeLangMenu(returnFocus) {
    if (el.langMenu.hidden) return;
    el.langMenu.hidden = true;
    el.langBtn.setAttribute('aria-expanded', 'false');
    if (returnFocus) el.langBtn.focus();
  }

  function initLangMenu() {
    el.langBtn.addEventListener('click', function () { if (el.langMenu.hidden) openLangMenu(); else closeLangMenu(false); });
    el.langBtn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (el.langMenu.hidden) openLangMenu(); }
    });
    el.langItems.forEach(function (item) {
      item.addEventListener('click', function () {
        var lang = item.getAttribute('data-lang');
        if (!lang || !T[lang]) return;
        applyLanguage(lang);
        lsSet(LS.lang, lang);
        closeLangMenu(true);
      });
    });
    el.langMenu.addEventListener('keydown', function (e) {
      var i = el.langItems.indexOf(document.activeElement);
      var n = el.langItems.length;
      if (e.key === 'ArrowDown') { e.preventDefault(); el.langItems[(i + 1) % n].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); el.langItems[(i - 1 + n) % n].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); el.langItems[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); el.langItems[n - 1].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeLangMenu(true); }
      else if (e.key === 'Tab') { closeLangMenu(false); }
    });
    document.addEventListener('click', function (e) {
      if (!el.langMenu.hidden && !e.target.closest('.lang-wrap')) closeLangMenu(false);
    });
  }

  // ---------- Convertisseur ----------
  function showOut(show) {
    el.outBlock.style.maxHeight = show ? '100000px' : '0';
    el.outBlock.style.opacity = show ? '1' : '0';
    el.outBlock.style.marginTop = show ? '14px' : '0';
  }

  function autoResize() {
    var ta = el.input;
    ta.style.height = 'auto';
    var borders = ta.offsetHeight - ta.clientHeight; // bordures du champ (le calcul de hauteur les inclut)
    var full = Math.max(ta.scrollHeight + borders, 58);
    var max = Math.max(160, Math.round(window.innerHeight * 0.45));
    ta.style.height = Math.min(full, max) + 'px';
    ta.style.overflowY = full > max ? 'auto' : 'hidden';
  }

  function run() {
    var value = el.input.value;
    if (!value.trim()) {
      el.output.textContent = '';
      showOut(false);
      el.misalHint.style.display = '';
      return;
    }
    el.misalHint.style.display = 'none';
    showOut(true);
    engineReady.then(function (ok) {
      if (el.input.value !== value) return; // le texte a changé entre-temps
      if (!ok) { el.output.textContent = ENGINE_ERROR; return; }
      el.output.textContent = window.translate(value) || ' ';
    });
  }

  var draftTimer = null;
  function onInput() {
    autoResize();
    run();
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function () { lsSet(LS.draft, el.input.value); }, 300);
  }

  function fillExample() {
    el.input.value = EXAMPLE_TEXT;
    autoResize();
    el.input.focus();
    run();
    lsSet(LS.draft, EXAMPLE_TEXT);
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  function copyText(text, button) {
    if (!text) return;
    function done() {
      button.classList.add('done');
      setTimeout(function () { button.classList.remove('done'); }, 900);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { if (legacyCopy(text)) done(); });
    } else if (legacyCopy(text)) {
      done();
    }
  }

  // ---------- Signalement (formulaire Google par langue, prérempli) ----------
  // Même principe que l'extension : rien n'est envoyé par le site. Le bouton ouvre la page du formulaire dans un nouvel
  // onglet, préremplie (texte source et résultat limités à 300 caractères) ; la personne relit et envoie elle-même.
  function feedbackFormFor(lang) {
    var F = I.FEEDBACK;
    var f = F.forms[lang];
    return (f && f.url && f.entries && f.types) ? f : F.defaultForm;
  }

  function buildFeedbackUrl(source, result) {
    var F = I.FEEDBACK;
    var form = feedbackFormFor(state.lang);
    var clip = function (s) {
      s = typeof s === 'string' ? s.trim() : '';
      return s.length > F.maxChars ? s.slice(0, F.maxChars) + '…' : s;
    };
    var params = new URLSearchParams();
    params.set('usp', 'pp_url');
    params.set('hl', F.uiLang[state.lang] || 'en');
    var src = clip(source), res = clip(result);
    // avec du texte : mauvaise translittération ; sans texte : bug
    params.set(form.entries.type, (src || res) ? form.types.transliteration : form.types.bug);
    if (src) params.set(form.entries.source, src);
    if (res) params.set(form.entries.result, res);
    params.set(form.entries.version, 'web ' + WEB_VERSION + ' (engine ' + (window.CLS_ENGINE_VERSION || '?') + ')');
    return form.url + '?' + params.toString();
  }

  function openFeedback(source, result) {
    window.open(buildFeedbackUrl(source, result), '_blank', 'noopener');
  }

  // ---------- Palette : lettres latines (mêmes caractères que le moteur) ----------
  function alphaChar(item) { return state.shift ? item.ch.toUpperCase() : item.ch; }

  function refreshAlphabet() {
    var buttons = el.alphaKeys.querySelectorAll('.alpha-key');
    Array.prototype.forEach.call(buttons, function (b) {
      var item = ALPHABET[Number(b.dataset.idx)];
      var c = alphaChar(item);
      var tipText = (item.tip && (T[state.lang] || {})[item.tip]) || item.cyr;
      b.textContent = c;
      b.title = tipText;
      b.setAttribute('aria-label', c + ' — ' + tipText);
    });
  }

  function buildAlphabet() {
    if (el.alphaKeys.childElementCount) return;
    var separated = false;
    ALPHABET.forEach(function (item, idx) {
      if (!item.sp && !separated) {
        var sep = document.createElement('div');
        sep.className = 'alpha-sep';
        sep.setAttribute('role', 'separator');
        el.alphaKeys.appendChild(sep);
        separated = true;
      }
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'alpha-key' + (item.sp ? ' sp' : '');
      b.dataset.idx = String(idx);
      b.tabIndex = idx === 0 ? 0 : -1;
      el.alphaKeys.appendChild(b);
    });
    refreshAlphabet();
  }

  function setAlphaShift(on) {
    state.shift = !!on;
    el.alphaShift.setAttribute('aria-pressed', state.shift ? 'true' : 'false');
    refreshAlphabet();
  }

  function insertAlphaChar(ch) {
    var ta = el.latInput;
    var start = ta.selectionStart === null ? ta.value.length : ta.selectionStart;
    var end = ta.selectionEnd === null ? start : ta.selectionEnd;
    ta.setRangeText(ch, start, end, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function onAlphaKeyClick(e) {
    var b = e.target.closest('.alpha-key');
    if (!b) return;
    insertAlphaChar(alphaChar(ALPHABET[Number(b.dataset.idx)]));
    if (state.shift) setAlphaShift(false); // majuscule à usage unique
  }

  function onAlphaKeyKeydown(e) {
    var keys = Array.prototype.slice.call(el.alphaKeys.querySelectorAll('.alpha-key'));
    var i = keys.indexOf(document.activeElement);
    if (i < 0) return;
    var n = -1;
    if (e.key === 'ArrowRight') n = i + 1;
    else if (e.key === 'ArrowLeft') n = i - 1;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = keys.length - 1;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      var top0 = keys[0].getBoundingClientRect().top;
      var cols = Math.max(1, keys.filter(function (k) { return Math.abs(k.getBoundingClientRect().top - top0) < 2; }).length);
      n = e.key === 'ArrowDown' ? i + cols : i - cols;
    }
    if (n < 0 || n >= keys.length) return;
    e.preventDefault();
    keys[i].tabIndex = -1;
    keys[n].tabIndex = 0;
    keys[n].focus();
  }

  function setAlphaOpen(open, persist) {
    el.alphaBody.hidden = !open;
    el.alphaToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (persist) lsSet(LS.alpha, open ? '1' : '0');
  }

  // ---------- Mesure d'audience anonyme (GoatCounter), seulement si un code de site est configuré ----------
  // Aucun cookie. Ne compte rien : sur un poste local ou un fichier, si le navigateur envoie « Ne pas me suivre » (DNT)
  // ou « Global Privacy Control ». Le texte saisi n'est jamais transmis : le compteur ne voit que la visite de la page.
  function statsAllowed() {
    if (!STATS_CODE) return false;
    var loc = window.location;
    if (!/^https?:$/.test(loc.protocol)) return false;
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname)) return false;
    var nav = navigator;
    if (nav.doNotTrack === '1' || window.doNotTrack === '1' || nav.msDoNotTrack === '1' || nav.globalPrivacyControl === true) return false;
    return true;
  }

  function startStats() {
    if (!statsAllowed()) return;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://gc.zgo.at/count.js';
    s.setAttribute('data-goatcounter', 'https://' + STATS_CODE + '.goatcounter.com/count');
    document.head.appendChild(s);
  }

  // ---------- Démarrage ----------
  function init() {
    engineReady = Promise.resolve(window.initializeExtension()).then(
      function (r) { return !!(r && r.isLoaded); },
      function () { return false; }
    );

    buildAlphabet();
    applyLanguage(pickInitialLang());
    initLangMenu();

    el.input.addEventListener('input', onInput);
    el.misalHint.addEventListener('click', fillExample);
    el.btnCopy.addEventListener('click', function () { copyText(el.output.textContent, el.btnCopy); });
    el.btnReport.addEventListener('click', function () { openFeedback(el.input.value, el.output.textContent); });
    el.btnReportProblem.addEventListener('click', function () { openFeedback('', ''); });
    window.addEventListener('resize', autoResize);

    el.alphaToggle.addEventListener('click', function () { setAlphaOpen(el.alphaBody.hidden, true); });
    el.alphaKeys.addEventListener('mousedown', function (e) { if (e.target.closest('.alpha-key')) e.preventDefault(); });
    el.alphaKeys.addEventListener('click', onAlphaKeyClick);
    el.alphaKeys.addEventListener('keydown', onAlphaKeyKeydown);
    [el.alphaShift, el.alphaCopy, el.alphaClear].forEach(function (b) {
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    });
    el.alphaShift.addEventListener('click', function () { setAlphaShift(!state.shift); });
    el.alphaCopy.addEventListener('click', function () { copyText(el.latInput.value, el.alphaCopy); });
    el.alphaClear.addEventListener('click', function () { el.latInput.value = ''; el.latInput.focus(); });

    // palette : ouverte par défaut sur grand écran, repliée sur téléphone (le choix de la personne est mémorisé)
    var savedOpen = lsGet(LS.alpha);
    setAlphaOpen(savedOpen === null ? window.innerWidth >= 700 : savedOpen === '1', false);

    // brouillon de la dernière visite
    var draft = lsGet(LS.draft);
    if (draft) { el.input.value = draft; }
    autoResize();
    run();

    startStats();

    // installation hors ligne (uniquement sur http/https)
    if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* hors ligne non disponible */ });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
