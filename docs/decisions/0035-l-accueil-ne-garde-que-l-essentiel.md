# 0035 — L'Accueil ne garde que l'essentiel

Date : 16/09/2026 (v3.36.0). Statut : acceptée. Retour de l'utilisateur après
les ADR 0033 et 0034 : « je suis difficile mais je cherche à ce que ce soit
parfait ».

## Contexte

L'Accueil portait encore un grand panneau Sécurité — boutons d'armement,
glissière de serrure, rangée de tuiles — alors que la vue Sécurité dit
désormais tout cela dans le même langage. Le panneau « En ce moment »
listait tout appareil allumé, prises et interrupteurs de caméra compris :
« je m'en fiche des prises ». Sur téléphone, les boutons des modes de
l'alarme, coupés au tiers (« Désa… »), ne se lisaient pas. Et la carte Sirène
manquait chez l'utilisateur : sa sirène n'est pas une entité `siren`, comme
beaucoup de sirènes Zigbee qui n'arrivent qu'en `switch`.

## Décision

- **L'alarme est une tuile de la bannière, la première** : son état et son
  mode en trois mots (« Armée · Nuit »), l'icône du mode, la couleur ; un tap
  mène à la vue Sécurité. La phrase des faits ne répète plus l'alarme. Le
  grand panneau quitte l'Accueil, avec ses boutons d'armement et la
  glissière de serrure (la serrure reste dans sa pièce et dans Objets). La
  section `securite` n'existe plus ; un agencement enregistré qui la citait
  l'ignore.
- **« En ce moment » ne dit que ce qui se passe** : un lecteur en lecture,
  un aspirateur ou une tondeuse au travail, le lave-vaisselle en cours, les
  zones qui chauffent, un volet en mouvement. Ni prise, ni ventilateur, ni
  vanne, ni volet à mi-course. La tuile de la bannière en porte le compte —
  « n · En ce moment » — à la place de « appareils actifs », qui comptait
  les prises.
- **Les modes de l'alarme portent leur icône** — bouclier, maison, avion,
  lune, parasol — et le mot s'efface au téléphone ; le décompte d'armement
  reste visible. Le mot reste dans le libellé accessible.
- **Une sirène est reconnue par son domaine ou par son nom** : `siren`, ou
  un `switch`/`input_boolean` dont l'identifiant ou le nom contient « siren »
  (sans accent ni casse) ; celle que l'utilisateur configure
  (`loggia_entities.sirene`) passe devant. La carte l'allume et l'éteint dans
  son domaine ; la durée du test n'existe que pour `siren`.

## Conséquences

L'Accueil compte quatre sections dans sa colonne : Favoris, Scénarios,
Pièces, Caméras. Le calcul de « En ce moment » remonte avant le rendu pour
que la bannière en lise le compte. `RailArm`, `RailSerrure` et
`serrureRailId` disparaissent du code. Non fait : un choix de sirène dans la
feuille des entités de la vue — la clé de configuration est lue, la feuille
ne la propose pas encore.
