# Le guide de l'interface

Les règles d'interface de Loggia, rassemblées en un seul endroit. Elles ont été fixées une à une, au fil des retours ;
beaucoup ont leur décision dans `decisions/`, certaines n'étaient écrites nulle part. Avant de dessiner une carte, une
popup ou une barre, on lit la partie qui la concerne.

Chaque règle dit :
- **la règle**, en une phrase ;
- **pourquoi** elle existe ;
- un exemple **oui / non** ;
- **tenu par** : le composant ou le jeton à utiliser, la décision, et le test qui la garde quand il y en a un.

Le vocabulaire est celui de `GLOSSAIRE.md`. `tests/guide_ux.test.mjs` vérifie que tout ce que ce guide cite existe
encore : un composant renommé ou une décision déplacée fait échouer la suite, et le guide se corrige avec.

## L'ordre de priorité

Deux règles peuvent tirer en sens contraire. Dans ce cas, on suit cet ordre :

1. **Le gabarit des cartes** (règles 1 à 3). Il prime sur toute maquette.
2. **La maquette**, à la lettre, format par format (règle 43).
3. **L'existant**. Il ne prime jamais sur une maquette.

Une règle de cette page l'emporte sur une habitude du code. Si le code la contredit, c'est le code qui a tort.

---

## 1. Les cartes

### 1. Le gabarit maison

**La règle.** Toute carte suit le même dessin :
- l'icône, seule, en haut à gauche ;
- le chiffre ou le verdict en haut à droite ;
- le titre sous l'icône, avec 10 à 14 px d'air ;
- le contenu ensuite, sur toute la hauteur.

Pas de bordure propre à la carte : seul le liseré du réglage (règle 21).

**Pourquoi.** On lit toutes les cartes de la même façon, d'un coup d'œil, quelle que soit la vue.

**Oui.** Une carte de pièce : l'icône en haut à gauche, « 21,4° » en haut à droite, le nom dessous.
**Non.** Le titre à côté de l'icône, sur la même ligne, parce qu'une maquette l'a dessiné ainsi.

**Tenu par.** `src/styles.js` › `ICONE_CARTE` · `src/styles.js` › `NOM_CARTE` · `tests/cartes_compactes_gabarit.test.mjs`

### 2. Deux tailles : 88 et 184 px

**La règle.** Une carte fait 88 px (compacte) ou 184 px (standard) de haut, rien d'autre. Deux compactes l'une sur
l'autre, avec leur espace (88 + 8 + 88), tiennent exactement à côté d'une standard, alignées en haut et en bas.

**Pourquoi.** Une grille où l'on peut mêler compactes et standards sans rien qui dépasse.

**Oui.** Une standard, et à sa droite deux compactes empilées : les trois bords hauts et bas tombent juste.
**Non.** Une carte de 120 px « parce que le contenu tient en 120 ».

**Tenu par.** ADR 0151

### 3. Au téléphone, la carte étroite « 1c »

**La règle.** Au téléphone, une carte étroite montre :
- l'icône et le chiffre en haut ;
- le nom en entier ;
- une phrase d'état ;
- une seule ligne de commandes de 44 px.

Toucher la carte ouvre sa popup. Une lumière a sa bascule en haut à droite et son pourcentage dans la phrase.

**Pourquoi.** Un doigt attrape une cible de 44 px. Un nom coupé ne dit plus de quel appareil il s'agit.

**Oui.** « Lampe du salon », « Allumée · 60 % », la bascule en haut à droite.
**Non.** « Lampe du s… », ou un appui long à découvrir pour ouvrir la popup.

**Tenu par.** ADR 0202, 0380 · `tests/carte_mesure_etroite.test.mjs`

### 4. Le bouton du coin change la taille

**La règle.** En mode édition, le bouton ⤢ du coin d'une carte bascule compacte ↔ standard. Il ne change jamais la
largeur : la largeur simple ou double se règle dans la fiche de la carte.

