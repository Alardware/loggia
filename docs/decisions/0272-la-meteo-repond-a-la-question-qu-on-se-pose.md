# 0272 — La météo répond à la question qu'on se pose

*20 octobre 2026 — accepté (sa maquette « Cartes météo », cadres 1a et 1b)*

*Complétée par l'ADR [0303](0303-l-air-et-les-uv-dans-la-meteo.md) (30/10) : l'air, les pollens et l'UV du jour dans la fiche.*

## Le problème

Le widget météo du rail disait le temps qu'il fait : le lieu tel que
l'intégration le nomme — « Météo-France forecast for city Sainte-Solange » —,
la température, le ciel, Max et Min, la pluie et le vent, les heures. Et il
ouvrait la fiche universelle : neuf lignes sous « Commandes », qui ne contenait
aucune commande, où « partlycloudy », « Cloud cover », « Freeze chance » et
« 3 UV index » restaient en anglais.

Sa maquette dit ce qui manque : **on ne regarde pas la météo pour savoir
qu'il fait 22°, on la regarde pour savoir si on peut étendre le linge.**

## La décision

**Le widget porte une phrase qui répond** — « Sec jusqu'à samedi », « Pluie
vers 16 h · rentrez le linge », « Fraîche au réveil : 6° vers 7 h » —, sous le
nom de la ville. Elle se calcule des prévisions, par trois règles dans l'ordre :
la pluie des heures qui viennent ; sinon, de nuit, le minimum avant le lever ;
sinon le premier jour de pluie de la semaine. **Rien ne s'invente** : sans
prévision, pas de phrase.

**Le vent et le coucher du soleil** (le lever, de nuit) rejoignent la ligne
sous la température. Le cumul de pluie quitte le widget pour la fiche.

**La popup est une fiche à part**, chargée à la demande, rangée par question :
maintenant (le chiffre, le ciel, le ressenti, la phrase et son conseil), les
heures, la semaine — une barre par jour entre son minimum et son maximum, sur
l'échelle de la semaine, le repère d'aujourd'hui —, six tuiles que l'entité
donne ou non, les risques, la vigilance par phénomène. Les entités restent
sous « L'appareil », qui ouvre la fiche universelle par-dessus.

**Une vigilance orange ou rouge teinte le widget et prend la phrase.** Une
vigilance jaune ne touche pas l'Accueil : il ne fait pas de bruit (ADR 0038,
« À surveiller ») — elle se lit dans la popup, où chaque phénomène a son
niveau. Le capteur de Météo-France d'abord (son état est le niveau, ses
attributs les phénomènes), MeteoAlarm sinon : la même lecture que la carte
Vigilance de Dehors (`vigilance.js`).

**Tout en français**, et dans les six autres langues : 52 textes neufs par
catalogue. La clé `{n} {u}`, que seul l'ancien widget appelait, part.

## Ce que ça coûte, et ce qu'on a refusé de payer

Le démarrage porte le widget, pas la fiche. La première version mettait toutes
les règles dans `meteo.js` — chargé par le rail — et le boot dépassait sa borne
de 654 octets. Les règles de la fiche seule (la semaine, les tuiles, les
risques, les mots) sont parties dans `meteofiche.js`, chargé avec elle. Le
boot : 1 097 500 octets pour une borne de 1 100 000. La borne n'a pas bougé.

Le gel, dans Risques, n'est pas une probabilité que Home Assistant donnerait :
c'est la part des heures à 0° ou moins. On le dit tel quel plutôt que de
prétendre à une prévision qu'on n'a pas.

## Tests

`tests/meteo_fiche.test.mjs` refait les règles à sec, dates fixées ;
`tests/fiche_meteo.test.mjs` rend la fiche — la vigilance orange en bande et
jaune en tableau, la fiche muette qui n'invente rien, le chargement à la
demande ; `tests/accueil_meteo.test.mjs` garde la carte à la maquette sans
lâcher ses garanties d'avant (abonnement, réserves, accessibilité, aucune
couleur en dur).

## Non fait, et dit

La vigilance orange n'a pas été vue à l'écran : la démo n'en a qu'une jaune.
Le widget au téléphone n'a pas été mesuré : le rail y est la seconde page
(ADR 0030), absente de la démo rendue ici.
