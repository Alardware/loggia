# 0390 — Une plante se juge sur les seuils de son espèce

*23 novembre 2026 — appliqué (v3.101.0) (sa demande du 23/11 : donner à chaque plante les seuils de son espèce, tirés d'Open Plantbook par
l'intégration de Home Assistant)*

*Complète l'ADR [0205](0205-une-plante-se-decouvre-sa-carte-et-sa-fiche.md) (une plante se découvre ; sa carte et sa fiche).*

*Complétée par l'ADR [0391](0391-la-carte-d-une-plante-montre-son-espece.md) (la carte d'une plante montre son espèce).*

## Le problème

Toutes les plantes se jugeaient sur UNE table, `PLAGES_PLANTE` (`objets.js`) : le sol de 15 à 70 %, 10 à 32 °C, 500 à
20 000 lx, 350 à 2 000 µS/cm. Un basilic et un cactus recevaient le même « Arrosez-la » au même chiffre. L'ADR 0205 laissait
« les seuils par plante » hors chantier.

Open Plantbook tient, espèce par espèce, l'humidité du sol, la température, la lumière et la conductivité qui lui conviennent.
Son intégration Home Assistant (`openplantbook`) garde les clés du compte et publie deux actions : `search` (`alias`) rend
`{ pid: display_pid }`, `get` (`species`) rend la fiche de l'espèce — `min_soil_moist`, `max_soil_moist`, `min_temp`,
`max_temp` (°C), `min_light_lux`, `max_light_lux`, `min_soil_ec`, `max_soil_ec`, `display_pid`, `image_url`. Elle la recopie
dans une entité `openplantbook.<pid>`, qui s'efface avec son cache et ne survit pas à un redémarrage de Home Assistant.

Ailleurs, Plant Monitor (intégration `plant`) fait de chaque plante un appareil : ses seuils sont des `number`, ses capteurs
des COPIES de ceux de la sonde (`external_sensor`) — humidité du sol et conductivité comprises. La découverte de l'ADR 0205 y
voyait donc deux plantes.

## La décision

**Une plante se juge sur SES plages** (`plagesPlante`, `plantes.js`), mesure par mesure : celles de son espèce, sinon celles
de Plant Monitor, sinon la table générale. `verdictsPlante` les reçoit (`plages`) ; sans elles, rien ne change. La lecture de
la plante (`lirePlante`) les porte, et tout ce qui la lit suit : la phrase et les couleurs de la carte, les conseils de la fiche
(« Arrosez-la : le sol est à 28 %, il lui en faut au moins 30 %. »), ses barres et ses « Idéal : … », la section Plantes et
piles, les points d'attention de l'Accueil.

**L'espèce se choisit dans la fiche, par un administrateur** (`choixespece.jsx`). Une rangée « Espèce », entre le panneau du
sol et les mesures : la photo de l'espèce si Open Plantbook en a une, son nom latin, d'où viennent ses seuils. Elle ouvre une
recherche par-dessus la fiche : un champ, « Chercher » — un appel par recherche, pas par frappe : Open Plantbook compte les
recherches du compte —, la liste trouvée, l'espèce de la plante en bleu plein (la puce choisie, règle 17). Un appui lit la
fiche de l'espèce (`get`), relue dans l'entité à défaut de réponse ; « Revenir aux repères généraux » retire l'espèce. Les deux
erreurs se disent : la limite du compte (« réessayez dans un moment »), ou l'intégration qui ne répond pas (« ses identifiants se
règlent dans Home Assistant »). Un compte ordinaire lit la rangée ; un appui lui dit le refus, qui nomme la clé (la règle des
prises, P4) : l'espèce est la configuration de la MAISON.

