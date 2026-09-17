# 0034 — Trois cartes à la place du bandeau

Date : 16/09/2026 (v3.35.0). Statut : acceptée. Demande de l'utilisateur,
maquettes à l'appui, après l'ADR 0033 : « dans Sécurité, remplace le bandeau
par les cartes alarme, sirène et présence ; reprends ma carte alarme et ajoute,
s'il y a un message, entre le nom et les boutons ; fais-moi aussi la carte
pour la sirène ».

## Contexte

La vue Sécurité ouvrait sur un bandeau de modes — « Alarme prête · Désarmé ·
Absent · Nuit » —, avec sa propre mécanique (état optimiste, code, décompte)
à côté de celle de la carte « Alarme (seule) » du catalogue, qui fait la même
chose. Deux fois le même geste, deux dessins. La sirène, elle, n'avait pas de
carte : une entité `siren` n'était visible que dans sa pièce. Et la présence
se trouvait rangée avec les ouvrants, où elle n'avait rien à faire.

## Décision

- **Le bandeau disparaît.** À sa place, une rangée de trois cartes, chacune
  seulement si son entité existe : l'alarme, la sirène (une carte par
  sirène), la présence. La vue ne garde de l'alarme que l'état lu tel quel ;
  les gestes vivent dans la carte.
- **La carte Alarme est celle du catalogue**, telle quelle — code demandé
  avant d'agir, décompte sur le bouton du mode visé, modes offerts par le
  panneau —, avec une chose en plus : un message entre le nom et les
  boutons, quand il y en a un. Déclenchée : par quel capteur, si le panneau le
  dit ; armée ou en cours d'armement : les ouvrants ouverts, nommés, et ce
  que le panneau contourne. Désarmée : rien — un ouvrant ouvert de jour n'est
  pas un message. Les mots viennent du panneau (`open_sensors`,
  `bypassed_sensors` d'Alarmo) d'abord, de nos comptes ensuite.
- **La carte Sirène** suit le gabarit maison : icône en haut à gauche,
  bascule à droite, nom sous l'icône, état (« Sirène active » en rouge,
  « au repos » sinon). Ses tuiles ne disent que ce que l'entité expose — le
  nombre de sonneries, le volume quand il existe. « Test sonore (3 s) » sonne
  trois secondes, par `duration` quand la sirène le gère, sinon en l'éteignant
  nous-mêmes.
- **Rien d'inventé.** Les maquettes montraient « Volume 95 dB », « Délai
  d'entrée 30 s », « Dernier armement hier à 23:10 · Mode Nuit » : Home
  Assistant n'expose aucune de ces données. Elles n'apparaissent pas.

## Conséquences

L'état optimiste de l'alarme (six secondes de filet) quitte la vue : Home
Assistant répond assez vite, et la carte du catalogue n'en a jamais eu. La
section « Ouvrants et présence » devient « Ouvrants ». Les sirènes rejoignent
les entités relues sur la vue. Non fait : les couleurs et le lettrage serif
des maquettes — la règle est de garder nos cartes.

## Ajustement du 17/09 (v3.40.0)

Les trois cartes avaient leur propre grille (250 px, une seule colonne de
362 px au téléphone, 251 × 223 px sur tablette). Retour de l'utilisateur :
« sur mobile et tablette, elles ne respectent pas les dimensions, trop
large ». Elles prennent la grille des cartes standard — 225 px, deux
colonnes au téléphone et sur tablette, rangées de 184 px : 176 × 184 au
téléphone, alignées sur les ouvrants. Ce qui ne tient plus s'efface d'après
la largeur DE LA CARTE (requêtes de conteneur) : le mot d'une chip
d'armement — jamais tronqué, un seuil par nombre de modes — et le « · À la
maison » d'une personne, que sa pastille dit déjà. Les tuiles de la sirène
(sonneries, volume) rejoignent sa ligne d'état : en tuiles, la carte
montait à 223 px et entraînait toute sa rangée.
