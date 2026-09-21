# 0064 — Le minuteur d'extinction, tenu par Home Assistant

Date : 21/09/2026 (v3.64.0). Statut : acceptée. Demande : « pourquoi Loggia
doit rester ouvert, c'est absurde, et je n'ai pas le décompte ».

## Contexte

La fiche d'une lampe et celle d'une prise proposent « +30 min » : éteindre
l'appareil dans une demi-heure. Ce minuteur vivait dans l'onglet du
navigateur — un `setTimeout` et une table en mémoire. Trois défauts :

- **fermer l'écran l'annulait**, sans rien dire : la lampe restait allumée ;
- **un autre appareil ne le voyait pas** : posé sur la tablette, invisible
  au téléphone ;
- **pas de décompte** : « Extinction dans 30 min », arrondi à la minute
  supérieure, relu toutes les quinze secondes.

La ligne l'avouait — « tant que Loggia reste ouvert » —, ce qui ne le rendait
pas moins absurde pour un minuteur de maison.

## Décision

- **Le minuteur vit dans le composant** (`custom_components/loggia/minuteurs.py`),
  comme le planning des robots : une heure de fin par appareil, gardée dans le
  magasin (`loggia_minuteurs`), un rendez-vous (`async_call_later`) qui éteint à
  l'heure. Il part même quand aucun écran n'est ouvert.
- **Le temps s'ajoute** : réappuyer sur « +30 min » prolonge ce qui reste. Au
  plus 24 h devant soi, cinquante minuteurs en cours.
- **Éteint à la main avant l'heure, le minuteur s'efface** — il ne doit pas
  éteindre la lampe qu'on rallumera plus tard. Un appareil qui décroche du
  réseau (`unavailable`) n'a pas été éteint : son minuteur tient.
- **Home Assistant redémarre** : les minuteurs sont relus ; celui qui est
  arrivé à échéance pendant l'arrêt s'exécute au démarrage — « dans 30 min »
  voulait dire « éteinte à telle heure ».
- **L'extinction est la main de celui qui a posé le minuteur**, différée : elle
  part avec son contexte, comme un scénario, et laisse une ligne au journal.
- **Droits** : trois commandes ouvertes à tout compte connecté
  (`loggia/minuteurs/etat|poser|annuler`), mais seulement sur ce que ce compte
  a le droit de piloter — le composant éteint lui-même, la vérification de
  Home Assistant n'aurait pas lieu (audit du 18/09). Qui pose le minuteur vient
  de la session, jamais du message.
- **L'écran compte à la seconde** (`src/minuteur.js`) : il lit l'heure de fin et
  l'heure du SERVEUR, dont il tire l'écart avec l'horloge de l'appareil — une
  tablette qui retarde n'annonce pas trois minutes de trop. La rangée montre
  « Extinction à 20:38 » et le décompte « 29:51 » en chiffres tabulaires.
- **Sans réponse du composant, pas de rangée** : un minuteur qui mourrait avec
  l'onglet ne se propose plus.

## Conséquences

- **Redémarrer Home Assistant** après la mise à jour : les commandes WebSocket
  s'enregistrent au démarrage. Avant, la rangée « Minuteur » n'apparaît pas.
- La démo simule le composant : même décompte, même cumul.

Tests : tests/python/test_minuteurs.py (13), tests/minuteur.test.mjs (4).
