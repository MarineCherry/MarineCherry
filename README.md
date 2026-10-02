# Atelier notarial

Boîte à outils de calcul pour l'étude notariale. Un écran d'accueil façon « téléphone » donne accès à chaque outil :

| Outil | Rôle |
| --- | --- |
| **Plus-value immobilière** | Plus-value des particuliers : origines de propriété multiples, démembrement, terrain bâti, forfaits, abattements, surtaxe, récapitulatif par vendeur. |
| **Succession & donation** | Comparatif des droits : A · succession sans donation, B · donation en pleine propriété, C · donation en nue-propriété. Petits-enfants, Dutreil, résidence principale, don familial, rappel fiscal, synthèse client avec graphiques. |
| **Paramètres** | Barème de l'usufruit (art. 669 CGI), taux, abattements, barème en ligne directe, régimes particuliers. |

Les calculs reprennent à l'identique les formules des classeurs Excel d'origine (vérifié par des tests automatiques).

## Utilisation

Aucune installation : ouvrir **`index.html`** dans Chrome, Edge ou Firefox (double-clic).

- **Enregistrer** : télécharge le dossier dans un fichier `.json` sur le poste. **Ouvrir** permet de le reprendre plus tard.
- **Imprimer / PDF** : ouvre la fenêtre d'impression ; choisir « Enregistrer au format PDF » pour obtenir un PDF.
- Le dossier en cours est aussi conservé automatiquement dans le navigateur : on le retrouve en revenant dans l'outil.
- **Paramètres** : les modifications sont enregistrées sur le poste et s'appliquent à tous les dossiers. « Exporter » / « Importer » permet de partager les mêmes paramètres entre collègues.

Confidentialité : rien n'est envoyé sur internet. Les polices sont incluses dans le dossier, l'application fonctionne hors connexion.

## Organisation du code

```
index.html                     page unique
assets/css/style.css           mise en forme (écran et impression)
assets/fonts/                  polices Inter et Fraunces (licence OFL)
assets/js/core/                outils communs : formatage, enregistrement, composants, graphiques
assets/js/apps/<outil>/engine.js   moteur de calcul (fonctions pures, testées)
assets/js/apps/<outil>/app.js      écrans de l'outil
assets/js/app.js               accueil et navigation
tests/                         tests des moteurs contre les valeurs calculées par Excel
```

### Ajouter un outil

1. Créer `assets/js/apps/<outil>/engine.js` (calcul) et `app.js` (écrans, à partir de `A.simulator`).
2. Ajouter les scripts dans `index.html` et l'identifiant dans `ORDER` (`assets/js/app.js`).
3. Ajouter ses paramètres par défaut dans `assets/js/core/defaults.js`.

## Tests

```
npm test
```

Les valeurs attendues (`tests/fixtures/*.expected.json`) ont été produites par les classeurs Excel d'origine recalculés avec LibreOffice (`tests/excel/reference.py`). Pour les régénérer après une modification d'un classeur :

```
python3 tests/excel/reference.py --pv simulateur_plus_value.xlsx --succession Simulateur_Succession_Donation.xlsx
```

## Avertissement

Simulations indicatives : les résultats sont à relire avant toute déclaration ou tout conseil au client.
