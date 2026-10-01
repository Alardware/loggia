# 0110 — Ne pas agir sur ce qu'on ignore

Date : 30/09/2026. Statut : appliqué. **Redémarrage de Home Assistant requis** :
`presence.py`, `alertes.py` et `interrupteurs.py` changent.

## D'où ça vient

Un audit mené le 29/09/2026 par une autre session a signalé trois façons dont
la maison pouvait s'ouvrir sans que personne ne le demande. Les deux premières
se déclenchent sur une information **absente**, et non sur une information
contraire ; la troisième laissait un message du réseau appeler n'importe quel
service. Les deux ont été relues ici, ligne par ligne, avant
d'être corrigées : elles sont réelles, et elles ouvrent la maison.

Le défaut est le même des deux côtés, et c'est pour cela qu'une seule décision
les porte : **un « je ne sais pas » était lu comme un « non »**, puis le « non »
servait à agir.

## 1. L'alarme se désarmait quand les téléphones se taisaient

`tous_absents()` refuse à juste titre d'affirmer qu'une maison est vide sans au
moins une personne suivie ET joignable — sinon une installation sans suivi de
présence s'éteindrait toute seule en permanence. Elle rend donc `False` pour
**deux raisons très différentes** : quelqu'un est là, ou plus personne ne
répond.

L'évaluation lisait ce `False` comme une présence :

```python
vide = absents and not invite
elif not vide:
    if self.dehors:          # ← on croyait quelqu'un rentré
        await self._async_retour()   # ← qui désarme l'alarme
```

Maison armée, maison vide, la box tombe : les `device_tracker` passent à
`unavailable`, `tous_absents` ne peut plus conclure, et Loggia **désarme**.
Une coupure de réseau suffisait donc à ouvrir la garde — précisément le moment
où l'on voudrait qu'elle tienne.

**Décidé :** le retour exige un signe **franc**. `quelquun_est_la()` répond à la
question inverse et demande un `home` explicite ; le mode invité vaut également
signe. Les deux fonctions disent « non » quand on ne sait pas, et alors rien ne
bouge : la maison reste déclarée dehors, l'alarme reste armée, et le retour se
fera au premier téléphone qui revient pour de bon.

Le départ, lui, ne change pas : il traitait déjà le doute comme une présence,
ce qui est le sens prudent de ce côté-là.

## 2. Un ouvrant sans classe s'ouvrait sur une alerte fumée

Sur un danger fumée, gaz ou monoxyde, Loggia remonte les volets. La liste des
ouvrants à ne pas toucher nommait trois classes :

```python
PAS_UN_VOLET = ("garage", "gate", "door")
volets = self._entites("cover", PAS_UN_VOLET)   # device_class NOT IN (…)
```

Un portail dont la `device_class` n'est pas renseignée vaut `None`, qui n'est
aucun de ces trois noms : il passait le filtre. Or beaucoup de portails et de
portes de garage arrivent sans classe déclarée. Un détecteur qui crie à tort —
une vapeur de cuisine, une pile en fin de vie — ouvrait donc le portail.

**Décidé :** le filtre nomme ce qu'il **ouvre**, au lieu d'énumérer ce qu'il
évite.

```python
VOLETS_CLASSES = ("shutter", "blind", "curtain", "shade", "awning", "window")
```

Ce qu'on ne sait pas nommer reste fermé. L'arbitrage est franc : ne pas
remonter un volet mal déclaré se répare en lui donnant sa classe dans Home
Assistant ; ouvrir un portail au milieu de la nuit, non.

## Ce que ça entraîne

- **Un volet sans `device_class` n'est plus remonté sur un danger.** C'est le
  prix du correctif, et il se paie une fois : déclarer la classe dans Home
  Assistant le fait revenir. Les autres réactions — lumières, vanne d'eau,
  notifications — ne changent pas.
- `_entites()` filtre désormais par inclusion (`classes=`) et non plus par
  exclusion. Ses deux autres appels, `light` et `valve`, ne passent rien et
  voient tout le domaine, comme avant.
- Quatre tests épinglent les trois règles, dont un qui relit l'évaluation (la
  fonction seule ne garantit rien si le câblage la contourne) et un qui a été
  vérifié en neutralisant le correctif : sans lui, il échoue.
- **Il faut redémarrer Home Assistant** pour que le composant reparte.

## 3. Un appui venu du réseau ouvrait une serrure

Le troisième point de l'audit est d'une autre nature — il n'y a ici aucune
ignorance, le geste est explicite —, mais il ferme la même porte, et il est
livré avec les deux autres.

Un geste affecté à un interrupteur sans fil partait tel quel :

```python
domaine, nom_service = service.split(".", 1)
await self.hass.services.async_call(domaine, nom_service, data, blocking=False)
```

Aucun filtre, là où les scénarios passent déjà par `filtrer_autorisees`. Un
`lock.unlock` posé sur un bouton s'exécutait donc sur simple message du broker.
Il faut certes déjà l'accès au broker pour l'envoyer — mais c'est précisément
la barrière qu'on ne veut pas voir tomber toute seule.

**Décidé :** on refuse le **geste**, pas le domaine.

```python
GESTES_REFUSES = frozenset({"lock.unlock", "lock.open",
                            "alarm_control_panel.alarm_disarm"})
```

Verrouiller et armer **ferment** la maison : ils restent permis, et un bouton
qui verrouille en partant garde tout son sens. Seul ce qui ouvre est écarté, et
le refus est tracé dans le journal — sinon un bouton reste muet sans qu'on
sache pourquoi.

Un `script.*` affecté à un bouton peut évidemment appeler ce qu'il veut : c'est
le script de l'utilisateur, écrit et choisi par lui, pas un message venu du
réseau. Cette liste n'est pas une prison, c'est une barrière.
