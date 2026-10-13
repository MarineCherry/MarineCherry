/*
 * Lecture des états hypothécaires « état-réponse » (ANF — Accès des Notaires au Fichier immobilier).
 *
 * Seule la partie informatisée (texte) est lue : chaque formalité y forme un bloc
 * (nature, rédacteur, dates, référence d'enliassement, disposants, bénéficiaires, immeubles,
 * prix, complément). Les copies de fiches manuscrites (pages sans texte) sont seulement repérées,
 * pour être affichées à côté du formulaire.
 *
 * Entrée : pages = [{ num, items: [{ str, x, y }] }] (coordonnées PDF, y vers le haut).
 * Fonctions pures, testables sous Node.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else {
    root.Atelier = root.Atelier || {};
    root.Atelier.etatHypothecaire = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DATE = /(\d{2})\/(\d{2})\/(\d{4})/;
  const iso = (s) => {
    const m = DATE.exec((s || '').trim());
    return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
  };
  const sansAccents = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const norm = (s) => sansAccents(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

  /* ---------- 1. Lignes ---------- */

  // Regroupe les éléments de texte en lignes (même ordonnée), triées de haut en bas puis de gauche à droite.
  function lignesDePage(items) {
    const lignes = [];
    items.filter((i) => i.str && i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x).forEach((i) => {
      const l = lignes.find((x) => Math.abs(x.y - i.y) <= 2.5);
      const it = { str: i.str.trim(), x: i.x, y: i.y };
      if (l) l.items.push(it);
      else lignes.push({ y: i.y, items: [it] });
    });
    lignes.forEach((l) => {
      l.items.sort((a, b) => a.x - b.x);
      l.texte = l.items.map((i) => i.str).join(' ');
    });
    return lignes;
  }

  // Valeurs « Libellé : valeur » présentes sur une ligne (plusieurs par ligne possible).
  function paires(ligne) {
    const out = {};
    let cle = null;
    const its = ligne.items;
    for (let k = 0; k < its.length; k++) {
      const str = its[k].str;
      // Le libellé et les deux-points peuvent former un ou deux éléments (« Montant principal », « : »).
      const deuxPointsSepares = its[k + 1] && its[k + 1].str === ':';
      const m = /^(.*\S)\s*:$/.exec(str);
      const label = m ? m[1] : deuxPointsSepares ? str : null;
      if (label && /[a-zé]/i.test(label) && label.length < 40) {
        cle = label.replace(/\s+/g, ' ');
        out[cle] = out[cle] || '';
        if (deuxPointsSepares) k++;
        continue;
      }
      if (cle) out[cle] = (out[cle] ? out[cle] + ' ' : '') + str;
    }
    return out;
  }

  /* ---------- 2. Désignations cadastrales et lots ---------- */

  // « AB 555 à 557 », « L1à2 », « IK 36 » → { section: 'AB', numeros: [555, 556, 557] }
  const RE_DESIGNATION = /^([A-Z]{1,2}|\d{3}\s?[A-Z]{1,2})\s?(\d+)(?:\s?à\s?(\d+))?$/;
  function designation(s) {
    const m = RE_DESIGNATION.exec((s || '').trim().toUpperCase().replace('À', 'à'));
    if (!m) return null;
    const a = +m[2], b = m[3] ? +m[3] : a;
    const numeros = [];
    for (let n = a; n <= Math.min(b, a + 500); n++) numeros.push(n);
    return { section: m[1].replace(/\s/g, ''), numeros, texte: s.trim() };
  }
  // « 91 à 94 » → [91, 92, 93, 94]
  function lots(s) {
    const m = /^(\d+)(?:\s?à\s?(\d+))?$/.exec((s || '').trim());
    if (!m) return [];
    const a = +m[1], b = m[2] ? +m[2] : a;
    const out = [];
    for (let n = a; n <= Math.min(b, a + 2000); n++) out.push(n);
    return out;
  }

  /* ---------- 3. Lecture des blocs ---------- */

  const NATURES = [
    [/DONATION.?PARTAGE/, 'donation-partage-conjonctive'],
    [/DONATION/, 'donation'],
    [/ATTESTATION.*(DECES|PROPRIETE|IMMOBILIERE|NOTARIEE)/, 'succession'],
    [/LICITATION/, 'vente'],
    [/PARTAGE/, 'partage'],
    [/ECHANGE/, 'echange'],
    [/ADJUDICATION/, 'adjudication'],
    [/VENTE|CESSION|APPORT/, 'vente'],
  ];
  function typeActe(nature, complement) {
    const n = sansAccents(nature).toUpperCase();
    if (/RECTIFICATIVE/.test(n) && !/VENTE|DONATION|PARTAGE|DECES/.test(n)) return null;
    for (const [re, t] of NATURES) {
      if (re.test(n)) {
        if (t === 'succession' && /LEGS|LEGATAIRE/.test(sansAccents(complement || '').toUpperCase())) return 'legs-universel';
        return t;
      }
    }
    return null;
  }

  function lirePersonne(ligne, colonneDroite) {
    const items = ligne.items;
    if (!items.length) return null;
    const premier = items[0].str;
    if (!/^(\d+|-)$/.test(premier)) return null;
    const droite = items.filter((i) => i.x >= colonneDroite - 15).map((i) => i.str).join(' ');
    const nom = items.slice(1).filter((i) => i.x < colonneDroite - 15).map((i) => i.str).join(' ').trim();
    if (!nom) return null;
    const naissance = /^\d{2}\/\d{2}\/\d{4}$/.test(droite) ? iso(droite) : '';
    const siren = /^[\d ]{9,11}$/.test(droite) ? droite.replace(/\s/g, '') : '';
    return {
      rang: premier === '-' ? null : +premier,
      nom,
      naissanceDate: naissance,
      siren,
      morale: !naissance,
    };
  }

  // Analyse complète du texte de l'état.
  function analyser(pages) {
    const res = { entete: {}, demande: { personnes: [], immeubles: [] }, formalites: [], pagesScannees: [], pagesTexte: [] };
    const toutes = [];
    pages.forEach((p) => {
      const lignes = lignesDePage(p.items);
      // Copies de fiches (scans manuscrits) : seuls l'en-tête et le pied de page « Copie de fiche » sont du texte.
      const utiles = lignes.filter((l) => l.y > 40 && l.y < 560);
      if (lignes.some((l) => l.y < 40 && /Copie de fiche/i.test(l.texte))) {
        res.pagesScannees.push(p.num);
        return;
      }
      if (!utiles.length) return; // page blanche
      res.pagesTexte.push(p.num);
      lignes.forEach((l) => { l.page = p.num; });
      toutes.push(...lignes.filter((l) => l.y > 40));
    });

    // En-tête
    toutes.forEach((l) => {
      const pr = paires(l);
      if (pr['Dossier ANF N°']) res.entete.anf = pr['Dossier ANF N°'];
      if (pr['Référence dossier']) res.entete.reference = pr['Référence dossier'];
      if (pr['Déposée le']) res.entete.demandeur = pr['Déposée le'];
      const d = /délivré le (.+)$/.exec(l.texte);
      if (d) res.entete.delivre = d[1].replace(/\s*Paiement.*$/, '');
    });

    // Personnes et immeubles de la demande (tableaux en tête d'état)
    let zone = null, cols = null;
    for (const l of toutes) {
      if (/^Personne issue de la demande/.test(l.texte)) { zone = 'personnes'; cols = null; continue; }
      if (/^Immeuble issu de la demande/.test(l.texte)) { zone = 'immeubles'; cols = null; continue; }
      if (/^(Registre des dépôts|Relevé des formalités)/.test(l.texte)) { zone = null; continue; }
      if (!zone) continue;
      if (Object.keys(paires(l)).length) { zone = null; continue; } // fin du tableau
      if (zone === 'personnes') {
        if (/Civilité|Dénomination/.test(l.texte)) { cols = l.items.map((i) => ({ t: i.str, x: i.x })); continue; }
        if (!cols) continue;
        const val = (label) => {
          const c = cols.find((x) => x.t.startsWith(label));
          if (!c) return '';
          return l.items.filter((i) => Math.abs(i.x - c.x) < 12).map((i) => i.str).join(' ');
        };
        if (!val(cols.some((c) => c.t === 'Civilité') ? 'Nom' : 'Dénomination')) continue;
        if (cols.some((c) => c.t === 'Civilité')) {
          res.demande.personnes.push({
            civilite: /^(MME|MLLE)/i.test(val('Civilité')) ? 'Mme' : 'M', nom: val('Nom'),
            prenoms: [val('Premier prénom'), val('Deuxième prénom')].filter(Boolean).map((p) => p.charAt(0) + p.slice(1).toLowerCase()).join(' '),
            naissanceDate: iso(val('Date de naissance')), naissanceLieu: val('Lieu de naissance'), morale: false,
          });
        } else res.demande.personnes.push({ nom: val('Dénomination'), siren: val("N° d'identité"), domicile: val('Siège'), morale: true });
      } else {
        if (/Code - Commune/.test(l.texte)) { cols = l.items.map((i) => ({ t: i.str, x: i.x })); continue; }
        if (!cols) continue;
        const cx = (label) => (cols.find((c) => c.t.startsWith(label)) || {}).x;
        const xDes = cx('Désignation'), xLot = cx('Lot'), xVol = cx('Volume');
        const commune = l.items.find((i) => i.x < (cx('Préfixe') || 290) - 10);
        const des = l.items.filter((i) => i.x >= xDes - 10 && i.x < xVol - 10).map((i) => i.str).join(' ');
        const lot = l.items.filter((i) => Math.abs(i.x - xLot) < 12).map((i) => i.str).join(' ');
        const dernier = res.demande.immeubles[res.demande.immeubles.length - 1];
        if (commune) res.demande.immeubles.push({ commune: commune.str.replace(/^\d+\s*-\s*/, ''), designations: des ? [des] : [], lots: lot ? [lot] : [] });
        else if (dernier) {
          if (des && des !== '-') dernier.designations.push(des);
          if (lot) dernier.lots.push(lot);
        }
      }
    }

    // Blocs de formalités (relevé) : un bloc commence par la ligne « … PAGE n À PAGE m ».
    let section = null, bloc = null;
    const blocs = [];
    for (const l of toutes) {
      const s = /^Relevé des formalités - (Publication|Charge)/.exec(l.texte);
      if (s) { section = s[1]; continue; }
      if (/^Registre des dépôts/.test(l.texte)) { section = null; continue; }
      if (!section) continue;
      const t = /^(.*?)\s*PAGE (\d+) À PAGE (\d+)$/.exec(l.texte);
      if (t) {
        const cle = section + t[1] + t[2] + t[3];
        if (!bloc || bloc.cle !== cle) {
          bloc = { cle, section, nature: t[1].trim(), pages: [+t[2], +t[3]], lignes: [] };
          blocs.push(bloc);
        }
        continue;
      }
      if (bloc && !/^ANF_/.test(l.texte)) bloc.lignes.push(l);
    }

    res.formalites = blocs.map(lireBloc).filter(Boolean);
    return res;
  }

  function lireBloc(bloc) {
    const f = {
      section: bloc.section, nature: bloc.nature, entetes: [], disposants: [], beneficiaires: [], creanciers: [], proprietaires: [],
      immeubles: [], prix: null, montant: null, complement: '', radiee: false, pages: bloc.pages,
    };
    let mode = null, colDroite = 500, colsImm = null, imm = null;
    for (const l of bloc.lignes) {
      const pr = paires(l);
      const txt = l.texte;
      if (pr['Rédacteur']) {
        f.entetes.push({ redacteur: pr['Rédacteur'] });
        mode = 'entete';
      }
      const ent = f.entetes[f.entetes.length - 1];
      if (mode === 'entete' && ent) {
        if (pr['Commune']) ent.commune = pr['Commune'];
        if (pr["Date de l'acte"]) ent.dateActe = iso(pr["Date de l'acte"]);
        if (pr['Date de dépôt']) ent.dateDepot = iso(pr['Date de dépôt']);
        const ref = /\d{4}\s*[A-Z]\s*\d+/.exec(pr["Référence d'enliassement"] || pr['Référence de dépôt'] || '');
        if (ref) ent.reference = ref[0];
        if (pr['Code sages']) ent.sages = pr['Code sages'];
        const marque = l.items.filter((i) => i.x > 540).map((i) => i.str).join(' ');
        if (/RADIATION/i.test(marque) || /RADIATION/i.test(txt)) f.radiee = true;
        if (/RECTIFICATIVE/i.test(marque)) ent.rectificative = true;
      }
      if (/Disposition n°/.test(txt)) { mode = null; continue; }
      if (/^(Disposants?, Donateurs?)/.test(txt)) { mode = 'disposants'; colDroite = (l.items.find((i) => /naissance|identité/.test(i.str)) || { x: 500 }).x; continue; }
      if (/^(Bénéficiaires?, Donataires?)/.test(txt)) { mode = 'beneficiaires'; colDroite = (l.items.find((i) => /naissance|identité/.test(i.str)) || { x: 500 }).x; continue; }
      if (/^Créancier/.test(txt)) { mode = 'creanciers'; colDroite = (l.items.find((i) => /naissance|identité/.test(i.str)) || { x: 500 }).x; continue; }
      if (/^Propriétaire Immeuble/.test(txt)) { mode = 'proprietaires'; colDroite = (l.items.find((i) => /naissance|identité/.test(i.str)) || { x: 500 }).x; continue; }
      if (/^Immeuble mère/.test(txt)) { mode = 'division'; continue; }
      if (/^Immeuble\(s\)/.test(txt) && mode !== 'division') {
        mode = 'immeubles';
        colsImm = { vol: (l.items.find((i) => i.str === 'Volume') || { x: 600 }).x, lot: (l.items.find((i) => i.str === 'Lot') || { x: 700 }).x };
        continue;
      }
      if (pr['Prix/évaluation']) { f.prix = montant(pr['Prix/évaluation']); mode = null; continue; }
      if (pr['Montant principal']) { f.montant = montant(pr['Montant principal']); mode = null; continue; }
      if (pr['Complément'] !== undefined) {
        f.complement += (f.complement ? '\n' : '') + pr['Complément'];
        if (/radiation|radiée/i.test(pr['Complément'])) f.radiee = true;
        mode = 'complement';
        continue;
      }
      if (/^Formalité \d/.test(txt)) { mode = null; continue; }

      if (['disposants', 'beneficiaires', 'creanciers', 'proprietaires'].includes(mode)) {
        const p = lirePersonne(l, colDroite);
        if (p) f[mode].push(p);
      } else if (mode === 'immeubles' && colsImm) {
        const label = /^(Bénéficiaire|Débiteur)\s*:$/.test(l.items[0].str);
        const reste = label ? l.items.slice(1) : l.items;
        const lotItems = reste.filter((i) => Math.abs(i.x - colsImm.lot) < 15).map((i) => i.str).filter((s) => s !== '-');
        const avant = reste.filter((i) => i.x < colsImm.vol - 15);
        const desItem = avant.filter((i) => designation(i.str)).pop();
        if (label) {
          const droit = (avant[0] && !designation(avant[0].str) ? avant[0].str : '').replace(/^(tous|\d+)\s*-\s*/, '');
          const commune = avant.filter((i) => i !== desItem && i !== avant[0]).map((i) => i.str).join(' ');
          imm = { commune, droit, designation: desItem ? designation(desItem.str) : null, lots: [] };
          f.immeubles.push(imm);
        } else if (desItem && imm) {
          imm = Object.assign({}, imm, { designation: designation(desItem.str), lots: [] });
          f.immeubles.push(imm);
        }
        if (imm) lotItems.forEach((s) => imm.lots.push(...lots(s)));
      } else if (mode === 'division') {
        // Procès-verbal du cadastre : immeuble mère → immeuble fille.
        const ds = l.items.filter((i) => designation(i.str)).map((i) => designation(i.str));
        if (ds.length >= 2) f.division = { mere: ds[0], fille: ds[1] };
        ds.forEach((d) => f.immeubles.push({ commune: '', droit: '', designation: d, lots: [] }));
      } else if (mode === 'complement') {
        f.complement += '\n' + txt;
        if (/radiation|radiée/i.test(txt)) f.radiee = true;
      }
    }
    const e = f.entetes[0] || {};
    Object.assign(f, {
      dateActe: e.dateActe || '', dateDepot: e.dateDepot || '', reference: e.reference || '', sages: e.sages || '',
      redacteur: e.redacteur || '', communeRedacteur: e.commune || '',
      type: f.section === 'Publication' ? typeActe(f.nature, f.complement) : null,
    });
    f.complement = f.complement.trim();
    return f;
  }

  function montant(s) {
    const m = /([\d\s  .]+,\d{2})/.exec(s || '');
    return m ? Number(m[1].replace(/[\s  .]/g, '').replace(',', '.')) : null;
  }

  /* ---------- 4. Sélection des formalités concernant le bien ---------- */

  // critere : { commune, parcelle ('IK 36'), lot ('87') }
  function concerne(f, critere) {
    const d = designation(critere.parcelle);
    if (!d) return true;
    const lot = critere.lot ? +String(critere.lot).trim() : null;
    const commune = norm(critere.commune);
    return f.immeubles.some((i) => {
      if (!i.designation || i.designation.section !== d.section) return false;
      if (!d.numeros.some((n) => i.designation.numeros.includes(n))) return false;
      if (commune && i.commune && norm(i.commune) !== commune) return false;
      return !lot || !i.lots.length || i.lots.includes(lot);
    });
  }

  /* ---------- 5. Conversion en fiches d'origine ---------- */

  const cle = (p) => (p.morale ? 'M:' + (p.siren || norm(p.nom)) : 'P:' + norm(p.nom) + ':' + p.naissanceDate);

  function notaire(redacteur, commune) {
    const m = /^NOT\.?\s+(.*)$/i.exec((redacteur || '').trim());
    return { nom: m ? m[1].trim() : (redacteur || '').trim(), ville: (commune || '').trim() };
  }
  function enliassement(ref) {
    const m = /^(\d{4})\s*([A-Z])\s*(?:n°\s*)?(\d+)$/.exec((ref || '').trim());
    return m ? { volume: m[1] + m[2], numero: m[3] } : { volume: '', numero: (ref || '').trim() };
  }
  const service = (sages) => ((sages || '').split(' - ')[1] || sages || '').trim();

  /*
   * Construit les personnes et les actes à partir des formalités retenues (ordre : de la plus récente à la plus ancienne).
   * fabrique : { personne(o), acte(type, o) } — constructeurs du moteur de rédaction.
   */
  function versDossier(etat, formalites, fabrique, existantes) {
    const personnes = [];
    const index = new Map();
    (existantes || []).forEach((p) => {
      if (p.nom) index.set(cle({ nom: p.nom, naissanceDate: p.naissanceDate || '', morale: p.morale, siren: p.siren }), p);
    });
    function personne(src) {
      const k = cle(src);
      if (index.has(k)) return index.get(k).id;
      // Compléments connus par la demande (prénoms, lieu de naissance de la personne requise).
      const dem = etat.demande.personnes.find((d) => cle(d) === k) || {};
      const p = fabrique.personne(Object.assign(
        src.morale
          ? { morale: true, nom: src.nom, siren: src.siren || dem.siren || '', domicile: dem.domicile || '' }
          : { nom: src.nom, prenoms: dem.prenoms || '', civilite: dem.civilite || 'M', naissanceDate: src.naissanceDate, naissanceLieu: dem.naissanceLieu || '' },
        { importe: true }));
      index.set(k, p);
      personnes.push(p);
      return p.id;
    }

    const tri = formalites.slice().sort((a, b) => (b.dateActe || b.dateDepot).localeCompare(a.dateActe || a.dateDepot));
    const actes = tri.map((f) => {
      const type = f.type || 'vente';
      const ref = enliassement(f.reference);
      const droits = Array.from(new Set(f.immeubles.map((i) => i.droit).filter((d) => d && !/^Toute propriété$/i.test(d))));
      const notes = [
        'Formalité « ' + f.nature + ' » relevée sur l\'état' + (etat.entete.anf ? ' ' + etat.entete.anf : '') + '.',
        droits.length ? 'Droits : ' + droits.join(', ') + '.' : null,
        /LICITATION/i.test(f.nature) ? 'Licitation faisant cesser l\'indivision : vérifier la rédaction (trame « Acquisition » utilisée).' : null,
        f.entetes.length > 1 ? 'Formalités liées : ' + f.entetes.slice(1).map((e) => (e.rectificative ? 'rectificative ' : '') + (e.reference || '') + (e.dateActe ? ' (acte du ' + e.dateActe.split('-').reverse().join('/') + ')' : '')).join(' ; ') + '.' : null,
        f.complement ? 'Complément : ' + f.complement.replace(/\n/g, ' ') : null,
      ].filter(Boolean).join('\n');
      const a = fabrique.acte(type, {
        date: f.dateActe,
        notaire: notaire(f.redacteur, f.communeRedacteur),
        publication: { service: service(f.sages), date: f.dateDepot, volume: ref.volume, numero: ref.numero },
        acquereurs: f.beneficiaires.map(personne),
        cedants: f.disposants.map(personne),
        importNotes: notes,
      });
      if (['vente', 'construction', 'adjudication'].includes(type) && f.prix !== null) {
        a.prix = f.prix;
        a.prixDevise = 'EUR';
      }
      // Décès mentionné au complément d'une attestation (« Disposant décédé le … »).
      const deces = /d[ée]c[ée]d[ée]e?\s+le\s+(\d{2}\/\d{2}\/\d{4})/i.exec(f.complement);
      if (deces && type !== 'vente') {
        a.cedants.forEach((id) => {
          const p = personnes.find((x) => x.id === id) || (existantes || []).find((x) => x.id === id);
          if (p && !p.morale && !p.decesDate) Object.assign(p, { decede: true, decesDate: iso(deces[1]) });
        });
      }
      if (type === 'donation' && /réserve d.usufruit/i.test(f.complement)) a.importNotes += '\nRéserve d\'usufruit au profit du donateur.';
      return a;
    });
    return { personnes, actes };
  }

  // Charges (hypothèques, privilèges…) relevées sur le bien.
  function charges(etat, critere) {
    return etat.formalites.filter((f) => f.section === 'Charge' && concerne(f, critere)).map((f) => ({
      nature: f.nature, dateActe: f.dateActe, dateDepot: f.dateDepot, reference: f.reference,
      creancier: f.creanciers.map((c) => c.nom).join(', '), montant: f.montant, radiee: f.radiee, complement: f.complement,
    }));
  }

  return { lignesDePage, analyser, concerne, versDossier, charges, designation, lots, typeActe };
});
