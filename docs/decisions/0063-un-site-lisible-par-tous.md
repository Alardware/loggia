# 0063 — Un site lisible par tous, et par ce qui n'a pas d'yeux

Date : 20/09/2026 (v3.63.0). Statut : acceptée. Demande : « Fais en sorte que
le site soit accessible autant pour les utilisateurs que pour les agents IA.
Ajoute des alt textes sur toutes les images. Check les couleurs de chaque
contraste sur le site pour que ce soit bien lisible. » Seconde tranche du
travail ouvert par l'ADR 0062 ; plan proposé en trois options, réponse : « ok
pour le plan A » — le site ET l'application, sans audit complet du référentiel.

## Contexte

Mesuré avant d'écrire :

- **Sans JavaScript, la page du site est vide** : un `<div id="root">`, un
  titre « Loggia », aucune description. C'est ce que voit un moteur de
  recherche ou un agent IA qui n'exécute pas de script.
- **L'application était déjà soignée** : chaque vue a son `<h1>`, les 42
  boutons de l'Accueil portent un nom, et le linter ne relevait que six
  avertissements d'accessibilité dans tout le code — tous des faux positifs
  (un rôle conditionnel, un clavier apporté par étalement, un champ nommé par
  son `<label>`), que la règle ne sait pas lire.
- **Mais** : l'Accueil n'avait aucun titre de page, ses sections (« Favoris »,
  « Scénarios », « Pièces »…) étaient des blocs stylés, et toutes les images
  avaient un texte alternatif vide — y compris le flux d'une caméra. Les
  icônes météo portaient à la fois `alt=""` et une étiquette « météo », ce
  qui se contredit et ne dit rien.
- **Contrastes** : audit automatique rejoué — 15 thèmes × clair et sombre × 7
  vues, au téléphone, 13 528 textes. 306 sous 4,5:1 (2,3 %), aucun sous 3:1,
  le pire à 3,29. Et presque tous au même endroit : **303 sur 306 au pied
  d'une carte teintée**, là où le lavis est le plus dense — « 612 ppm » sur la
  pièce bleue, « Tout est éteint » sur la carte ambrée, les graduations d'une
  jauge. C'est le reste que l'ADR 0060 avait laissé (« petit gris sur carte
  teintée, 3,7–4,3:1 »).

## Décision

**Le site, pour qui n'exécute pas de script** — tout par le greffon
`siteEnLigne` (ADR 0062), donc dans la seule construction « demo » : la page
que Home Assistant sert derrière son authentification n'a besoin d'aucun
référencement et ne change pas d'un octet.

- `site/_tete.html` : description, adresse canonique, Open Graph, données
  structurées `SoftwareApplication` (gratuit, licence, auteur ; la version
  vient de `package.json` à la construction).
- `site/_sans-script.html` : un `<noscript>` qui dit ce qu'est Loggia, en
  français et en anglais, avec les liens utiles.
- `site/llms.txt` et `site/sitemap.xml`. Pas de `robots.txt` : sous `/loggia/`
  il ne serait pas lu, il doit vivre à la racine du domaine.
- Un fichier de `site/` dont le nom commence par `_` est un gabarit : il
  s'injecte, il ne se copie pas. Si un repère d'`index.html` disparaît, la
  construction échoue au lieu de publier une page sans ses gabarits.
- `site/legal/accessibilite.html` : une déclaration VOLONTAIRE (l'article 47
  de la loi n° 2005-102 ne vise pas un site personnel), qui ne revendique
  aucun niveau de conformité et dit ce qui n'est pas fait.

**L'application, pour qui ne la voit pas.**

- L'Accueil reçoit un `<h1>` lu mais pas vu (`.o-vh`) ; ses cinq titres de
  section deviennent des `<h2>`, marge et graisse annulées — rien ne bouge à
  l'œil.
- Les images se trient. Celles qui DISENT quelque chose ont un nom : le flux
  d'une caméra, sous ses trois formes (vidéo, MJPEG, instantané), porte
  « Caméra Entrée, en direct » ; une icône météo dit la condition (« Pluie »),
  avec les libellés de `haWeatherLabel`. Celles qui ne font que décorer ou
  redire le texte voisin gardent un texte vide : le logo à côté du mot
  « Loggia », la pochette à côté du titre du morceau, les calques de la maison
  de la vue Énergie. C'est le critère 1.2 du RGAA — leur écrire un texte ferait
  lire du bruit. La demande disait « sur toutes les images » ; c'est dit à
  l'utilisateur.
- Les six avertissements du linter : une vraie correction (`tabIndex` retiré
  d'une carte qui ne s'ouvre pas, `tabIndex={-1}` sur la liste d'un champ à
  suggestions) et, pour le reste, une dérogation qui dit POURQUOI la règle se
  trompe.

