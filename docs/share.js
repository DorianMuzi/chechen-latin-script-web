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
// Partage (2.7) : logique commune à la popup/au panneau de l'extension ET au site web (le site copie ce fichier à la génération).
// Rien n'est envoyé : un clic ouvre la page de partage du service choisi (adresse construite ici) ; la personne relit et envoie.
// Ce fichier ne touche pas à la page : il fabrique seulement des adresses et des listes de choix.
//
// Deux contextes (ctx.mode) :
//  - 'ext' (extension) : « Partager » envoie UNIQUEMENT le texte converti (aucun lien) ; « Partager le projet » envoie le lien de
//    l'extension dans le magasin (Chrome Web Store ou Firefox AMO, selon le navigateur).
//  - 'web' (site)      : « Partager » envoie le texte converti + l'adresse du site (et propose un lien qui contient le texte) ;
//    « Partager le projet » envoie l'adresse du site.
(function (root) {
  'use strict';

  var PROJECT_URL = 'https://dorianmuzi.github.io/chechen-latin-script-web/';
  // Adresses de l'extension dans les magasins (sans code de langue : chaque magasin affiche la page dans la langue de la personne).
  // Si une adresse est vide, le partage du projet depuis l'extension renvoie, par défaut, vers l'adresse du site.
  var STORE = {
    chrome: 'https://chromewebstore.google.com/detail/chechen-latin-script/gkacmephckndedlofhigjikcnchpipcn',
    firefox: 'https://addons.mozilla.org/firefox/addon/chechen-latin-script/'
  };
  var LINK_MAX = 600;    // au-delà de ce nombre de lettres (texte d'origine), pas de lien « avec le texte » (adresse trop longue)
  var X_MAX = 220;       // X limite à 280 caractères, adresse comprise
  var X_MAX_TEXT_ONLY = 270;   // sans adresse : un peu plus de place
  var IN_MAX = 4000;     // à la lecture d'un lien : on ignore tout ce qui dépasse (caractères de l'adresse)
  var TEXT_MAX = 2000;   // et le texte décodé est coupé à ce nombre de lettres

  function isFirefox() {
    try { return /Firefox\//.test(navigator.userAgent || ''); } catch (e) { return false; }
  }

  // Adresse de l'extension dans le magasin du navigateur utilisé (Firefox : AMO ; Chrome, Edge, Brave… : Chrome Web Store)
  function storeUrl() {
    var u = isFirefox() ? STORE.firefox : STORE.chrome;
    return (typeof u === 'string' && /^https:\/\//.test(u)) ? u : PROJECT_URL;
  }

  // Lien « avec le texte » (site) : le texte d'origine (UTF-8) en base64 adapté aux adresses, dans la partie après « # »
  // (cette partie n'est jamais envoyée à un serveur).
  function b64urlEncode(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64urlDecode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }

  // Texte contenu dans une adresse (« #t=… »), ou '' s'il n'y en a pas ou s'il est invalide. Le texte n'est jamais interprété
  // comme du code de page : l'appelant le place seulement dans un champ de saisie (value).
  function readSharedText(hash) {
    var m = /^#t=([A-Za-z0-9_-]+)$/.exec(hash || '');
    if (!m || m[1].length > IN_MAX) return '';
    try { return b64urlDecode(m[1]).slice(0, TEXT_MAX); } catch (e) { return ''; }
  }

  // ctx : { source, result, tagline, mode } — source = texte cyrillique saisi, result = texte latin obtenu, tagline = sous-titre traduit
  function dataFor(kind, ctx) {
    ctx = ctx || {};
    var ext = ctx.mode === 'ext';
    if (kind === 'project') {
      var url = ext ? storeUrl() : PROJECT_URL;
      return { text: 'Chechen Latin Script — ' + (ctx.tagline || ''), url: url, link: url, facebook: true };
    }
    var result = String(ctx.result || '').trim();
    // Extension : le texte converti SEUL, sans aucun lien
    if (ext) return { text: result, url: '', link: '', facebook: false };
    var source = String(ctx.source || '').trim();
    // Site. Facebook ne reprend pas de texte libre (seulement une adresse) : absent du partage d'un résultat
    return { text: result, url: PROJECT_URL, link: (source && source.length <= LINK_MAX) ? PROJECT_URL + '#t=' + b64urlEncode(source) : '', facebook: false };
  }

  // Liste des choix, dans l'ordre d'affichage. labels : { link, more } (textes traduits) ; canShare : navigator.share existe.
  // Instagram et TikTok n'ont pas de lien de partage depuis un navigateur : ils passent par le menu du téléphone, par « Plus »
  // ou par « Copier le lien ».
  function itemsFor(kind, ctx, labels, canShare) {
    var d = dataFor(kind, ctx), q = encodeURIComponent, items = [];
    var max = d.url ? X_MAX : X_MAX_TEXT_ONLY;
    var xText = d.text.length > max ? d.text.slice(0, max - 1).replace(/\s+$/, '') + '…' : d.text;
    if (d.url) {
      items.push({ id: 'whatsapp', label: 'WhatsApp', href: 'https://wa.me/?text=' + q(d.text + '\n' + d.url) });
      items.push({ id: 'telegram', label: 'Telegram', href: 'https://t.me/share/url?url=' + q(d.url) + '&text=' + q(d.text) });
      items.push({ id: 'x', label: 'X', href: 'https://x.com/intent/post?text=' + q(xText) + '&url=' + q(d.url) });
    } else {
      // Texte seul. Telegram : sa page de partage exige un paramètre « url » ; on y place le texte lui-même (le message envoyé
      // est alors exactement ce texte, sans lien).
      items.push({ id: 'whatsapp', label: 'WhatsApp', href: 'https://wa.me/?text=' + q(d.text) });
      items.push({ id: 'telegram', label: 'Telegram', href: 'https://t.me/share/url?url=' + q(d.text) });
      items.push({ id: 'x', label: 'X', href: 'https://x.com/intent/post?text=' + q(xText) });
    }
    if (d.facebook) items.push({ id: 'facebook', label: 'Facebook', href: 'https://www.facebook.com/sharer/sharer.php?u=' + q(d.url) });
    if (d.link) items.push({ id: 'copy', label: labels.link, copy: d.link });
    if (canShare) items.push({ id: 'more', label: labels.more, native: true });
    return items;
  }

  // Données pour le menu de partage du système (navigator.share) : « url » seulement s'il y en a une
  function nativeData(kind, ctx) {
    var d = dataFor(kind, ctx), o = { title: 'Chechen Latin Script', text: d.text };
    if (d.url) o.url = d.url;
    return o;
  }

  root.CLS_SHARE = {
    PROJECT_URL: PROJECT_URL, STORE: STORE, LINK_MAX: LINK_MAX, X_MAX: X_MAX,
    b64urlEncode: b64urlEncode, b64urlDecode: b64urlDecode, readSharedText: readSharedText,
    storeUrl: storeUrl, data: dataFor, items: itemsFor, nativeData: nativeData
  };
})(typeof window !== 'undefined' ? window : this);
