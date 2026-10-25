# 0223 — L'apparence suit le profil, un écran peut avoir la sienne

*18 octobre 2026 — accepté (suite du chantier de synchronisation, ADR 0220–0222)*

## Le problème

Une relecture du dépôt public, qu'il nous a transmise (18/10), relevait un
désaccord : le README disait de l'apparence « Tous ces réglages sont propres à
l'appareil », et le composant classait le thème parmi les réglages communs.

Mesuré dans le code, c'était pire qu'un désaccord : l'apparence était rangée
**à moitié** à chaque endroit.

| Réglage | Où il vivait |
|---|---|
| mode clair / sombre, thème, « Suivre Home Assistant » | le **navigateur** (`loggia-mode`, `loggia-theme`, `loggia-ha`) — donc propre à l'appareil ET à l'adresse : accès local et accès distant différaient |
| teinte d'état, fonds, rayons, liserés… | la **maison** (`loggia_look`), commune à tous les profils |

Guillaume et Luna ne pouvaient donc pas avoir chacun son thème, et la même
personne ne retrouvait pas le sien d'un écran à l'autre.

## La décision

Son choix, « C » : **l'apparence suit le profil, et un écran peut avoir la
sienne** — le même modèle que la mise en page (ADR 0222).

```js
loggia_apparence = {            // rangée par profil (`__profils`, ADR 0185)
  mode, theme, ha, look,        // l'apparence du profil
  appareils: { '<id>': { … } }, // celle d'un écran qui a choisi la sienne
}
```

- La fiche d'appareil gagne `apparence` (oui / non), **indépendant** de
  `propre` : une tablette murale peut garder la mise en page commune et un
  thème clair, ou l'inverse. L'interrupteur vit dans Paramètres › Appareils.
- Un écran à part passe devant son profil **champ par champ** : il peut
  changer son mode et garder le thème du profil.
- **Seul un geste écrit** (choisir un mode, un thème, une teinte). Le
  démarrage n'écrit jamais : sinon le premier écran allumé imposerait son
  thème à tous ceux du profil.
- **Un champ que personne n'a posé** laisse l'écran tel qu'il était : son
  navigateur pour le mode et le thème, la maison pour `loggia_look`. Rien ne
  change donc sous les yeux à l'installation ; c'est le premier choix fait
  après qui se met à suivre le profil.
- L'apparence se relit quand la configuration change : réponse du serveur,
  autre profil, réglage fait sur un autre écran.
- Le navigateur garde une copie du mode : `index.html` la lit AVANT React pour
  qu'un thème sombre ne s'ouvre pas sur un éclair blanc.

### Le piège évité

`cfgSet` applique une **fonction** à la part de **chaque** profil — c'est le
geste de structure qui renomme une pièce partout. Écrite ainsi, l'apparence
de Luna serait devenue celle de Guillaume. `poserApparence` passe donc une
valeur, calculée sur la seule part de celui qui regarde. Un test le garde.

## Ce que cela entraîne

- Le README dit maintenant ce que Loggia fait.
- La clé est ouverte à tout compte, comme le reste de l'apparence
  (`APPARENCE`, `store.py`).
- Redémarrage de Home Assistant nécessaire : le composant change.
- Trois textes nouveaux dans les sept langues ; le polonais est marqué pour
  relecture.

## Ce qui n'est pas fait ici

- La langue (`loggia-langue`), les effets météo et la barre du bas restent où
  ils étaient : ils ne font pas partie de la section Apparence.
- `loggia_look` n'est plus écrit ; il reste la valeur de départ de la maison.
