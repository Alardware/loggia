# 0157 — Une alerte météo n'est pas un incendie

Date : 06/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(mise à jour d'un composant personnalisé) ; le paquet est rebâti.

## Ce qui s'est passé

Le 06/10 à 06 h 10, chez l'utilisateur : les volets du salon **et de la
chambre** se sont ouverts, et quatorze lumières se sont allumées. La chambre
« ne peut s'ouvrir que manuellement pour laisser dormir les personnes ».

Il soupçonnait une coupure de courant — le Wi-Fi de la box était injoignable —
et m'a demandé de vérifier. Son journal Loggia répond en une ligne :

```
06:10:40  alertes  danger  remonter  (2 volets)    motif : fumee : meteoalarm
06:10:40  alertes  danger  allumer   (14 lumières) motif : fumee : meteoalarm
```

Ce n'est pas la coupure. C'est Loggia, et c'était **la quatrième fois** :
27/09, 29/09, 03/10, 06/10, toujours le même motif. Depuis le 04/10 ces
allumages étaient notés comme « un mystère », avec trois pistes — l'éclairage
nocturne, l'autre agent, ses propres automatisations. **Les trois étaient
fausses.**

## La cause

`alertes.py` traduisait les `device_class` de Home Assistant en catégories de
danger :

```python
"safety": ("fumee", "Alerte de sûreté"),
```

Or Home Assistant ne donne à `safety` qu'un seul sens : *on = pas sûr*. Il ne
dit **pas de quoi**. C'est une classe fourre-tout — et **Meteoalarm l'emploie
pour une alerte météo**. Un coup de vent annoncé, et Loggia lisait « fumée ».

La catégorie « fumee » est celle qui déclenche le plus : elle remonte les
volets (les issues, l'accès des secours) et allume toute la maison à 100 %.
Dans un incendie, c'est exactement ce qu'il faut. Pour un avis de vent à six
heures du matin, cela ouvre la chambre où dorment des gens.

**Le plus instructif : le tableau de bord le savait déjà.** `src/attention.js`
écarte explicitement meteoalarm depuis longtemps — classe `safety` plus un
`awareness_level`, ou le mot dans l'identifiant ou l'attribution. Mais c'est le
composant Python qui AGIT, et lui ne le savait pas. La connaissance était du
côté qui regarde, pas du côté qui ouvre les volets.

## Ce qui change

**`safety` sort de la table, et n'y reviendra pas.** Une classe ne déclenche une
évacuation que si elle NOMME le danger : `smoke`, `gas`, `carbon_monoxide`,
`moisture`. Une classe générique, non.

Ignorer un capteur mal déclaré se répare — on lui donne sa vraie classe. Ouvrir
une chambre au milieu de la nuit, non. Le compromis n'est pas symétrique.

Trois endroits suivent, pour que rien ne reste en désaccord :

- **Deux tests Python** interdisent le retour de `safety` et épinglent la liste
  exacte de ce qui agit (`VOLETS`, `LUMIERES`, `VANNE`).
- **`ALERTES_CLASSES`** (page Alertes des Paramètres) reprend la même table : un
  test comparait déjà les deux, et il a sauté — l'écran aurait compté des
  détecteurs qui n'alertent plus.
- **Le gabarit « Alerte de sûreté : {nom} »** disparaît du catalogue serveur, des
  six catalogues de langue et de la liste des clés téléphone. Deux tests l'ont
  réclamé, chacun de son côté : un message qui ne part plus ne doit pas rester
  traduit.

## Ce qu'on a appris

**Une `device_class` fourre-tout ne doit jamais déclencher une action
physique.** La règle du module — « les catégories sont reconnues par
`device_class`, jamais par identifiant » — reste juste : c'est la table qui
était trop généreuse. Reconnaître par la classe, oui ; accepter une classe qui
ne nomme rien, non.

**Quand deux moitiés d'un même produit jugent le même capteur, elles doivent
juger pareil.** Le front filtrait meteoalarm, le serveur l'écoutait. Ce n'est
pas une divergence de style : l'une affiche, l'autre ouvre les volets.

**Le journal a tranché en une ligne.** Quatre incidents avaient été mis sur le
compte du hasard parce que personne n'avait lu le journal de Loggia au bon
horodatage — le journal de Home Assistant, lui, est effacé à chaque
redémarrage. Il consignait pourtant le motif exact, à chaque fois.

1902 tests JavaScript, 1431 tests Python, lint et audit propres.
