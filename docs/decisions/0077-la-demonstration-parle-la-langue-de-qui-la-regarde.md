# ADR 0077 — La démonstration parle la langue de qui la regarde

**Statut** : décidé et appliqué le 2026-09-23 (v3.72.3).

*Le numéro 0076 revient au placement libre des cartes, écrit en parallèle dans
une autre branche.*

## Contexte

Loggia parle sept langues depuis la v3.72.2 (ADR 0070). La démonstration en
ligne est la vitrine : quelqu'un qui arrive en polonais y lisait une interface
polonaise, et une maison française. « Salle de bain », « Enceinte salon »,
« Salon CO2 » au milieu de mots polonais.

La règle pour une VRAIE installation ne fait pourtant aucun doute : un nom de
pièce, d'appareil ou d'entité vient de Home Assistant. Il est déjà dans la
langue de la maison, il a été tapé par quelqu'un, et Loggia n'y touche jamais.
Traduire ce que l'utilisateur a nommé serait une faute.

Mais la maison de la démonstration n'appartient à personne. Elle est inventée,
et ses noms sont les nôtres. Les laisser en français n'est pas une fidélité,
c'est un oubli.

## Décision

- **La démonstration traduit ses propres noms**, et elle seule. Deux tables
  dans `demo.js` : `LIEUX` (sept lieux) et `APPAREILS` (cent dix noms), avec
  `lieu()` et `etiquette()` pour les lire.
- **Le nom d'un LIEU est une clé.** Il relie la configuration, l'index des
  zones, les scénarios, la règle des fenêtres et le journal. Il ne s'écrit donc
  qu'à un seul endroit, en français, et tout le reste passe par `lieu()` : les
  deux côtés d'une comparaison parlent toujours la même langue.
- **Le nom d'un APPAREIL n'est qu'une étiquette.** `etiquette()` est appliquée
  une seule fois, dans le constructeur d'état `s()` : les cent vingt
  `friendly_name` sont couverts sans les toucher un par un. Huit autres
  porteurs de nom, que `s()` ne voit pas, sont traités à part — le profil
  invité, la plante, le scénario personnel, les interrupteurs Zigbee dont la
  CLÉ reste française, les sauvegardes.
- **Ce qu'une INTÉGRATION nomme reste tel quel** : « System Monitor Memory
  use », « Home Assistant Core Update ». Ces noms sont anglais même dans une
  maison française — les traduire montrerait une installation qui n'existe pas.
  Les prénoms des habitants non plus.
- **La langue arrive par l'appelant** : `installerDemo(langue)`. Elle est lue
  dans `main.jsx` AVANT que le magasin mémoire ne remplace `localStorage`,
  sinon le `?lang=` de l'URL, écrit juste après, serait invisible.
- **Changer de langue dans la démonstration recharge la page**, avec la langue
  dans l'adresse. Renommer les pièces à chaud demanderait de rebâtir la maison
  entière, puisque leurs noms sont des clés. Le magasin mémoire repart à neuf à
  chaque chargement de toute façon, et le lien devient partageable. Une vraie
  installation ne recharge rien : ses noms viennent de Home Assistant.

## Ce que l'on a trouvé en chemin

**L'icône d'une pièce ne connaissait que deux langues.** `PARENTE`, dans
`App.jsx`, devine le modèle d'une pièce à partir de son nom : canapé pour un
séjour, fourchette pour une cuisine, lit pour une chambre. Sa table ne portait
que des mots français et anglais. Une maison allemande dont les zones
s'appellent « Wohnzimmer » et « Küche » recevait donc la maison grise partout.

Ce n'est pas un défaut de la démonstration : c'est un défaut pour **toute**
maison non francophone, et il est arrivé avec la v3.70.0 sans que rien ne le
signale. Loggia parlait leur langue et ne reconnaissait pas leurs pièces.

Les sept langues y sont désormais. Deux pièges méritent d'être écrits :

- le nom est comparé **en minuscules, sans retirer les accents** — « Salón » et
  « Baño » doivent y figurer accentués, et les variantes sans accent
  (`kueche`, `bano`, `lazienka`) sont ajoutées à côté ;
- `LIGHT_ROOM`, qui range les luminaires, garde le français et l'anglais : lui
  lit des `entity_id`, pas des noms de zone.

**Deux tables de la démonstration figeaient la langue de démarrage.**
`SCN_CFG` et `FEN_CFG` portent un nom de pièce et étaient évaluées à l'import,
avant que `installerDemo` ne connaisse la langue. Elles sont devenues
paresseuses — exactement la méprise de `HUE_CATS()` la veille.

## Conséquences

- **Aucun redémarrage de Home Assistant** : rien du composant ne change, tout
  est dans l'interface. Un rechargement de page suffit.
- Sur une installation réelle, le seul changement visible est l'icône d'une
  pièce dont le nom n'est ni français ni anglais. Rien n'a été retiré des mots
  existants : une maison française ne bouge pas.
- Une langue de plus demandera une colonne dans `LIEUX` et dans `APPAREILS`,
  et ses mots dans `PARENTE`.
- La démonstration reste honnête : son badge et ses données factices n'ont pas
  changé, et rien de ce qu'elle montre ne prétend venir d'une vraie maison.

Tests : tests/accueil_attention.test.mjs réaligné (la table des caméras est
devenue une fonction) ; la suite entière au vert, 936.
