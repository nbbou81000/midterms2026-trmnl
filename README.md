Midterms 2026 US — plugin TRMNL
Suivi du "generic ballot" (Démocrates vs Républicains) et de l'approbation
de Trump pour les élections de mi-mandat du 3 novembre 2026.
Comment ça marche
```
SnoutCounter (Hackquantumcpp/snoutcounter-backend, GitHub)
        │
        ▼  (chaque heure, via le cron natif GitHub Actions)
scripts/fetch-midterms-data.js   →   public/midterms.json (compact)
        │
        ▼  (poll TRMNL)
templates/full.liquid  →  écran e-ink 800×480
```
Contrairement au plugin présidentielle 2027 (sondages bruts à agréger
nous-mêmes), SnoutCounter publie déjà une moyenne glissante quotidienne
du generic ballot et de l'approbation de Trump — le script se contente de
récupérer le dernier point, plus un échantillon sur ~180 jours pour la
courbe de tendance.
Ce qui manque par rapport au plugin France
Il n'existe pas (encore) de données course-par-course pour les élections
au Sénat, à la Chambre ou pour les postes de gouverneur — l'auteur de
SnoutCounter prévoit de les construire à l'approche du scrutin, mais ce
n'est pas disponible aujourd'hui. Ce plugin se limite donc à l'indicateur
national (generic ballot) et à l'approbation présidentielle, qui sont
les deux mesures les plus citées pour anticiper l'ampleur d'une vague
électorale.
Les 4 écrans (`ecran`)
Valeur	Écran
`ballot`	Democrats vs Republicans, generic ballot (jauge + écart) — défaut
`tendance`	Courbe des deux partis sur les ~180 derniers jours
`instituts`	Dernier sondage non-partisan de chaque institut
`approbation`	Approbation / désapprobation de Trump (jauge + écart)
Résultats officiels — à brancher plus tard
`resultats_ballot` est `null` pour l'instant, comme pour le plugin France :
aucune API officielle identifiée pour la soirée électorale. Le jour venu,
un script complémentaire pourra remplir ce champ avec la même forme que
`ballot_actuel` (`dem`, `rep`, `net`, `autres`, `date`) ; le template
bascule automatiquement dessus dès qu'il est renseigné (`{% assign b = resultats_ballot | default: ballot_actuel %}`).
---
Mise en place — tout depuis le navigateur
1. Créer le repo
github.com/new.
Repository name : `midterms2026-trmnl` (ou ce que tu veux).
Public.
Coche Add a README file, puis Create repository.
2. Ajouter les fichiers
Comme pour le plugin France : Add file → Create new file, tape le
chemin complet dans le nom de fichier (GitHub crée les dossiers tout
seul), colle le contenu, Commit changes.
Fichiers à créer, dans cet ordre :
`scripts/fetch-midterms-data.js`
`templates/full.liquid`
`public/midterms.json` (sera écrasé par la première exécution)
`.github/workflows/update-data.yml`
3. Autoriser le workflow à écrire
Settings → Actions → General → Workflow permissions → Read and write
permissions → Save.
4. Lancer la première exécution
Actions → "Mise à jour des données midterms" → Run workflow. Vérifie
ensuite que `public/midterms.json` contient bien des vraies données.
Le workflow se relance ensuite tout seul chaque heure.
5. Récupérer l'URL du JSON
```
https://raw.githubusercontent.com/<ton-pseudo>/midterms2026-trmnl/main/public/midterms.json
```
6. Créer le plugin sur TRMNL
TRMNL → Plugins → Create Plugin → Private Plugin.
Strategy : Polling. Polling URL : l'URL de l'étape 5.
Colle le contenu de `templates/full.liquid` dans l'éditeur de markup
(layout Full).
Enregistre, puis ajoute le plugin à ton appareil.
7. Ajouter le sélecteur d'écran (Custom Fields)
Onglet Custom Fields du plugin → éditeur YAML → colle :
```yaml
- keyname: ecran
  field_type: select
  name: Écran affiché
  description: Choisis quel écran ce plugin doit montrer sur ton TRMNL.
  options:
    - ballot
    - tendance
    - instituts
    - approbation
  default: ballot
```
Enregistre : un menu déroulant apparaît dans les réglages du plugin pour
basculer entre les 4 écrans à tout moment.
---
Structure du projet
```
midterms2026/
├── scripts/
│   ├── fetch-midterms-data.js   # récupère + agrège generic ballot & approval
│   └── render-test.js            # QA locale optionnelle (nécessite Node)
├── templates/
│   └── full.liquid               # template TRMNL unique, 4 écrans
├── public/
│   └── midterms.json             # sortie compacte, servie à TRMNL
└── .github/workflows/
    └── update-data.yml           # cron horaire + commit-si-changement
```
