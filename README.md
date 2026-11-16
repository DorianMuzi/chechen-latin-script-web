# Chechen Latin Script — version web

Convertisseur **cyrillique tchétchène → latin (1992)** dans le navigateur. C'est le même moteur que l'extension
Chechen Latin Script (projet LinguaCE) : mêmes règles, mêmes listes de mots.

- Tout est converti **dans votre navigateur** : le texte n'est jamais envoyé, aucun cookie. Une **mesure d'audience anonyme** (GoatCounter : visites et pays, sans donnée personnelle) peut être activée, désactivée par défaut (voir plus bas).
- Fonctionne **hors ligne** et peut être **installé** sur l'écran d'accueil (téléphone ou ordinateur).
- 8 langues d'interface : tchétchène, anglais, français, russe, allemand, turc, espagnol, arabe.
- Palette de **lettres latines** pour écrire en latin tchétchène et copier le texte.
- Bouton **Signaler** (et lien « Signaler un problème ») : ouvre le formulaire Google de la langue choisie dans un nouvel onglet, prérempli avec le texte et le résultat (300 caractères au maximum). Rien n'est envoyé tant que la personne ne clique pas sur « Envoyer » dans le formulaire. Les adresses des formulaires sont reprises de l'extension par `tools/build.cjs`.

Licence : Apache 2.0 (© LinguaCE). Contact : linguachechen@gmail.com

## Contenu du dossier

| Dossier | Rôle |
|---|---|
| `docs/` | **Le site à publier** (généré). C'est ce dossier que GitHub Pages sert. |
| `tools/` | Les sources du site et le script `build.cjs` qui génère `docs/` à partir de l'extension. |
| `tests/` | Les tests (moteur identique à l'extension, et site essayé dans un vrai Chrome). |

## Publier sur GitHub Pages (une fois)

1. Créez un dépôt GitHub (par exemple `chechen-latin-script-web`) et envoyez-y **tout le contenu de ce dossier**
   (`README.md`, `LICENSE`, `docs/`, `tools/`, `tests/`).
2. Dans le dépôt : **Settings → Pages → Build and deployment**, source **Deploy from a branch**, branche `main`,
   dossier **`/docs`**, puis **Save**.
3. Au bout d'une ou deux minutes, le site est en ligne à l'adresse
   `https://<votre-compte>.github.io/chechen-latin-script-web/`.

## Mettre à jour le site après une nouvelle version de l'extension

Le moteur et les listes de mots sont **copiés** de l'extension : il faut regénérer le site à chaque version.

```bash
node tools/build.cjs "chemin/vers/le/dossier/de/l-extension-Chrome"
node tests/parity.cjs "chemin/vers/le/dossier/de/l-extension-Chrome"
node tests/browser.cjs
```

Puis envoyer les fichiers modifiés sur GitHub. Le site met à jour tout seul le cache hors ligne des visiteurs
(le nom du cache change avec la version du moteur).

Prérequis : Node.js 20 ou plus ; Google Chrome pour `tests/browser.cjs` (variable `BROWSER_EXE` pour indiquer un autre
chemin). Aucune dépendance à installer.

## Mesure d'audience (GoatCounter) — désactivée par défaut

Pour savoir combien de personnes utilisent le site et depuis quels pays (sans cookie, sans donnée personnelle, sans démographie) :

1. Créez un compte gratuit sur <https://www.goatcounter.com> et un site : choisissez un **code**, par exemple `chechenlatin` (le tableau de bord sera sur `https://chechenlatin.goatcounter.com`).
2. Écrivez ce code dans `tools/config.json` : `{ "goatcounter": "chechenlatin" }`.
3. Régénérez le site (`node tools/build.cjs ...`), puis publiez les fichiers modifiés de `docs/`.
4. **Publiez aussi la politique de confidentialité à jour** (version 2.1, section « Version web ») avant ou en même temps : la phrase affichée en bas du site annonce alors le comptage anonyme, dans les 8 langues.

Le compteur ne se déclenche pas : sans code, sur un poste local ou un fichier, si le navigateur envoie « Ne pas me suivre » ou « Global Privacy Control ». Le texte saisi n'est jamais transmis (le compteur ne voit que la visite de la page). Pour désactiver : remettez `"goatcounter": ""`, régénérez et republiez.

## À savoir

- `tools/build.cjs` ne modifie jamais le dossier de l'extension : il ne fait que le lire.
- Ne modifiez pas à la main les fichiers générés de `docs/` (`data.js`, `i18n.js`, `styles.css`, `index.html`,
  `engine/`, `sw.js`) : ils sont écrasés à la prochaine génération. Les sources sont dans `tools/`.
- Les deux phrases affichées en bas de page (confidentialité et précision sur le signalement) sont en anglais pour le tchétchène (en attente de la formulation).
- Ouvrir `docs/index.html` directement depuis le disque fonctionne aussi (les listes de mots sont embarquées), mais
  l'installation et le mode hors ligne demandent une adresse `https://` (ou `http://localhost`).
- Pour voir les journaux détaillés du moteur dans la console : ajoutez `?debug` à l'adresse.
