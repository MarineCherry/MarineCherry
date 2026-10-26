/*
 * Lecture et écriture des archives ZIP (fichiers Word .docx, regroupement de courriers).
 * Lecture : entrées « stockées » ou compressées (deflate), décompressées avec DecompressionStream
 * (navigateur) ou zlib (Node, pour les tests). Écriture : entrées stockées, sans compression.
 * Aucune bibliothèque externe, aucun accès internet.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else {
    root.Atelier = root.Atelier || {};
    root.Atelier.zip = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const enc = new TextEncoder();
  const dec = new TextDecoder('utf-8');

  const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  async function inflate(bytes) {
    if (typeof DecompressionStream === 'function') {
      const flux = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(flux).arrayBuffer());
    }
    // eslint-disable-next-line no-undef
    return new Uint8Array(require('zlib').inflateRawSync(bytes));
  }

  // Contenu de l'archive : { 'word/document.xml': Uint8Array, … }
  async function lire(donnees) {
    const b = donnees instanceof Uint8Array ? donnees : new Uint8Array(donnees);
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let fin = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
      if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
    }
    if (fin < 0) throw new Error('Ce fichier n\'est pas un document Word (.docx) valide.');
    const nb = v.getUint16(fin + 10, true);
    let p = v.getUint32(fin + 16, true);
    const out = {};
    for (let k = 0; k < nb; k++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new Error('Archive endommagée.');
      const methode = v.getUint16(p + 10, true);
      const taille = v.getUint32(p + 20, true);
      const lNom = v.getUint16(p + 28, true), lExtra = v.getUint16(p + 30, true), lCom = v.getUint16(p + 32, true);
      const local = v.getUint32(p + 42, true);
      const nom = dec.decode(b.subarray(p + 46, p + 46 + lNom));
      p += 46 + lNom + lExtra + lCom;
      if (nom.endsWith('/')) continue;
      const debut = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const brut = b.subarray(debut, debut + taille);
      out[nom] = methode === 0 ? brut.slice() : await inflate(brut);
    }
    return out;
  }

  // fichiers : { nom: Uint8Array | chaîne } → Uint8Array (archive ZIP)
  function ecrire(fichiers) {
    const parties = [], central = [];
    let offset = 0;
    const date = new Date();
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
    const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    Object.keys(fichiers).forEach((nom) => {
      const data = typeof fichiers[nom] === 'string' ? enc.encode(fichiers[nom]) : fichiers[nom];
      const n = enc.encode(nom);
      const crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, n.length, true); h.setUint16(28, 0, true);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, n.length, true);
      c.setUint32(42, offset, true);
      parties.push(new Uint8Array(h.buffer), n, data);
      central.push(new Uint8Array(c.buffer), n);
      offset += 30 + n.length + data.length;
    });
    const tailleCentral = central.reduce((t, x) => t + x.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    const nb = Object.keys(fichiers).length;
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, nb, true); e.setUint16(10, nb, true);
    e.setUint32(12, tailleCentral, true); e.setUint32(16, offset, true);
    const tout = parties.concat(central, [new Uint8Array(e.buffer)]);
    const res = new Uint8Array(tout.reduce((t, x) => t + x.length, 0));
    let i = 0;
    tout.forEach((x) => { res.set(x, i); i += x.length; });
    return res;
  }

  const texte = (bytes) => dec.decode(bytes);
  const octets = (s) => enc.encode(s);

  return { lire, ecrire, crc32, texte, octets };
});