**Pourquoi.** Un seul geste, un seul sens. Le même bouton ne doit pas faire deux choses selon la vue.

**Oui.** Un appui sur ⤢ : la carte passe de 184 à 88 px de haut.
**Non.** Un appui sur ⤢ : la carte passe sur deux colonnes.

**Tenu par.** ADR 0159 · `tests/lot13r_taille_edition.test.mjs`

### 5. Un appareil = sa carte + sa popup

**La règle.** Un appareil n'a jamais de vue à lui. Il a une carte, et cette carte ouvre une popup (sa fiche) qui porte
tout le reste : réglages, historique, planning.

**Pourquoi.** Une vue par appareil multiplie les entrées de menu et éloigne l'appareil de sa pièce.

**Oui.** Le robot aspirateur : sa carte dans la pièce, sa fiche à onglets au toucher.
**Non.** Une entrée « Robot » dans la barre latérale.

**Tenu par.** ADR 0153

### 6. Pas de boîte dans une boîte

**La règle.** Des cartes ne se posent jamais dans un panneau. Deux panneaux côte à côte ont la même hauteur. Une longue
liste défile dans sa carte. Ce qu'une maquette pleine page ne montre pas s'en va.

**Pourquoi.** Un cadre dans un cadre brouille ce qui est cliquable et ce qui ne l'est pas.

**Oui.** Une rangée de cartes posée sur le fond de la vue, sous un titre de section.
**Non.** Un grand panneau « Pièces » qui contient des cartes de pièces.

**Tenu par.** cette page.

### 7. Rien qui ressemble à une carte sans en être une

**La règle.** Dans une rangée de cartes, chaque élément est une vraie carte. Le chemin « voir tout » est un lien de
l'en-tête de la section. Une rangée trop longue défile (avec des flèches à la souris), elle n'est pas coupée.

**Pourquoi.** Une fausse carte trompe le doigt : on s'attend à un appareil, on tombe sur un lien.

**Oui.** L'en-tête « Scénarios », et à droite « 9 scénarios → ».
**Non.** Une dernière carte « + 6 autres » au bout de la rangée.

**Tenu par.** cette page.

### 8. Un état qui se dessine se dessine

**La règle.** Quand une carte peut montrer son état par un dessin, elle le fait. Le modèle est celui des portes et des
fenêtres : l'ouvrant dessiné en fond, ouvert ou fermé, ambré quand il est ouvert.

**Pourquoi.** Un dessin se lit de loin, avant le texte.

**Oui.** La carte d'une fenêtre ouverte : la fenêtre dessinée entrouverte, teinte ambre. La fiche d'un robot : l'appareil
vu de dessus, le sol qui défile sous lui au travail, figé et gris en pause, posé sur sa base.
**Non.** Une pastille « Ouvert » en texte seul quand un dessin dirait la même chose.

**Tenu par.** cette page · `src/dessinrobot.jsx` › `DessinRobot` · ADR 0389 · `tests/dessin_robot.test.mjs`

---

## 2. Les popups et les menus

### 9. Une popup a la hauteur de son contenu

**La règle.** Une popup prend la hauteur de ce qu'elle contient. Seules les popups à onglets ont une hauteur fixe, pour
ne pas sauter d'un onglet à l'autre.

**Pourquoi.** Une petite popup dans une grande boîte vide paraît cassée ; une popup à onglets qui change de taille fait
bouger la croix sous le doigt.

**Oui.** La fiche d'une prise, courte ; la fiche d'un robot, à onglets, de hauteur constante.
**Non.** Toutes les fiches à 80 % de l'écran.

**Tenu par.** ADR 0055

### 10. Une seule croix pour fermer

**La règle.** Une popup a une seule croix. Elle est la dernière de la ligne d'en-tête, à la taille et sur la ligne de ses
voisins (épingle, roue). Elle n'est jamais posée au-dessus de l'en-tête.

