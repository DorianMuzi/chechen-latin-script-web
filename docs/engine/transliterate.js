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
// Moteur de translittération partagé (content script + popup).
// Extrait de content.js pour garder un algorithme unique. Ne contient AUCUNE
// logique liée au DOM de la page : uniquement le chargement des données et translate().

// Variables globales partagées
let isInitialized = false;
let extensionData = null;

// Cyrillic to Latin alphabet mapping (fallback)
const defaultAlphabet = {
  'а': 'a', 'б': 'b', 'ц': 'c', 'ч': 'ç', 'д': 'd', 'э': 'e', 'ф': 'f', 'г': 'g',
  'и': 'i', 'ы': 'i', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p',
  'р': 'r', 'с': 's', 'щ': 'ş', 'ш': 'ş', 'т': 't', 'у': 'u', 'в': 'v', 'х': 'x',
  'й': 'y', 'з': 'z', 'ж': 'ƶ', 'ь': '', 'я': 'ya', 'ю': 'yu', 'о́': 'ó',
  'а́': 'á', 'э́': 'é', 'ѓ': 'ǵ', 'и́': 'í', 'ќ': 'ḱ', 'р́': 'ŕ', 'у́': 'ú',
  'ю́': 'yú', 'я́': 'yá', 'ё': 'yo', 'а̄': 'ā', 'ӯ':'ū', 'ӣ':'ī'
};

function isUppercaseLetter(char) {
  return char >= 'A' && char <= 'Z' || char >= 'А' && char <= 'Я';
}

// Fonction pour vérifier si un texte a déjà été translittéré
function isAlreadyTransliterated(text) {
  const translitPatterns = [
    'ẋ', 'ü', 'ö', 'ä', 'q̇', 'ŋ', 'ġ', 'ċ', 'ç̇', 'k̇', 'ṗ', 'ṫ'
  ];
  return translitPatterns.some(pattern => text.includes(pattern));
}

// Palochka tapée avec un « I » latin, un « І » ukrainien (U+0406) ou un « l » minuscule latin
// (« тIехь », « дІа », « Iаьржа », « цlа ») → vraie palochka « Ӏ » (U+04C0). Sans cela, ces
// caractères restaient « I » / « І » / « l » (ou devenaient « j » au mauvais endroit).
// Le « l » est plus ambigu : on ne le convertit qu'ENTRE deux lettres cyrilliques, ou en DÉBUT de
// mot devant une lettre cyrillique (jamais en fin de mot, jamais collé à du latin), et seulement
// dans un mot qui contient une voyelle cyrillique : une abréviation sans voyelle comme « Мlн »
// (млн = million, où le « l » remplace la lettre « л ») doit rester « Mln ».
function normalizePalochka(word) {
  let w = word.replace(/(?<=[Ѐ-ӿ])[IІ]|[IІ](?=[Ѐ-ӿ])/g, 'Ӏ');
  if (/[аеёиоуыэюяАЕЁИОУЫЭЮЯ]/.test(w)) {
    w = w.replace(/(?<=[Ѐ-ӿ])l(?=[Ѐ-ӿ])|(?<![A-Za-zЀ-ӿ])l(?=[Ѐ-ӿ])/g, 'Ӏ');
  }
  return w;
}

// Fonction pour vérifier si un chiffre romain est isolé (entouré d'espaces ou en début/fin de texte)
function isIsolatedRomanNumeral(text, startIndex, endIndex) {
  // Vérifier le caractère précédent
  const charBefore = startIndex > 0 ? text[startIndex - 1] : ' ';
  // Vérifier le caractère suivant
  const charAfter = endIndex < text.length ? text[endIndex] : ' ';

  // Doit être précédé et suivi d'un espace, ou être en début/fin de texte
  const isIsolatedBefore = charBefore === ' ' || startIndex === 0;
  const isIsolatedAfter = charAfter === ' ' || endIndex === text.length;

  return isIsolatedBefore && isIsolatedAfter;
}

// Fonction pour détecter si on est au début d'une séquence de chiffres romains
function isStartOfRomanSequence(text, index) {
  const romanPatterns = [
    'XVIII', 'XVII', 'XVI', 'XIV', 'XIII', 'XII', 'XIX', 'XXI', 'XX',
    'VIII', 'VII', 'VI', 'IV', 'III', 'II', 'IX', 'XI', 'XV',
    'I', 'V', 'X', 'L', 'C', 'D', 'M'
  ];

  // Trier par longueur décroissante pour matcher les plus longs d'abord
  romanPatterns.sort((a, b) => b.length - a.length);

  for (const pattern of romanPatterns) {
    if (index + pattern.length <= text.length &&
        text.slice(index, index + pattern.length) === pattern) {

      // Vérifier si c'est vraiment un contexte de chiffre romain
      const charAfter = index + pattern.length < text.length ? text[index + pattern.length] : ' ';

      // Accepter si suivi par espace, ponctuation, ou fin de texte
      if (/[\s\.\,\!\?\:\;\)\]\}]/.test(charAfter) || index + pattern.length === text.length) {
        return { length: pattern.length, pattern: pattern };
      }
    }
  }

  return null;
}

// Fonction pour charger les remplacements depuis replacements.txt
async function loadReplacements(filename) {
  try {
    console.log(`Chargement de ${filename}...`);
    const response = await fetch(chrome.runtime.getURL(filename));
    if (!response.ok) {
      throw new Error(`Failed to load ${filename}: ${response.status}`);
    }
    const text = await response.text();

    // Commencer avec l'alphabet par défaut
    const replacements = {...defaultAlphabet};

    const lines = text.split('\n').filter(line => line.trim());
    console.log(`${filename}: ${lines.length} lignes trouvées`);

    lines.forEach((line, index) => {
      line = line.trim();
      if (line && line.includes(',')) {
        const parts = line.split(',');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const value = parts[1].trim();
          if (key && value) {
            // Remplacer ou ajouter au dictionnaire existant
            replacements[key] = value;
          }
        }
      }
    });

    console.log(`${filename} chargé avec succès:`, Object.keys(replacements).length, 'remplacements au total');
    console.log(`- Alphabet de base: ${Object.keys(defaultAlphabet).length} entrées`);
    console.log(`- Nouvelles entrées du fichier: ${lines.length} lignes`);
    return replacements;
  } catch (error) {
    console.error(`Erreur lors du chargement de ${filename}:`, error);
    console.log("Utilisation de l'alphabet par défaut uniquement");
    return {...defaultAlphabet}; // Retourner l'alphabet par défaut en cas d'erreur
  }
}

