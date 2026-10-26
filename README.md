# Atelier notarial

Boîte à outils de l'étude notariale. Un écran d'accueil façon « téléphone » donne accès à chaque outil :

| Outil | Rôle |
| --- | --- |
| **Suivi des dossiers** | Tableau de bord des ventes et successions de l'étude : avancement des pièces par étape (promesse, vente / ouverture, règlement), échéances, alertes et relances. Diagnostics obligatoires selon le bien et la commune (zones termites et mérule tenues dans Paramètres), avec leur durée de validité. Import d'un mail d'agence (.msg Outlook, .eml), d'une offre ou d'un compromis (PDF) : parties, bien, prix, notaires et pièces jointes sont repris automatiquement. Dossiers partagés entre collègues via un dossier du réseau de l'étude. |
| **Plus-value immobilière** | Plus-value des particuliers : origines de propriété multiples, démembrement, terrain bâti, forfaits, abattements, surtaxe, récapitulatif par vendeur. |
| **Succession & donation** | Patrimoine par branche (biens propres de chaque parent, biens communs), donations envisagées ligne par ligne (qui donne, quel bien, quel montant, à qui). Comparatif parent par parent : A · succession sans donation, B · pleine propriété aux enfants, C · nue-propriété aux enfants, D · montage optimisé en nue-propriété (part des biens donnée à chaque enfant, don aux petits-enfants à égalité entre les branches, part gardée pour la succession, choisis pour minimiser les droits de la famille ; hypothèse facultative, activée par un bouton dans la carte des petits-enfants). Synthèse client avec graphiques, enregistrable en PDF. |
| **Conjoint survivant** | Liquidation du régime matrimonial (communauté, séparation, participation aux acquêts, PACS) avec récompenses calculées (art. 1469 C. civ.) et avantages matrimoniaux, ou actif net saisi directement. Dévolution (descendants par souches avec représentation, père et mère, frères et sœurs, biens de famille), droits légaux du conjoint, donation entre époux ou testament (trois options, cantonnement), droit viager au logement, legs, imputation sur la quotité disponible et réduction des libéralités (legs réduits au prorata, indemnité de réduction des donations, imputée sur la réserve du gratifié héritier), rapport avec indemnité due par l'héritier trop gratifié. Comparatif des options et droits de succession par héritier (rappel fiscal, résidence principale, assurance-vie). Synthèse client en PDF. |
| **Courriers de succession** | Lecture de l'acte de décès (PDF texte : identité, naissance, décès, domicile, situation familiale ; acte scanné ou manuscrit : aperçu à côté de la fiche, rubriques signalées ⚠). Destinataires proposés à partir du domicile : carnet d'adresses de l'étude, puis annuaire officiel de l'administration (conseil départemental, service des impôts, caisse de retraite ; accès internet, seule la commune est transmise). Courriers types (banques : demande de position, déblocage, acompte ; assurance-vie ; mutuelle ; conseil départemental avec attestation de créancier ; Trésor public ; caisse et maison de retraite), modifiables ; RIB de l'étude joint aux courriers qui le prévoient. Carnet d'adresses des services successions (plusieurs services régionaux par établissement, au choix), ajout de nouveaux tiers, adresse mail à copier. Papier à en-tête importé d'un courrier Word de l'étude ; sélection des courriers à télécharger en Word (.docx) ou en PDF, séparés ou en .zip. |
| **Origine de propriété** | Saisie de la chaîne de propriété (12 types d'actes, dont l'apport en société) et des personnes, rédaction automatique à partir de trames modifiables, rappel « susnommé » des personnes déjà désignées, contrôle de l'origine trentenaire, copie vers Word. |
| **Paramètres** | Barème de l'usufruit (art. 669 CGI), taux, abattements, barème en ligne directe, régimes particuliers. |

Les calculs reprennent à l'identique les formules des classeurs Excel d'origine (vérifié par des tests automatiques).

## Utilisation

Aucune installation : ouvrir **`index.html`** dans Chrome, Edge ou Firefox (double-clic).

- **Enregistrer** : télécharge le dossier dans un fichier `.json` sur le poste. **Ouvrir** permet de le reprendre plus tard.
- **Imprimer / PDF** : ouvre la fenêtre d'impression ; choisir « Enregistrer au format PDF » pour obtenir un PDF. La synthèse succession s'enregistre aussi directement en PDF (html2canvas et jsPDF, `assets/vendor/pdf`, licence MIT).
- Le dossier en cours est aussi conservé automatiquement dans le navigateur : on le retrouve en revenant dans l'outil.
- **Paramètres** : les modifications sont enregistrées sur le poste et s'appliquent à tous les dossiers. « Exporter » / « Importer » permet de partager les mêmes paramètres entre collègues.