**Pourquoi.** Le doigt va toujours au même endroit pour fermer, et un lecteur d'écran entend partout le même
« Fermer la fiche ».

**Oui.** `<TitreFeuille>{nom}</TitreFeuille>` : le titre à gauche, la croix commune posée d'office à droite. Dans un
en-tête fait main, `<CroixFeuille />` est le dernier enfant de la ligne.
**Non.** Un `<button>×</button>` placé en absolu dans le coin de la feuille.

**Tenu par.** `src/ui.jsx` › `CroixFeuille` · `src/ui.jsx` › `TitreFeuille` · `src/ui.jsx` › `DESSIN_CROIX` ·
ADR 0055, 0374 · `tests/feuilles.test.mjs`

### 11. Jamais de `<select>` natif

**La règle.** Tout menu passe par `ListeChoix`, toute saisie avec suggestions par `ChampSuggere`.

**Pourquoi.** La liste d'un `<select>` natif est dessinée par le système : blanche sous Windows, quel que soit le thème.

**Oui.** `<ListeChoix value={…} options={…} onChange={…} />`.
**Non.** `<select><option>…</option></select>`, même pour deux choix.

**Tenu par.** `src/ui.jsx` › `ListeChoix` · `src/ui.jsx` › `ChampSuggere` · ADR 0051 · `tests/choix.test.mjs`

### 12. Ce qui est commun à toutes les vues est au même endroit

**La règle.** Une commande commune à toutes les vues se trouve au même endroit partout. Le bandeau du mode édition est le
premier enfant du contenu de la vue.

**Pourquoi.** « Pourquoi elle n'est jamais au même endroit ? » : on ne cherche pas deux fois la même commande.

**Oui.** En mode édition, le bandeau est toujours en tête, sous la barre de la vue.
**Non.** Le bandeau en bas d'une vue et en haut d'une autre.

**Tenu par.** `src/edition/briques.jsx` › `BandeauEdition` · ADR 0024 · `tests/edition_en_tete.test.mjs`

### 13. Un réglage ne se règle qu'à un endroit

**La règle.** Paramètres ne répète pas un réglage que la page sait déjà régler.

**Pourquoi.** Deux endroits pour le même réglage, c'est deux endroits qui finissent par se contredire.

**Oui.** La taille d'une carte se règle sur la carte, en mode édition.
**Non.** La même taille aussi dans Paramètres › Vues.

**Tenu par.** `tests/edition_en_tete.test.mjs`

---

## 3. Les barres, les rangées, les puces

### 14. Une barre de tête de vue fait 59 px

**La règle.** Une barre en tête de vue (réglages rapides, confort…) suit la norme de la barre des Scénarios : 59 px de
haut, 10 px de marge, des groupes de 36 à 37 px, sur une seule rangée.

**Pourquoi.** Plus épaisse, la barre est « trop épaisse » et vole la place des cartes.

**Oui.** La barre de confort des pièces, à la hauteur de celle des Scénarios.
**Non.** Une barre de 80 px parce que ses boutons ont des libellés sur deux lignes.

**Tenu par.** ADR 0051

### 15. Au téléphone, une rangée de tuiles reste sur une ligne

**La règle.** Au téléphone, une rangée de tuiles d'état s'adapte à la largeur et reste sur une seule ligne. Elle ne passe
jamais à la ligne et ne force pas deux colonnes.

**Pourquoi.** La rangée se lit comme un tout : Portes, Fenêtres, Mouvement, Caméras côte à côte.

**Oui.** Quatre tuiles plus étroites, sur une ligne.
**Non.** Deux tuiles par ligne, sur deux lignes.

**Tenu par.** cette page.

### 16. Au téléphone, rien à faire glisser pour atteindre une commande

**La règle.** Au téléphone, on ne fait pas glisser une barre d'outils pour atteindre ses commandes. Si elles ne tiennent
pas sur une rangée, la barre passe sur deux.

