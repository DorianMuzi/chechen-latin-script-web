/*
 * Génère le dossier docs/ (le site à publier) à partir de l'extension Chechen Latin Script.
 *
 *   node tools/build.cjs [dossier-de-l-extension-Chrome]
 *
 * Reprend du dossier de l'extension : le moteur (transliterate.js), les listes de mots, les textes d'interface et la
 * liste des lettres de la palette (popup.js), le style (popup.htm), les polices et les licences.
 * Rien n'est écrit dans le dossier de l'extension. À relancer après chaque nouvelle version du moteur.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
// CLS_OUT : dossier de sortie alternatif (aperçus) ; par défaut docs/ (le site publié)
const DOCS = process.env.CLS_OUT ? path.resolve(process.env.CLS_OUT) : path.join(ROOT, 'docs');
const EXT = process.argv[2] || 'C:\\Users\\mouss\\OneDrive\\Bureau\\Chechen Latin Script';
const TOOLS = __dirname;

const read = (p) => fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, 'utf8'); };
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
const escapeNonAscii = (s) => s.replace(/[^\x20-\x7E]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const take = (re, text, what) => { const m = text.match(re); if (!m) throw new Error('Introuvable dans l\'extension : ' + what); return m; };

// ---- configuration du site (tools/config.json) : code du site GoatCounter ; vide = aucune mesure d'audience
const config = JSON.parse(read(path.join(TOOLS, 'config.json')));
const goatcounter = String(config.goatcounter || '').trim().toLowerCase();
if (goatcounter && !/^[a-z0-9-]{1,40}$/.test(goatcounter)) throw new Error('tools/config.json : « goatcounter » doit être le code du site (lettres, chiffres, tirets), par exemple "chechenlatin"');

const manifest = JSON.parse(read(path.join(EXT, 'manifest.json')));
const engineVersion = manifest.version;

// ---- moteur + listes de mots
copy(path.join(EXT, 'transliterate.js'), path.join(DOCS, 'engine', 'transliterate.js'));
// partage : logique commune (adresses des services, lien avec le texte) reprise de l'extension
copy(path.join(EXT, 'share.js'), path.join(DOCS, 'share.js'));
copy(path.join(TOOLS, 'shim.js'), path.join(DOCS, 'engine', 'shim.js'));
const FILES = ['replacements.txt', 'special_words.txt', 'special_e_words.txt', 'special_n_words.txt'];
const data = {};
FILES.forEach((f) => { data[f] = read(path.join(EXT, f)); });
write(path.join(DOCS, 'data.js'),
  '/* Généré par tools/build.cjs à partir de l\'extension (moteur ' + engineVersion + ') : ne pas modifier à la main. */\n' +
  'window.CLS_DATA = ' + JSON.stringify(data) + ';\n' +
  'window.CLS_ENGINE_VERSION = ' + JSON.stringify(engineVersion) + ';\n' +
  'window.CLS_CONFIG = ' + JSON.stringify({ goatcounter: goatcounter }) + ';\n');

// ---- textes d'interface et lettres de la palette (popup.js)
const popupJs = read(path.join(EXT, 'popup.js'));
const T = vm.runInNewContext('(' + take(/const T = (\{[\s\S]*?\n\});/, popupJs, 'T')[1] + ')');
const LANGS = vm.runInNewContext('(' + take(/const LANGS = (\{[\s\S]*?\n\});/, popupJs, 'LANGS')[1] + ')');
const ALPHABET = vm.runInNewContext('(' + take(/const ALPHABET = (\[[\s\S]*?\n\]);/, popupJs, 'ALPHABET')[1] + ')');
// Les textes propres à l'extension (description, signalement, raccourcis…) ne sont pas repris
const KEEP = ['sub', 'lang', 'cyr', 'lat', 'misal', 'copy', 'ph', 'report', 'reportProblem', 'aboutVersion', 'aboutLicense', 'aboutContact',
  'alpha', 'alphaPh', 'alphaShift', 'alphaClear', 'alphaEng', 'alphaW', 'theme', 'themeAuto', 'themeLight', 'themeDark',
  'share', 'shareLink', 'shareProject', 'shareMore'];
