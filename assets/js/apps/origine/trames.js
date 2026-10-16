/*
 * Trames par défaut de l'outil « Origine de propriété ».
 * Adaptées des formules « Origines courantes, rédaction abrégée » (JCl. Notarial Formulaire,
 * V° Origine de propriété, fasc. 15) transmises par l'étude. Chaque utilisateur peut les modifier
 * dans l'outil (onglet Trames) ; ces textes servent alors de valeurs d'origine.
 *
 * Syntaxe :
 *   {variable}                                  valeur saisie (ou « ...... » si elle manque)
 *   {si variable} … {sinon} … {fin}             passage conditionnel ; aussi {si variable = valeur} et {si non variable}
 *   {accord groupe : il | elle | ils | elles}   accord selon le genre et le nombre (ou 2 formes : singulier | pluriel)
 *   Une ligne vide sépare deux paragraphes.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else {
    root.Atelier = root.Atelier || {};
    root.Atelier.tramesOrigine = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PAIEMENT = '{si paiement = terme}, payé comptant à concurrence de {prix_comptant} et stipulé payable à terme pour le surplus{sinon}, payé comptant et quittancé à l\'acte{fin}';
  const QUITTANCE = '{si quittance}{acquereurs_noms} {accord acquereurs : s\'est libéré | s\'est libérée | se sont libérés | se sont libérées} du solde de {accord acquereurs : son | leur} prix d\'acquisition, ainsi que le constate un acte de quittance reçu par {quittance_notaire}, le {quittance_date}, contenant en outre mainlevée de l\'inscription de {hypotheque_vendeur}, qui a été radiée depuis.{fin}';

  const ACTES = {
    vente: [
      '{ouverture} à {acquereurs}, au moyen de l\'acquisition {accord acquereurs : qu\'il | qu\'elle | qu\'ils | qu\'elles} en {accord acquereurs : a | ont} faite de {cedants},',
      'Suivant acte reçu par {notaire}, le {date}, {publication},',
      'Moyennant le prix de {prix}' + PAIEMENT + '.',
      '{accord cedants : Le vendeur | La venderesse | Les vendeurs | Les venderesses} {accord cedants : a | ont}, notamment, déclaré à l\'acte :',
      '{si situation_vendeur}{accord cedants : Qu\'il était marié | Qu\'elle était mariée | Qu\'ils étaient mariés | Qu\'elles étaient mariées} {situation_vendeur} ;{fin}',
      '{accord cedants : Qu\'il jouissait de sa | Qu\'elle jouissait de sa | Qu\'ils jouissaient de leur | Qu\'elles jouissaient de leur} pleine capacité civile.',
      'L\'état délivré {si ancien}lors de la transcription{sinon}sur publication{fin} {etat}.',
      QUITTANCE,
    ],
    construction: [
      '{ouverture} à {acquereurs}, savoir :',
      '- Les constructions pour les avoir fait édifier après avoir obtenu un permis de construire du maire de la commune de {permis_commune}, le {permis_date} ; il est précisé que {si conformite = attestation}l\'attestation de non-opposition à la conformité a été délivrée{sinon}le certificat de conformité a été délivré{fin} par ce dernier, le {conformite_date} ;',
      '- Et le terrain pour l\'avoir acquis de {cedants}, suivant acte reçu par {notaire}, le {date}, {publication}, moyennant le prix de {prix}' + PAIEMENT + '.',
      'L\'état délivré {si ancien}lors de la transcription{sinon}sur publication{fin} {etat}.',
      QUITTANCE,
    ],
    adjudication: [
      '{ouverture} à {acquereurs}, au moyen de l\'adjudication qui en a été prononcée à {accord acquereurs : son | leur} profit, suivant acte dressé par {notaire}, le {date}, en suite d\'un {cahier} dressé par le même notaire, le {cahier_date}, le tout à la requête de :',
      '{cedants_liste}',
      'Moyennant le prix de {prix}, payable à terme.',
      '{si declarations}Au {cahier}, {accord cedants : le vendeur a | la venderesse a | les vendeurs ont | les venderesses ont} notamment déclaré : {declarations}{fin}',
      'Le {cahier} et le procès-verbal d\'adjudication ont été {publication_pluriel}, avec inscription de {hypotheque_vendeur}, le {inscription_date}, volume {inscription_volume}, n° {inscription_numero}.',
      'L\'état délivré sur cette formalité {etat}.',
      '{si quittance}{acquereurs_noms} {accord acquereurs : s\'est libéré | s\'est libérée | se sont libérés | se sont libérées} de {accord acquereurs : son | leur} prix d\'adjudication, ainsi que le constate un acte reçu par {quittance_notaire}, le {quittance_date}, contenant en outre mainlevée de l\'inscription de {hypotheque_vendeur}, laquelle a été radiée depuis.{fin}',
    ],
    donation: [
      '{ouverture} à {acquereurs}, au moyen de la donation entre vifs qui {accord acquereurs : lui | leur} en a été consentie, sans charge, par {cedants}, et {accord acquereurs : qu\'il a acceptée | qu\'elle a acceptée | qu\'ils ont acceptée | qu\'elles ont acceptée},',
      'Suivant acte reçu{si temoins} en présence réelle de témoins{fin} par {notaire}, le {date}, {publication}.',
      'L\'état délivré sur cette formalité {etat}.',
      '{si definitive}Cette donation est devenue définitive, {accord cedants : le donateur étant décédé | la donatrice étant décédée | les donateurs étant décédés | les donatrices étant décédées} {lieu_date_deces}, {reserve}, ainsi que le constate un acte de notoriété dressé par {notoriete_notaire}, le {notoriete_date}{si partage} et un acte de partage reçu par {partage_notaire}, le {partage_date}{fin}.{fin}',
    ],
    'donation-partage-conjonctive': [
      '{ouverture} à {acquereurs}, pour {accord acquereurs : lui | leur} avoir été attribué, sans soulte à {accord acquereurs : sa | leur} charge, aux termes d\'un acte reçu{si temoins} en présence réelle de témoins{fin} par {notaire}, le {date}, contenant :',
      '1° Donation entre vifs à titre de partage anticipé par {cedants}, à :',
      '{donataires_liste}',
      'Leurs {nombre_donataires} enfants et présomptifs héritiers, chacun pour {quotite}, donataires pour même quotité, qui ont accepté aux termes du même acte, de divers immeubles leur appartenant ;',
      '2° Et partage entre les donataires des biens donnés.',
      'Cet acte a été {publication}.',
      'L\'état délivré sur cette formalité {etat}.',
      '{si definitive}La donation a pu recevoir son entière exécution, les donateurs n\'ayant pas laissé d\'autre héritier réservataire que les donataires, {notorietes}.{fin}',
    ],
    'donation-partage-cumulative': [
      '{ouverture} à {acquereurs}, pour {accord acquereurs : lui | leur} avoir été attribué, sans soulte à {accord acquereurs : sa | leur} charge, aux termes d\'un acte reçu{si temoins} en présence réelle de témoins{fin} par {notaire}, le {date}, contenant :',
      '1° Donation à titre de partage anticipé de divers biens par {cedants}, à :',
      '{donataires_liste}',
      '{accord cedants : Ses | Leurs} {nombre_donataires} enfants, qui ont accepté aux termes du même acte ;',
      '2° Et partage entre les donataires tant des biens donnés que de divers biens leur provenant de la succession de {predecede}, {predecede_lien}, {predecede_deces}, et dont ils étaient seuls héritiers, ainsi que le constate un acte de notoriété dressé par {predecede_notoriete_notaire}, le {predecede_notoriete_date}.',
      'Cet acte a été {publication}.',
      'L\'état délivré sur cette formalité {etat}.',
      '{si definitive}La donation a pu recevoir son entière exécution, {cedants_noms} étant {accord cedants : décédé | décédée | décédés | décédées} {lieu_date_deces}, en laissant pour seuls héritiers {accord cedants : ses | leurs} {nombre_donataires} enfants donataires, ainsi qu\'il est constaté par un acte de notoriété dressé par {notoriete_notaire}, le {notoriete_date}.{fin}',
    ],
    echange: [
      '{ouverture}{si en_propre} en propre{fin} à {acquereurs}, pour l\'avoir reçu en échange d\'un immeuble {accord acquereurs : lui | leur} appartenant{si en_propre} en propre{fin}, aux termes d\'un contrat passé avec {cedants}, devant {notaire}, le {date}. Cet échange a eu lieu {soulte}. Chacune des parties a renoncé pour ce qui la concernait à l\'action en répétition. Cet acte a été {publication}.',
      'L\'état délivré du chef de {cedants_noms} {etat}.',
      '{si origine_contrepartie}L\'immeuble cédé en échange par {acquereurs_noms} {accord acquereurs : lui | leur} appartenait {origine_contrepartie}.{fin}',
    ],
    'legs-universel': [
      '{ouverture} à {acquereurs}, en {accord acquereurs : sa qualité de légataire universel | sa qualité de légataire universelle | leur qualité de légataires universels | leur qualité de légataires universelles}, aux termes {testament}, par {cedants}, {deces_cedants}, et n\'ayant laissé aucun héritier à réserve, ainsi qu\'il est constaté par un acte de notoriété dressé par {notoriete_notaire}, le {notoriete_date}{si possession = formalites}, {acquereurs_noms} ayant pris possession à la suite des formalités effectuées par le notaire ayant reçu l\'acte de dépôt énoncé ci-dessus{fin}{si possession = envoi}, {acquereurs_noms} ayant été {accord acquereurs : envoyé | envoyée | envoyés | envoyées} en possession par ordonnance du président du tribunal judiciaire de {envoi_tribunal}, le {envoi_date}, dont la copie exécutoire a été déposée aux minutes de {envoi_notaire}, le {envoi_depot_date}{fin}.',
      'Il est précisé que cette transmission de propriété a été constatée par une attestation dressée par {notaire}, le {date}, {publication_feminin}, et que l\'état délivré sur cette formalité {etat}.',
    ],
    'legs-particulier': [
      '{ouverture} à {acquereurs}, comme {accord acquereurs : lui | leur} ayant été légué à titre particulier par {cedants}, {deces_cedants}, aux termes {testament}.',
      'Ce legs a été délivré par {delivrance_par}, suivant acte reçu par {delivrance_notaire}, le {delivrance_date}.',
      'Il est précisé que cette mutation de propriété a été constatée par une attestation établie par {notaire}, le {date}, {publication_feminin}, et que l\'état délivré sur cette formalité {etat}.',
    ],
    partage: [
      '{ouverture}{si en_propre} en propre{fin} à {acquereurs}, pour {accord acquereurs : lui | leur} avoir été attribué aux termes d\'un acte reçu par {notaire}, le {date}, contenant entre {accord acquereurs : lui | elle | eux | elles} et {cedants}, le partage des biens dépendant {successions_de} {defunts}, {lien_defunts}, {defunts_deces}, dont ils étaient seuls héritiers, {notorietes}.',
      'Ce partage a eu lieu {soulte}.',
      'Cet acte a été {publication}.',
      'L\'état délivré du chef de {defunts_noms} {etat}.',
    ],
    apport: [
      '{ouverture} à {acquereurs}, par suite de l\'apport qui lui en a été fait par {cedants}, suivant acte {operation} reçu par {notaire}, le {date}, {publication}.',
      'Cet apport a été consenti à la société en pleine propriété, à titre {si titre_apport = onereux}partiellement onéreux à concurrence du passif de {passif} pris en charge par la société{sinon}pur et simple{fin}, en rémunération duquel il a été attribué à {cedants_noms} {nombre_titres} {titres} de la société {societe}, d\'une valeur nominale de {valeur_nominale} chacune.',
      'L\'état délivré sur cette formalité {etat}.',
    ],
    succession: [
      '{ouverture} à {acquereurs}, pour l\'avoir recueilli dans la succession de {cedants}, {lien_defunt}, {deces_cedants}, dont {accord acquereurs : il était seul héritier | elle était seule héritière | ils étaient seuls héritiers | elles étaient seules héritières}.',
      'Ainsi que le constatent :',
      '- Un acte de notoriété dressé par {notoriete_notaire}, le {notoriete_date} ;',
      '- Et une attestation immobilière établie par {attestation_notaire}, le {date}, {publication_feminin}, étant précisé que l\'état délivré sur cette formalité du chef du défunt {etat}.',
    ],
  };

  // Éléments communs, utilisés par toutes les trames d'actes.
  const COMMUNS = {
    titre_immediate: 'ORIGINE DE PROPRIÉTÉ',
    titre_anterieure: 'ORIGINE ANTÉRIEURE',
    ouverture_immediate: 'Le BIEN objet des présentes appartient',
    ouverture_anterieure: 'Antérieurement, le BIEN appartenait',
    publication: 'publié{e} au service de la publicité foncière de {service}, le {date_publication}, volume {volume}, n° {numero}',
    publication_ancienne: 'transcrit{e} au bureau des hypothèques de {service}, le {date_publication}, volume {volume}, n° {numero}',
    personne: '{civilite} {prenoms} {nom}{si nom_usage}, {accord personne : époux | épouse | époux | épouses} {nom_usage}{fin}{si profession}, {si decede}en son vivant {fin}{profession}{fin}, demeurant à {domicile}, {accord personne : né | née | nés | nées} à {naissance_lieu} le {naissance_date}{si situation}, {situation}{fin}{si nationalite}, de nationalité {nationalite}{fin}',
    personne_rappel: '{civilite} {prenoms} {nom}, {accord personne : susnommé | susnommée | susnommés | susnommées}',
    vendeur: 'le VENDEUR',
    vendeur_nomme: '{civilite} {prenoms} {nom}, VENDEUR aux présentes',
    societe: 'la société dénommée {denomination}{si forme}, {forme}{fin}, dont le siège est à {siege}, identifiée au SIREN sous le numéro {siren}',
    notaire: 'Maître {notaire_nom}, notaire à {notaire_ville}',
  };

  const join = (lines) => lines.join('\n\n');
  const defaults = {};
  Object.keys(ACTES).forEach((k) => (defaults['acte:' + k] = join(ACTES[k])));
  Object.keys(COMMUNS).forEach((k) => (defaults['commun:' + k] = COMMUNS[k]));

  return { defaults };
});