**Pourquoi.** « Obligé de scroller, on voit mal » : une commande cachée hors de l'écran n'existe pas.

**Oui.** La barre des ambiances en deux rangées au téléphone.
**Non.** Une barre qui défile de côté, avec ses derniers boutons hors champ.

**Tenu par.** ADR 0051 · `tests/barre_ambiances.test.mjs`

### 17. Une puce choisie est en bleu plein

**La règle.** Toute puce choisie (navigation, filtre, onglet, mode, zone, option de menu) prend `--o-accent-fond`, avec un
texte blanc. Une couleur qui porte un sens devient un petit repère, jamais la teinte de la puce.

**Pourquoi.** On reconnaît « choisi » d'un coup d'œil, sous tous les thèmes et dans toutes les vues.

**Oui.** `style={puce(choisie)}`. Une puce « Alerte » choisie : en bleu, avec un petit point rouge à gauche.
**Non.** Une puce choisie teintée en rouge parce qu'elle parle d'une alerte.

**Tenu par.** `src/styles.js` › `puce` · `--o-accent-fond` · ADR 0051 · `tests/lot15_contraste_puces.test.mjs`

---

## 4. Les thèmes

### 18. Jamais de couleur en dur dans un composant

**La règle.** Un composant ne prend ses couleurs que dans les jetons `--o-…` du thème. Aucun `#fff`, aucun `rgb(…)` posé
pour « faire joli ». Seule exception : le blanc sur l'accent, que la garde calcule pour qu'il se lise.

**Pourquoi.** Une couleur en dur est juste dans un thème et fausse dans les quatorze autres.

**Oui.** `color: 'var(--o-text2)'`.
**Non.** `color: '#8a8f98'`.

**Tenu par.** `src/contraste.js` › `garde` · ADR 0060

### 19. Le contraste est tenu par la garde

**La règle.** La garde de contraste ajuste chaque thème : les textes tiennent leur seuil sur la page et sur les cartes,
et le seuil WCAG (4,5:1) sur les puces. Un thème ne la contourne pas, il se règle pour la passer.

**Pourquoi.** Un thème garde sa personnalité, mais aucun texte ne passe sous son seuil de lisibilité.

**Oui.** Un thème clair dont la garde fonce le gris secondaire juste ce qu'il faut.
**Non.** Un jeton figé avec `!important` pour échapper à la garde.

**Tenu par.** `src/contraste.js` › `garde` · `src/contraste.js` › `SEUILS` · ADR 0060 · `tests/contraste.test.mjs`

### 20. L'arrondi suit le thème

**La règle.** Un dessin repris dans tous les thèmes prend l'arrondi du thème appliqué (`--o-radius`), jamais celui du
thème d'où il vient.

**Pourquoi.** Une pilule de Prisme posée dans un thème à angles droits jure avec tout le reste.

**Oui.** `borderRadius: 'var(--o-radius)'`.
**Non.** `borderRadius: 999` recopié du thème d'origine.

**Tenu par.** `--o-radius` · `tests/audit_themes_1311_rayons.test.mjs`

### 21. Les liserés valent pour toutes les cartes

**La règle.** Le réglage « Liserés » (Paramètres › Apparence) borde toutes les cartes et tous les panneaux : un trait de
1 px quand il est activé, aucun quand il est coupé.

**Pourquoi.** Un réglage d'apparence qui ne vaut que pour la moitié de l'écran paraît cassé.

**Oui.** `border: 'var(--o-bw,1px) solid var(--o-bd2)'`.
**Non.** `border: 'none'` en dur sur une carte.

**Tenu par.** `--o-bw` · ADR 0152 · `tests/liseres.test.mjs`

### 22. Les effets valent pour tout le tableau de bord

**La règle.** Les effets nés avec Prisme (survol, verre, filet de lumière des fiches, appui) valent pour tous les thèmes.
La forme et l'écriture, elles, restent propres à chaque thème.