**Loggia GARDE ce que `get` rend**, dans `loggia_plants` : `{ base, …, espece: { pid, nom, image, plages } }`. Une plante
découverte sans configuration y entre par sa base seule, marquée `decouverte` : la ligne ne fait que la compléter — ni nom ni
pièce figés, la découverte les garde ; si l'appareil disparaît, elle se tait au lieu de faire une plante fantôme ; retirer
l'espèce la retire. Une ligne écrite à la main reste, sans espèce. L'écriture passe par une fonction (`cfgSet`) : seule la
ligne de la plante change. Chaque appel à Open Plantbook est borné à 20 s : au-delà, l'intégration « ne répond pas », et la
recherche se relance ; une espèce en lecture ne se laisse pas doubler par une recherche. L'espèce se relit sans confiance (`especeValide`) : des plages lisibles —
deux nombres, le bas sous le haut — et une image http(s), de Home Assistant (`/local/…`) ou servie avec Loggia (`./…`), rien
d'autre ; la photo se charge sans référent.

**« Choisir l'espèce » n'existe que si Open Plantbook est là** (règle 46) : ses deux actions dans les services vivants de Home
Assistant, sinon dans ceux que l'index a lus (`plantbookDisponible`). Sans elles, une espèce déjà gardée se lit, sans rien à
choisir ; sans espèce ni Plant Monitor, la rangée n'existe pas — la fiche est celle d'avant. Les clés du compte restent dans
l'intégration : Loggia n'en voit aucune.

**Plant Monitor complète, sans doubler** : la copie d'un capteur (`external_sensor`) ne fait pas une plante de plus — la sonde
reste la plante, sa clé ne bouge pas —, sauf si la sonde se cache : la plante de Plant Monitor la remplace. La plante prend son
nom, sa pièce et ses seuils, lus dans ses `number` à leur clé de traduction (`min_moisture`, `max_temperature`…), jamais à leur
identifiant ; la température en Celsius. Sans espèce choisie dans Loggia, celle que Plant Monitor connaît se montre (son nom, sa
photo). Une ligne de `loggia_plants` posée sur la base des copies, du temps où elles faisaient une plante, retrouve la plante :
sa clé et son nom tiennent.

**Une configuration se lie d'abord à la plante de SA base**, puis à celle dont elle couvre un capteur, la base la plus longue
d'abord : la ligne de `sensor.ficus` ne va plus à `sensor.ficus_2` parce qu'elle a été vue la première. Une maison dont deux
bases se recouvrent peut voir une ligne changer de plante : c'est le correctif ; sans recouvrement, rien ne bouge.

Écarté : interroger Open Plantbook depuis Loggia (les clés quitteraient Home Assistant) ; relire l'entité `openplantbook.<pid>`
à chaque rendu (elle s'efface) ; une suggestion par frappe (une recherche comptée par lettre) ; l'humidité de l'air, le DLI et
les soins d'Open Plantbook (la carte ne mesure ni l'un ni l'autre) ; écrire les seuils dans Plant Monitor.

## Les conséquences

- Pas de redémarrage de Home Assistant : rien côté serveur, aucun `.py`. `loggia_plants` reste la clé de la maison, réservée aux
  administrateurs comme avant ; l'écrire recharge l'eau comme avant (`rechargement.py`).
- Une plante découverte dont on choisit l'espèce entre dans `loggia_plants` : le serveur la reconnaît désormais comme plante,
  comme une plante configurée — sa fraîcheur se juge à 24 h et non 6 h (ADR 0311). Sa base est celle de ses capteurs
  (`sensor.…`) : aucun `binary_sensor` n'y entre, aucune fuite n'est écartée.
- Un seuil changé dans Plant Monitor se voit au relevé suivant d'un capteur de la plante : la carte ne suit que ses capteurs.
- La recherche et la rangée partent avec la fiche, chargée à la demande ; le démarrage ne porte que le jugement et la lecture de
  Plant Monitor.
- 17 textes neufs, dans les six catalogues.
- La démo publie les deux actions et répond à leur place, sur dix espèces aux plages INVENTÉES pour elle (vraisemblables, pas
  celles d'Open Plantbook) ; ses deux dessins servent de photo. Elle n'appelle personne.
- Tests : `tests/plantes_especes.test.mjs`. Le guide de l'interface cite « Choisir l'espèce » à sa règle 46.
