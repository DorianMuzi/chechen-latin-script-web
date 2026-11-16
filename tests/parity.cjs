// Vérifie que le site web donne EXACTEMENT les mêmes résultats que l'extension :
// mêmes fichiers (moteur, listes), mêmes sorties sur un grand corpus, même liste de lettres pour la palette.
// Usage : node tests/parity.cjs [dossier-de-l-extension-Chrome]
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');
const EXT = process.argv[2] || 'C:\\Users\\mouss\\OneDrive\\Bureau\\Chechen Latin Script';
const DOCS = path.resolve(__dirname, '..', 'docs');
const read = (p) => fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
let fails = 0;
const ck = (name, cond, extra) => { if (cond) console.log('  OK   ' + name); else { fails++; console.log('  ECHEC ' + name + (extra ? ' | ' + extra : '')); } };

// 1) fichiers identiques
ck('moteur identique à celui de l\'extension', sha(path.join(DOCS, 'engine', 'transliterate.js')) === sha(path.join(EXT, 'transliterate.js')));
const sandbox = { window: {} }; vm.createContext(sandbox);
vm.runInContext(read(path.join(DOCS, 'data.js')), sandbox);
const D = sandbox.window.CLS_DATA;
['replacements.txt', 'special_words.txt', 'special_e_words.txt', 'special_n_words.txt'].forEach((f) => ck('liste ' + f + ' identique', D[f] === read(path.join(EXT, f))));
ck('numéro de version du moteur', sandbox.window.CLS_ENGINE_VERSION === JSON.parse(read(path.join(EXT, 'manifest.json'))).version, sandbox.window.CLS_ENGINE_VERSION);

// 2) mêmes sorties : moteur de l'extension (listes lues dans le dossier) contre moteur du site (listes embarquées + shim)
async function load(kind) {
  const noop = () => {};
  const ctx = { console: { log: noop, error: noop, warn: noop, info: noop }, setTimeout, URLSearchParams, URL, Promise, document: {}, navigator: {}, location: { search: '' } };
  if (kind === 'ext') {
    ctx.chrome = { runtime: { getURL: (f) => f } };
    ctx.fetch = async (f) => ({ ok: true, status: 200, text: async () => read(path.join(EXT, f)) });
  }
  ctx.window = ctx; vm.createContext(ctx);
  if (kind === 'web') {
    vm.runInContext(read(path.join(DOCS, 'data.js')), ctx);
    vm.runInContext(read(path.join(DOCS, 'engine', 'shim.js')), ctx);
    vm.runInContext(read(path.join(DOCS, 'engine', 'transliterate.js')), ctx);
  } else {
    vm.runInContext(read(path.join(EXT, 'transliterate.js')), ctx);
  }
  const r = await vm.runInContext('initializeExtension()', ctx);
  if (!r || !r.isLoaded) throw new Error('moteur non chargé (' + kind + ')');
  return (s) => vm.runInContext('translate(' + JSON.stringify(s) + ')', ctx);
}

(async () => {
  const EXTE = await load('ext'), WEB = await load('web');
  const lines = (f) => read(path.join(EXT, f)).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const corpus = new Set();
  [...lines('special_words.txt'), ...lines('special_n_words.txt'), ...lines('special_e_words.txt'), ...lines('replacements.txt').map((l) => l.split(',')[0].trim())].forEach((w) => corpus.add(w));
  const suffixes = ['', 'а', 'ан', 'ийн', 'на', 'хьа', 'къа', 'кхи', 'хӀа', 'аь', 'оь', 'уь', 'гӀа', 'чӀа', 'тӀа', 'цӀа', 'пӀа', 'кӀа', 'яь', 'юь'];
  lines('special_e_words.txt').forEach((w) => suffixes.forEach((s) => { corpus.add(w + s); corpus.add('са ' + w + s + ' са'); }));
  ['Нохчийн мотт — Маршалла хуьлда шуьга! Башкирийчоь цIе йолу мехкан дакъа ду.', 'ехьа ву хьо, екъа вай, ехьалха дӀавала, ешаь къоман даьттӀа',
    'Ӏаьржа гӀала екхи.', 'Литературин-исбахьаллин журнал «ОРГА»', 'Эван Иван Сёрен Кыргызстан Щербаков', 'XIII ХI-ХII вв.'].forEach((x) => corpus.add(x));
  let diff = 0; const bad = [];
  for (const c of corpus) { if (EXTE(c) !== WEB(c)) { diff++; if (bad.length < 5) bad.push(c); } }
  ck('sorties identiques sur ' + corpus.size + ' chaînes', diff === 0, diff + ' différence(s), ex. ' + bad.join(' | '));

  // 3) la palette : mêmes lettres que l'extension
  const s2 = { window: {} }; vm.createContext(s2); vm.runInContext(read(path.join(DOCS, 'i18n.js')), s2);
  const pop = read(path.join(EXT, 'popup.js'));
  const ALPHA_EXT = vm.runInNewContext('(' + pop.match(/const ALPHABET = (\[[\s\S]*?\n\]);/)[1] + ')');
  ck('palette : mêmes ' + ALPHA_EXT.length + ' touches, mêmes caractères et infobulles que l\'extension', JSON.stringify(s2.window.CLS_I18N.ALPHABET) === JSON.stringify(ALPHA_EXT));
  // formulaires de retour : mêmes adresses, mêmes champs, mêmes libellés que l'extension
  const bg = read(path.join(EXT, 'background.js'));
  const grab = (re) => vm.runInNewContext('(' + bg.match(re)[1] + ')');
  const FB = s2.window.CLS_I18N.FEEDBACK;
  ck('signalement : formulaire par défaut identique', JSON.stringify(FB.defaultForm) === JSON.stringify(grab(/const FEEDBACK_DEFAULT_FORM = (\{[\s\S]*?\n\});/)));
  ck('signalement : formulaires par langue identiques (' + Object.keys(FB.forms).length + ')', JSON.stringify(FB.forms) === JSON.stringify(grab(/const FEEDBACK_FORMS = (\{[\s\S]*?\n\});/)) && Object.keys(FB.forms).length === 7);
  ck('signalement : langue des formulaires et plafond de texte identiques', JSON.stringify(FB.uiLang) === JSON.stringify(grab(/const FEEDBACK_UI_LANG = (\{[\s\S]*?\});/)) && FB.maxChars === Number(bg.match(/const FEEDBACK_MAX_CHARS = (\d+);/)[1]));
  const langs = Object.keys(s2.window.CLS_I18N.T);
  ck('8 langues d\'interface', langs.length === 8, langs.join(','));
  console.log(fails ? '\nÉCHECS : ' + fails : '\nTout est identique à l\'extension.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
