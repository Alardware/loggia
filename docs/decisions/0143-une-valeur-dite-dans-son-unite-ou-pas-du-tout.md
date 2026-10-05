# 0143 — Une valeur dite dans son unité, ou pas du tout

Date : 03/10/2026. Statut : appliqué. Pas de redémarrage de Home Assistant :
seul l'écran change.

Le lot 9 de l'audit du 03/10 : huit défauts où l'écran disait une valeur
fausse plutôt que de ne rien dire. Certains venaient d'une unité mal lue,
d'autres d'un zéro ou d'une valeur d'exemple mis à la place d'une mesure
absente. Les deux défauts d'heure d'hiver du même axe étaient déjà réglés
(ADR 0135).

**1. Une puissance en kW lue comme des watts (gravité haute).** La découverte
choisit le capteur par sa `device_class`, sans regarder l'unité. C'est juste,
mais la LECTURE ne la regardait pas non plus. Un compteur P1/DSMR qui publie
2,75 kW s'affichait « 3 W » ; les seuils « > 5 W » ne se franchissaient
jamais, et le solaire ne paraissait jamais actif. Cela touchait les Pays-Bas
et la Belgique, alors que le néerlandais est livré. `wattsDe` et `kwhDe`
(`src/unites.js`, sur le principe de l'ADR 0128) ramènent la valeur au watt
et au kWh. Elles couvrent les unités que Home Assistant connaît, calories
comprises : un réseau de chaleur publie en Gcal. Elles servent sur la vue
Énergie, l'Accueil, la carte Énergie, les notifications, le lave-vaisselle et
l'aperçu des Paramètres. Une unité absente ou inconnue se lit telle quelle,
comme avant. Mesuré : 2,5 kW s'affiche « 2,5 kW », et 0,46 kW « 460 W ».

**2. Des zéros inventés.** `num()` rendait 0 pour une entité muette. Avec un
Linky indisponible et 6,2 kWh produits, l'autosuffisance valait 100 %. L'en-tête
disait « 0 W » au-dessus de chiffres qui disaient « — ». Une maison sans
compteur voyait « ↓ 0 W » en permanence sur l'Accueil. `src/bilan.js` choisit
le compteur du jour et rend `null` quand aucun ne répond. L'en-tête ne dit que
ce qui se lit, et la tuile disparaît sans source (règle du zéro, ADR 0030). Un
VRAI zéro, comme une borne à l'arrêt, reste affiché.

**3. Les °F et les ft².** Les tables de confort restent en Celsius
(ADR 0057, 0128) : c'est la valeur qui s'y ramène avant les seuils, et l'unité
de la maison ne sert qu'à l'affichage. 72 °F n'est plus « Trop chaud ». Une
moyenne de températures d'unités mêlées passe par le Celsius
(`moyenneTemperatures`). Le robot ne lit plus des pieds carrés comme des
mètres carrés.

**4. Une consigne de thermostat inventée.** En mode `heat_cool`, Home
Assistant ne donne pas de consigne unique. La carte affichait 20 °C (19 pour
le fil pilote), et le « + » envoyait 20,5. Désormais la carte dit « — » et ses
± restent à leur place mais inertes : on n'ENVOIE jamais une consigne
inventée. La fiche dit la plage, « Plage 19,0 °C – 23,0 °C, réglée dans Home
Assistant » ; elle ne la pilote pas, faute de plan d'action pour
`set_temperature_range`. Mesuré dans la démo, ainsi qu'un thermostat normal
inchangé.

**5. La fiche de confort d'une vraie pièce** reprenait les valeurs du modèle
d'exemple quand une mesure manquait : une chambre sans hygromètre affichait
« Humidité 60 % ». `mesuresFiche` (`confort.js`) ne lit plus que les capteurs.
Les valeurs d'exemple restent pour l'écran d'avant la connexion, qui en a
besoin. Mesuré : l'humidité muette disparaît, et l'indice se calcule sans
elle.

**6. Un seul sondage en échec vidait l'agenda** pendant un quart d'heure : un
redémarrage de HA, et « Rien de prévu ces 7 jours ». Si TOUS les calendriers
échouent, les événements d'avant restent, et un nouvel essai part 30 s plus
tard. Un calendrier qui répond vide reste vide. L'historique 24 h garde de
même sa série.

**7. Le journal « 24 h »** d'une tablette allumée depuis lundi montrait jeudi
un « 16:00 » de lundi. Il se filtre à 24 h au rendu, sur une horloge qui
avance, et une ligne d'un autre jour dit son jour (`src/evenement.js`).

**8. Les courbes de l'Énergie** ne se relisaient jamais. Elles se relisent
toutes les 5 min tant que la page se voit, et une seule fois au retour d'un
onglet caché (`src/releve.js`). Un raté du réseau garde la courbe d'avant.

**Comment c'est vérifié.** Huit fichiers de tests, avec les fonctions pures
testées par import réel. Rejoués sur le code d'avant le lot, les huit
échouent. Les mesures dans la démo sont citées plus haut ; la console reste
propre. Deux correctifs se croisaient à l'application, le kW et les zéros,
sur les mêmes index de consommation : ils sont fusionnés à la main en
`numKwh(id, null)`, qui ramène l'unité ET dit « illisible ».

**La relecture contradictoire** (cinq angles, chaque constat contesté) a
trouvé cinq défauts réels ; deux autres ont été écartés. Ils existaient
souvent déjà, mais sur des lignes que ce lot avait réécrites :
- **Notification « Surplus solaire ».** Elle comparait l'INDEX cumulé de
  l'export (850 kWh) à un seuil de 100 W, et s'affichait en permanence, la
  nuit comprise. Elle ne lit plus qu'une puissance, dans l'ordre de la vue
  Énergie : le flux net du compteur, sinon l'injection, sinon le surplus.
- **Autosuffisance avec une moitié muette.** Une injection configurée mais
  muette comptait pour zéro, ce qui donnait 67 % au lieu de 37 %. Un index
  heures creuses lisible avec des heures pleines muettes faisait une journée
  de 2 kWh au lieu de 10. « Configuré mais muet » n'est plus « absent » : pas
  de cadran, ou le total réseau s'il se lit.
- **Tuile Énergie d'une vue.** `Math.max(0, grid)` effaçait le signe d'un
  compteur net. Avec un solaire à 3000 W et un réseau à −2000 W, la maison
  valait 3000 W au lieu de 1000, quand la vue Énergie disait 1000.
- **Les deux sens du réseau.** Un capteur de surplus seul mesure l'export, pas
  l'achat. L'en-tête disait « réseau 0 W » la nuit et le pylône « ↓ 0 W ».
  L'achat ne se dit plus qu'au compteur.
- **Une courbe gardée après un raté expire** au bout de 30 min, ou du quart
  de sa fenêtre pour la courbe d'une heure du Système. Sans borne, un
  historique durablement en panne figeait la carte « Les dernières
  24 heures » sur l'heure du dernier succès.

Chacun a son test.