// Fonction pour charger les fichiers de mots spéciaux
async function loadTextFile(filename) {
  try {
    console.log(`Chargement de ${filename}...`);
    const response = await fetch(chrome.runtime.getURL(filename));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} pour ${filename}`);
    }
    const text = await response.text();
    const lines = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    console.log(`${filename} chargé avec succès:`, lines.length, 'mots');
    return lines;
  } catch (error) {
    console.error(`Erreur lors du chargement de ${filename}:`, error);

    // Valeurs par défaut selon le type de fichier
    let defaultExamples = [];
    if (filename.includes('special_words')) {
      defaultExamples = ["Ӏабат", "Ӏад", "Ӏалашо"];
    } else if (filename.includes('special_e_words')) {
      defaultExamples = ["егар", "ела", "елча"];
    } else if (filename.includes('special_n_words')) {
      defaultExamples = ["план", "баян", "дизайн"];
    }

    console.log(`Utilisation des exemples par défaut pour ${filename}:`, defaultExamples);
    return defaultExamples;
  }
}

// Fonction d'initialisation principale
async function initializeExtension() {
  if (isInitialized && extensionData?.isLoaded) {
    console.log("Extension déjà initialisée");
    return extensionData;
  }

  console.log("=== DÉBUT D'INITIALISATION ===");
  isInitialized = true;

  try {
    // Charger tous les fichiers en parallèle
    console.log("Chargement des fichiers...");
    const [alphabetData, specialWordsData, specialEWordsData, specialNWordsData] = await Promise.all([
      loadReplacements('replacements.txt'),
      loadTextFile('special_words.txt'),
      loadTextFile('special_e_words.txt'),
      loadTextFile('special_n_words.txt')
    ]);

    // Stocker dans un objet global
    extensionData = {
      alphabet: alphabetData,
      specialWords: specialWordsData,
      specialEWords: specialEWordsData,
      specialNWords: specialNWordsData,
      isLoaded: true
    };

    // Aussi stocker sur window pour compatibilité
    window.cyrillicToLatinData = extensionData;

    console.log("=== INITIALISATION TERMINÉE ===");
    console.log("- Alphabet:", Object.keys(alphabetData).length, "entrées");
    console.log("- Mots spéciaux:", specialWordsData.length, "mots");
    console.log("- Mots spéciaux 'e':", specialEWordsData.length, "mots");
    console.log("- Mots spéciaux 'n':", specialNWordsData.length, "mots"); // CORRIGÉ: utilise specialNWordsData au lieu de specialNWordsLowercase

    return extensionData;
  } catch (error) {
    console.error("=== ÉCHEC D'INITIALISATION ===", error);
    isInitialized = false;
    return null;
  }
}

// Nouvelle fonction pour détecter le début d'une phrase
function isStartOfSentence(index, text) {
  if (index === 0) {
    return true;
  }

  const acceptedSequences = ['. ', '! ', '? ', '— ', '-  ', '—  '];
  return acceptedSequences.some(seq =>
    index >= seq.length && text.slice(index - seq.length, index) === seq
  );
}

// Fonction pour vérifier si un texte contient du cyrillique
function containsCyrillic(text) {
  return /[Ѐ-ӿ]/.test(text) && !isAlreadyTransliterated(text);
}

function isCyrillicChar(char) {
  return /[Ѐ-ӿ]/.test(char);
}

function isLowerCaseLatinLetter(c) {
  return /[a-z]/.test(c);
}

function isAlphabetic(char) {
  return /[a-zA-ZЀ-ӿ]/.test(char);
}

function shouldTransform1ToJ(index, text) {
  if (index > 0 && text[index - 1].match(/\d/)) {
    return false;
  }
  if (index + 1 < text.length && isUppercaseLetter(text[index + 1])) {
    return false;
  }
  if ((index + 1 < text.length && isCyrillicChar(text[index + 1])) ||
      (index > 0 && isCyrillicChar(text[index - 1]))) {
    return true;
  }
  return false;
}

function shouldTransformNToEng(index, text) {
  if (index + 1 >= text.length || !isAlphabetic(text[index + 1])) {
    const validSequences = [
      'зе', ' э', 'са', 'Ше', 'ше', 'Са', 'ьa', 'Iу', 'Iy', '-я', ' я', 'ой', 'Шу', 'ий', 'ай',
      'Хи', 'чу', 'хи', 'Во', 'де', ' е', 'ра', 'га', 'ча', 'ма', 'ва', 'ба', 'ша', 'фа', 'ле',
      'ти', 'та', 'ка', 'да', 'Ӏа', 'Си', 'си', 'за', 'су', 'йа', 'ки', 'лу', 'же', 'ъя', 'ула',
      'Ла', 'не', 'НИ', 'НА', 'ри́', 'ши', 'па', 'ло', 'ьцу', 'ха', 'оа', 'ви', 'ри', 'гу', 'ттй',
      'би', 'ье', 'ни', 'пи', 'ци', 'на', 'си́', 'зи', 'ги', 'ми', 'ди', 'ли', 'Ӏи', 'ке', 'зей',
      'фи', 'ая', 'ае', 'уй', 'хьу', 'хӀу', 'Ц1е', 'хьа', 'кхи', ' се', ' лу', 'гӀи', 'гӀу', 'ваа',
      'хӀи', 'хьи', 'тӀи', ' ла', 'Кхи', ' шу', ' йе', ' гу', 'ХӀу', 'Эла', 'Х1у', 'х1у', 'х1а', 'тта',
      ' ва', '-хи', ' ле', 'Хьа', 'Кxи', 'kхи', 'во', 'ХIу', 'хIy', 'ХӀа', 'Тха', ' че', 'къи',
      ' ше', ' хи', ' Ӏа', 'ХIа', 'Аси', 'КХИ', 'Къе', 'КӀе', 'къа', 'ЦӀе', 'цӀе', 'уло', 'олу',
      'ани', 'лпи', ' га', ' да', ' ба', ' ве', 'Ури', 'йту', 'лей', ' бе', 'Шай', 'шай', 'еца',
      'Txa', 'тха', 'Вие', 'лиэ', 'зиэ', 'тиэ', 'ета', 'ага', 'ьаэ', 'лва', 'дай', 'рий', 'яре',
      'пала', 'ала', 'рей', 'алла', 'тӀие', 'аро', 'джо', 'ела', 'опи',
      'Ӏай', 'кӀо', ' Са', ' са', 'сйа', ' дā', ' Ӏе', 'Аму', 'Радио', 'радио', 'йиши', ' та',
      'Соси', 'Муса', 'кӀай', ' диэ', ' сте', 'Соди', 'Ӏожа', 'Кипи', 'Кема', 'Неха', 'ножа',
      'попа', 'Музи', 'оьшу', 'енко', 'Эрка', 'Лома', 'Аюба', 'Моха', 'коша', ' оза', 'ЦоӀа',
      'Баша', 'Бузи', 'Гуни', 'Ӏузи', 'Нула', 'Ӏади', 'Асни', 'ЯӀли', ' Ури', ' хьа', ' кӀе',
      'Дети', 'Шера', 'ЯхӀу', 'АЗКИ', 'Хуши', 'Шиви', 'Муци', 'Зипа', 'Рами', 'Зами', 'Амци',
      'Репи', 'Шизи', ' э́ра', ' эра', 'Зату', 'Ӏиду', 'Шиха', ' къе', 'Цупи', '«ХIа', 'Нера',
      'Цуби', 'меха', 'Нати', 'Реби', 'Доди', 'АгӀи', ' хӀу', 'Юаша', 'Мики', 'Рути', ' х1у',
      ' х1а', 'Юшая', 'Яира', 'ШуӀи', 'Гади', 'Рапу', 'Нуни', 'Маки', 'Дела', 'Дора', 'Леви',
      'лома', 'веши', 'Юала', 'неха', 'дӀайе', 'берза', 'Ашара', 'Муаби', ' шера', ' кема',
      'Тайпа'
    ];

    const maxLen = Math.max(...validSequences.map(seq => seq.length));
    const start = Math.max(0, index - maxLen);
    const precedingText = text.slice(start, index);

    return validSequences.some(seq => precedingText.endsWith(seq));
  }
  return false;
}

function isSpecialNEndingWord(index, text, specialNWordsList) {
  if (index <= 0 || text[index].toLowerCase() !== 'н') return false;

  let start = index;
  while (start > 0 && isAlphabetic(text[start - 1])) {
    start--;
  }

  const word = text.slice(start, index + 1).toLowerCase();

  if (word.length < 2) return false;

  return specialNWordsList.includes(word);
}

function isInCyrillicContext(index, text) {
  // Vérifier si précédé ou suivi de cyrillique
  const hasCyrillicBefore = index > 0 && isCyrillicChar(text[index - 1]);
  const hasCyrillicAfter = index + 1 < text.length && isCyrillicChar(text[index + 1]);

  // Vérifier dans un contexte plus large (mot entier)
  let start = index;
  while (start > 0 && isAlphabetic(text[start - 1])) start--;
  let end = index;
  while (end < text.length && isAlphabetic(text[end])) end++;

  const word = text.slice(start, end + 1);
  const hasCyrillicInWord = /[Ѐ-ӿ]/.test(word);

  return hasCyrillicBefore || hasCyrillicAfter || hasCyrillicInWord;
}

// Fonction principale de traduction
// Combinaisons de lettres (къ, хь, кх, аь, оь, уь, юь, яь, гӀ, кӀ, пӀ, тӀ, цӀ, чӀ, хӀ) appliquées à un mot cyrillique.
// Utilisée pour la restauration des mots spéciaux « е » : ces mots sont mis de côté (marqueurs) AVANT la phase des
// combinaisons, donc sans cette fonction leurs digraphes ressortaient lettre par lettre (ехьа → yexa au lieu de yeẋa).
function applySpecialCombinations(word) {
  let w = word;
  w = w.replace(/(к)(ъ)/gi, (match, p1) => (p1 === p1.toUpperCase() ? 'Q̇' : 'q̇'));
  w = w.replace(/(ч)([ӀІlIӏi1])/gi, (match, p1) => (p1 === p1.toUpperCase() ? 'Ç̇' : 'ç̇'));
  w = w.replace(/(г)([ӀІlIӏi1])/gi, (match, p1) => (p1 === p1.toUpperCase() ? 'Ġ' : 'ġ'));
  w = w.replace(/(х)([ӀІlIӏi1])/gi, (match, p1) => (p1 === p1.toUpperCase() ? 'H' : 'h'));
  w = w.replace(/(x)([ӀІlIӏi1])/gi, (match, p1) => (p1 === p1.toUpperCase() ? 'H' : 'h'));
  w = w.replace(/(ц)([ӀІlIӏi1])/gi, (match, p1) => (p1 === p1.toUpperCase() ? 'Ċ' : 'ċ'));
  w = w.replace(/(к)([ӀІlIӏi1])/gi, (match, p1) => (p1 === p1.toUpperCase() ? 'K̇' : 'k̇'));
  w = w.replace(/(k)([ӀІlIӏi1])/gi, (match, p1) => (p1 === p1.toUpperCase() ? 'K̇' : 'k̇'));
  w = w.replace(/(п)([ӀІlIӏi1])/gi, (match, p1) => (p1 === p1.toUpperCase() ? 'Ṗ' : 'ṗ'));
  w = w.replace(/(т)([ӀІlIӏi1])/gi, (match, p1) => (p1 === p1.toUpperCase() ? 'Ṫ' : 'ṫ'));
  w = w.replace(/(t)([ӀІlIӏi1])/gi, (match, p1) => (p1 === p1.toUpperCase() ? 'Ṫ' : 'ṫ'));
  w = w.replace(/(х)(ь)/gi, (match, p1) => (p1 === p1.toUpperCase() ? 'Ẋ' : 'ẋ'));
  w = w.replace(/(x)(ь)/gi, (match, p1) => (p1 === p1.toUpperCase() ? 'Ẋ' : 'ẋ'));
  w = w.replace(/(у)(ь)/gi, (match, p1) => (p1 === p1.toUpperCase() ? 'Ü' : 'ü'));
  w = w.replace(/(к)(х)/gi, (match, p1) => (p1 === p1.toUpperCase() ? 'Q' : 'q'));
  w = w.replace(/(k)(x)/gi, (match, p1) => (p1 === p1.toUpperCase() ? 'Q' : 'q'));
  w = w.replace(/(а)(ь)/gi, (match, p1) => (p1 === p1.toUpperCase() ? 'Ä' : 'ä'));
  w = w.replace(/(о)(ь)/gi, (match, p1) => (p1 === p1.toUpperCase() ? 'Ö' : 'ö'));
  w = w.replace(/(я)(ь)/gi, (match, p1) => (p1 === p1.toUpperCase() ? 'Yä' : 'yä'));
  w = w.replace(/(ю)(ь)/gi, (match, p1) => (p1 === p1.toUpperCase() ? 'Yü' : 'yü'));
  return w;
}

function translate(text) {
  // Vérifier que les données sont chargées
  if (!extensionData || !extensionData.isLoaded) {
    console.error("ERREUR: Les données ne sont pas chargées pour la traduction!");
    return text;
  }

  console.log("=== DÉBUT TRADUCTION ===");
  console.log("Texte original:", text.substring(0, 100) + "...");

  const currentAlphabet = extensionData.alphabet;
  const currentSpecialWords = extensionData.specialWords;
  const currentSpecialEWords = extensionData.specialEWords;
  const currentSpecialNWords = extensionData.specialNWords;

  // Remplacements spécifiques du code Python
  text = text.replace(' девн', ' dövn');
  text = text.replace(' екъна', ' yeq̇na');
  text = text.replace(' дlа', ' dja');
  text = text.replace(' екъае', ' йеq̇aйе');
  text = text.replace(' ветта ', ' vätta ');
  text = text.replace(' бетта ', ' bätta ');
  text = text.replace(' детта ', ' dätta ');
  text = text.replace(' етт', ' yätt');
  text = text.replace(' евлла', ' yövlla');
  text = text.replace(' ен ', ' yeŋ ');
  text = text.replace(' мин ', ' min ');
  text = text.replace(' Ӏаьржа ', ' järƶa ');
  text = text.replace(' Ӏаьржо ', ' järƶo ');
  text = text.replace(' Ӏаьржачу ', ' järƶaçu ');
  text = text.replace(' Ӏамалекхахойн', ' jamalеqaxoyŋ');
  text = text.replace(' Ӏамалекхахо', ' jamalеqaxo');
  text = text.replace(' Ӏада а ', ' jada a ');
  text = text.replace(' Ӏеса нах', ' jеsa nax');
  text = text.replace(' Ӏадаво', ' jadavo');
  text = text.replace(' Ӏана вахана', ' jana vaxana');
  text = text.replace(' е»', ' ye»');
  text = text.replace(' е,', ' ye,');
  text = text.replace(' е ', ' ye ');
  text = text.replace(' е.', ' ye.');
  text = text.replace(' е!', ' ye!');
  text = text.replace(' кан', ' кан');
  text = text.replace(' гӀан', ' ġan');
  text = text.replace(' бин ', ' бин ');
  text = text.replace('Лан ду', 'Lan du');
  text = text.replace('лан ду', 'lan du');
  text = text.replace(' Ӏадат', ' jadat');
  text = text.replace(' хан', ' xan');
  text = text.replace(' хьун', ' ẋun');
  text = text.replace(' Ӏин', ' jin');
  text = text.replace(' Ӏебархойн', ' jebarxoyŋ');
  text = text.replace(' Ӏебархо', ' jebarxo');
  text = text.replace(' Ӏанамхойна', ' janamxoyna');
  text = text.replace(' Ӏанамхойн', ' janamxoyŋ');
  text = text.replace(' Ӏанамхой', ' janamxoy');

  // ✅ PHASE 0: MARQUAGE DES MOTS SPÉCIAUX EN PREMIER (AVANT TOUTE TRANSFORMATION)
  console.log("Phase 0: Marquage des mots spéciaux AVANT toute transformation");
  const specialEWordMarkers = new Map();
  const specialNWordMarkers = new Map();
  let markerIndex = 0;

  // 0.1 - Marquer les mots spéciaux commençant par 'е' ou 'Е'
  let textIndex = 0;
  while (textIndex < text.length) {
    if ((text[textIndex] === 'е' || text[textIndex] === 'Е') &&
          (textIndex === 0 || !isAlphabetic(text[textIndex - 1]))) {

      let wordEnd = textIndex;
      while (wordEnd < text.length && isAlphabetic(text[wordEnd])) {
        wordEnd++;
      }
      const currentWord = text.slice(textIndex, wordEnd).toLowerCase();

      let matchedSpecialWord = null;
      for (const specialWord of currentSpecialEWords) {
        if (currentWord.startsWith(specialWord.toLowerCase())) {
          matchedSpecialWord = specialWord;
          break;
        }
      }

      if (matchedSpecialWord) {
        const marker = `__SPECIAL_E_WORD_${markerIndex}__`;
        const originalWord = text.slice(textIndex, wordEnd);
        specialEWordMarkers.set(marker, originalWord);

        text = text.slice(0, textIndex) + marker + text.slice(wordEnd);
        textIndex += marker.length;
        markerIndex++;
        console.log(`Mot spécial E marqué: ${originalWord} -> ${marker}`);
      } else {
        textIndex++;
      }
    } else {
      textIndex++;
    }
  }

  // 0.2 - Marquer les mots spéciaux de special_n_words.txt (CASSE EXACTE DU FICHIER)
  for (const specialWord of currentSpecialNWords) {
    const escapedWord = specialWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Créer une regex qui respecte la casse EXACTE du fichier
    const findRegex = new RegExp(`(?<![a-zA-Z\\u0400-\\u04FF\\u0406\\u04c0])${escapedWord}(?![a-zA-Z\\u0400-\\u04FF\\u0406\\u04c0])`, 'g');

    // Traiter les occurrences de la fin vers le début pour éviter les problèmes de décalage
    const matches = [...text.matchAll(findRegex)].reverse();

    for (const match of matches) {
      const foundWordInText = match[0];
      const startIndex = match.index;
      const endIndex = startIndex + foundWordInText.length;

      const marker = `__SPECIAL_N_WORD_${markerIndex}__`;
      specialNWordMarkers.set(marker, foundWordInText);

      text = text.slice(0, startIndex) + marker + text.slice(endIndex);
      markerIndex++;
      console.log(`✅ Mot spécial N marqué AVANT transformation: "${foundWordInText}" -> ${marker}`);
    }
  }

  // 0.3 - Mots spéciaux de special_words.txt : mots écrits avec un « I » latin (ou une variante)
  // à la place de la palochka. On normalise EN PLACE ces caractères en « Ӏ » (U+04C0) pour que le
  // pipeline normal les lise comme palochka. Aucun marqueur : le nombre de mots est conservé.
  const PALOCHKA_CLASS = '[ӀIӏІ' + '1]';
  for (const specialWord of currentSpecialWords) {
    // Créer une version du mot spécial qui accepte I et Ӏ comme équivalents (UNE seule passe :
    // deux remplacements successifs corrompaient la classe de caractères déjà insérée)
    const pattern = specialWord
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/[Ӏӏ]/g, PALOCHKA_CLASS);

    if (!text.match(new RegExp(pattern, 'i'))) continue;

    const wordBoundary = `(?<![a-zA-Z\\u0400-\\u04FF\\u0406\\u04c0])${pattern}(?![a-zA-Z\\u0400-\\u04FF\\u0406\\u04c0])`;
    const regex = new RegExp(wordBoundary, 'gi');

    // Trouver toutes les variantes du mot dans le texte
    const matches = [...text.matchAll(regex)];

    for (const match of matches.reverse()) { // Traiter de la fin vers le début
      const foundVariant = match[0];
      if (foundVariant.length !== specialWord.length) continue; // sécurité : alignement caractère par caractère

      // Aux positions « palochka » du mot de la liste (Ӏ, ӏ ou I latin), forcer Ӏ
      let normalized = '';
      for (let j = 0; j < foundVariant.length; j++) {
        const ref = specialWord[j];
        normalized += (ref === 'Ӏ' || ref === 'ӏ' || ref === 'I') ? 'Ӏ' : foundVariant[j];
      }

      if (normalized !== foundVariant) {
        text = text.slice(0, match.index) + normalized + text.slice(match.index + foundVariant.length);
        console.log(`Mot spécial normalisé: ${foundVariant} -> ${normalized}`);
      }
    }
  }

  console.log(`Phase 0 terminée. ${markerIndex} mots spéciaux marqués au total.`);

  // 1.0 - TRAITEMENT SPÉCIAL POUR 'н' -> 'ŋ' EN PREMIER
  console.log("Phase 1.0: Traitement 'н' → 'ŋ'");
  let tempText = '';
  for (let index = 0; index < text.length; index++) {
    if ((text[index] === 'н' || text[index] === 'Н') && shouldTransformNToEng(index, text)) {
      let isInSpecialNWords = false;

      let start = index;
      while (start > 0 && /[a-zA-ZЀ-ӿ]/.test(text[start - 1])) {
        start--;
      }

      let wordEnd = index;
      while (wordEnd < text.length && /[a-zA-ZЀ-ӿ]/.test(text[wordEnd])) {
        wordEnd++;
      }
      const word = text.slice(start, wordEnd).toLowerCase();

      if (currentSpecialNWords.includes(word)) {
        isInSpecialNWords = true;
        console.log(`Mot spécial N détecté: ${word} - garde 'н'`);
      }

      if (!isInSpecialNWords) {
        const startCheck = Math.max(0, index - 10);
        const precedingText = text.slice(startCheck, index);
        const isUppercase = text[index] === 'Н' || precedingText === precedingText.toUpperCase();
        const result = isUppercase ? 'Ŋ' : 'ŋ';
        tempText += result;
      } else {
        tempText += text[index];
      }
    } else {
      tempText += text[index];
    }
  }
  text = tempText;
  console.log("Phase 1.0 terminée");

  // 1.0b - Palochka tapée avec un « I » latin collé à des lettres cyrilliques (« тIехь », « хIунда »,
  // « Iаьржа ») : on la ramène à « Ӏ » (U+04C0) pour que les combinaisons КӀ ТӀ ГӀ ХӀ ЦӀ ЧӀ ПӀ
  // s'appliquent comme pour « Ӏ » et « 1 ». Fait APRÈS la phase 1.0 (ses séquences de contexte
  // contiennent des « I » latins) et AVANT les combinaisons. On raisonne mot par mot (suite de lettres).
  // Un chiffre romain n'est JAMAIS une palochka, même collé à une abréviation de siècle
  // (« XIIв. », « XVIIIвв. », « IIIв »). Un chiffre romain pur écrit avec des Х / І cyrilliques est
  // ramené en latin (« ХI-ХII » → « XI-XII »).
  text = text.replace(/\p{L}+/gu, (w) => {
    if (!/[IlІ]/.test(w)) return w;
    if (/^[IVXLCDMХІСМ]+(?:вв?|век(?:а|у|ом|е|ов)?)?$/.test(w)) {
      return w.replace(/Х/g, 'X').replace(/І/g, 'I');
    }
    return normalizePalochka(w);
  });

  // *** NOUVELLE PHASE 1.1 - APPLIQUER LES COMBINAISONS SPÉCIALES EN PREMIER ***
  console.log("Phase 1.1: Application des combinaisons spéciales AVANT marquage");

  // КӀ -> K̇
  text = text.replace(/(к)([ӀІӏ1])/gi, (match, p1, p2) => {
    const result = p1 === p1.toUpperCase() ? 'K̇' : 'k̇';
    console.log(`Combinaison КӀ: "${match}" → "${result}"`);
    return result;
  });

  // KӀ -> K̇ (Latin K)
  text = text.replace(/(k)([ӀІӏ1])/gi, (match, p1, p2) => {
    const result = p1 === p1.toUpperCase() ? 'K̇' : 'k̇';
    console.log(`Combinaison KӀ: "${match}" → "${result}"`);
    return result;
  });

  // ЧӀ -> Ç̇
  text = text.replace(/(ч)([ӀІӏ1])/gi, (match, p1, p2) => {
    const result = p1 === p1.toUpperCase() ? 'Ç̇' : 'ç̇';
    console.log(`Combinaison ЧӀ: "${match}" → "${result}"`);
    return result;
  });

  // ГӀ -> Ġ
  text = text.replace(/(г)([ӀІӏ1])/gi, (match, p1, p2) => {
    const result = p1 === p1.toUpperCase() ? 'Ġ' : 'ġ';
    console.log(`Combinaison ГӀ: "${match}" → "${result}"`);
    return result;
  });

  // ХӀ -> H
  text = text.replace(/(х)([ӀІӏ1])/gi, (match, p1, p2) => {
    const result = p1 === p1.toUpperCase() ? 'H' : 'h';
    console.log(`Combinaison ХӀ: "${match}" → "${result}"`);
    return result;
  });

  // XӀ -> H (Latin X)
  text = text.replace(/(x)([ӀІӏ1])/gi, (match, p1, p2) => {
    const result = p1 === p1.toUpperCase() ? 'H' : 'h';
    console.log(`Combinaison XӀ: "${match}" → "${result}"`);
    return result;
  });

  // ЦӀ -> Ċ
  text = text.replace(/(ц)([ӀІӏ1])/gi, (match, p1, p2) => {
    const result = p1 === p1.toUpperCase() ? 'Ċ' : 'ċ';
    console.log(`Combinaison ЦӀ: "${match}" → "${result}"`);
    return result;
  });

  // ПӀ -> Ṗ
  text = text.replace(/(п)([ӀІӏ1])/gi, (match, p1, p2) => {
    const result = p1 === p1.toUpperCase() ? 'Ṗ' : 'ṗ';
    console.log(`Combinaison ПӀ: "${match}" → "${result}"`);
    return result;
  });

  // ТӀ -> Ṫ
  text = text.replace(/(т)([ӀІӏ1])/gi, (match, p1, p2) => {
    const result = p1 === p1.toUpperCase() ? 'Ṫ' : 'ṫ';
    console.log(`Combinaison ТӀ: "${match}" → "${result}"`);
    return result;
  });

  // TӀ -> Ṫ (Latin T)
  text = text.replace(/(t)([ӀІӏ1])/gi, (match, p1, p2) => {
    const result = p1 === p1.toUpperCase() ? 'Ṫ' : 'ṫ';
    console.log(`Combinaison TӀ: "${match}" → "${result}"`);
    return result;
  });

  // хь -> ẋ
  text = text.replace(/(х)(ь)/gi, (match, p1, p2) => {
    const result = p1 === p1.toUpperCase() ? 'Ẋ' : 'ẋ';
    console.log(`Combinaison хь: "${match}" → "${result}"`);
    return result;
  });

  // Latin xь -> ẋ
  text = text.replace(/(x)(ь)/gi, (match, p1, p2) => {
    const result = p1 === p1.toUpperCase() ? 'Ẋ' : 'ẋ';
    console.log(`Combinaison xь: "${match}" → "${result}"`);
    return result;
  });

  // уь -> ü
  text = text.replace(/(у)(ь)/gi, (match, p1, p2) => {
    const result = p1 === p1.toUpperCase() ? 'Ü' : 'ü';
    console.log(`Combinaison уь: "${match}" → "${result}"`);
    return result;
  });

  // кх -> q
  text = text.replace(/(к)(х)/gi, (match, p1, p2) => {
    const result = p1 === p1.toUpperCase() ? 'Q' : 'q';
    console.log(`Combinaison кх: "${match}" → "${result}"`);
    return result;
  });

  // kx -> q (Latin k)
  text = text.replace(/(k)(x)/gi, (match, p1, p2) => {
    const result = p1 === p1.toUpperCase() ? 'Q' : 'q';
    console.log(`Combinaison kx: "${match}" → "${result}"`);
    return result;
  });

  // аь -> ä
  text = text.replace(/(а)(ь)/gi, (match, p1, p2) => {
    const result = p1 === p1.toUpperCase() ? 'Ä' : 'ä';
    console.log(`Combinaison аь: "${match}" → "${result}"`);
    return result;
  });

  // оь -> ö
  text = text.replace(/(о)(ь)/gi, (match, p1, p2) => {
    const result = p1 === p1.toUpperCase() ? 'Ö' : 'ö';
    console.log(`Combinaison оь: "${match}" → "${result}"`);
    return result;
  });

  // *** CRITIQUE : къ -> q̇ ***
  text = text.replace(/(к)(ъ)/gi, (match, p1, p2) => {
    const result = p1 === p1.toUpperCase() ? 'Q̇' : 'q̇';
    console.log(`*** Combinaison къ: "${match}" → "${result}" ***`);
    return result;
  });

  // яь -> yä
  text = text.replace(/(я)(ь)/gi, (match, p1, p2) => {
    const result = p1 === p1.toUpperCase() ? 'Yä' : 'yä';
    console.log(`Combinaison яь: "${match}" → "${result}"`);
    return result;
  });

  // юь -> yü
  text = text.replace(/(ю)(ь)/gi, (match, p1, p2) => {
    const result = p1 === p1.toUpperCase() ? 'Yü' : 'yü';
    console.log(`Combinaison юь: "${match}" → "${result}"`);
    return result;
  });

  console.log("Phase 1.1 terminée - Combinaisons appliquées");
  console.log("Texte après combinaisons:", text.substring(0, 100) + "...");

  // 1.3 - Appliquer les remplacements généraux depuis replacements.txt
  console.log("Phase 1.3: Application des remplacements du fichier replacements.txt");
  let processedText = text;
  const alphabetEntries = Object.entries(currentAlphabet);

  // Trier par longueur décroissante pour éviter les conflits
  alphabetEntries.sort((a, b) => b[0].length - a[0].length);

  let appliedReplacements = 0;
  for (const [key, value] of alphabetEntries) {
    if (key && value && processedText.includes(key)) {
      const beforeReplace = processedText;
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      processedText = processedText.replace(new RegExp(escapedKey, 'g'), value);

      if (beforeReplace !== processedText) {
        appliedReplacements++;
        if (appliedReplacements <= 5) {
          console.log(`Remplacement ${appliedReplacements}: "${key}" -> "${value}"`);
        }
      }
    }
  }

  console.log(`Phase 1.3 terminée. Total remplacements appliqués: ${appliedReplacements}`);

  // 1.4 - Restaurer les mots spéciaux avec transformation correcte
  console.log("Phase 1.4: Restauration des mots spéciaux");

  // Restaurer mots spéciaux 'e'
  for (const [marker, originalWordRaw] of specialEWordMarkers) {
    if (processedText.includes(marker)) {
      const originalWord = normalizePalochka(originalWordRaw);
      const isUpperCase = originalWord[0] === 'Е';

      let transformedWord = '';
      if (isUpperCase) {
        if (originalWord.length > 1 && isUppercaseLetter(originalWord[1])) {
          transformedWord += 'YE';
        } else {
          transformedWord += 'Ye';
        }
      } else {
        transformedWord += 'ye';
      }

      // Combinaisons appliquées au reste du mot (le « е » initial est déjà rendu par « ye »)
      const restWord = applySpecialCombinations(originalWord.slice(1));
      for (let j = 0; j < restWord.length; j++) {
        const char = restWord[j];
        const lowerChar = char.toLowerCase();

        if (char === '́' && j > 0) {
          transformedWord += char;
        }
        // ⭐ RÈGLE DIRECTE : н en fin de mot → ŋ (sauf mots spéciaux N)
        else if (lowerChar === 'н') {
          // Vérifier si c'est un mot spécial N (garde 'n')
          if (currentSpecialNWords.includes(originalWord.toLowerCase())) {
            transformedWord += char === 'Н' ? 'N' : 'n';
          }
          // Sinon, appliquer la règle standard : н en fin de mot → ŋ
          else if (j === restWord.length - 1) {
            // 'н' en fin de mot → 'ŋ'
            transformedWord += char === 'Н' ? 'Ŋ' : 'ŋ';
          }
          else {
            // 'н' au milieu du mot → 'n'
            transformedWord += char === 'Н' ? 'N' : 'n';
          }
        }
        // Lettre déjà issue d'une combinaison (ẋ, q̇, ä…) : on la garde telle quelle
        else if (!/[Ѐ-ӿ]/.test(char)) {
          transformedWord += char;
        }
        else if (currentAlphabet[lowerChar]) {
          if (char === char.toUpperCase() && char !== char.toLowerCase()) {
            const transliterated = currentAlphabet[lowerChar];
            transformedWord += transliterated.charAt(0).toUpperCase() + transliterated.slice(1);
          } else {
            transformedWord += currentAlphabet[lowerChar];
          }
        } else {
          transformedWord += char;
        }
      }

      processedText = processedText.replace(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), transformedWord);
      console.log(`⭐ Mot spécial E restauré avec règle н→ŋ: ${marker} -> ${transformedWord}`);
    }
  }


  // Restaurer autres mots spéciaux
  for (const [marker, originalWord] of specialNWordMarkers) {
  if (processedText.includes(marker)) {

    // ⭐ ÉTAPE 1: D'ABORD appliquer les combinaisons spéciales au mot original
    // (palochka tapée « I » / « І » → « Ӏ » : sinon « Iалхан » ressortait « Ialxan »)
    let transformedWord = normalizePalochka(originalWord);

    // Appliquer toutes les combinaisons spéciales
    // къ -> q̇
    transformedWord = transformedWord.replace(/(к)(ъ)/gi, (match, p1, p2) => {
      return p1 === p1.toUpperCase() ? 'Q̇' : 'q̇';
    });

    // ЧӀ -> Ç̇
    transformedWord = transformedWord.replace(/(ч)([ӀІlIӏi1])/gi, (match, p1, p2) => {
      return p1 === p1.toUpperCase() ? 'Ç̇' : 'ç̇';
    });

    // ГӀ -> Ġ
    transformedWord = transformedWord.replace(/(г)([ӀІlIӏi1])/gi, (match, p1, p2) => {
      return p1 === p1.toUpperCase() ? 'Ġ' : 'ġ';
    });

    // ⭐ ХӀ -> H (CRITIQUE pour 'ОвхӀан')
    transformedWord = transformedWord.replace(/(х)([ӀІlIӏi1])/gi, (match, p1, p2) => {
      return p1 === p1.toUpperCase() ? 'H' : 'h';
    });

    // XӀ -> H (Latin X)
    transformedWord = transformedWord.replace(/(x)([ӀІlIӏi1])/gi, (match, p1, p2) => {
      return p1 === p1.toUpperCase() ? 'H' : 'h';
    });

    // ЦӀ -> Ċ
    transformedWord = transformedWord.replace(/(ц)([ӀІlIӏi1])/gi, (match, p1, p2) => {
      return p1 === p1.toUpperCase() ? 'Ċ' : 'ċ';
    });

    // КӀ -> K̇
    transformedWord = transformedWord.replace(/(к)([ӀІlIӏi1])/gi, (match, p1, p2) => {
      return p1 === p1.toUpperCase() ? 'K̇' : 'k̇';
    });

    // KӀ -> K̇ (Latin K)
    transformedWord = transformedWord.replace(/(k)([ӀІlIӏi1])/gi, (match, p1, p2) => {
      return p1 === p1.toUpperCase() ? 'K̇' : 'k̇';
    });

    // ПӀ -> Ṗ
    transformedWord = transformedWord.replace(/(п)([ӀІlIӏi1])/gi, (match, p1, p2) => {
      return p1 === p1.toUpperCase() ? 'Ṗ' : 'ṗ';
    });

    // ТӀ -> Ṫ
    transformedWord = transformedWord.replace(/(т)([ӀІlIӏi1])/gi, (match, p1, p2) => {
      return p1 === p1.toUpperCase() ? 'Ṫ' : 'ṫ';
    });

    // TӀ -> Ṫ (Latin T)
    transformedWord = transformedWord.replace(/(t)([ӀІlIӏi1])/gi, (match, p1, p2) => {
      return p1 === p1.toUpperCase() ? 'Ṫ' : 'ṫ';
    });

    // хь -> ẋ
    transformedWord = transformedWord.replace(/(х)(ь)/gi, (match, p1, p2) => {
      return p1 === p1.toUpperCase() ? 'Ẋ' : 'ẋ';
    });

    // Latin xь -> ẋ
    transformedWord = transformedWord.replace(/(x)(ь)/gi, (match, p1, p2) => {
      return p1 === p1.toUpperCase() ? 'Ẋ' : 'ẋ';
    });

    // уь -> ü
    transformedWord = transformedWord.replace(/(у)(ь)/gi, (match, p1, p2) => {
      return p1 === p1.toUpperCase() ? 'Ü' : 'ü';
    });

    // кх -> q
    transformedWord = transformedWord.replace(/(к)(х)/gi, (match, p1, p2) => {
      return p1 === p1.toUpperCase() ? 'Q' : 'q';
    });

    // kx -> q (Latin k)
    transformedWord = transformedWord.replace(/(k)(x)/gi, (match, p1, p2) => {
      return p1 === p1.toUpperCase() ? 'Q' : 'q';
    });

    // аь -> ä
    transformedWord = transformedWord.replace(/(а)(ь)/gi, (match, p1, p2) => {
      return p1 === p1.toUpperCase() ? 'Ä' : 'ä';
    });

    // оь -> ö
    transformedWord = transformedWord.replace(/(о)(ь)/gi, (match, p1, p2) => {
      return p1 === p1.toUpperCase() ? 'Ö' : 'ö';
    });

    // яь -> yä
    transformedWord = transformedWord.replace(/(я)(ь)/gi, (match, p1, p2) => {
      return p1 === p1.toUpperCase() ? 'Yä' : 'yä';
    });

    // юь -> yü
    transformedWord = transformedWord.replace(/(ю)(ь)/gi, (match, p1, p2) => {
      return p1 === p1.toUpperCase() ? 'Yü' : 'yü';
    });

    // ⭐ ÉTAPE 2: Traiter caractère par caractère ce qui reste
    let finalWord = '';
    for (let i = 0; i < transformedWord.length; i++) {
      const char = transformedWord[i];
      const lowerChar = char.toLowerCase();

      // Traitement spécial pour 'н' (raison d'être des mots spéciaux N)
      if (char.toLowerCase() === 'н') {
        finalWord += char === 'Н' ? 'N' : 'n';
      }
      // CARACTÈRES DÉJÀ TRANSFORMÉS (combinaisons), les garder tels quels
      else if (!/[Ѐ-ӿ]/.test(char)) {
        finalWord += char;
      }
      // TRAITEMENT NORMAL pour les autres caractères cyrilliques
      else if (currentAlphabet[lowerChar]) {
        if (char === char.toUpperCase() && char !== char.toLowerCase()) {
          const transliterated = currentAlphabet[lowerChar];
          finalWord += transliterated.charAt(0).toUpperCase() + transliterated.slice(1);
        } else {
          finalWord += currentAlphabet[lowerChar];
        }
      } else {
        finalWord += char;
      }
    }

    processedText = processedText.replace(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), finalWord);
    console.log(`⭐ Mot spécial N restauré: "${originalWord}" -> "${finalWord}"`);
  }
}

  // PHASE 2: APPLIQUER LES TRANSFORMATIONS CARACTÈRE PAR CARACTÈRE
  console.log("Phase 2: Traitement caractère par caractère");
  let translation = '';
  let i = 0;

  while (i < processedText.length) {

    // Handle special cases for 'XIII' (isolé)
    if (i + 3 < processedText.length && processedText.slice(i, i + 4) === 'XIII') {
      if (isIsolatedRomanNumeral(processedText, i, i + 4)) {
        translation += 'XIII';
        i += 4;
        console.log('Chiffre romain XIII protégé');
        continue;
      }
    }

    // Handle special cases for 'XII' (isolé) - NOUVEAU
    if (i + 2 < processedText.length && processedText.slice(i, i + 3) === 'XII') {
      if (isIsolatedRomanNumeral(processedText, i, i + 3)) {
        translation += 'XII';
        i += 3;
        console.log('Chiffre romain XII protégé');
        continue;
      }
    }

    // Handle special cases for 'XI' (isolé)
    if (i + 1 < processedText.length && processedText.slice(i, i + 2) === 'XI') {
      if (isIsolatedRomanNumeral(processedText, i, i + 2)) {
        // XI isolé reste XI
        translation += 'XI';
        i += 2;
        console.log('Chiffre romain XI protégé');
        continue;
      } else {
        // XI non-isolé - appliquer la logique existante
        // Siècle en chiffres romains collé à son abréviation (« XIв. », « XIвв. », « XIвек »),
        // déjà latinisée à ce stade (« XIv. », « XIvv. », « XIvek ») : c'est un chiffre romain,
        // pas la combinaison ХӀ → H. On teste le MOT entier, pas seulement les deux lettres.
        const atWordStart = i === 0 || !isAlphabetic(processedText[i - 1]);
        // NB : à ce stade le « е » est encore cyrillique (converti en dernière étape) → [eе].
        const centuryToken = /^[IVXLCDM]+(?:vv?|v[eе]k(?:a|u|om|[eе]|ov)?)(?![A-Za-zЀ-ӿ])/.exec(processedText.slice(i));
        if (atWordStart && centuryToken) {
          translation += 'XI';
          i += 2;
          continue;
        }
        if (i + 2 === processedText.length || !isAlphabetic(processedText[i + 2])) {
          translation += 'XI';
          i += 2;
          continue;
        } else if (!['V', 'X', 'L', 'C', 'D', 'M', 'I'].includes(processedText[i + 2])) {
          translation += 'H';
          i += 2;
          continue;
        } else {
          translation += 'XI';
          i += 2;
          continue;
        }
      }
    }

    // AJOUTER protection pour d'autres chiffres romains courants

    // Handle 'XIV' (isolé)
    if (i + 2 < processedText.length && processedText.slice(i, i + 3) === 'XIV') {
      if (isIsolatedRomanNumeral(processedText, i, i + 3)) {
        translation += 'XIV';
        i += 3;
        console.log('Chiffre romain XIV protégé');
        continue;
      }
    }

    // Handle 'XV' (isolé)
    if (i + 1 < processedText.length && processedText.slice(i, i + 2) === 'XV') {
      if (isIsolatedRomanNumeral(processedText, i, i + 2)) {
        translation += 'XV';
        i += 2;
        console.log('Chiffre romain XV protégé');
        continue;
      }
    }

    // Handle 'XVI' (isolé)
    if (i + 2 < processedText.length && processedText.slice(i, i + 3) === 'XVI') {
      if (isIsolatedRomanNumeral(processedText, i, i + 3)) {
        translation += 'XVI';
        i += 3;
        console.log('Chiffre romain XVI protégé');
        continue;
      }
    }

    // Handle 'XVII' (isolé)
    if (i + 3 < processedText.length && processedText.slice(i, i + 4) === 'XVII') {
      if (isIsolatedRomanNumeral(processedText, i, i + 4)) {
        translation += 'XVII';
        i += 4;
        console.log('Chiffre romain XVII protégé');
        continue;
      }
    }

    // Handle 'XVIII' (isolé)
    if (i + 4 < processedText.length && processedText.slice(i, i + 5) === 'XVIII') {
      if (isIsolatedRomanNumeral(processedText, i, i + 5)) {
        translation += 'XVIII';
        i += 5;
        console.log('Chiffre romain XVIII protégé');
        continue;
      }
    }

    // Handle 'XIX' (isolé)
    if (i + 2 < processedText.length && processedText.slice(i, i + 3) === 'XIX') {
      if (isIsolatedRomanNumeral(processedText, i, i + 3)) {
        translation += 'XIX';
        i += 3;
        console.log('Chiffre romain XIX protégé');
        continue;
      }
    }

    // Handle 'XX' (isolé)
    if (i + 1 < processedText.length && processedText.slice(i, i + 2) === 'XX') {
      if (isIsolatedRomanNumeral(processedText, i, i + 2)) {
        translation += 'XX';
        i += 2;
        console.log('Chiffre romain XX protégé');
        continue;
      }
    }

    // Handle 'XXI' (isolé)
    if (i + 2 < processedText.length && processedText.slice(i, i + 3) === 'XXI') {
      if (isIsolatedRomanNumeral(processedText, i, i + 3)) {
        translation += 'XXI';
        i += 3;
        console.log('Chiffre romain XXI protégé');
        continue;
      }
    }

    // NOUVELLE LOGIQUE : Traitement prioritaire pour 'I', 'Ӏ', 'ӏ'
    if (processedText[i] === 'I' || processedText[i] === 'Ӏ' || processedText[i] === 'ӏ') {

  // ⭐ ÉTAPE 0: Vérifier d'abord les séquences de chiffres romains
  if (processedText[i] === 'I') {
    const romanMatch = isStartOfRomanSequence(processedText, i);
    if (romanMatch) {
      // Protéger la séquence romaine complète
      translation += romanMatch.pattern;
      i += romanMatch.length;
      console.log(`Séquence romaine protégée: ${romanMatch.pattern}`);
      continue;
    }
  }

  // ÉTAPE 1: Vérifier si c'est dans un contexte cyrillique (pour les I isolés)
  if (processedText[i] === 'I' && isInCyrillicContext(i, processedText)) {
    let isWordStart = (i === 0 || !isAlphabetic(processedText[i - 1]));
    let isSentenceStart = isStartOfSentence(i, processedText);

    if (isWordStart && isSentenceStart) {
      translation += 'J';
    } else {
      translation += 'j';
    }
    i += 1;
    continue;
  }

  // ÉTAPE 2: Pour Ӏ/ӏ cyrillique, traitement normal
  if (processedText[i] === 'Ӏ' || processedText[i] === 'ӏ') {
    let isWordStart = (i === 0 || !isAlphabetic(processedText[i - 1]));
    let isSentenceStart = isStartOfSentence(i, processedText);

    if (isWordStart && isSentenceStart) {
      translation += 'J';
    } else {
      translation += 'j';
    }
    i += 1;
    continue;
  }

  // ÉTAPE 3: Pour 'I' latin, vérifier si c'est un chiffre romain (logique existante)
  if (processedText[i] === 'I') {
    const isRomanNumeralContext = (
      (i === 0 || !isAlphabetic(processedText[i - 1]) || ['V', 'X', 'L', 'C', 'D', 'M', 'I', 'S'].includes(processedText[i - 1])) &&
      (i + 1 === processedText.length || !isAlphabetic(processedText[i + 1]) || ['V', 'X', 'L', 'C', 'D', 'M', 'I', 'S'].includes(processedText[i + 1]))
    );

    if (isRomanNumeralContext) {
      translation += 'I';
    } else {
      // Cas par défaut : traiter comme un caractère normal
      translation += 'I';
    }
    i += 1;
    continue;
  }
}

    // Handle cases for '1'
    if (processedText[i] === '1') {
      if (shouldTransform1ToJ(i, processedText)) {
        if ((i === 0 || isUppercaseLetter(processedText[i - 1])) &&
            i + 1 < processedText.length && isUppercaseLetter(processedText[i + 1])) {
          translation += 'J';
        } else {
          translation += 'j';
        }
      } else if (i + 1 < processedText.length && isLowerCaseLatinLetter(processedText[i + 1])) {
        translation += 'j';
      } else {
        translation += '1';
      }
      i += 1;
      continue;
    }

    // Handle cases for 'ӀIӏІ1'
    if (['І', '1'].includes(processedText[i])) {
      // Handle multiple consecutive characters
      if (i + 2 < processedText.length && processedText[i] === processedText[i + 1] && processedText[i] === processedText[i + 2]) {
        translation += processedText[i].repeat(3);
        i += 3;
        continue;
      }

      // Handle two consecutive characters
      if (i + 1 < processedText.length && processedText[i] === processedText[i + 1]) {
        if ((i === 0 || !isAlphabetic(processedText[i - 1])) &&
            (i + 2 >= processedText.length || !isAlphabetic(processedText[i + 2]))) {
          translation += processedText[i].repeat(2);
          i += 2;
          continue;
        }

        // Check if characters are adjacent to specified letters
        if ((i > 0 && ['V', 'X', 'L', 'C', 'D', 'M', 'I'].includes(processedText[i - 1])) ||
            (i + 2 < processedText.length && ['V', 'X', 'L', 'C', 'D', 'M', 'I'].includes(processedText[i + 2]))) {
          translation += processedText[i] + processedText[i + 1];
        } else {
          translation += 'jj';
        }
        i += 2;
        continue;
      }
    }

    // Handle 'Я', 'Ю' uppercase context
    if (processedText[i] === 'Я' && ((i > 0 && isUppercaseLetter(processedText[i - 1])) ||
        (i + 1 < processedText.length && isUppercaseLetter(processedText[i + 1])))) {
      translation += 'YA';
      i += 1;
      continue;
    }

    if (processedText[i] === 'Ю' && ((i > 0 && isUppercaseLetter(processedText[i - 1])) ||
        (i + 1 < processedText.length && isUppercaseLetter(processedText[i + 1])))) {
      translation += 'YU';
      i += 1;
      continue;
    }

    // Traitement du 'ь' seul
    if (processedText[i] === 'ь' || processedText[i] === 'Ь') {
      // Ne rien ajouter à la traduction (le supprimer)
      i += 1;
      continue;
    }

    // Traitement du 'ъ' seul
    if (processedText[i] === 'ъ' || processedText[i] === 'Ъ') {
      translation += processedText[i] === 'Ъ' ? 'Ə' : 'ə';
      i += 1;
      continue;
    }

    // ===== ALPHABET DE BASE (EN DERNIER) =====
    // Handle regular alphabet characters
    const lowerChar = processedText[i].toLowerCase();
    if (currentAlphabet[lowerChar]) {
      if (processedText[i] === processedText[i].toUpperCase()) {
        translation += currentAlphabet[lowerChar].charAt(0).toUpperCase() + currentAlphabet[lowerChar].slice(1);
      } else {
        translation += currentAlphabet[lowerChar];
      }
    } else {
      translation += processedText[i];
    }

    i += 1;
  }

  // Dernière étape : е / Е cyrilliques (U+0435 / U+0415) -> e / E latins.
  // Aucune règle ne les convertissait : la sortie « latine » gardait des homoglyphes cyrilliques
  // invisibles (recherche, copier-coller et synthèse vocale cassés). Faite ICI, après tout le
  // pipeline, car la détection du contexte cyrillique des « I » latins s'appuie sur les lettres
  // cyrilliques restantes : la déplacer plus tôt change la sortie de mots comme « тIехь ».
  translation = translation.replace(/е/g, 'e').replace(/Е/g, 'E');

  console.log("=== FIN TRADUCTION ===");
  return translation;
}
