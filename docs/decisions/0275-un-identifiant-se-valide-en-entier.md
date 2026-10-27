# 0275 — Un identifiant se valide en entier

*26 octobre 2026 — à l'essai (rien de publié). Le composant change : un redémarrage de Home Assistant à l'installation.*

## Le problème

En Python, `$` accepte un `\n` final : avec un motif `^…$`, `REGEX.match("valeur\n")` réussit. Le défaut a été corrigé le 25/10
dans `robots.py`, `robots_carnet.py`, `robots_pieces.py` et `distributeurs.py` (ADR 0216, 0218). Il restait ailleurs : un
identifiant d'appareil, un profil, un lecteur et une heure du mode enfant, une prise, une entité de minuteur ou de sirène, un
identifiant de scénario, un nom d'étage du plan (qui devient un nom de fichier), une clé d'attribut d'un VTherm.

## Décidé

Une expression qui valide une valeur ENTIÈRE se lit par `fullmatch`, jamais par `match`. Les ancres `^…$` restent, pour qui relit
le motif. `match` ne reste que pour lire volontairement un PRÉFIXE (un motif sans `$`), ou un texte déjà nettoyé par `strip()`.

Passés à `fullmatch` le 26/10 : `appareils.py` (`MOTIF_ID`, `MOTIF_PROFIL`), `enfant_calcul.py` (`LECTEUR`, `HEURE`),
`prises_calcul.py` (`INTERRUPTEUR`), `minuteurs.py` et `sirene.py` (`ENTITE`), `scenarios.py` (`SLUG`, et le motif de l'icône,
déjà nettoyé par `strip()` : rien n'y change, la forme s'aligne), `plan.py` (`_ETAGE`), `chauffage_familles.py`
(`SOUS_JACENT_A_PLAT` : la clé entière, pas un préfixe). Non touchés : `automatisations.py` (`_ENTITE`) et `chauffage.py`
(`DATE_SEULE`), qui lisent un texte déjà nettoyé.

Test : `tests/python/test_identifiants_entiers.py` — chaque valeur suivie de `\n` était acceptée, elle est refusée ; la forme
propre passe toujours.
