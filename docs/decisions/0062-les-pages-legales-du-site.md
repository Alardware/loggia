# 0062 — Les pages légales du site

Date : 20/09/2026 (v3.62.0). Statut : acceptée. Demande : « Je ne veux pas me
prendre une amende sur mon site Loggia […] fais-moi une page de politique de
confidentialité, une page des termes et de conditions d'utilisation, une
politique des cookies. Regarde si j'ai besoin d'un consentement de cookies
[…], d'une page légale de remboursement, de consentement et de formulaire.
[…] Regarde si on est conforme aux lois de mon pays et surtout, ne fais pas
d'erreur. » Puis, sur le plan en deux tranches : « ok pour la première
tranche ».

## Contexte

Le « site », c'est la démo en ligne (ADR 0049) : une page statique servie par
GitHub Pages. Avant d'écrire, mesure du site publié (20/09/2026) :

- **aucun cookie** (`document.cookie` vide) ;
- **douze requêtes, toutes vers le site lui-même** — ni mesure d'audience, ni
  police, ni script d'ailleurs ;
- `localStorage` remplacé par une mémoire (la démo) : rien n'est écrit sur
  l'appareil ; seules huit clés de `sessionStorage` existent dans le code, et
  elles s'effacent avec l'onglet ;
- ni compte, ni formulaire, ni vente ; le lien Ko-fi ne charge rien avant le
  clic ;
- le micro ne s'ouvre jamais (il exige la liaison à Home Assistant, que la
  démo n'a pas) ; la caméra ne sert qu'à l'option « Réveil par la caméra »,
  coupée par défaut, traitée sur l'appareil ;
- seule donnée personnelle : l'adresse IP, que GitHub enregistre « à des fins
  de sécurité » — l'éditeur n'y a pas accès.

L'éditeur : un particulier, en France, à titre non professionnel.

Ce que la loi en tire :

- **Mentions légales : obligatoires**, et absentes jusqu'ici. Article 1-1 de
  la loi n° 2004-575 (LCEN, réécrite par la loi du 21 mai 2024) ; l'article 1-2
  punit leur absence d'un an d'emprisonnement et de 75 000 € d'amende. C'était
  le vrai risque. Le II de l'article 1-1 permet à qui édite à titre non
  professionnel de ne publier que le nom et l'adresse de son hébergeur : le nom
  de l'éditeur est donné en plus, de son plein gré (il figure déjà dans
  `LICENSE`) ; son domicile et son téléphone restent privés.
- **Bandeau de consentement : inutile.** Article 82 de la loi n° 78-17 : pas
  d'accord à recueillir pour ce qui est strictement nécessaire au service
  demandé ; la CNIL y range les choix d'interface. Ici, en plus, rien
  n'identifie personne.
- **Page de remboursement, de consentement, de formulaire : inutiles.** Rien
  n'est vendu, aucun formulaire ne collecte. Les dons passent par Ko-fi ; un
  paragraphe des conditions d'utilisation le dit.
- **Accessibilité** : ni le RGAA ni la directive européenne n'obligent un site
  personnel. C'est la seconde tranche, faite parce que c'est utile.

En passant, un manque de licence : les icônes UIcons (Flaticon) sont gratuites
**sous réserve d'attribution**, et rien ne les créditait.

## Décision

- **Quatre pages statiques, en français, dans `site/legal/`** : mentions
  légales, politique de confidentialité, conditions d'utilisation, politique
  des cookies. HTML sémantique, une feuille de style, **aucun script** : elles
  se lisent au lecteur d'écran, au navigateur texte, par un agent IA, à 320 px,
  à l'impression. Polices du site, couleurs de Loggia, clair et sombre selon le
  système ; le contraste le plus faible mesuré est de 5,45:1.
- **Elles ne partent que sur le site.** `public/` est copié dans toutes les
  constructions, donc dans le paquet HACS — or la politique d'un site web n'a
  rien à faire dans le Home Assistant des gens. Un greffon de `vite.config.js`
  (`siteEnLigne`) copie `site/` dans la seule construction « demo ».
- **Le badge « Démonstration » porte le lien « Mentions légales »**, dans la
  construction en ligne seulement (sur une installation, `?demo` n'a pas ces
  pages). Là, le badge vit dans le corps de la page, nommé comme pied de page :
  accroché à `<html>`, le lien restait hors de l'arbre d'accessibilité
  (mesuré). Cible de 28 px ; deux lignes à 320 px, une au-delà.
- **Le badge prend les couleurs du thème**, partout : son bleu écrit en dur
  donnait 1,4:1 en mode clair, et son fond translucide changeait avec ce qui
  passait dessous. Fond opaque (l'accent à 16 % sur le fond de page), texte du
  thème : 11,3:1 en clair, 13,4:1 en sombre.
- **Les crédits** (polices, UIcons, Meteocons, bibliothèques) figurent dans les
  mentions légales.
- **Le ton** reste celui du projet : un particulier qui parle à la première
  personne, et qui dit ce que le site fait vraiment.

## Conséquences

- Les pages affirment des choses du code ; un test les tient vraies. Un cookie,
  une clé de session de plus, une adresse externe nouvelle, une mesure
  d'audience, un micro qui s'ouvrirait en démo : le test tombe, et la page se
  relit AVANT de publier.
- Le test refuse tout repère « à compléter » et exige un contact : la page ne
  peut pas partir en ligne à moitié écrite. Il ne porte aucune adresse —
  `npm run audit` les refuse dans `tests/` et `docs/`, et `site/` n'est pas
  dans son champ.
- `vite.config.js` rend désormais une fonction du mode ; la chaîne
  `plugins: [react(), orbeRechargee],` que tient le test de l'orbe est intacte.
- Si Loggia devient un jour une activité rémunérée, le régime du
  non-professionnel tombe : les mentions légales se refont (domicile ou siège,
  téléphone, immatriculation), et les dons deviennent des ventes ou des
  recettes à traiter comme telles.
- Seconde tranche, à part : description et contenu de repli sans JavaScript,
  données structurées, `llms.txt`, un titre par vue, textes alternatifs des
  images qui portent une information, restes de l'audit de contraste,
  déclaration d'accessibilité.
- Non vérifiable d'ici, laissé à l'éditeur : que son compte GitHub porte bien
  son identité (condition du II de l'article 1-1), et l'origine des
  illustrations de la vue Énergie.

Tests : tests/pages_legales.test.mjs (8).
