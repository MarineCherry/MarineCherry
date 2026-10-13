# Atelier notarial

Boîte à outils de calcul pour l'étude notariale. Un écran d'accueil façon « téléphone » donne accès à chaque outil :

| Outil | Rôle |
| --- | --- |
| **Plus-value immobilière** | Plus-value des particuliers : origines de propriété multiples, démembrement, terrain bâti, forfaits, abattements, surtaxe, récapitulatif par vendeur. |
| **Succession & donation** | Patrimoine par branche (biens propres de chaque parent, biens communs), donations envisagées ligne par ligne (qui donne, quel bien, quel montant, à qui). Comparatif parent par parent : A · succession sans donation, B · pleine propriété aux enfants, C · nue-propriété aux enfants, D · nue-propriété aux enfants et petits-enfants (montant égal par branche, montant optimal calculé). Synthèse client avec graphiques, enregistrable en PDF. |
| **Origine de propriété** | Saisie de la chaîne de propriété (11 types d'actes) et des personnes, rédaction automatique à partir de trames modifiables, rappel « susnommé » des personnes déjà désignées, contrôle de l'origine trentenaire, copie vers Word. |
| **Paramètres** | Barème de l'usufruit (art. 669 CGI), taux, abattements, barème en ligne directe, régimes particuliers. |

Les calculs reprennent à l'identique les formules des classeurs Excel d'origine (vérifié par des tests automatiques).

## Utilisation

Aucune installation : ouvrir **`index.html`** dans Chrome, Edge ou Firefox (double-clic).

- **Enregistrer** : télécharge le dossier dans un fichier `.json` sur le poste. **Ouvrir** permet de le reprendre plus tard.
- **Imprimer / PDF** : ouvre la fenêtre d'impression ; choisir « Enregistrer au format PDF » pour obtenir un PDF. La synthèse succession s'enregistre aussi directement en PDF (html2canvas et jsPDF, `assets/vendor/pdf`, licence MIT).
- Le dossier en cours est aussi conservé automatiquement dans le navigateur : on le retrouve en revenant dans l'outil.
- **Paramètres** : les modifications sont enregistrées sur le poste et s'appliquent à tous les dossiers. « Exporter » / « Importer » permet de partager les mêmes paramètres entre collègues.

### Origine de propriété

1. **Chaîne de propriété** : une fiche par acte, de la plus récente à la plus ancienne (type d'acte, parties, date, notaire, publication, état hypothécaire, particularités).
2. **Personnes** : l'état civil de chaque personne n'est saisi qu'une fois ; il est rédigé en entier à la première mention, puis la personne est rappelée « susnommée ». Le propriétaire actuel (bénéficiaire de l'origine immédiate), déjà identifié en tête d'acte, est désigné « le VENDEUR » ; le bien est désigné « le BIEN ».
3. **Texte rédigé** : « Copier pour Word » puis Ctrl + V dans l'acte. Les éléments non saisis sont surlignés à l'écran et apparaissent « ...... » dans Word.
4. **Import d'un état hypothécaire** : « Importer un état (PDF) » lit l'état-réponse de l'ANF (partie informatisée), retient les formalités concernant la parcelle et le lot indiqués, et crée les origines (type d'acte, date, notaire, publication, prix) et les personnes (nom, date de naissance ; prénoms et autres éléments à compléter). Les charges relevées sur le bien sont listées. Les copies de fiches manuscrites s'affichent à côté du formulaire (« Fiches scannées ») pour saisir les origines plus anciennes. Le PDF est lu sur le poste, avec pdf.js (`assets/vendor/pdfjs`, licence Apache 2.0).
5. **Trames** : chaque trame se modifie librement (variables `{date}`, conditions `{si …}{sinon}{fin}`, accords `{accord acquereurs : il | elle | ils | elles}`), avec aperçu immédiat. Les trames personnalisées sont enregistrées sur le poste et partagées via Paramètres → Exporter / Importer.

Les trames d'origine sont adaptées des formules du JCl. Notarial Formulaire (V° Origine de propriété, fasc. 15, © LexisNexis) transmises par l'étude, pour son usage interne. En cas de diffusion ou de commercialisation de l'outil, elles devront être remplacées par des trames propres ou faire l'objet d'une licence.

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