**Pourquoi.** Un geste répond de la même façon partout ; c'est le dessin qui change d'un thème à l'autre.

**Oui.** Une carte qui réagit au survol sous GitHub comme sous Prisme.
**Non.** Un survol réservé à un seul thème.

**Tenu par.** `tests/effets_partout.test.mjs`

### 23. Un décor se fond dans le vrai fond du thème

**La règle.** Un décor (ciel météo, voile, halo) s'efface vers le vrai fond de la page (`--o-bggrad`), jamais vers une
couleur en dur. Une rangée qui défile n'a pas d'ombre rognée.

**Pourquoi.** Un fondu vers le mauvais noir laisse une bande visible sur un thème sur deux.

**Oui.** Un masque qui laisse apparaître le fond de la page.
**Non.** `linear-gradient(transparent, #0b0d12)`.

**Tenu par.** `--o-bggrad` · ADR 0059 · `tests/accueil_ciel_fondu.test.mjs`

### 24. Jamais deux pastilles de la même couleur

**La règle.** Dans un choix de couleurs, deux pastilles n'ont jamais la même couleur. Une option qui ferait doublon avec la
couleur du thème s'en va.

**Pourquoi.** Deux pastilles identiques donnent l'impression d'un choix qui ne fait rien.

**Oui.** Les couleurs d'accent, chacune différente de celle du thème.
**Non.** Une pastille « Bleu » à côté du bleu du thème.

**Tenu par.** ADR 0051

---

## 5. L'Accueil

### 25. L'Accueil ne garde que l'essentiel

**La règle.** L'Accueil ne montre que ce qui sert au quotidien. L'alarme y est une tuile de la bannière qui mène à la
vue Sécurité, pas un grand panneau.

**Pourquoi.** L'Accueil est la page qu'on regarde dix fois par jour : chaque bloc doit mériter sa place.

**Oui.** Une tuile « Alarme · désarmée » qui ouvre Sécurité.
**Non.** Le clavier de l'alarme en entier sur l'Accueil.

**Tenu par.** ADR 0035

### 26. « En ce moment » ne montre que des événements

**La règle.** « En ce moment » montre ce qui se passe : une lecture, un robot qui tourne, un lave-vaisselle, le
chauffage, un volet qui bouge. Jamais les prises ni les interrupteurs.

**Pourquoi.** Une prise allumée n'est pas un événement ; vingt lignes de prises noient ce qui compte.

**Oui.** « Robot aspirateur · en cours, 12 min ».
**Non.** « Prise du bureau · allumée ».

**Tenu par.** ADR 0035

### 27. « À surveiller » est sur le côté, et rare

