# 0065 — Le test de sirène, tenu par Home Assistant

Date : 22/09/2026 (v3.65.0). Statut : acceptée. Origine : l'audit du 22/09
(plan d'évolution, point A1), sur « go » de l'auteur ; la règle est celle de
l'ADR 0064 — une action différée ne vit jamais dans l'onglet.

## Contexte

La carte Sirène de la vue Sécurité (ADR 0034) propose « Test sonore (3 s) ».
Pour une sirène qui gère la durée (`SirenEntityFeature.DURATION`), Home
Assistant l'éteignait lui-même. Pour les autres — un `siren.*` sans ce
drapeau, ou une sirène branchée sur un `switch.*` —, c'était l'onglet qui
comptait : `turn_on`, puis un `setTimeout` de trois secondes avant `turn_off`
(`src/App.jsx`, `CvSirene`). Onglet fermé, page rechargée ou connexion perdue
pendant ces trois secondes : la sirène restait allumée. Le même défaut que le
« +30 min » d'avant la v3.64.0, en plus bruyant — et la dernière action de la
maison encore tenue par le navigateur (346 temporisateurs relus, un seul en
cause).

## Décision

- **Le test vit dans le composant** (`custom_components/loggia/sirene.py`) :
  une commande `loggia/sirene/tester` allume la sirène ; si elle gère la
  durée, elle part avec `duration: 3` et il n'y a rien à tenir ; sinon un
  rendez-vous (`async_call_later`) l'éteint trois secondes plus tard. Il part
  et s'arrête même quand aucun écran n'est ouvert.
- **Réappuyer pendant le test repart de zéro** : le rendez-vous est remplacé,
  la sirène n'est pas coupée au milieu du second essai.
- **Une sirène qui sonne pour de vrai ne se teste pas** : allumée sans qu'un
  test soit en cours, la commande est refusée — un essai ne doit jamais
  couper une alerte trois secondes plus tard.
- **Home Assistant redémarre pendant un test** : l'entrée est relue au
  démarrage (`loggia_sirene_test`) et la sirène éteinte aussitôt — un
  redémarrage dure plus que trois secondes, elle a assez sonné.
- **Le test est la main de celui qui appuie** : les deux appels partent avec
  son contexte, comme un scénario, et laissent une ligne au journal
  (« sonner », puis « éteindre »).
- **Droits** : commande ouverte à tout compte connecté, mais seulement sur ce
  que ce compte a le droit de piloter — le composant appelle les services
  lui-même, la vérification de Home Assistant n'aurait pas lieu (audit du
  18/09). Qui teste vient de la session, jamais du message.
- **L'écran ne compte plus rien** : le bouton se libère à la fin que le
  serveur annonce (un affichage), et un refus se lit sur la carte à la place
  de l'état (« Ce compte ne pilote pas cet appareil. », « Le test n'a pas pu
  partir. »).

## Conséquences

- **Redémarrer Home Assistant** après la mise à jour : la commande s'enregistre
  au démarrage. Avant, le bouton répond « Le test n'a pas pu partir. ».
- La démo simule le composant : la sirène de la démo ne gère pas la durée,
  c'est le cas tenu par le serveur qu'on y voit.
- Plus aucun `setTimeout` de `src/` ne commande la maison.

Tests : tests/python/test_sirene.py (12), tests/securite_trois_cartes.test.mjs.
