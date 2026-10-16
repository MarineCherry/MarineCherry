/*
 * Lecture d'un mail d'agence, d'une offre d'achat ou d'un compromis : repérage des informations utiles
 * (parties, bien, prix, honoraires, financement, notaires, pièces jointes reçues).
 * Le texte est analysé sur le poste ; rien n'est envoyé sur internet.
 * Fonctions pures : testables sous Node.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else {
    root.Atelier = root.Atelier || {};
    root.Atelier.engines = root.Atelier.engines || {};
    root.Atelier.engines.extraction = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const sansAccent = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const propre = (s) => (s || '').replace(/<mailto:[^>]*>/gi, '').replace(/<https?:[^>]*>/gi, '').replace(/[ \t ]+/g, ' ').trim();

  // « 282 000 € » / « 282.000,00 euros » → 282000
  function montant(s) {
    const m = /(\d{1,3}(?:[ .  ]\d{3})+|\d+)(?:,(\d{1,2}))?\s*(?:€|euros?|eur\b)/i.exec(s || '');
    if (!m) return null;
    return Number(m[1].replace(/[ .  ]/g, '') + (m[2] ? '.' + m[2] : ''));
  }
  function tousMontants(s) {
    const re = /(\d{1,3}(?:[ .  ]\d{3})+|\d+)(?:,(\d{1,2}))?\s*(?:€|euros?|eur\b)/gi;
    const out = [];
    let m;
    while ((m = re.exec(s || ''))) out.push({ valeur: Number(m[1].replace(/[ .  ]/g, '') + (m[2] ? '.' + m[2] : '')), index: m.index, fin: re.lastIndex });
    return out;
  }

  // « 12 rue des Lilas 84 100 Orange » → { adresse, codePostal, commune }
  function adresse(s) {
    const t = propre(s);
    const m = /^(.*?)[,\s–-]+(\d{2})\s?(\d{3})\s+([A-Za-zÀ-ÿ' -]+?)(?:\s*cedex.*)?$/i.exec(t);
    if (!m) return { adresse: t, codePostal: '', commune: '' };
    return { adresse: m[1].replace(/[,\s–-]+$/, ''), codePostal: m[2] + m[3], commune: m[4].trim() };
  }

  /* ---------- Mail au format .eml (MIME) ---------- */
  function decodeQP(s) {
    return s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, x) => String.fromCharCode(parseInt(x, 16)));
  }
  function bytesToString(bin, charset) {
    try {
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0) & 255);
      return new TextDecoder(/utf-?8/i.test(charset || 'utf-8') ? 'utf-8' : charset).decode(bytes);
    } catch (e) {
      return bin;
    }
  }
  const b64 = (s) => (typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'));
  // En-têtes encodés « =?UTF-8?B?...?= » ou « =?UTF-8?Q?...?= »
  function decodeEntete(s) {
    return (s || '').replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_, cs, enc, txt) =>
      bytesToString(enc.toUpperCase() === 'B' ? b64(txt) : decodeQP(txt.replace(/_/g, ' ')), cs)).replace(/\?=\s+=\?/g, '');
  }
  function entetes(bloc) {
    const h = {};
    bloc.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).forEach((l) => {
      const i = l.indexOf(':');
      if (i > 0) h[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
    });
    return h;
  }
  function partie(brut) {
    const i = brut.search(/\r?\n\r?\n/);
    const h = entetes(i < 0 ? brut : brut.slice(0, i));
    const corps = i < 0 ? '' : brut.slice(i).replace(/^\r?\n\r?\n/, '');
    return { h, corps };
  }
  function lireEml(texte) {
    const racine = partie(texte);
    const res = { sujet: decodeEntete(racine.h.subject), expediteur: decodeEntete(racine.h.from), date: racine.h.date || '', corps: '', html: '', piecesJointes: [] };
    (function parcourir(p) {
      const ct = p.h['content-type'] || 'text/plain';
      const bound = /boundary="?([^";]+)"?/i.exec(ct);
      if (/multipart\//i.test(ct) && bound) {
        p.corps.split('--' + bound[1]).slice(1).forEach((morceau) => {
          if (/^--/.test(morceau)) return;
          parcourir(partie(morceau.replace(/^\r?\n/, '')));
        });
        return;
      }
      const disp = p.h['content-disposition'] || '';
      const nom = /filename\*?="?([^";]+)"?/i.exec(disp) || /name="?([^";]+)"?/i.exec(ct);
      if (/attachment/i.test(disp) || (nom && !/text\/(plain|html)/i.test(ct))) {
        res.piecesJointes.push(decodeEntete(nom ? nom[1] : 'pièce jointe'));
        return;
      }
      const enc = (p.h['content-transfer-encoding'] || '').toLowerCase();
      const cs = (/charset="?([^";]+)"?/i.exec(ct) || [])[1];
      let txt = p.corps;
      if (enc === 'base64') txt = bytesToString(b64(txt.replace(/\s+/g, '')), cs);
      else if (enc === 'quoted-printable') txt = bytesToString(decodeQP(txt), cs);
      if (/text\/html/i.test(ct)) res.html += txt;
      else if (/text\/plain/i.test(ct)) res.corps += txt;
    })(racine);
    if (!res.corps && res.html) res.corps = htmlEnTexte(res.html);
    return res;
  }
  function htmlEnTexte(html) {
    return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
  }

  /* ---------- Pièces jointes reconnues ---------- */
  const PIECES = [
    { id: 'identite', re: /\b(ci|cni)\b|carte d.?identit|passeport|pi[eè]ce d.?identit|titre de s[ée]jour/i },
    { id: 'diagnostics', re: /diagnostic|\bddt\b|\bdpe\b|amiante|termite|plomb|crep\b|[ée]lectricit|\berp\b|etat des risques|carrez/i },
    { id: 'titre', re: /titre de propri|acte d.?acquisition|acte de vente|attestation (de propri|immobili)/i },
    { id: 'taxeFonciere', re: /taxe fonci/i },
    { id: 'reglementCopro', re: /r[eè]glement de copro|\brcp\b|\bedd\b|[ée]tat descriptif/i },
    { id: 'preEtatDate', re: /pr[ée].?[ée]tat dat/i },
    { id: 'etatDate', re: /(^|[^r])[ée]tat dat[ée]/i },
    { id: 'cadastre', re: /cadastr|plan de situation/i },
    { id: 'etatCivilVendeurs', re: /acte de naissance|extrait de naissance|livret de famille/i },
    { id: 'contratMariage', re: /contrat de mariage|\bpacs\b/i },
    { id: 'statutsKbis', re: /\bkbis\b|k-bis|statuts/i },
    { id: 'offrePret', re: /offre de pr[eê]t/i },
  ];
  function piecesReconnues(noms) {
    const out = [];
    (noms || []).forEach((n) => {
      const nom = n.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_]+/g, ' ');
      const p = PIECES.find((x) => x.re.test(nom));
      out.push({ fichier: n, piece: p ? p.id : null });
    });
    return out;
  }

  /* ---------- Analyse du texte ---------- */
  const CIVILITE = /^(monsieur|madame|mademoiselle|m\.|mme|mlle|mr)\s+/i;
  const RUBRIQUES = [
    { id: 'vendeurs', re: /^(les\s+)?vendeurs?\b|^(le|la)\s+vendeu(r|se)\b|^propri[ée]taires?\s*(vendeurs?)?\s*:/i },
    { id: 'acquereurs', re: /^(les\s+)?acqu[ée]reurs?\b|^(l.)?acqu[ée]reu(r|se)\b|^acheteurs?\b/i },
    { id: 'financement', re: /^(d[ée]tails?\s+)?financement\s*:?\s*$|^d[ée]tails?\s+financement/i },
    { id: 'bien', re: /^(informations?\s+)?(sur\s+le\s+)?bien(\s+vendu)?\s*:?\s*$|^informations?\s+bien|^d[ée]signation\s*:?\s*$/i },
  ];
  // Libellés « clé : valeur » reconnus (sans accents, en minuscules).
  const CLES = [
    ['adresseBien', /^adresse (du )?bien( vendu)?$/],
    ['adresse', /^adresse( postale)?$|^domicile$|^(demeurant|domicilie\(?e?\)?|domiciliee)( au| a| a l.adresse)?$/],
    ['telephone', /^(tel|telephone|portable|mobile)\.?$/],
    ['email', /^(e-?mail|courriel|mail)$/],
    ['profession', /^profession$/],
    ['naissance', /^(date (et lieu )?de naissance|ne\(?e?\)? le)$/],
    ['situation', /^(situation (familiale|matrimoniale)|regime matrimonial)$/],
    ['typeBien', /^(type|nature)( de bien| du bien)?$/],
    ['cadastre', /^(cadastre|cadastree?|references? cadastrales?|parcelles?)$/],
    ['prixNet', /^prix net( vendeur)?$|^net vendeur$/],
    ['prix', /^prix( de vente| d.?achat| propose| offert| fai| frais d.?agence inclus)?$/],
    ['honoraires', /^(honoraires|commission|frais d.?agence)$/],
    ['depot', /^(depot de garantie|sequestre|acompte)$/],
    ['financement', /^(financement|mode de financement|pret|credit)$/],
    ['mandat', /^mandat( de vente)?( n.?)?/],
    ['surface', /^(surface( habitable)?|superficie)$/],
    ['lots', /^lots?( de copropriete)?( n.?)?$/],
    ['dateSignature', /^(date (de signature|souhaitee|de la promesse|du compromis)|signature)$/],
  ];
  function cleDe(libelle) {
    const l = sansAccent(libelle).toLowerCase().replace(/[^a-z0-9 .'()-]/g, '').replace(/\s+/g, ' ').trim();
    const c = CLES.find((x) => x[1].test(l));
    return c ? c[0] : null;
  }

  function personneVide(nom, qualite) {
    return { nom: nom || '', qualite: qualite || 'personne', civilite: '', adresse: '', codePostal: '', commune: '', telephone: '', email: '', profession: '', situation: '', representants: '' };
  }
  // Prénom avant le NOM : « MARTIN Paul » → « Paul MARTIN » (le nom est repéré par ses capitales).
  function prenomAvantNom(s) {
    const mots = (s || '').split(/\s+/).filter(Boolean);
    const estNom = (m) => m.length > 1 && m === m.toUpperCase() && /[A-ZÀ-Ý]/.test(m);
    const noms = mots.filter(estNom);
    const prenoms = mots.filter((m) => !estNom(m));
    if (!noms.length || !prenoms.length) return mots.join(' ');
    return prenoms.concat(noms).join(' ');
  }
  // « Monsieur MARTIN Paul » → { civilite: 'M.', nom: 'Paul MARTIN' }
  function lireNom(l) {
    const m = CIVILITE.exec(l);
    const civ = m ? (/^(madame|mme|mademoiselle|mlle)/i.test(m[1]) ? 'Mme' : 'M.') : '';
    return { civilite: civ, nom: prenomAvantNom(propre(l.replace(CIVILITE, '')).replace(/[,:;.]+$/, '')) };
  }
  const estTelephone = (l) => /^[\d\s.+()-]{9,20}$/.test(l) && /^(0[1-9]|33[1-9])\d{7,9}$/.test(l.replace(/\D/g, '').replace(/^0033/, '33'));
  const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
  // « Claire ROUX » : nom en capitales, sans chiffre ni deux-points (prénom puis NOM).
  function nomSansCivilite(l) {
    if (/[:@\d]/.test(l) || l.length > 60) return null;
    const mots = l.replace(/[,;.]+$/, '').split(/\s+/);
    if (mots.length < 2 || mots.length > 6) return null;
    const maj = mots.filter((m) => m.length > 1 && m === m.toUpperCase() && /[A-ZÀ-Ý]/.test(m));
    if (!maj.length) return null;
    const autres = mots.filter((m) => !maj.includes(m));
    if (autres.some((m) => !/^[A-ZÀ-Ý][a-zà-ÿ'-]+$/.test(m))) return null;
    return autres.concat(maj).join(' ');
  }
  const SOCIETE = /(^|\s)(SCI|SARL|SAS|SASU|EURL|SA|SNC|SCP|SCEA|GFA|SELARL|Soci[ée]t[ée]|SOCI[ÉE]T[ÉE])(\s|$)/;

  function extraire(doc) {
    const texte = (doc.corps || '').replace(/\r/g, '');
    const lignes = texte.split('\n').map((l) => propre(l));
    const res = {
      type: 'vente', vendeurs: [], acquereurs: [], bien: {}, prix: {}, financement: {}, agence: {}, notaires: [], dates: {},
      piecesJointes: piecesReconnues(doc.piecesJointes), trouve: [], sujet: doc.sujet || '',
    };
    if (/succession|d[ée]c[eè]s/i.test(doc.sujet || '') && !/vente|promesse|compromis|offre/i.test(doc.sujet || '')) res.type = 'succession';

    let rubrique = null;
    let courant = null;
    const valeurs = {};
    const fin = /^(bien cordialement|cordialement|bien [àa] vous|sinc[eè]res salutations|respectueusement|salutations distingu[ée]es|--)/i;
    // Mail transféré : l'expéditeur d'origine est dans le corps (« De : … »).
    let debut = 0;
    let expediteurOrigine = '';
    for (let i = 0; i < Math.min(lignes.length, 60); i++) {
      const m = /^(de|from)\s*:\s*(.+)$/i.exec(lignes[i]);
      if (m && lignes.slice(i + 1, i + 6).some((x) => /^(envoy[ée]|sent|date|[àa]|to|objet|subject)\s*:/i.test(x))) {
        expediteurOrigine = m[2];
        let j = i + 1;
        while (j < lignes.length && (/^(envoy[ée]|sent|date|[àa]|to|cc|objet|subject|importance)\s*:/i.test(lignes[j]) || !lignes[j])) j++;
        debut = j;
        break;
      }
    }
    for (let i = debut; i < lignes.length; i++) {
      const l = lignes[i].replace(/^[-–•*·]\s*/, '');
      if (!l) continue;
      if (fin.test(l)) {
        // Signature : nom de l'expéditeur, puis (après « -- ») le nom de l'agence et ses coordonnées.
        const sig = lignes.slice(i + 1).filter(Boolean);
        if (sig[0] && sig[0].length < 60 && !/@|http|^-+$/.test(sig[0]) && !estTelephone(sig[0])) res.agence.contact = sig[0];
        const sep = sig.findIndex((x) => /^-{2,}\s*$/.test(x));
        const bloc = sep >= 0 ? sig.slice(sep + 1, sep + 6) : sig.slice(0, 6);
        if (sep >= 0 && bloc[0] && !/@|http/.test(bloc[0]) && !estTelephone(bloc[0]) && bloc[0].length < 60) res.agence.nomSignature = bloc[0];
        const tel = sig.slice(0, 8).find(estTelephone);
        if (tel) res.agence.telephone = tel;
        const mail = sig.slice(0, 8).map((x) => (EMAIL.exec(x) || [])[0]).find(Boolean);
        if (mail) res.agence.emailSignature = mail;
        break;
      }
      // Bien : « l'appartement situé : » puis l'adresse (sur la même ligne ou la suivante).
      const situe = /\b(appartement|maison|villa|terrain|local|immeuble|studio|bien)\b.*\b(situ[ée]e?s?|sise?)(?=[\s:]|$)\s*(?:au|[àa])?\s*:?\s*(.*)$/i.exec(l);
      if (situe && !valeurs.adresseBien) {
        const suite = situe[3] || (lignes.slice(i + 1).find(Boolean) || '');
        if (/\d{2}\s?\d{3}\s+\S/.test(suite)) {
          valeurs.adresseBien = suite;
          if (!valeurs.typeBien) valeurs.typeBien = situe[1];
        }
      }
      // À compléter : « Il manque au dossier : … ».
      if (/^il manque/i.test(l)) {
        res.aSuivre = [];
        for (let j = i + 1; j < lignes.length && res.aSuivre.length < 10; j++) {
          if (!lignes[j]) continue;
          if (!/^[-–•*·]/.test(lignes[j])) break;
          res.aSuivre.push(lignes[j].replace(/^[-–•*·]\s*/, ''));
        }
        continue;
      }
      const rub = RUBRIQUES.find((r) => r.re.test(sansAccent(l).replace(/\s+/g, ' ')) || r.re.test(l));
      if (rub && l.length < 120) {
        rubrique = rub.id;
        courant = null;
        // « ACQUÉREURS : SCI LES OLIVIERS représentée par »
        const apres = l.replace(/^[^:]*:\s*/, l.includes(':') ? '' : l);
        if ((rubrique === 'vendeurs' || rubrique === 'acquereurs') && l.includes(':') && apres && !CIVILITE.test(apres)) {
          const soc = SOCIETE.test(apres);
          const nom = apres.replace(/\s*(repr[ée]sent[ée]e?s?|prise? en la personne).*$/i, '').trim();
          if (nom) {
            courant = personneVide(nom, soc ? 'societe' : 'personne');
            res[rubrique].push(courant);
            if (soc) courant.representantsEnCours = true;
          }
        }
        continue;
      }
      const partie = rubrique === 'vendeurs' || rubrique === 'acquereurs';
      // Téléphone ou e-mail seuls sur leur ligne.
      if (partie && courant && estTelephone(l)) { if (!courant.telephone) courant.telephone = l; continue; }
      if (partie && courant && EMAIL.test(l) && !/:/.test(l.replace(/<mailto:[^>]*>/, ''))) { if (!courant.email) courant.email = EMAIL.exec(l)[0]; continue; }
      // Personne : ligne commençant par une civilité, ou nom en capitales seul sur sa ligne.
      const sansCiv = partie && !CIVILITE.test(l) ? nomSansCivilite(l) : null;
      if (partie && ((CIVILITE.test(l) && !/:/.test(l)) || sansCiv)) {
        const n = sansCiv ? { civilite: '', nom: sansCiv } : lireNom(l);
        const liste = res[rubrique];
        const soc = liste.find((x) => x.qualite === 'societe' && x.representantsEnCours);
        if (soc) {
          soc.representants = soc.representants ? soc.representants + ' et ' + (n.civilite ? n.civilite + ' ' : '') + n.nom : (n.civilite ? n.civilite + ' ' : '') + n.nom;
        }
        courant = Object.assign(personneVide(n.nom), { civilite: n.civilite, representantDe: soc ? soc.nom : '' });
        if (!soc) liste.push(courant);
        else (soc.membres = soc.membres || []).push(courant);
        continue;
      }
      const kv = /^([^:]{2,45}?)\s*:\s*(.*)$/.exec(l);
      if (kv) {
        const cle = cleDe(kv[1]);
        let v = kv[2];
        // Valeur sur la ligne suivante.
        if (!v && lignes[i + 1]) v = lignes[i + 1];
        if (!cle) continue;
        if (courant && ['adresse', 'telephone', 'email', 'profession', 'naissance', 'situation'].includes(cle) && (rubrique === 'vendeurs' || rubrique === 'acquereurs')) {
          if (cle === 'adresse') Object.assign(courant, adresse(v));
          else if (cle === 'email') courant.email = (/[\w.+-]+@[\w-]+\.[\w.-]+/.exec(v) || [''])[0];
          else if (cle === 'situation') courant.situation = situation(v);
          else courant[cle] = v;
          continue;
        }
        if (!(cle in valeurs)) valeurs[cle] = v;
      }
    }
    // Les membres d'une société représentante ne sont pas des parties : on garde leurs coordonnées sur la société.
    ['vendeurs', 'acquereurs'].forEach((r) => res[r].forEach((x) => {
      delete x.representantsEnCours;
      if (x.membres && x.membres.length) {
        const m = x.membres[0];
        ['adresse', 'codePostal', 'commune', 'telephone', 'email'].forEach((k) => { if (!x[k]) x[k] = m[k]; });
      }
    }));

    // Bien.
    if (valeurs.adresseBien) Object.assign(res.bien, adresse(valeurs.adresseBien));
    if (valeurs.typeBien) {
      const t = sansAccent(valeurs.typeBien).toLowerCase();
      res.bien.description = valeurs.typeBien;
      res.bien.type = /appartement|studio|\bt\d\b|duplex/.test(t) ? 'appartement' : /terrain/.test(t) && !/maison|villa/.test(t) ? 'terrain'
        : /maison|villa|pavillon|mas\b|bastide/.test(t) ? 'maison' : /local|commerce|bureau/.test(t) ? 'local' : /immeuble/.test(t) ? 'immeuble' : '';
      if (/copropriete/.test(t)) res.bien.copro = true;
      const hab = /(\d+(?:[.,]\d+)?)\s*m(?:²|2)\s*(?:habitables?)/i.exec(valeurs.typeBien);
      if (hab) res.bien.surface = Number(hab[1].replace(',', '.'));
    }
    if (valeurs.surface && !res.bien.surface) {
      const s = /(\d+(?:[.,]\d+)?)/.exec(valeurs.surface);
      if (s) res.bien.surface = Number(s[1].replace(',', '.'));
    }
    if (valeurs.cadastre) {
      const c = /(?:section\s+)?([A-Z]{1,2})\s*(?:n[°o]\s*)?(\d+(?:\s*(?:,|et)\s*\d+)*)/i.exec(valeurs.cadastre);
      if (c) res.bien.cadastre = c[1].toUpperCase() + ' ' + c[2].replace(/\s+/g, ' ');
      const cont = /(\d+\s*ha\s*)?(\d+\s*a\s*)?(\d+\s*ca)/i.exec(valeurs.cadastre);
      if (cont) res.bien.contenance = cont[0].replace(/\s+/g, ' ').trim();
    }
    if (valeurs.lots) res.bien.lots = valeurs.lots;
    if (/copropri[ée]t[ée]/i.test(texte) && res.bien.copro === undefined) res.bien.copro = true;
    if (res.bien.type === 'appartement' && res.bien.copro === undefined && /r[ée]sidence|\bb[aâ]t(iment)?\b|[ée]tage|\blot\b/i.test(valeurs.adresseBien || texte)) res.bien.copro = true;
    if (/travaux (de moins de (10|dix) ans|r[ée]cents?)|travaux r[ée]alis[ée]s depuis moins de (10|dix) ans/i.test(texte)) res.bien.travauxRecents = true;

    // Prix et honoraires : « 282 000 € commission comprise soit 274 000 € net vendeur et 8 000 € de commission à CHARGE VENDEURS ».
    if (valeurs.prix) {
      const v = valeurs.prix;
      const ms = tousMontants(v);
      const apres = (m) => sansAccent(v.slice(m.fin, m.fin + 40)).toLowerCase();
      const net = ms.find((m) => /^\s*(net vendeur|net)/.test(apres(m)));
      const fai = ms.find((m) => /^\s*(commission comprise|fai|frais d.?agence inclus|honoraires inclus|hai)/.test(apres(m)));
      const hon = ms.find((m) => m !== fai && /^\s*(de )?(commission|honoraires|frais d.?agence)/.test(apres(m)));
      res.prix.prix = (net || ms[0] || {}).valeur || null;
      if (fai) res.prix.prixFAI = fai.valeur;
      if (hon) res.prix.honoraires = hon.valeur;
      if (!hon && fai && net) res.prix.honoraires = fai.valeur - net.valeur;
      const charge = sansAccent(v).toLowerCase();
      if (/charge (des )?vendeurs?|charge du vendeur/.test(charge)) res.prix.chargeHonoraires = 'vendeur';
      else if (/charge (des )?acquereurs?|charge de l.?acquereur/.test(charge)) res.prix.chargeHonoraires = 'acquereur';
    }
    if (valeurs.prixNet) {
      const net = montant(valeurs.prixNet);
      const total = res.prix.prix;
      if (net) {
        res.prix.prix = net;
        if (total && total > net) res.prix.prixFAI = total;
      }
    }
    if (valeurs.honoraires && !res.prix.honoraires) res.prix.honoraires = montant(valeurs.honoraires);
    if (!res.prix.honoraires && res.prix.prixFAI && res.prix.prix) res.prix.honoraires = res.prix.prixFAI - res.prix.prix;
    if (valeurs.depot) res.financement.depotGarantie = montant(valeurs.depot);
    if (valeurs.financement) {
      const f = sansAccent(valeurs.financement).toLowerCase();
      res.financement.texte = valeurs.financement;
      res.financement.pret = /pas de (clause de )?(credit|pret)|sans (clause de )?(credit|pret)|comptant|fonds propres/.test(f) ? false : /pret|credit|emprunt/.test(f) ? true : null;
      const p = montant(valeurs.financement);
      if (p && res.financement.pret) res.financement.montantPret = p;
    }
    if (valeurs.mandat || /mandat de vente n/i.test(texte)) {
      const m = /mandat(?: de vente)?\s*n[°o]?\s*([\w-]+)(?:\s+du\s+(\d{2}\/\d{2}\/\d{4}))?/i.exec(texte);
      if (m) res.agence.mandat = m[1] + (m[2] ? ' du ' + m[2] : '');
    }

    // Notaires : « Maître X représentera … ».
    texte.split(/\n|(?<=\.)\s/).forEach((phrase) => {
      const re = /(?:[Mm]a[iî]tre|MA[IÎ]TRE|Me)\s+((?:[A-ZÀ-Ý][A-Za-zÀ-ÿ'-]*)(?:[\s-][A-ZÀ-Ý][A-Za-zÀ-ÿ'-]*)*)((?:\s*,)?\s*notaire\s+[àa]\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ' -]*?))?\s+(?:repr[ée]sentera|interviendra|assistera|pour)\s+(.{3,80}?)(?=\s+et\s+(?:[Mm]a[iî]tre|MA[IÎ]TRE|Me)\s|[.\n]|$)/g;
      let m;
      while ((m = re.exec(phrase))) {
        res.notaires.push({ nom: 'Maître ' + m[1].trim(), ville: (m[3] || '').trim(), pour: propre(m[4]).replace(/^(monsieur et madame|m\. et mme|mr et mme)\s+/i, 'M. et Mme ') });
      }
    });

    // Agence : expéditeur (d'origine si le mail a été transféré), signature, objet du mail.
    // Un expéditeur de l'étude (adresse notaires.fr ou interne Exchange) n'est pas l'agence.
    const exp = expediteurOrigine || doc.expediteur || '';
    const interne = /notaires\.fr|\/o=exchange/i.test(exp);
    const em = interne ? null : EMAIL.exec(exp);
    if (em) res.agence.email = em[0];
    else if (res.agence.emailSignature) res.agence.email = res.agence.emailSignature;
    const nomExp = interne ? '' : propre(exp.replace(/<[^>]*>/, '').replace(/"/g, '').replace(em ? em[0] : '', ''));
    if (nomExp) res.agence.nom = nomExp;
    if (res.agence.nomSignature) {
      if (nomExp && !res.agence.contact) res.agence.contact = nomExp;
      res.agence.nom = res.agence.nomSignature;
    }
    const agenceSujet = /^([^:]{2,40})\s*:/.exec((doc.sujet || '').replace(/^\s*((re|tr|fw|fwd)\s*:\s*)+/i, ''));
    if (agenceSujet && !/^(re|tr|fw|fwd)$/i.test(agenceSujet[1].trim())) res.agence.nom = agenceSujet[1].trim();
    delete res.agence.nomSignature;
    delete res.agence.emailSignature;

    // Résumé de ce qui a été trouvé.
    const t = res.trouve;
    if (res.vendeurs.length) t.push(res.vendeurs.length + ' vendeur(s)');
    if (res.acquereurs.length) t.push(res.acquereurs.length + ' acquéreur(s)');
    if (res.bien.adresse || res.bien.commune) t.push('adresse du bien');
    if (res.bien.cadastre) t.push('cadastre');
    if (res.prix.prix) t.push('prix');
    if (res.financement.depotGarantie) t.push('dépôt de garantie');
    if (res.notaires.length) t.push(res.notaires.length + ' notaire(s)');
    if (res.piecesJointes.some((x) => x.piece)) t.push('pièces jointes reconnues');
    if (res.bien.travauxRecents) t.push('travaux récents');
    if (res.aSuivre && res.aSuivre.length) t.push('pièces annoncées');
    return res;
  }
  function situation(v) {
    const s = sansAccent(v).toLowerCase();
    if (/pacs/.test(s)) return 'pacse';
    if (/marie/.test(s)) return 'marie';
    if (/divorce/.test(s)) return 'divorce';
    if (/veu(f|ve)/.test(s)) return 'veuf';
    if (/celibataire/.test(s)) return 'celibataire';
    return '';
  }

  /*
   * Report des informations retenues dans un dossier : seuls les champs vides sont remplis,
   * les parties et notaires déjà présents ne sont pas dupliqués.
   * groupes : { parties, bien, prix, financement, agence, notaires, pieces } (booléens)
   */
  const cleNom = (s) => sansAccent(s).toLowerCase().replace(/[^a-z]+/g, ' ').trim().split(' ').sort().join(' ');
  function remplir(cible, source, champs) {
    champs.forEach((k) => {
      const v = source[k];
      if (v === undefined || v === null || v === '') return;
      if (cible[k] === undefined || cible[k] === null || cible[k] === '') cible[k] = v;
    });
  }
  function fusionner(d, res, groupes, o) {
    const opts = o || {};
    const uid = opts.uid || ((p) => p + Math.random().toString(36).slice(2, 10));
    const today = opts.aujourdhui || '';
    const g = groupes || {};
    if (g.parties) {
      ['vendeurs', 'acquereurs'].forEach((r) => {
        d[r] = d[r] || [];
        (res[r] || []).forEach((x) => {
          if (d[r].some((y) => cleNom(y.nom) === cleNom(x.nom))) return;
          const p = Object.assign({ id: uid('p') }, x);
          delete p.membres;
          delete p.representantDe;
          d[r].push(p);
        });
      });
    }
    if (g.bien) {
      d.bien = d.bien || {};
      remplir(d.bien, res.bien || {}, ['adresse', 'codePostal', 'commune', 'type', 'description', 'surface', 'cadastre', 'contenance', 'lots']);
      if (res.bien && res.bien.copro && !d.bien.copro) d.bien.copro = true;
    }
    if (g.prix) {
      d.prix = d.prix || {};
      remplir(d.prix, res.prix || {}, ['prix', 'prixFAI', 'honoraires', 'chargeHonoraires']);
    }
    if (g.financement) {
      d.financement = d.financement || {};
      remplir(d.financement, res.financement || {}, ['depotGarantie', 'texte', 'montantPret']);
      if (res.financement && typeof res.financement.pret === 'boolean' && typeof d.financement.pret !== 'boolean') d.financement.pret = res.financement.pret;
    }
    if (g.agence) {
      d.agence = d.agence || {};
      remplir(d.agence, res.agence || {}, ['nom', 'contact', 'telephone', 'email', 'mandat']);
    }
    if (g.notaires) {
      d.notaires = d.notaires || [];
      (res.notaires || []).forEach((n) => {
        if (!d.notaires.some((y) => cleNom(y.nom) === cleNom(n.nom))) d.notaires.push(Object.assign({ id: uid('n') }, n));
      });
    }
    d.documents = d.documents || [];
    if (g.pieces) {
      d.pieces = d.pieces || {};
      (res.piecesJointes || []).forEach((x) => {
        d.documents.push({ id: uid('doc'), date: today, fichier: x.fichier, piece: x.piece || '', source: opts.source || '' });
        if (!x.piece) return;
        const cur = d.pieces[x.piece] || {};
        if (cur.statut !== 'recue') d.pieces[x.piece] = Object.assign({}, cur, { statut: 'recue', date: today, note: cur.note || ('Reçu : ' + x.fichier) });
      });
    }
    if (res.aSuivre && res.aSuivre.length && g.pieces !== false) {
      const bloc = 'À suivre' + (opts.source ? ' (' + opts.source + ')' : '') + ' :\n' + res.aSuivre.map((x) => '- ' + x).join('\n');
      if (!(d.notes || '').includes(bloc)) d.notes = (d.notes ? d.notes + '\n\n' : '') + bloc;
    }
    if (g.bien && res.bien && res.bien.travauxRecents && d.bien) d.bien.travauxRecents = true;
    if (opts.source) d.documents.push({ id: uid('doc'), date: today, fichier: opts.source, piece: '', source: res.sujet || '', lu: true });
    return d;
  }

  return { lireEml, extraire, fusionner, htmlEnTexte, piecesReconnues, adresse, montant };
});
