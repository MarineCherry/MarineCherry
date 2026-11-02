/*
 * Ajoute un numéro de version aux scripts et feuilles de style de index.html (« ?v=… »), pour que
 * les navigateurs chargent la nouvelle version après chaque mise à jour au lieu de garder l'ancienne en mémoire.
 * Usage : npm run version
 */
'use strict';
const fs = require('fs');
const path = require('path');
const fichier = path.join(__dirname, '..', 'index.html');
const d = new Date();
const v = d.toISOString().replace(/[-:T]/g, '').slice(0, 12);
const html = fs.readFileSync(fichier, 'utf8').replace(/((?:src|href)="assets\/[^"?]+\.(?:js|css))(?:\?v=[^"]*)?"/g, '$1?v=' + v + '"');
fs.writeFileSync(fichier, html);
console.log('Version ' + v);
