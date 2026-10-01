# 0119 — La bascule qui mentait six secondes

Date : 01/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(mise à jour d'un composant personnalisé) ; le paquet est rebâti.

« Si j'allume une lumière, OK ça fonctionne ; je l'éteins, OK aussi, sauf que
le toggle se remet sur ON au bout de quelques secondes. » Puis : « ça le fait
sur toutes les cartes lumière », « radiateur aussi », « multimédia pareil »,
« donc sur tous les toggles d'entité en fait ».

## Ce que la mesure a dit

Un observateur posé sur la bascule, sur l'installation réelle :

| temps | état |
|---|---|
| 4 377 ms | allumé ← l'appui |
| **10 384 ms** | éteint ← **+6 007 ms** |
| 15 203 ms | allumé |

**Même nœud du début à la fin, zéro remontage** : React ne recrée pas la carte.
Et 6 007 ms, c'est `OPTIMISTE_MS = 6000` à la milliseconde près.

En parallèle, l'entité échantillonnée vingt fois : `off`, `last_updated` figé.
**Home Assistant n'a jamais bougé.** Son journal ne montre que les deux
commandes de l'utilisateur, et l'interface de l'intégration MQTT, elle, ne
clignote pas.

## La cause

Loggia ne s'abonne pas aux changements d'état : `useHass` **sonde toutes les
deux secondes** et ne redessine que si la signature d'une LISTE d'entités
surveillées change. Or la vue Objets montre tous les appareils, et surveillait
ceci :

```js
objets: [...vacKeys, 'lawn_mower.', ...mowerKeys(), ...croqKeys(), ...medKeys(), ...plantKeys()],
```

Aspirateurs, tondeuses, distributeur, médias, plantes. **Ni lumières, ni prises,
ni volets, ni chauffage.** Basculer une lampe ne changeait donc aucune
signature : le parent ne se redessinait pas, et la carte gardait l'objet `hass`
capturé AVANT la commande. Son propre minuteur la redessinait seule, six
secondes plus tard, avec cet état périmé — puis elle se recalait au premier
mouvement d'un aspirateur ou d'une plante, d'où les délais irréguliers.

**Décidé :** la vue surveille les domaines qu'elle COMMANDE, par préfixe —
`light.`, `switch.`, `cover.`, `climate.`, `media_player.`, `fan.`, `lock.`,
`humidifier.`, `valve.`, `siren.`, `water_heater.`, `input_boolean.`.

`sensor.` et `binary_sensor.` restent **dehors**, volontairement : ils jittent
en permanence et redessineraient tout l'écran toutes les deux secondes. Une
mesure en retard ne ment pas ; une bascule, si.

## Et un second défaut, du même ressort

`useOptimiste` traitait tout changement de l'état réel comme « la maison a
répondu », y compris un passage à `null` — qui ne répond rien. Une carte de
pièce rend `null` quand la liste de ses plafonniers est momentanément vide :
l'optimiste était jeté, et l'affichage retombait sur un compteur lui aussi vide.

**« Je ne sais pas » n'est pas une réponse.** On n'efface que sur une valeur ;
le minuteur reste le filet. Et les deux gabarits de carte de pièce laissent
désormais l'optimiste passer devant leur compteur.
