/*
 * Copyright 2026 LinguaCE
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Author: MUZIŊ Darr
//
// PROTOTYPE (2.7) : écrire en latin 1992 → obtenir le cyrillique tchétchène (sens inverse du moteur).
// Le latin 1992 perd de l'information : « ş » vient de ш ou de щ, « i » de и ou de ы, « e » de е ou de э, « y+a » de я ou de й+а,
// « n » et « ŋ » de н, et le signe « ь » seul disparaît. Ce convertisseur choisit donc un résultat PAR DÉFAUT (options ci-dessous,
// réglées d'après un texte réel : voir le rapport de validation) et corrige les mots irréguliers connus du moteur
// (replacements.txt et listes de mots spéciaux) grâce à un dictionnaire inversé, construit à partir du moteur lui-même.
(function (root) {
  'use strict';

  var PALOCHKA = 'Ӏ';   // Ӏ (U+04C0), la palochka que produit le moteur pour « j »

  // Choix par défaut pour les lettres ambiguës (ils peuvent être changés pour les essais)
  var OPTIONS = {
    sh: 'ш',     // ş → ш  (autre choix : щ)
    i: 'и',      // i → и  (autre choix : ы)
    eInitial: 'э',  // e en début de mot → э (autre choix : е) : choix d'après un texte réel (эзар, эскар, эцан… contre quelques е)
    eMiddle: 'е',   // e ailleurs → е (autre choix : э)
    eAfterVowel: '',  // e juste après une voyelle (« аэ », « иэ », « еэ ») : '' = comme eMiddle ; essai : 'э'
    yMode: 'positional', // y+a/u/o : й+а/у/о en début de mot ou après une voyelle (йара, охьайала) ; я/ю/ё après une consonne
                         // (mots russes : бюджет, Стюарт) ; ou 'fixed' (valeurs ya / yu / yo ci-dessous)
    ya: 'я',     // ya → я  (mode « fixed » seulement ; autre choix : йа)
    yu: 'йу',    // yu → йу (mode « fixed » seulement ; autre choix : ю)
    yo: 'йо', // yo → йо (mode « fixed » seulement ; autre choix : ё)
    yeInitial: 'йе', // ye en début de mot → йе (autre choix : е ; les mots en « ye » des listes du moteur passent par le dictionnaire)
    yeMiddle: 'йе' // ye ailleurs → йе (autre choix : е)
  };

  var dict = Object.create(null);   // mot latin (minuscules, NFC) → mot cyrillique (minuscules)
  var dictAlt = Object.create(null);

  function isUpper(ch) { return ch !== ch.toLowerCase() && ch === ch.toUpperCase(); }

  // minuscules de la lettre latine (en gardant les lettres composées d'un seul caractère)
  function lower(s) { return s.toLowerCase(); }

  // Reprend la casse du mot saisi : tout en majuscules, première lettre majuscule, ou minuscules
  function applyCase(src, out) {
    var letters = src.replace(/[^\p{L}]/gu, '');
    if (letters.length > 1 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) return out.toUpperCase().replace(/Ӏ/g, PALOCHKA);
    var first = src.charAt(0);
    if (first !== first.toLowerCase()) {
      // première lettre en majuscule : on met en majuscule la première lettre du résultat (« къ » → « Къ »)
      return out.charAt(0).toUpperCase() + out.slice(1);
    }
    return out;
  }

  // Conversion « règles » d'un mot (minuscules, NFC)
  // ov : choix imposés { numéro de lettre ambiguë → texte } ; meta : liste remplie avec les lettres ambiguës rencontrées
  // { def : choix par défaut, alt : autre choix, doubt : le choix par défaut est incertain (mot sans doute emprunté au russe) }
  function wordByRules(w, opt, ov, meta) {
    var o = opt || OPTIONS;
    var out = '';
    var amb = -1;
    function pick(def, alt, doubt) {
      amb++;
      if (meta) meta.push({ def: def, alt: alt, doubt: !!doubt });
      return (ov && ov[amb] !== undefined) ? ov[amb] : def;
    }
    var n = w.length;
    for (var i = 0; i < n; i++) {
      var c = w.charAt(i), nx = w.charAt(i + 1), nx2 = w.charAt(i + 2);
      var start = (i === 0);
      // lettres + point au-dessus (U+0307) : q̇ k̇ ç̇ (et par prudence les autres, si elles n'ont pas été recomposées)
      if (nx === '̇') {
        var m = { q: 'къ', k: 'к' + PALOCHKA, 'ç': 'ч' + PALOCHKA, c: 'ц' + PALOCHKA, g: 'г' + PALOCHKA, p: 'п' + PALOCHKA, t: 'т' + PALOCHKA, x: 'хь' };
        if (m[c]) { out += m[c]; i++; continue; }
      }
      switch (c) {
        case 'a': out += 'а'; break;
        case 'b': out += 'б'; break;
        case 'c': out += 'ц'; break;
        case 'd': out += 'д'; break;
        case 'e': {
          var pv = i > 0 ? w.charAt(i - 1) : '';
          var afterVowel = pv !== '' && 'aeiou\u00E4\u00F6\u00FC\u0259'.indexOf(pv) >= 0;
          var de = start ? o.eInitial : (afterVowel && o.eAfterVowel) ? o.eAfterVowel : o.eMiddle;
          out += pick(de, de === 'э' ? 'е' : 'э', start);
          break;
        }
        case 'f': out += 'ф'; break;
        case 'g': out += 'г'; break;
        case 'h': out += 'х' + PALOCHKA; break;
        case 'i': out += pick(o.i, o.i === 'и' ? 'ы' : 'и', false); break;
        case 'j': out += PALOCHKA; break;
        case 'k': out += 'к'; break;
        case 'l': out += 'л'; break;
        case 'm': out += 'м'; break;
        case 'n': out += 'н'; break;
        case 'o': out += 'о'; break;
        case 'p': out += 'п'; break;
        case 'q': out += 'кх'; break;
        case 'r': out += 'р'; break;
        case 's': out += 'с'; break;
        case 't': out += 'т'; break;
        case 'u': out += 'у'; break;
        case 'v': out += 'в'; break;
        case 'w': out += 'в'; break;
        case 'x': out += 'х'; break;
        case 'z': out += 'з'; break;
        case 'y':
          // Mode « positional » : en début de mot ou après une voyelle, y+a/u/o = й+а/у/о (écriture tchétchène : йара, охьайала) ;
          // après une consonne, y+a/u/o = я/ю/ё (voyelles « molles » des mots russes : бюджет, Стюарт, абсолют).
          if (o.yMode === 'positional' && (nx === 'a' || nx === 'u' || nx === 'o')) {
            var prev = i > 0 ? w.charAt(i - 1) : '';
            var afterConsonant = prev !== '' && 'aeiouy\u00E4\u00F6\u00FC\u0259'.indexOf(prev) < 0;
            var soft = (nx === 'a' ? 'я' : nx === 'u' ? 'ю' : 'ё'), hard = 'й' + (nx === 'a' ? 'а' : nx === 'u' ? 'у' : 'о');
            out += afterConsonant ? pick(soft, hard, true) : pick(hard, soft, false);
            i++;
          }
          else if (nx === 'a') { out += pick(o.ya, o.ya === 'я' ? 'йа' : 'я', false); i++; }
          else if (nx === 'u') { out += pick(o.yu, o.yu === 'ю' ? 'йу' : 'ю', false); i++; }
          else if (nx === 'o') { out += pick(o.yo, o.yo === 'ё' ? 'йо' : 'ё', false); i++; }
          else if (nx === 'e') { var dy = start ? o.yeInitial : o.yeMiddle; out += pick(dy, dy === 'е' ? 'йе' : 'е', false); i++; }
          else if (nx === 'ä') { out += 'яь'; i++; }
          else if (nx === 'ü') { out += 'юь'; i++; }
          else out += 'й';
          break;
        case 'ä': out += 'аь'; break;       // ä → аь
        case 'ö': out += 'оь'; break;       // ö → оь
        case 'ü': out += 'уь'; break;       // ü → уь
        case 'ġ': out += 'г' + PALOCHKA; break;  // ġ → гӀ
        case 'ċ': out += 'ц' + PALOCHKA; break;  // ċ → цӀ
        case 'ẋ': out += 'хь'; break;       // ẋ → хь
        case 'ṗ': out += 'п' + PALOCHKA; break;  // ṗ → пӀ
        case 'ṫ': out += 'т' + PALOCHKA; break;  // ṫ → тӀ
        case 'ƶ': out += 'ж'; break;             // ƶ → ж
        case 'ç': out += 'ч'; break;             // ç → ч
        case 'ş': out += pick(o.sh, o.sh === 'ш' ? 'щ' : 'ш', true); break;                 // ş → ш
        case 'ŋ': out += 'н'; break;             // ŋ → н
        case 'ə': out += 'ъ'; break;             // ə → ъ
        default: out += c; break;
      }
    }
    return out;
  }

  // Construit le dictionnaire inversé à partir du moteur : paires de replacements.txt (cyrillique,latin) et mots des listes de
  // mots spéciaux traduits par le moteur. translate : fonction du moteur ; data : { fichier: texte }.
  function init(translate, data) {
    dict = Object.create(null); dictAlt = Object.create(null);
    function add(lat, cyr) {
      lat = lower(String(lat).normalize('NFC').trim()); cyr = String(cyr).trim().toLowerCase().replace(/ӏ/g, PALOCHKA);
      if (!lat || !cyr || lat === cyr) return;
      if (!/^[\p{Script=Latin}̀-ͯ'-]+$/u.test(lat)) return;
      if (dict[lat] === undefined) dict[lat] = cyr;
      else if (dict[lat] !== cyr) { (dictAlt[lat] = dictAlt[lat] || []).push(cyr); }
    }
    var rep = (data && data['replacements.txt']) || '';
    rep.split('\n').forEach(function (line) {
      var p = line.split(',');
      if (p.length >= 2) add(p[1], p[0]);
    });
    ['special_words.txt', 'special_e_words.txt', 'special_n_words.txt'].forEach(function (f) {
      var txt = (data && data[f]) || '';
      txt.split('\n').forEach(function (line) {
        var cyr = line.replace(/#.*$/, '').trim();
        if (!cyr || /\s/.test(cyr)) return;
        var lat;
        try { lat = translate(cyr); } catch (e) { return; }
        add(lat, cyr);
      });
    });
    return Object.keys(dict).length;
  }

  function convertWord(word, opt) {
    var w = word.normalize('NFC');
    var lw = lower(w);
    var hit = dict[lw];
    // mot à trait d'union (« Адан-ЯхӀун ») : le dictionnaire le connaît en entier ; sinon chaque partie est convertie à part
    var out = hit !== undefined ? hit : lw.split('-').map(function (p) { return wordByRules(p, opt); }).join('-');
    return { out: w.indexOf('-') >= 0 ? w.split('-').map(function (p, k) { return applyCase(p, out.split('-')[k] || ''); }).join('-') : applyCase(w, out), known: hit !== undefined };
  }

  // Texte complet : les mots latins sont convertis, tout le reste (chiffres, ponctuation, cyrillique déjà présent) est conservé.
  // Renvoie { text, words:[{src, out, known}] }.
  function convert(text, opt) {
    var words = [];
    var res = String(text || '').normalize('NFC').replace(/[\p{Script=Latin}̀-ͯ]+(?:-[\p{Script=Latin}̀-ͯ]+)*/gu, function (w) {
      var r = convertWord(w, opt);
      words.push({ src: w, out: r.out, known: r.known });
      return r.out;
    });
    return { text: res, words: words };
  }

  // Résultat par défaut d'un mot + variantes (une lettre ambiguë changée à la fois) ; doubt = au moins un choix incertain
  function analyse(lw, opt) {
    var meta = [];
    var base = wordByRules(lw, opt, null, meta);
    var alts = [], doubt = false;
    meta.forEach(function (m, k) {
      if (m.doubt) doubt = true;
      var ov = {}; ov[k] = m.alt;
      var v = wordByRules(lw, opt, ov);
      if (v !== base && alts.indexOf(v) < 0) alts.push(v);
    });
    return { out: base, alts: alts, doubt: doubt };
  }

  // Découpe le texte en morceaux pour l'interface : { text, word:false } pour ce qui n'est pas un mot latin, et pour un mot
  // { text, word:true, src, key, variants:[…], idx, doubt, known }. choices : { mot latin en minuscules → cyrillique choisi }.
  function tokens(text, choices, opt) {
    var s = String(text || '').normalize('NFC'), res = [], last = 0;
    var re = /[\p{Script=Latin}\u0300-\u036F]+(?:-[\p{Script=Latin}\u0300-\u036F]+)*/gu, m;
    while ((m = re.exec(s)) !== null) {
      if (m.index > last) res.push({ text: s.slice(last, m.index), word: false });
      var w = m[0], lw = lower(w), hit = dict[lw];
      if (hit !== undefined || lw.indexOf('-') >= 0) {
        var r = convertWord(w, opt);
        res.push({ text: r.out, word: true, src: w, key: lw, variants: [r.out], idx: 0, doubt: false, known: hit !== undefined });
      } else {
        var an = analyse(lw, opt);
        var variants = [applyCase(w, an.out)].concat(an.alts.map(function (v) { return applyCase(w, v); }));
        var idx = 0, ch = choices && choices[lw];
        if (ch) { var k = variants.map(function (v) { return v.toLowerCase(); }).indexOf(String(ch).toLowerCase()); if (k >= 0) idx = k; }
        res.push({ text: variants[idx], word: true, src: w, key: lw, variants: variants, idx: idx, doubt: an.doubt, known: false });
      }
      last = m.index + w.length;
    }
    if (last < s.length) res.push({ text: s.slice(last), word: false });
    return res;
  }

  root.CLS_REV = { tokens: tokens, analyse: analyse, OPTIONS: OPTIONS, init: init, convert: convert, convertWord: convertWord, wordByRules: wordByRules, size: function () { return Object.keys(dict).length; } };
})(typeof window !== 'undefined' ? window : this);