const T2 = {};
Object.keys(T).forEach((l) => { T2[l] = {}; KEEP.forEach((k) => { if (!(k in T[l])) throw new Error('Clé manquante ' + l + '.' + k); T2[l][k] = T[l][k]; }); });
// ---- formulaires de retour (un formulaire Google par langue) : repris de background.js de l'extension
const bgJs = read(path.join(EXT, 'background.js'));
const FEEDBACK = {
  defaultForm: vm.runInNewContext('(' + take(/const FEEDBACK_DEFAULT_FORM = (\{[\s\S]*?\n\});/, bgJs, 'FEEDBACK_DEFAULT_FORM')[1] + ')'),
  forms: vm.runInNewContext('(' + take(/const FEEDBACK_FORMS = (\{[\s\S]*?\n\});/, bgJs, 'FEEDBACK_FORMS')[1] + ')'),
  uiLang: vm.runInNewContext('(' + take(/const FEEDBACK_UI_LANG = (\{[\s\S]*?\});/, bgJs, 'FEEDBACK_UI_LANG')[1] + ')'),
  maxChars: Number(take(/const FEEDBACK_MAX_CHARS = (\d+);/, bgJs, 'FEEDBACK_MAX_CHARS')[1])
};
write(path.join(DOCS, 'i18n.js'),
  '/* Généré par tools/build.cjs à partir de popup.js et background.js de l\'extension : ne pas modifier à la main. */\n' +
  'window.CLS_I18N = ' + escapeNonAscii(JSON.stringify({ T: T2, LANGS: LANGS, ALPHABET: ALPHABET, FEEDBACK: FEEDBACK })) + ';\n');

// ---- style (celui de la popup de l'extension + surcharges web)
const popupHtm = read(path.join(EXT, 'popup.htm'));
const style = take(/<style>([\s\S]*?)<\/style>/, popupHtm, 'style')[1];
write(path.join(DOCS, 'styles.css'),
  '/* Généré par tools/build.cjs : style de la popup de l\'extension + tools/web.css */\n' + style + '\n' + read(path.join(TOOLS, 'web.css')));

// ---- page : le sélecteur de langue et le bloc « Lettres latines » sont repris de la popup
// (le bouton de thème de l'extension, dans la bannière juste après la langue, n'est PAS repris : le site a son propre sélecteur de thème)
const langWrap = take(/(<div class="lang-wrap">[\s\S]*?)\n    <div class="theme-wrap">/, popupHtm, 'sélecteur de langue')[1].replace(/\s+$/, '');
const alpha = take(/(    <!-- Alphabet latin[\s\S]*?<\/div>\n)  <\/div>\n\n  <!-- Auto toggle/, popupHtm, 'palette')[1].replace(/\s+$/, '');
let html = read(path.join(TOOLS, 'index.template.html'));
html = html.replace('<!--LANGWRAP-->', () => langWrap).replace('<!--ALPHA-->', () => alpha);
write(path.join(DOCS, 'index.html'), html);

// ---- application, manifeste, polices, licences
copy(path.join(TOOLS, 'app.js'), path.join(DOCS, 'app.js'));
copy(path.join(TOOLS, 'manifest.webmanifest'), path.join(DOCS, 'manifest.webmanifest'));
copy(path.join(EXT, 'fonts.css'), path.join(DOCS, 'fonts.css'));
fs.readdirSync(path.join(EXT, 'fonts')).forEach((f) => copy(path.join(EXT, 'fonts', f), path.join(DOCS, 'fonts', f)));
['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.txt'].forEach((f) => copy(path.join(EXT, f), path.join(DOCS, f)));
copy(path.join(EXT, 'LICENSE'), path.join(ROOT, 'LICENSE'));

// GitHub Pages : ne pas passer le site par Jekyll (publication telle quelle)
write(path.join(DOCS, '.nojekyll'), '');

// ---- service worker (mise en cache pour le mode hors ligne ; la version change à chaque génération)
const files = [];
(function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    const p = path.join(dir, d.name);
    if (d.name.charAt(0) === '.') return; // fichiers cachés (.nojekyll) : jamais mis en cache hors ligne
    if (d.isDirectory()) walk(p); else files.push(path.relative(DOCS, p).split(path.sep).join('/'));
  });
})(DOCS);
const precache = ['./'].concat(files.filter((f) => f !== 'sw.js').sort());
// le nom du cache dépend du CONTENU de tous les fichiers : toute modification (moteur, interface, réglages) renouvelle le cache des visiteurs
const hash = require('crypto').createHash('sha1');
precache.filter((f) => f !== './').forEach((f) => { hash.update(f); hash.update(fs.readFileSync(path.join(DOCS, f))); });
const swVersion = 'cls-web-' + hash.digest('hex').slice(0, 10);
write(path.join(DOCS, 'sw.js'),
`/* Généré par tools/build.cjs. Met le site en cache pour qu'il fonctionne hors ligne. */
const CACHE = ${JSON.stringify(swVersion)};
const FILES = ${JSON.stringify(precache, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.indexOf('cls-web-') === 0 && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => cached || fetch(event.request))
  );
});
`);

console.log('Site généré dans ' + DOCS + ' (moteur ' + engineVersion + ', ' + precache.length + ' fichiers en cache, cache ' + swVersion + ', mesure d\'audience : ' + (goatcounter ? 'GoatCounter « ' + goatcounter + ' »' : 'désactivée') + ').');
