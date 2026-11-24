// Tests du moteur (extension) : « Сан » / « Бан » nom propre ou mot courant, et MAJUSCULES (ŋ).
// Charge transliterate.js de l'extension (même source que le site, vérifié par parity.cjs).
const fs = require('fs'), path = require('path'), vm = require('vm');
const EXT = process.env.EXT_DIR || 'C:\\Users\\mouss\\OneDrive\\Bureau\\Chechen Latin Script';
const ctx = { window: {}, console: { log() {}, error() {}, warn() {} }, chrome: { runtime: { getURL: f => f } },
  fetch: async f => ({ ok: true, status: 200, text: async () => fs.readFileSync(path.join(EXT, f), 'utf8') }) };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(EXT, 'transliterate.js'), 'utf8') + '\n;this.__api={init:initializeExtension,translate:translate};', ctx);
let ok = 0, ko = 0;
const eq = (input, expected) => {
  const got = ctx.__api.translate(input);
  if (got === expected) ok++; else { ko++; console.log('  ECHEC', JSON.stringify(input), '=>', JSON.stringify(got), '(attendu', JSON.stringify(expected) + ')'); }
};
(async () => {
  await ctx.__api.init();
  console.log('== « Сан » : nom de lieu = San, mot courant = saŋ');
  eq('сан', 'saŋ'); eq('Сан', 'Saŋ'); eq('САН', 'SAŊ');
  eq('Сан Андрес', 'San Andres'); eq('Сан-Франциско', 'San-Francisko'); eq('Сан  Рамон', 'San  Ramon');
  eq('Хардинес де Сан Исидро', 'Xardines de San Isidro'); eq('Сан цӀе Ахьмад ю', 'Saŋ ċe Aẋmad yu');
  eq('Йовзийта, сан кхи а Сан Марино', 'Yovziyta, saŋ qi a San Marino');
  console.log('== « Бан » : nom de personne = Ban, verbe/mot courant = baŋ');
  eq('бан', 'baŋ'); eq('Бан', 'Baŋ'); eq('БАН', 'BAŊ');
  eq('Бан Говд-е АхӀмади ( ) — Иранан', 'Ban Govd-e Ahmadi ( ) — Iranaŋ');
  eq('Бан дара. Бан Мун', 'Baŋ dara. Ban Mun');
  console.log('== MAJUSCULES (≥ 5 lettres) : même décision n/ŋ qu’en minuscule ; ≤ 4 lettres inchangé (sigles)');
  eq('нохчийн', 'noxçiyŋ'); eq('НОХЧИЙН', 'NOXÇIYŊ'); eq('НОХЧИЙН МОТТ', 'NOXÇIYŊ MOTT');
  eq('ШЕРАН', 'ŞERAŊ'); eq('ХӀОРДАН', 'HORDAŊ'); eq('ИТАЛИН', 'ITALIŊ');
  eq('РАН', 'RAN'); eq('ООН', 'OON'); eq('ДОН', 'DON'); eq('Дон', 'Don'); eq('Нохчийн', 'Noxçiyŋ');
  console.log('== Mots spéciaux N en majuscules inchangés');
  eq('ПЛАН', 'PLAN');
  console.log('TOTAL : ' + ok + ' OK, ' + ko + ' échec(s)');
  process.exit(ko ? 1 : 0);
})();