**Les contrastes.** Tenir 4,5:1 au pied de la carte la plus teintée demande
un gris nettement plus clair (`#8c98b2` → `#a9b2c5` en Loggia sombre). Posé
partout, il changeait le visage du thème — que l'ADR 0060 tient pour la
référence. Il ne vaut donc que LÀ : la garde calcule pour chaque thème deux
jetons « sur lavis » (`--o-text2-lavis`, `--o-text3-lavis`), et les cartes
teintées les substituent aux gris ordinaires par une règle CSS qui lit le
dégradé qu'elles posent en ligne. Ailleurs, rien ne bouge ; le test « Loggia
garde ses gris » passe inchangé. Une teinte qui écrit sur son propre lavis
tient désormais 4,5:1 au lieu de 4,2 — sauf le rouge d'alerte et le rose des
médias, qui se délavaient (`#ef4444` → `#f37373`) : le rouge dit « action
nécessaire », et il ne le dit jamais seul.

**`?theme=` dans la démo**, à côté de `?mode=`, `?lang=` et `?vue=` : l'audit
se rejoue variante par variante, sans cliquer dans les Paramètres.

## Conséquences

- Audit rejoué après correction (mêmes 210 passes) : **306 textes sous
  4,5:1 → 86** sur 13 378 (0,6 %), le pire de 3,29 à 3,71, la tranche 3–3,9
  de 51 à 9, et toujours aucun sous 3:1. Les libellés gris de la tuile
  d'alarme, vus à cette passe, ont rejoint la règle ensuite (vérifié sur la
  tuile, pas par une troisième passe complète).
- Restent sous 4,5:1, entre 3,7 et 4,4 : un mot d'état écrit dans une teinte
  sur une carte teintée — « Ouvert » en violet sur sa carte, « 1480 ppm »
  ambre sur une pièce, « Désarmée » en vert sur sa tuile. Corrigés le jour
  même par une variante « sur lavis » pour chaque teinte : voir la suite, en
  bas de cette décision. Les textes posés sur une
  image (nom d'une caméra sur son flux) ne se mesurent pas d'avance. La page
  Accessibilité dit les deux.
- L'outil d'audit doit tourner DEPUIS la démo : dans un cadre, l'application
  cherche la maison de démonstration dans la page parente, et se croit hors
  ligne sinon. Et il doit attendre que le nombre de textes soit stable — la
  première passe relevait trop tôt et ne mesurait que le cadre de la page.
- Non fait, et dit : aucun essai avec un vrai lecteur d'écran ; le mode
  édition n'est pas vérifié au clavier.

## Suite, le même jour (v3.63.1) — « ok pour la suite »

Les 86 textes restants étaient des mots d'état écrits dans une TEINTE sur une
carte teintée. Même remède que pour les gris, étendu :

- **Chaque teinte a sa variante « sur lavis »** (`--o-purple-lavis`…), que les
  cartes teintées substituent à la teinte. Jamais le compagnon « r,g,b » : c'est
  lui qui teinte la carte elle-même. Le rouge d'alerte et le rose ne se mesurent
  que contre LEUR lavis — tenus contre la carte ambrée, ils tournaient au
  pastel.
- **Le texte principal et son second aussi** : inchangés dans Loggia (la
  variante vaut la couleur elle-même), rattrapés dans une palette terne (One
  Dark Pro : « Plafonnier Cuisine » à 4,07:1 sur la carte d'une lampe).
- **Les pastilles à fond teinté** (`background: rgba(var(--o-…-rgb), α)`)
  suivent la même règle : « 4 MISES À JOUR » en ambre sur sa pastille ambre.
- **Les variantes visent un lavis plus dense que le nominal** (`LAVIS_DENSE`,
  0,3 contre 0,2) : au pied d'une carte deux dégradés se superposent. Une marge
  qui ne coûte rien à l'allure du thème, puisqu'elle ne vaut que là.
- **Sans la garde** (mode sans apparence, premier affichage), chaque variante
  vaut sa teinte : `--o-ok-lavis: var(--o-ok)` dans `:root` et dans l'îlot
  sombre. Sans ce défaut, `var()` serait invalide et la carte perdrait ses
  couleurs.

Audit complet rejoué : **306 → 86 → 6 textes sous 4,5:1** sur 13 378, le pire
à 3,84. Les six étaient dans la vue Sécurité de trois thèmes (un nom de caméra,
« TOUT EST CALME », les initiales d'une personne). **Soldés le 24/09 (ADR
0078)** : leur point commun n'était pas la vue mais le mécanisme — tous écrits
par un compagnon « r,g,b » posé sur un lavis de sa propre teinte, le seul cas
que la garde ne testait pas. Mesuré sur une carte allumée
en Loggia clair : gris `#54617b` → `#3f495c`, violet `#6d23eb` → `#5c14d6` ;
sur une carte éteinte et sur la page, rien ne bouge.

L'outil d'audit vit dans le dossier de travail de la session (éphémère) ; la
méthode est notée dans cette décision : le charger DEPUIS la démo, attendre un
nombre de textes stable et un `h1`, ne rien reconstruire pendant qu'il tourne.

Tests : tests/site_lisible.test.mjs (7), tests/contraste.test.mjs (+2),
tests/pages_legales.test.mjs (cinq pages).