### Suivi des dossiers

1. **Ouvrir un dossier** : « Importer un mail ou un document » (ou glisser le mail depuis Outlook sur le tableau de bord). L'Atelier lit le mail sur le poste et propose ce qu'il a trouvé (vendeurs, acquéreurs, société et ses représentants, adresse et cadastre du bien, prix, honoraires, dépôt de garantie, financement, notaires, agence) ; les pièces jointes reconnues (pièces d'identité, diagnostics…) sont cochées « reçues ». Seuls les noms des pièces jointes sont conservés.
2. **Pièces** : liste par étape, adaptée à la situation (copropriété, société, mariés ou pacsés, prêt, travaux, permis). Chaque pièce est « à obtenir », « demandée » (avec date, relance signalée après 15 jours), « reçue » ou « sans objet ». Les listes se modifient dans Paramètres → Suivi des dossiers.
3. **Diagnostics** : obligatoires ou non selon le type de bien, l'époque du permis de construire, l'âge des installations, l'assainissement, la copropriété, la classe du DPE et la commune ; validité contrôlée à la date de signature. Le bouton « Interroger Géorisques » interroge, à la demande, la Base Adresse Nationale et Géorisques (seule l'adresse du bien est envoyée).
4. **Partage** : avec Chrome ou Edge, « Choisir le dossier partagé » et désigner un dossier du réseau de l'étude ; chaque collègue choisit le même dossier. Un fichier par dossier y est enregistré ; si un collègue a modifié le dossier entre-temps, l'Atelier le signale. Avec un autre navigateur, les dossiers restent sur le poste.

Zones préremplies : Vaucluse d'après la carte de la DDT de Vaucluse (2022) — 51 communes contaminées par les termites ou susceptibles de l'être, zone de risque de mérule à Avignon ; Bouches-du-Rhône entièrement couvertes pour les termites (arrêté du 19 juillet 2001). Les autres départements se complètent dans Paramètres.

Les mails Outlook (.msg) sont lus avec msgreader (`assets/vendor/msgreader`, licences Apache 2.0 et BSD).

### Origine de propriété

1. **Chaîne de propriété** : une fiche par acte, de la plus récente à la plus ancienne (type d'acte, parties, date, notaire, publication, état hypothécaire, particularités).
2. **Personnes** : l'état civil de chaque personne n'est saisi qu'une fois ; il est rédigé en entier à la première mention, puis la personne est rappelée « susnommée ». Le propriétaire actuel (bénéficiaire de l'origine immédiate), déjà identifié en tête d'acte, est désigné « le VENDEUR » ; le bien est désigné « le BIEN ».
3. **Texte rédigé** : « Copier pour Word » puis Ctrl + V dans l'acte. Les éléments non saisis sont surlignés à l'écran et apparaissent « ...... » dans Word.
4. **Import d'un état hypothécaire** : « Importer un état (PDF) » lit l'état-réponse de l'ANF (partie informatisée), retient les formalités concernant la parcelle et le lot indiqués, et crée les origines (type d'acte, date, notaire, publication, prix) et les personnes (nom, date de naissance ; prénoms et autres éléments à compléter). Les charges relevées sur le bien sont listées. Les copies de fiches manuscrites s'affichent à côté du formulaire (« Fiches scannées ») pour saisir les origines plus anciennes. Le PDF est lu sur le poste, avec pdf.js (`assets/vendor/pdfjs`, licence Apache 2.0).
5. **Trames** : chaque trame se modifie librement (variables `{date}`, conditions `{si …}{sinon}{fin}`, accords `{accord acquereurs : il | elle | ils | elles}`), avec aperçu immédiat. Les trames personnalisées sont enregistrées sur le poste et partagées via Paramètres → Exporter / Importer.

Les trames d'origine sont adaptées des formules du JCl. Notarial Formulaire (V° Origine de propriété, fasc. 15, © LexisNexis) transmises par l'étude, pour son usage interne. En cas de diffusion ou de commercialisation de l'outil, elles devront être remplacées par des trames propres ou faire l'objet d'une licence.

Confidentialité : rien n'est envoyé sur internet (sauf la recherche Géorisques, lancée à la demande avec la seule adresse du bien). Les polices sont incluses dans le dossier, l'application fonctionne hors connexion.

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
