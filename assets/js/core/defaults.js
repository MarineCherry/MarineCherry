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
  };
});