**La règle.** « À surveiller » vit sur le côté (le rail), pas dans la colonne principale. Un point d'attention doit être
actionnable et rare. Une information de faible valeur (appareils hors ligne, chute d'entités) est du bruit.

**Pourquoi.** Ce qui prend de la place pour rien finit par ne plus être lu, même quand c'est important.

**Oui.** « Fenêtre ouverte, chauffage en marche » avec un bouton pour agir.
**Non.** « 3 appareils hors ligne » en permanence au milieu de l'Accueil.

**Tenu par.** ADR 0025, 0028

### 28. Le rail est une colonne qui défile seule

**La règle.** Sur ordinateur et tablette, le rail de l'Accueil est une colonne collante de la hauteur de la fenêtre. Elle
défile seule, avec tous ses widgets dépliés.

**Pourquoi.** Le rail reste à portée sans repousser le contenu principal, et rien ne se replie en lignes illisibles.

**Oui.** Le rail qui défile pendant que les cartes restent en place.
**Non.** Les widgets du rail repliés en lignes compactes, ou qui débordent sous les caméras.

**Tenu par.** ADR 0150 · `tests/rail_defilant.test.mjs`

### 29. Au téléphone : deux pages au doigt, pas d'onglets

**La règle.** Au téléphone, l'Accueil a deux pages (Maison, En ce moment) qu'on fait glisser au doigt, avec deux petits
points pour repère. Jamais une barre d'onglets en boutons. Les boutons d'armement de l'alarme restent des boutons.

**Pourquoi.** Le geste naturel d'un téléphone, et toute la hauteur pour le contenu.

**Oui.** Un glissement vers la gauche, le second point s'allume.
**Non.** Deux boutons « Maison | En ce moment » en haut de l'écran.

**Tenu par.** ADR 0025

---

## 6. Les écrans et les profils

### 30. La disposition est propre à chaque type d'écran

**La règle.** L'ordre, la largeur et la taille des cartes sont propres à chaque type d'écran : ordinateur, tablette,
téléphone. Seul le contenu (ajouter, modifier, retirer une carte ou une entité) se synchronise.

**Pourquoi.** Ce qui est bien rangé sur un écran de 27 pouces ne l'est pas sur un téléphone.

**Oui.** Une carte déplacée sur la tablette ne bouge pas sur le téléphone ; une carte ajoutée apparaît partout.
**Non.** Un rangement fait au téléphone qui chamboule l'ordinateur.

**Tenu par.** ADR 0052 · `tests/disposition.test.mjs`

### 31. L'interface est propre à chaque profil

**La règle.** Les favoris, les sections et widgets de l'Accueil et le rangement appartiennent à chaque profil, Admin
compris. Un geste de l'Admin ne se recopie pas chez les autres. Seules les cartes d'une vue restent partagées.

**Pourquoi.** « L'interface est propre à chacun » : chacun range sa maison comme il la vit.

**Oui.** L'Admin retire un widget de son Accueil ; les autres profils le gardent.
**Non.** Un favori ajouté par l'Admin qui apparaît chez tout le monde.

**Tenu par.** ADR 0223, 0323 · `tests/reglages_par_profil.test.mjs`

### 32. Ranger ses cartes n'est pas un privilège d'administrateur

**La règle.** Tout profil peut ranger ses cartes. Les droits séparent ce qu'une erreur coûte, pas ce qui est commun ou
personnel.

**Pourquoi.** Déplacer une carte ne casse rien ; le refuser n'apprend rien à personne.

**Oui.** Un profil sans droit d'administration déplace et redimensionne ses cartes.
**Non.** Le mode édition caché à tous les profils sauf l'Admin.

**Tenu par.** ADR 0125

### 33. Un geste vaut partout, à la souris comme au doigt

**La règle.** Un geste ou une fonction s'applique partout où il a du sens (toutes les vues, toutes les grilles) et sur
tous les écrans (ordinateur à la souris, téléphone au doigt). Un essai partiel ne se livre pas comme fini.

**Pourquoi.** Un geste qui marche dans une vue et pas dans sa voisine passe pour une panne.

**Oui.** Glisser une carte marche à la souris et au doigt, dans toutes les vues.
**Non.** Le glisser-déposer à la souris seulement, « le doigt viendra plus tard ».

**Tenu par.** cette page.

### 34. Au téléphone, pas une carte par rangée quand trois tiennent

**La règle.** Au téléphone, un choix de cartes ou de vignettes se met par trois (par deux sous 350 px), jamais une par
rangée quand trois tiennent.

**Pourquoi.** Une colonne de grandes vignettes oblige à faire défiler pour comparer.

**Oui.** Les thèmes de Paramètres › Apparence par trois au téléphone.
**Non.** Quinze thèmes l'un sous l'autre.

**Tenu par.** ADR 0051

### 35. Le bouton de l'assistant est un micro

**La règle.** Le bouton de l'assistant est un micro :
- dans l'en-tête, un rond gris comme ses voisins ;
- au milieu de la barre du bas, un carré arrondi rose → violet, pris dans les jetons.

Aux deux endroits, il dicte.

**Pourquoi.** On parle à l'assistant : le micro le dit avant toute explication.

**Oui.** Un appui sur le micro de la barre du bas : la dictée démarre.
**Non.** Une bulle de discussion, ou un micro qui ouvre seulement une fenêtre de texte.

**Tenu par.** ADR 0053

---

## 7. Le comportement

### 36. Ce qui se passe plus tard vit dans Home Assistant

**La règle.** Tout ce qui doit se produire plus tard (minuteur, planning, extinction) est tenu par le composant
Home Assistant, jamais par l'onglet du navigateur. L'écran montre un décompte à la seconde.

**Pourquoi.** Un onglet se ferme, un téléphone se met en veille : le minuteur, lui, doit tenir.

**Oui.** « Extinction dans 4 min 12 s », et la lampe s'éteint même si l'onglet est fermé.
**Non.** Un `setTimeout` dans le navigateur.

**Tenu par.** ADR 0064, 0066 · `tests/decompte_minuteur.test.mjs`

### 37. Un état optimiste expire

**La règle.** Quand l'écran montre un état avant que Home Assistant l'ait confirmé, cet état passe par `useOptimiste` et
expire. Home Assistant fait autorité. « Fermé » ne se décide pas sur un zéro pile : le seuil est réglable.

**Pourquoi.** Une carte qui garde un état que la maison n'a pas pris ment, et longtemps.

**Oui.** `const [ov, setOv] = useOptimiste(etat)` : sans confirmation, l'avance expire et la carte revient à l'état
réel.
**Non.** Un `useState` qui affiche « allumée » pour toujours après l'appui.

**Tenu par.** `src/optimiste.js` › `useOptimiste` · ADR 0105 · `tests/optimiste.test.mjs`

### 38. Tout marche sans configurer

**La règle.** Chez quelqu'un d'autre, tout doit marcher sans rien configurer. Une fiche de réglage complète la
découverte, elle ne la remplace jamais. La découverte travaille par famille ou par emplacement, jamais par domaine.

**Pourquoi.** Loggia s'installe chez des gens qui n'ont pas la même maison, ni les mêmes noms.

**Oui.** Un volet trouvé tout seul, qu'on peut ensuite corriger dans sa fiche.
**Non.** Une carte vide « Choisissez vos entités » à la première ouverture.

**Tenu par.** ADR 0164

---

## 8. Les textes et les langues

### 39. Aucun texte en clair dans le JSX

**La règle.** Tout texte affiché passe par `tr()`, et chaque clé existe dans les sept langues.

**Pourquoi.** Un texte en clair reste en français dans l'interface allemande.

**Oui.** `{tr('Fermer la fiche')}`.
**Non.** `<span>Fermer</span>`.

**Tenu par.** `src/i18n.js` › `tr` · ADR 0146 · `tests/tout_tr_traduit.test.mjs`

### 40. Le français vouvoie, les autres langues tutoient

**La règle.** Le français vouvoie. L'allemand, l'espagnol, l'italien et le néerlandais tutoient partout, comme
l'interface de Home Assistant. On ne passe jamais une langue au vouvoiement parce que le français vouvoie.

**Pourquoi.** On lit Loggia à côté de Home Assistant : le même registre, sinon tout sonne faux.

**Oui.** « Choisissez une pièce » ; « Wähle einen Raum ».
**Non.** « Wählen Sie einen Raum ».

**Tenu par.** `tests/langues_registre_de.test.mjs` · `tests/langues_registre_it_nl.test.mjs`

### 41. Les textes polonais existants ne se réécrivent pas

**La règle.** Une valeur polonaise existante ne se réécrit jamais : elle vient d'un contributeur polonais. On peut ajouter
des clés neuves. Si un mot est long, c'est la mise en page qui s'adapte, pas le mot.

**Pourquoi.** Une traduction relue par quelqu'un dont c'est la langue vaut mieux qu'une correction faite de loin.

**Oui.** Une puce qui passe sur deux lignes pour un mot polonais long.
**Non.** Un mot polonais raccourci pour tenir dans la puce.

**Tenu par.** ADR 0141 · `tests/polonais_seba882.test.mjs`

### 42. Un texte de vitrine dit ce que Loggia fait vraiment

**La règle.** Un texte de vitrine (README, bandeau, notes de version, présentation) décrit ce que Loggia fait vraiment,
sur un ton personnel et calme, à la première personne. Pas de slogan, rien de repris tel quel d'ailleurs.

**Pourquoi.** Loggia est fait par un particulier pour sa maison, puis partagé. Une promesse en trop déçoit.

**Oui.** « Je l'ai fait pour ma maison, puis je l'ai adapté pour le partager. »
**Non.** « La solution domotique ultime. »

**Tenu par.** cette page.

---

## 9. Les maquettes

### 43. Une maquette se reprend à la lettre, format par format

**La règle.** Une maquette se reprend à la lettre, pour chaque format qu'elle montre : ordinateur, tablette, téléphone.
On ne garde pas l'existant à sa place. Seul le gabarit des cartes passe avant elle (voir l'ordre de priorité).

