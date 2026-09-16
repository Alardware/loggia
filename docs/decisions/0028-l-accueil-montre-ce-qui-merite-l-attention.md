# 0028 — L'Accueil montre ce qui mérite l'attention

Date : 16/09/2026 (v3.29.0). Statut : acceptée. Première étape d'une refonte
de l'Accueil en six étapes, validée par l'utilisateur ; les cinq autres (cartes
pièces parlantes, hero plus bas et tuiles cliquables, dernier événement des
caméras, agenda d'abord, scénarios sur une rangée) auront chacune leur note.

## Contexte

L'Accueil était déjà lisible mais passif : pour savoir si quelque chose
n'allait pas, il fallait parcourir les cartes. Les sources existaient pourtant
— le diagnostic `health.js` (branché sur la seule console de débogage), les
veilles du serveur (CO₂, piles), les fenêtres ouvertes chauffage coupé, les
caméras hors ligne, les capteurs de sûreté, l'alarme — sans qu'aucune vue ne
les rassemble. La carte Sécurité comptait les ouvrants sans distinguer portes
et fenêtres, et ne regardait ni le mouvement ni les caméras. Diagnostic
partagé avec l'utilisateur : « moins embellir que rendre intelligent : montrer
immédiatement ce qui mérite l'attention, repousser le reste derrière un clic ».

## Décision

- **Sécurité en une seconde.** La carte garde ses boutons d'armement et sa
  serrure (règle acquise) ; elle dit d'abord « Alarme désarmée · Tout est
  sécurisé » en vert, ou en ambre ce qui ne l'est pas, puis une ligne d'état
  par famille de capteurs présente : Portes n/n fermées, Fenêtres n/n fermées,
  Mouvement, Caméras n/n en ligne. Une famille sans capteur n'apparaît pas ;
  chaque tuile mène à la vue Sécurité. La ligne « Tout est fermé » disparaît :
  les tuiles portent les mêmes données.
- **« À surveiller » n'existe que quand il le faut.** Aucune carte quand tout
  va bien — pas même en édition ; la bannière dit « Tout va bien » et sa
  pastille reste verte. Dès qu'un point existe, une carte en tête de la colonne
  principale, une ligne par point du plus grave au moins grave, chacune vers
  la vue qui permet d'agir. Jamais un « tout va bien » sur quinze lignes.
- **Des règles nommées, jamais une intuition.** Huit sources : alarme
  déclenchée ; capteurs de sûreté par `device_class` avec les exclusions déjà
  établies (plantes, MeteoAlarm) ; ouvrant ouvert **alarme armée** — ouvert de
  jour, alarme désarmée, n'est pas un point ; CO₂ d'une pièce au palier
  « chargé » (1 200 ppm) ; caméra hors ligne ; chauffage coupé par une fenêtre
  ouverte (module fenêtres) ; piles signalées par les veilles ; incidents du
  diagnostic (intégration muette, passerelle hors service, appareils hors
  ligne, chute simultanée — les résidus sont ignorés, c'est du bruit).
- **Le diagnostic se recalcule en direct**, sur l'Accueil seulement : celui de
  la découverte est un instantané du démarrage, une passerelle revenue en
  ligne y resterait hors service.
- **L'Accueil surveille ce qu'il lit** : mouvement, sûreté, caméras et panneaux
  d'alarme rejoignent les entités sondées, par `device_class` et par domaine,
  jamais par nom.

## Conséquences

Une section de plus dans l'ordre enregistré (`attention`, mise en tête des
agencements existants avec `securite`). Le module pur `src/attention.js`
porte les comptes et les règles ; App.jsx ne fait que lire. Non fait : un
centre d'attention côté serveur (poussé, historisé) — le front agrège ce
qu'il voit et ce que deux commandes lui disent toutes les trente secondes.

Amendée le 16/09/2026 (v3.30.0, ADR 0029), sur deux retours de l'utilisateur :
la carte « À surveiller » vit dans le rail, avec En ce moment et Rappels (sur
téléphone, la seconde page ; la bannière garde le compte des points) ; les
points « n appareils hors ligne » et « entités tombées ensemble » du
diagnostic sont retirés — « prend de la place pour rien ».
