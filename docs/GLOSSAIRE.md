# Glossaire du moteur de règles

Le langage commun du moteur de règles de Loggia — celui du code, des tests,
du journal et de l'écran. Un mot y a un sens et un seul ; quand deux mots
disent la même chose, l'un des deux est faux.

Le moteur JavaScript de découverte (index, appareils, capacités) a sa propre
documentation : `MOTEURS.md`. Ici, seulement ce qui décide et qui commande.

## Le modèle en une figure

```
        une MAIN ─────────────────── gèle ──────────────┐
                                                        ▼
 MODULE ──► RÈGLE ──► agir / prevenir / noter ──► SOCLE ──► Home Assistant
 (volets,   (planning,                          journal      (services,
  nuit…)     soleil…)                           gel          notify)
                                                tenues
                                                priorités
                                                simulation
                                                téléphone
```

Une règle ne parle jamais à Home Assistant directement : tout passe par le
socle, et c'est ainsi qu'elle hérite de tout le reste sans une ligne de plus.

## Les acteurs

**Module** — Un fichier Python du composant qui porte une famille de règles :
`volets`, `fenetres`, `presence`, `nuit`, `veilles`, `interrupteurs`,
`alertes`. Un module a sa configuration (`loggia_<module>`), son onglet à
l'écran, et déclare au socle les entités qu'il pilote.

**Règle** — Un comportement nommé, dans un module, débrayable seul : le
planning des volets, la protection solaire, la veilleuse, le CO2. C'est le
nom qui apparaît dans le journal (`regle`) et dans les priorités.

**Socle** — `regles.py`. Ce que toutes les règles partagent : le journal, le
respect du geste manuel, les priorités, la simulation, le téléphone. Un objet
unique par installation, créé avant les modules et passé à chacun.

**Main** (geste manuel) — Une action humaine sur une entité : interface,
application, voix. Home Assistant la distingue d'une automatisation par le
`user_id` de son contexte. Une main l'emporte sur toute règle. Un appui sur
un interrupteur sans fil est une main, même s'il passe par Loggia : le module
la déclare au socle (`regles.geler`, ADR 0015). Une exception, et une seule :
la veilleuse éteint ce qu'une main a allumé, c'est sa définition — le gel de
cette main ne la retient pas.

## Ce qu'une règle fait

**Agir** — Commander une ou plusieurs entités par le socle
(`regles.agir`). Rend la liste de ce qui est *réellement* parti — jamais la
liste demandée. Une entité gelée ou tenue par plus fort n'y figure pas.

**Prévenir** — Parler au téléphone par le socle (`regles.prevenir`). Deux
régimes : *critique* ou *ordinaire*. Voir « Le téléphone ».

**Noter** — Laisser une ligne au journal (`regles.noter`). `agir` et
`prevenir` notent d'eux-mêmes ; une règle ne note à la main que ce qui n'est
ni une commande ni une notification — un ordre mis en attente, un ordre
périmé.

**Suivre** — Déclarer au socle les entités qu'un module pilote
(`regles.suivre`). C'est sur elles, et elles seules, que le socle écoute les
mains. Une entité pilotée mais non déclarée : la main posée dessus passe
inaperçue.

## Ce qui retient une entité

**Gel** — L'effet d'une main : l'entité échappe aux règles pendant trente
minutes (`GEL_DEFAUT`). Le gel reprend aussi la tenue en cours. Le socle
reconnaît ses propres ordres à leur contexte, sans quoi il se gèlerait
lui-même à la première commande.

**Tenue** — Une règle *tient* une entité qu'elle vient de commander avec
`tenir=True`, et la protège des règles plus faibles jusqu'à la rendre
(`relacher`, ou une commande sans `tenir`). Commander par-dessus une tenue
la reprend. Une tenue oubliée tombe d'elle-même au bout de douze heures
(`TENUE_MAX`) — un filet, pas un réglage.

