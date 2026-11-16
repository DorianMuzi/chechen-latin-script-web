/*
 * Chechen Latin Script (web) — couche d'adaptation du moteur de l'extension.
 *
 * Le moteur (transliterate.js) a été écrit pour une extension de navigateur : il lit ses listes avec
 * fetch(chrome.runtime.getURL(fichier)). Ici, les listes sont embarquées dans data.js (window.CLS_DATA) et servies
 * par ce petit remplaçant de fetch : le site fonctionne donc hors ligne, et même ouvert depuis un fichier local.
 *
 * Copyright 2026 LinguaCE — Apache License 2.0
 */
(function () {
  'use strict';
  window.chrome = window.chrome || {};
  window.chrome.runtime = window.chrome.runtime || {};
  if (typeof window.chrome.runtime.getURL !== 'function') {
    window.chrome.runtime.getURL = function (file) { return file; };
  }

  var realFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  window.fetch = function (url, options) {
    var name = String(url).split('?')[0].split('/').pop();
    var data = window.CLS_DATA;
    if (data && Object.prototype.hasOwnProperty.call(data, name)) {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: function () { return Promise.resolve(data[name]); }
      });
    }
    return realFetch ? realFetch(url, options) : Promise.reject(new Error('fetch indisponible'));
  };

  // Le moteur journalise beaucoup (utile dans l'extension, inutile ici) : silence, sauf avec ?debug dans l'adresse
  if (!/[?&]debug\b/.test(window.location.search)) {
    window.console.log = function () {};
  }
})();