**Pourquoi.** Une maquette est une décision déjà prise. La réinterpréter, c'est la défaire.

**Oui.** La maquette téléphone montre deux colonnes : le téléphone a deux colonnes.
**Non.** « J'ai gardé une colonne au téléphone, c'était déjà comme ça. »

**Tenu par.** cette page.

### 44. Une couleur de maquette s'applique en entier

**La règle.** Quand une maquette colore une carte, toute la couleur s'applique : le lavis, l'icône et le repère.

**Pourquoi.** Une couleur réduite « par prudence » ne ressemble plus à la maquette.

**Oui.** La carte de la maquette en ambre : le fond lavé d'ambre, l'icône ambre, le repère ambre.
**Non.** Seule l'icône en ambre, sur un fond neutre.

**Tenu par.** cette page.

### 45. Ce qu'une capture montre s'applique tel quel

**La règle.** Les valeurs, les seuils et l'ordre des couleurs écrits sur une capture s'appliquent tels quels. On ne
redemande pas ce qui est écrit dessus.

**Pourquoi.** « Les valeurs sont inscrites sur les photos » : redemander fait perdre du temps à celui qui les a écrites.

**Oui.** La capture montre une jauge verte jusqu'à 800, orange jusqu'à 1 200 : la jauge fait cela.
**Non.** « Quels seuils voulez-vous pour la jauge ? »

