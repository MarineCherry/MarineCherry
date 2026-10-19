/*
 * Paramètres par défaut (barèmes et taux), repris des onglets de paramètres des classeurs Excel.
 * Ils sont modifiables dans l'application « Paramètres » ; ces valeurs servent à la réinitialisation.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else {
    root.Atelier = root.Atelier || {};
    root.Atelier.defaults = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  return {
    version: 1,

    // Barème de l'usufruit viager (art. 669 CGI), commun à tous les outils.
    commun: {
      bareme669: [
        { age: 0, usufruit: 0.9 },
        { age: 21, usufruit: 0.8 },
        { age: 31, usufruit: 0.7 },
        { age: 41, usufruit: 0.6 },
        { age: 51, usufruit: 0.5 },
        { age: 61, usufruit: 0.4 },
        { age: 71, usufruit: 0.3 },
        { age: 81, usufruit: 0.2 },
        { age: 91, usufruit: 0.1 },
      ],
    },

    plusValue: {
      tauxIR: 0.19,            // Art. 200 B CGI
      tauxPS: 0.172,           // Prélèvements sociaux sur plus-values immobilières
      pariteFranc: 6.55957,    // 1 € = 6,55957 F
      forfaitFrais: 0.075,     // Art. 150 VB II 3° CGI
      forfaitTravaux: 0.15,    // Art. 150 VB II 4° CGI
    },

    succession: {
      abattEnfant: 100000,         // Art. 779 CGI
      donFamilial: 31865,          // Art. 790 G CGI
      ageLimiteDonFamilial: 80,
      delaiRappel: 15,             // Art. 784 CGI
      abattPetitEnfant: 31865,     // Art. 790 B CGI
      bareme777: [                 // Ligne directe (art. 777 CGI)
        { de: 0, taux: 0.05 },
        { de: 8072, taux: 0.1 },
        { de: 12109, taux: 0.15 },
        { de: 15932, taux: 0.2 },
        { de: 552324, taux: 0.3 },
        { de: 902838, taux: 0.4 },
        { de: 1805677, taux: 0.45 },
      ],
      regimes: [
        { nom: 'Aucun', succession: 0, donation: 0 },
        { nom: 'Dutreil (75 %)', succession: 0.75, donation: 0.75 },
        { nom: 'Résidence principale (20 %)', succession: 0.2, donation: 0 },
      ],
      natures: ['Immobilier', 'Titres / parts sociales', 'Liquidités', 'Autre'],
    },

    // Origine de propriété : options de rédaction et trames modifiées par l'utilisateur
    // (les trames d'origine sont dans assets/js/apps/origine/trames.js).
    origine: {
      datesEnLettres: false,
      prixEnLettres: true,
      trames: {},
    },

    // Droits du conjoint survivant : barèmes hors ligne directe et abattements (ligne directe : section Succession).
    conjoint: {
      coefHabitation: 0.6,            // Droit d'usage et d'habitation = 60 % de l'usufruit (art. 762 bis CGI)
      fiscal: {
        abattFrere: 15932,            // Art. 779 IV CGI
        abattNeveu: 7967,             // Art. 779 V CGI
        abattDefaut: 1594,            // Art. 788 IV CGI
        abattHandicap: 159325,        // Art. 779 II CGI
        baremeFrere: [{ de: 0, taux: 0.35 }, { de: 24430, taux: 0.45 }],
        baremeParent4: [{ de: 0, taux: 0.55 }],
        baremeTiers: [{ de: 0, taux: 0.6 }],
        forfaitFuneraire: 1500,       // Art. 775 CGI
        abattementRP: 0.2,            // Art. 764 bis CGI
        delaiRappel: 15,              // Art. 784 CGI
        abattement990I: 152500,       // Art. 990 I CGI
        seuil990I: 700000,
        taux990I1: 0.2,
        taux990I2: 0.3125,
        abattement757B: 30500,        // Art. 757 B CGI
      },
    },

    // Suivi des dossiers : pièces attendues par étape (condition : voir engine.CONDITIONS)
    // et zones délimitées par arrêté préfectoral (termites, mérule). Tout est modifiable dans Paramètres.
    dossiers: {
      delaiRelance: 15,
      pieces: {
        vente: [
        { id: 'identite', libelle: 'Pièces d\'identité des parties', etape: 'promesse' },
        { id: 'diagnostics', libelle: 'Diagnostics (dossier de diagnostic technique)', etape: 'promesse', auto: 'diagnostics' },
        { id: 'titre', libelle: 'Titre de propriété du vendeur', etape: 'promesse' },
        { id: 'taxeFonciere', libelle: 'Dernier avis de taxe foncière', etape: 'promesse' },
        { id: 'honoraires', libelle: 'Convention d\'honoraires (à rédiger)', etape: 'promesse' },
        { id: 'preEtatDate', libelle: 'Pré-état daté (demande au syndic)', etape: 'promesse', condition: 'copro' },
        { id: 'reglementCopro', libelle: 'Règlement de copropriété et modificatifs', etape: 'promesse', condition: 'copro' },
        { id: 'cadastre', libelle: 'Plan cadastral', etape: 'promesse' },
        { id: 'etatCivilVendeurs', libelle: 'Actes d\'état civil des vendeurs', etape: 'vente' },
        { id: 'etatCivilAcquereurs', libelle: 'Actes d\'état civil des acquéreurs', etape: 'vente' },
        { id: 'contratMariage', libelle: 'Contrat de mariage / convention de PACS', etape: 'vente', condition: 'maries' },
        { id: 'statutsKbis', libelle: 'Statuts et extrait Kbis de la société', etape: 'vente', condition: 'societe' },
        { id: 'bodacc', libelle: 'Consultation du BODACC', etape: 'vente' },
        { id: 'casier', libelle: 'Casier judiciaire (bulletin n° 2) des acquéreurs', etape: 'vente' },
        { id: 'etatHypothecaire', libelle: 'État hypothécaire', etape: 'vente' },
        { id: 'etatDate', libelle: 'État daté (syndic)', etape: 'vente', condition: 'copro' },
        { id: 'nru', libelle: 'Note de renseignements d\'urbanisme (NRU)', etape: 'vente' },
        { id: 'permis', libelle: 'Permis de construire, déclaration d\'achèvement et conformité', etape: 'vente', condition: 'permis' },
        { id: 'factures', libelle: 'Factures des travaux récents et assurances (décennale, dommages-ouvrage)', etape: 'vente', condition: 'travaux' },
        { id: 'dia', libelle: 'Déclaration d\'intention d\'aliéner (DIA) — réponse de la mairie', etape: 'vente' },
        { id: 'offrePret', libelle: 'Offre de prêt de l\'acquéreur', etape: 'vente', condition: 'pret' },
        ],
        succession: [
        { id: 'acteDeces', libelle: 'Acte de décès', etape: 'ouverture' },
        { id: 'etatCivil', libelle: 'Actes d\'état civil des parties (héritiers)', etape: 'ouverture' },
        { id: 'livret', libelle: 'Livret de famille', etape: 'ouverture' },
        { id: 'contratMariageDefunt', libelle: 'Contrat de mariage / donation entre époux', etape: 'ouverture', condition: 'conjoint' },
        { id: 'fcddv', libelle: 'Interrogation du fichier des dernières volontés (FCDDV)', etape: 'ouverture' },
        { id: 'testament', libelle: 'Testament', etape: 'ouverture', condition: 'testament' },
        { id: 'titres', libelle: 'Titres de propriété', etape: 'ouverture' },
        { id: 'donationsAnterieures', libelle: 'Actes de donations antérieures', etape: 'ouverture' },
        { id: 'banques', libelle: 'Bordereaux de situation des banques', etape: 'reglement' },
        { id: 'retraites', libelle: 'Organismes de retraite', etape: 'reglement' },
        { id: 'tresor', libelle: 'Trésor public (impôts du défunt)', etape: 'reglement' },
        { id: 'conseilDept', libelle: 'Conseil départemental (récupération de l\'aide sociale)', etape: 'reglement' },
        { id: 'assuranceVie', libelle: 'Contrats d\'assurance-vie (interrogation AGIRA)', etape: 'reglement' },
        { id: 'obseques', libelle: 'Facture des obsèques', etape: 'reglement' },
        { id: 'impots', libelle: 'Derniers avis d\'imposition (taxe foncière, impôt sur le revenu)', etape: 'reglement' },
        { id: 'evaluation', libelle: 'Évaluation des biens immobiliers', etape: 'reglement' },
        ],
      },
      // commune '*' = tout le département.
      zonesTermites: [
        { dept: '13', commune: '*', arrete: 'arrêté préfectoral du 19/07/2001 modifié le 10/08/2001' },
        { dept: '84', commune: 'Lamotte-du-Rhône', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Bollène', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Mondragon', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Mornas', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Uchaux', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Visan', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Saint-Roman-de-Malegarde', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Buisson', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Villedieu', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Roaix', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Rasteau', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Vaison-la-Romaine', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Sorgues', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Le Pontet', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Avignon', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Vedène', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Morières-lès-Avignon', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Saint-Saturnin-lès-Avignon', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Jonquerettes', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Châteauneuf-de-Gadagne', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Caumont-sur-Durance', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Le Thor', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Velleron', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Pernes-les-Fontaines', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'La Roque-sur-Pernes', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Saumane-de-Vaucluse', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'L\'Isle-sur-la-Sorgue', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Lagnes', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Cabrières-d\'Avignon', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Cavaillon', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Robion', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Les Taillades', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Oppède', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Ménerbes', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Lacoste', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Bonnieux', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Gargas', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Cheval-Blanc', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Mérindol', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Puget', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Lauris', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Puyvert', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Lourmarin', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Vaugines', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Cadenet', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Villelaure', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Ansouis', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Pertuis', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'La Tour-d\'Aigues', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'La Bastidonne', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
        { dept: '84', commune: 'Mirabeau', arrete: 'carte DDT de Vaucluse des communes contaminées par les termites ou susceptibles de l\'être, 2022' },
      ],
      // Couverture connue des départements : 'tout', 'liste' (liste complète des communes), 'partie' ou 'aucun'.
      departementsTermites: { '13': 'tout', '84': 'liste', '83': 'partie', '06': 'partie' },
      zonesMerule: [
        { dept: '84', commune: 'Avignon', arrete: 'zone de présence d\'un risque de mérule (arrêté préfectoral ; carte DDT de Vaucluse, 2022)' },
      ],
      departementsMerule: { '84': 'liste' },
    },
  };
});
