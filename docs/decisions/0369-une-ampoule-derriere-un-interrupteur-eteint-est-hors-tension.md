# 0369 — Une ampoule derrière un interrupteur éteint est « hors tension », ni allumée ni en panne

*14 novembre 2026 — appliqué (v3.100.0). Audit du 12/11, point X4, validé « tel que décrit ». Le serveur change : Home Assistant doit être REDÉMARRÉ à l'installation.*

## Le problème

Une ampoule connectée posée derrière un interrupteur mural n'a plus de courant
quand il est éteint. Home Assistant ne le sait pas : il garde son dernier état
— « allumée », pour toujours — ou, si l'intégration surveille sa présence, la
dit injoignable au bout de quelques minutes.

À l'écran, la pièce comptait une lampe allumée dans le noir, sa bascule restait
jaune, le bandeau annonçait une lumière de trop ; ou bien la carte passait au
rouge d'une panne qui n'en est pas une, avec son point « À surveiller ». Et
« Tout éteindre », le coucher, le départ et les scénarios lui envoyaient des
ordres qui se perdaient.

## La décision

**La maison le dit une fois.** Dans la fiche de l'ampoule, une rangée
« Alimentée par » : une liste de choix — « Aucun interrupteur », puis les
lumières et les interrupteurs de sa pièce, puis les lumières des autres
pièces. C'est la configuration de la maison (`loggia_alimentation`,
`{ ampoule: source }`) : réservée aux administrateurs, valable pour tous les
écrans ; un compte ordinaire la lit, et un appui dit le refus.

**Tant que la source est éteinte, l'ampoule est hors tension :**

- elle est comptée ÉTEINTE partout — la carte et la bascule de sa pièce, le
  bandeau, la vue de la pièce, Appareils, la recherche ;
- sa carte dit « Hors tension · coupée par <nom> », en gris, sans le rouge ni
  le liseré d'une panne, sans point « À surveiller » ; sa bascule et sa barre
  sont inertes ; sa fiche dit qui la coupe et ne montre plus aucune commande ;
- aucun ordre ne lui parvient : ni de sa carte, ni d'un groupe (« Tout
  éteindre », la tuile d'une pièce, une ambiance : le reste part), ni du
  serveur — le coucher, le départ et le retour, les scénarios.

La source rallumée, l'ampoule redevient une lampe comme les autres. Une source
injoignable ne dit rien : l'ampoule garde son propre état.

**Où cela se pose.** Une vingtaine d'endroits décident qu'une lampe est
allumée en lisant `state` — il n'y a pas de fonction unique —, et la santé des
appareils lit `unavailable`. Plutôt que de les retoucher tous, le RELEVÉ que
l'écran lit est corrigé à son entrée unique (`getHass`) : l'ampoule y est
éteinte, marquée de ce qui la coupe (`avecAlimentation`, alimentation.js).
Sans relation, ou sans ampoule coupée, c'est l'objet de Home Assistant tel
quel : rien n'est recopié. Les ordres sont retenus au dernier mètre
(`sansCoupees`, actions.js), à côté de la garde de la vanne d'eau.

Côté serveur, la règle vit avec la définition commune des lumières
(`lumieres_maison.py`, ADR 0260) : une ampoule hors tension est épargnée comme
une veilleuse, par le coucher (`nuit.py`), le départ et le retour
(`presence.py`) et les scénarios (`scenarios.py` : `cibles`, `capturer`,
`ordres_etats`).

## Ce qui a été écarté

- **Une chaîne** (une ampoule derrière une prise, elle-même derrière un
  interrupteur) : une source ne peut pas être elle-même alimentée. La relation
  qui la nomme est ignorée ; ni boucle, ni cas à expliquer. La fiche d'une
  lampe qui en alimente d'autres dit « Ce qu'elle alimente », sans rien offrir.
- **Un message à chaque ordre retenu** : une ambiance commande les lampes une
  à une, il y en aurait autant que d'ampoules coupées. La carte le dit déjà.
- **Toucher aux règles qui nomment la lampe** : une veilleuse, l'éclairage de
  passage, un minuteur, et l'allumage sur un danger (la sûreté passe d'abord,
  ADR 0364) lui envoient toujours leurs ordres — sans effet tant qu'elle n'a
  pas de courant.

## Les conséquences

- Redémarrage de Home Assistant à l'installation (quatre modules Python).
- Les scènes et les scripts de Home Assistant lui-même ne passent pas par
  Loggia : ils continuent de lui écrire.
- La démonstration ne porte pas de relation par défaut ; elle se pose depuis
  la fiche d'une lampe, comme chez soi.
- Limite connue : le courant revenu, une ampoule que Home Assistant disait
  injoignable le reste quelques instants, le temps qu'elle se rattache.

Tests : `tests/audit_1211_lotx4_alimentation.test.mjs`,
`tests/audit_1211_lotx4_ecran.test.mjs`, `tests/python/test_alimentation.py`,
et un test de plus dans `test_nuit.py`, `test_presence.py`,
`test_scenarios.py`.