**Tenu par.** cette page.

---

## 10. Les appareils

### 46. Une commande n'apparaît que si l'entité la publie

**La règle.** Une fiche ne montre une commande, un mode, une vitesse, une mesure ou un onglet que si l'appareil le publie
vraiment dans Home Assistant : le bit de son `supported_features`, sa liste (`preset_modes`, `percentage_step`), ou une
entité sœur reconnue à sa clé de traduction, disponible. Ce qu'il ne publie pas n'apparaît pas — ni case vide, ni bouton
grisé — et les phrases ne parlent pas de ce qu'il n'a pas.

**Pourquoi.** « Les commandes doivent correspondre à l'entité : l'écran, moi je l'ai, mais pas tout le monde. » Une commande
qu'un appareil n'a pas trompe et ne fait rien.

**Oui.** Un purificateur sans écran ni verrou : Marche/Arrêt et Minuterie seulement ; sans mode nuit, pas de pilule Nuit ni
de plage « Nuit » au planning ; sans crans, aucun « vitesse moyenne » dans le bandeau.
**Non.** Un bouton Écran grisé « parce que d'autres en ont un », ou cinq pilules dont deux ne font rien.

**Tenu par.** `src/purificateur.js` › `vuePurificateur` · ADR 0387 · `tests/purificateur_commandes.test.mjs`
