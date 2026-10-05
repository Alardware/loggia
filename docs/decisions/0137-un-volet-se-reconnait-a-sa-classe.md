# 0137 — Un volet se reconnaît à sa classe, et le velux est une option

Date : 03/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(décision 0126) : `volets.py`, `scenarios.py` et le nouveau `ouvrants.py`
changent.

**Le défaut.** Les règles des volets prenaient **tous** les `cover.*`. Une nuit
de tempête, le vent fort ouvrait la porte de garage et le portail — puis les
rouvrait deux minutes plus tard s'ils n'avaient pas bougé (décision 0007). Le
matin, le lever du soleil faisait de même. Les avoir mis sur « Jamais » n'y
changeait rien pour le vent. Le scénario Réveil, lui, ouvrait un portail
motorisé sans classe avec les volets. La décision 0022 le disait pourtant : un
garage, un portail, une porte ne sont pas des volets ; et la décision 0110
l'avait déjà appliqué aux alertes, par une liste positive.

**Décidé, avec l'utilisateur (03/10) :**

- **Une liste positive**, dans `custom_components/loggia/ouvrants.py`, pour le
  planning, le vent et les scénarios : volet roulant, store, toile, rideau,
  store banne. **Une classe absente n'est pas un volet** (« option b ») : un
  vrai volet sans classe ne sera plus piloté — il suffit de lui en donner une
  dans Home Assistant. L'écran des réglages le dit, avec le nombre d'ouvrants
  laissés de côté, au lieu de les montrer comme s'ils suivaient le planning.
- **Les fenêtres de toit (velux) sont une option** — « comme ça chacun fait
  comme il veut ». Une fenêtre n'est pas un volet : « tout remonter » au vent,
  c'est l'ouvrir dans la tempête. Avec l'option, Loggia les **ferme** — au
  coucher du soleil, par vent fort, dans un scénario qui ferme — et **ne les
  ouvre jamais**, ni au lever ni par le Réveil.
- **Au vent, le store banne se replie** au lieu de se déployer : pour lui,
  « ouvrir » c'est sortir la toile, et elle se déchire dans la rafale comme un
  volet baissé se plie. Il suit le planning comme avant.
- **« Jamais » reste ce que l'écran promet** : retirer un volet du *planning*.
  Le vent continue de protéger un volet de chambre qu'on ne veut pas voir
  s'ouvrir au lever — c'est la liste positive qui épargne garage et portail.

**Dans le même lot :**

- **Le rattrapage respecte le mode.** Une fermeture retenue par une baie
  ouverte partait quand même à la fermeture de la baie, même si l'on était passé
  en « Manuel » (« Ne touche à rien ») entre-temps. Elle est jetée — et le
  journal le dit — si le planning ne la donnerait plus ; passer en Manuel ou
  couper le planning vide les ordres en attente ; une mise à l'abri en cours les
  retient.
- **Un anémomètre changé est suivi tout de suite.** L'abonnement n'était posé
  qu'au démarrage : le nouveau capteur n'était lu qu'au redémarrage suivant.
- La démonstration donne à ses volets la classe qu'ils auraient chez soi, et
  connaît l'option velux.

**Comment c'est vérifié.** `tests/python/test_ouvrants_regles.py` (douze cas)
rejoue le vent, le lever, le coucher, le rattrapage, l'anémomètre et les
scénarios sur une maison qui range sous `cover.*` un volet, un store banne, une
fenêtre de toit, un garage, un portail sans classe et une porte. Rejoué sur les
anciens `volets.py` et `scenarios.py`, il échoue neuf fois. `tests/ouvrants_miroir.test.mjs`
refuse que la liste de l'écran et celle du composant divergent. Les volets
fictifs des tests existants reçoivent la classe d'un volet roulant — c'est ce
qu'ils modélisent. À l'écran, dans la démonstration : les trois volets dans
« Volet par volet », le texte du vent, la carte des fenêtres de toit et son
avertissement quand aucune n'est trouvée.

**À faire chez soi après la mise à jour** : vérifier dans Home Assistant que
chaque volet a une classe (Paramètres → Appareils et services → l'entité →
« Afficher comme »). L'écran des règles des volets compte ceux qui n'en ont pas.