**Priorité** — Un entier par règle, déclaré une fois dans son module
(`volets.PRIORITES`), pris dans l'**échelle** de la maison. Face à une tenue,
la plus haute l'emporte ; l'égalité ne retient pas. Au-dessus de toutes les
priorités : une main.

**Échelle** — Les quatre paliers communs à toute la maison, du plus fort au
plus faible : *sûreté* (danger, vent), *présence* (départ, retour, invité),
*nuit* (fermeture du soir, extinction, veilleuse), *confort* (soleil,
ouverture du matin, éclairage doux). Un module prend ses niveaux dans son
palier (ADR 0014). La coupure du chauffage fenêtre ouverte est en sûreté
(ADR 0019).

**Attente** (ordre en attente) — Un ordre que le volet n'a pas pu recevoir
parce qu'il était injoignable. Gardé jusqu'à son retour, ou jusqu'à
l'événement solaire opposé — après quoi il est *périmé*. Le *rattrapage* est
le rejeu de cet ordre au retour de l'entité.

**Simulation** (observer sans agir) — Un mode par module : rien ne part, le
journal note ce qui *serait* parti, marqué `simule`. Les tenues bougent comme
en vrai. Basculer remet l'état des règles à zéro.

## Ce qui se voit

**Journal** — Une liste persistante, commune à tous les modules, dans son
propre magasin (`loggia_journal`), cinq cents lignes (ADR 0018), écrite en
différé. La plus récente en
premier. C'est le seul outil de débogage d'un non-technicien.

**Ligne** — `{ts, module, regle, quoi, cibles, n, motif, detail, simule}`.
`quoi` est le verbe (ouvrir, fermer, protéger, ventiler, prévenir, alerter) ;
`n` compte ce qui est *parti*.

**Motif** — Pourquoi la règle s'est déclenchée : « coucher +30 min »,
« vent 62 », « soleil à 225° », « 1450 ppm ». Sans motif, on lit qu'un volet
s'est fermé sans savoir pourquoi.

**Détail** — Ce qui a manqué ou ce qui a été dit : « 1 sous la main de
quelqu'un », « 1 tenu par vent », « 2 en attente », « critique · Fumée
détectée : cuisine ».

## Le téléphone

**Téléphone** — Le service `notify` choisi une fois dans Paramètres ›
Alertes (`loggia_alertes.service`). Aucune règle n'en redemande un autre.

**Critique** — Le régime qui réveille : fumée, gaz, monoxyde, fuite, alarme
(`alertes.DANGER`). Passe toujours, et par-dessus le mode silencieux du
téléphone (canal des alarmes sur Android, son critique sur iOS). Le *seul*
canal qui contourne les heures calmes.

**Heures calmes** — Une plage réglée à côté du téléphone
(`loggia_alertes.calme`), qui peut traverser minuit. Entre ces heures, une
notification ordinaire part *silencieuse* — elle arrive, elle ne sonne pas.
Rien n'est différé : on la lit au réveil.

**Silencieuse** — Une notification qui n'a pas sonné à cause des heures
calmes. Le journal le dit.

## Les quatre critères d'une règle

Ce qui rend une règle utilisable chez quelqu'un d'autre.

**Découverte** — La règle se nourrit d'une `device_class` ou d'un domaine
standard, jamais d'un nom d'entité. Quand Home Assistant ne sait pas dire ce
qu'est un capteur (un filtre, une machine), l'utilisateur le *désigne* une
fois — ce n'est pas une exception au critère, c'est son autre voie.

**Dégradation** — Zéro entité trouvée : la carte est grisée et dit quoi
ranger dans Home Assistant. Une entité muette (`unavailable`) ne vaut ni vrai
ni faux : la règle le dit au journal et agit selon la décision prise pour
elle.

**Réversibilité** — Toute action automatique sait revenir en arrière — à
l'état d'*avant*, pas à un défaut — et cède devant une main.

**Un seul réglage visible** — Par défaut, une règle montre un réglage ; le
reste est replié.
