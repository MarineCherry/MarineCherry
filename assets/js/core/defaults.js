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

    // Courriers de succession : textes modifiés par l'étude, papier à en-tête importé, carnet d'adresses.
    courriers: {
      modeles: {},
      papier: null,                   // en-tête de la première page, reproduit à l'écran et dans les PDF
      paquet: null,                   // courrier Word de l'étude, nettoyé, servant de base aux fichiers .docx
      nomPapier: '',
      signataire: '',
      clercs: [],                     // personnes qui suivent les dossiers : { nom, email }
      carnetSupprimes: [],
      rib: '',                        // coordonnées bancaires de l'étude, jointes à certains courriers            // adresses fournies avec l'outil que l'étude a retirées du carnet
      carnet: [
        // « anciennes » : versions précédentes d'une adresse fournie, remplacées si l'étude ne les a pas modifiées.
        { id: 'c-lbp', type: 'banque', nom: 'La Banque Postale', departement: '', lignes: 'LA BANQUE POSTALE\nService Successions\n1 rue Édouard Branly\n45900 LA SOURCE CEDEX 9', email: '', telephone: '04 91 10 26 63',
          anciennes: ['LA BANQUE POSTALE\nService SUCCESSION\n45900 LA SOURCE CEDEX'] },
        { id: 'c-cardif', type: 'assurance', nom: 'Cardif Assurance Vie', departement: '', lignes: 'CARDIF ASSURANCE VIE\nBNP PARIBAS\nTSA 50 003\n92729 NANTERRE CEDEX', email: '', telephone: '01 41 42 83 00' },
        { id: 'c-cd84', type: 'departement', nom: 'Conseil départemental de Vaucluse', departement: '84', lignes: 'CONSEIL DÉPARTEMENTAL DE VAUCLUSE\nService Pôle autonomie et Santé\n6 boulevard Limbert - CS 60517\n84908 AVIGNON CEDEX 9', email: '' },
        { id: 'c-cd05', type: 'departement', nom: 'Conseil départemental des Hautes-Alpes', departement: '05', lignes: 'CONSEIL DÉPARTEMENTAL DES HAUTES-ALPES\nHôtel du Département\nPlace Saint-Arnoux\nCS 66005\n05008 GAP', email: 'successions@hautes-alpes.fr' },
        { id: 'c-sg-toulouse', type: 'banque', nom: 'Société Générale CDS Toulouse', departement: '', lignes: 'SOCIÉTÉ GÉNÉRALE CDS TOULOUSE\nService Successions\n76 rue Saint-Jean\nBP 13196\n31130 BALMA', email: 'cdstoulouse.successions@socgen.com', telephone: '09 69 18 12 94 ou 09 69 32 08 06',
          anciennes: ['SOCIÉTÉ GÉNÉRALE\nCDS Toulouse - Pôle Succession\n76 rue Saint-Jean\n31130 BALMA'] },
        { id: 'c-lcl', type: 'banque', nom: 'LCL (Nantes)', departement: '', lignes: 'LCL\nService Successions\n3 bis rue d\'Athènes\n44379 NANTES CEDEX 3', email: '', telephone: '09 69 36 29 53' },
        { id: 'c-ca-alpes-provence', type: 'banque', nom: 'Crédit Agricole Alpes Provence', departement: '13, 84, 05', lignes: 'CRÉDIT AGRICOLE ALPES PROVENCE\nService Successions\n25 chemin des Trois Cyprès\n13080 AIX-EN-PROVENCE', email: 'successions@ca-alpesprovence.fr' },
        { id: 'c-hello-bank', type: 'banque', nom: 'Hello bank!', departement: '', lignes: 'HELLO BANK!\nService Successions\nTSA 80011', email: 'conseiller.succession2@bnpparibas.com', telephone: '01 43 63 15 15' },
        { id: 'c-ce-cecaz', type: 'banque', nom: 'Caisse d\'Épargne Côte d\'Azur (CECAZ)', departement: '06', lignes: 'CAISSE D\'ÉPARGNE CÔTE D\'AZUR\nService Successions\n455 promenade des Anglais\nBP 3297\n06205 NICE CEDEX 3', email: 'succession.mail@cecaz.caisse-epargne.fr', telephone: '04 98 07 20 49 ou 04 98 07 20 50',
          anciennes: ['CAISSE D\'ÉPARGNE CECAZ\nService Successions'] },
        { id: 'c-ce-mp', type: 'banque', nom: 'Caisse d\'Épargne Midi-Pyrénées', departement: '09, 12, 31, 32, 46, 65, 81, 82', lignes: 'CAISSE D\'ÉPARGNE MIDI-PYRÉNÉES\nService Successions\n10 avenue Maxwell\n31100 TOULOUSE', email: '' },
        { id: 'c-ce-hdf', type: 'banque', nom: 'Caisse d\'Épargne Hauts de France', departement: '59, 62, 80, 02, 60', lignes: 'CAISSE D\'ÉPARGNE HAUTS DE FRANCE\nService Successions Grand Public\n612 rue de la Chaude Rivière\n59800 LILLE', email: 'cehdf-successions@hdf.caisse-epargne.fr' },
        { id: 'c-ce-cepac', type: 'banque', nom: 'Caisse d\'Épargne CEPAC', departement: '13, 84, 04, 05', lignes: 'CAISSE D\'ÉPARGNE CEPAC\nService Successions\nPlace Estrangin-Pastré\n13001 MARSEILLE', email: 'successions.notaires@cepac.caisse-epargne.fr' },
        { id: 'c-bnp', type: 'banque', nom: 'BNP Paribas (Cesson-Sévigné)', departement: '', lignes: 'BNP PARIBAS\nAgence Successions\nTSA 21727\n35517 CESSON-SÉVIGNÉ CEDEX', email: 'conseiller.succession2@bnpparibas.com', telephone: '01 53 75 64 25' },
        { id: 'c-bnp-fontenay', type: 'banque', nom: 'BNP Paribas (Fontenay-sous-Bois)', departement: '', lignes: 'BNP PARIBAS\nService Successions\nTSA 60227\n94120 FONTENAY-SOUS-BOIS', email: 'agence.successions@bnpparibas.com', telephone: '08 20 89 03 10' },
        { id: 'c-ca-languedoc', type: 'banque', nom: 'Crédit Agricole du Languedoc', departement: '11, 30, 34, 48', lignes: 'CRÉDIT AGRICOLE DU LANGUEDOC\nService Successions\n5 boulevard Théophile Roussel\n48000 MENDE', email: 'successions@ca-languedoc.fr' },
        { id: 'c-smc-comptes', type: 'banque', nom: 'Société Marseillaise de Crédit (Département Clients Comptes)', departement: '', lignes: 'SOCIÉTÉ MARSEILLAISE DE CRÉDIT\nService Successions\nDépartement Clients Comptes\nBP 200\n13684 AUBAGNE', email: '', telephone: '04 91 18 36 81' },
        { id: 'c-chaix', type: 'banque', nom: 'Banque Chaix', departement: '', lignes: 'BANQUE CHAIX\nService Successions\n245 boulevard Michelet\n13274 MARSEILLE', email: 'balsuccessionssaisies@bpcx.fr', telephone: '04 91 30 24 30 ou 04 91 30 24 21' },
        { id: 'c-bpmed', type: 'banque', nom: 'Banque Populaire Méditerranée', departement: '13, 84, 83, 06, 04, 05, 2A, 2B', lignes: 'BANQUE POPULAIRE MÉDITERRANÉE\n15 avenue de l\'Orme Fourchu\n84093 AVIGNON', email: 'balsuccessions@bpmed.fr', telephone: '04 91 30 24 17' },
        { id: 'c-bpaura', type: 'banque', nom: 'Banque Populaire Auvergne Rhône Alpes', departement: '01, 03, 07, 15, 26, 38, 42, 43, 63, 69, 73, 74', lignes: 'BANQUE POPULAIRE AUVERGNE RHÔNE ALPES\nplace de la Fontaune\n01630 SAINT-GENIS-POUILLY', email: 'bpaura_successions@bpaura.fr', telephone: '04 50 42 26 99 ou 04 38 88 46 91' },
        { id: 'c-credit-mutuel', type: 'banque', nom: 'Crédit Mutuel', departement: '', lignes: 'CRÉDIT MUTUEL\nService Successions\n494 avenue du Prado\nBP 115\n13267 MARSEILLE', email: '', telephone: '04 91 23 71 61' },
        { id: 'c-lcl-lyon', type: 'banque', nom: 'LCL (Lyon)', departement: '', lignes: 'LCL\nService Successions - 023695-00\n69266 LYON', email: 'service_successions@lcl.fr', telephone: '09 69 36 29 53' },
        { id: 'c-smc', type: 'banque', nom: 'Société Marseillaise de Crédit (Aubagne)', departement: '', lignes: 'SOCIÉTÉ MARSEILLAISE DE CRÉDIT\nService Successions\n430 chemin de l\'Aumône Vieille\nBP 200\n13684 AUBAGNE', email: '', telephone: '04 91 19 01 53 ou 04 91 19 01 52' },
      ],
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
