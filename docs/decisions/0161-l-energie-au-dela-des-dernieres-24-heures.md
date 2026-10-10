# 0161 — L'Énergie au-delà des dernières 24 heures

Date : 06/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis** ;
le paquet est rebâti.

## Une vue qui s'arrêtait à hier

La vue Énergie savait tout du moment présent — le schéma de la maison, les flux,
la puissance des dernières vingt-quatre heures — et rien au-delà. Pas de
semaine, pas de mois, pas d'année, pas de tarif, pas de coût sur la durée.

Une maquette commandée à Claude Design (« Loggia panel ») proposait tout cela.
Elle a servi de cahier des charges, pas de modèle à copier.

## Le socle : les statistiques longue durée

L'historique d'**états** (`history/period`), celui que Loggia lit depuis
toujours, ne garde que quelques jours. Au-delà, Home Assistant tient des
**statistiques** : une ligne par heure, par jour ou par mois, conservées sans
limite de durée pour toute entité qui déclare un `state_class`. Loggia ne les
interrogeait nulle part.

`src/stats.js` les lit, par `recorder/statistics_during_period`. Trois choix s'y
répètent partout :

- on demande le type **`change`** — ce que le compteur a avancé pendant
  l'intervalle. `sum` est son cumul depuis toujours, `state` sa valeur brute :
  ni l'un ni l'autre ne s'additionne d'une case à la suivante ;
- les bornes sont **locales**, et on avance de case en case **par le
  calendrier**. Un mois de changement d'heure compte ses trente-et-un jours,
  pas trente jours et vingt-trois heures ;
- une case sans ligne rend **`null`**, jamais `0`. « Pas encore de données » et
  « mesuré à zéro » ne se dessinent pas pareil (ADR 0030).

Tout ce qui précède le crochet React est pur, et se vérifie à sec :
`tests/stats_periodes.test.mjs`.

## La maquette fait foi

Premier essai : prendre de la maquette ce qui manquait, et garder le reste.
Mauvaise lecture. « je t'ai donné le fichier a reproduire, la seul consigne
était de garder les flux actuel de la maison mais tout le reste change ».

La vue suit donc `LoggiaPanel.dc.html`, section par section, et le schéma de la
maison est la seule exception.

## Ce qu'on a pris de la maquette

**L'APERÇU, refait** : un disque qui se remplit comme un verre — trois vagues
décalées, à des vitesses différentes, sinon ce ne serait qu'un dessin qui
défile — cerclé des parts de chaque source. La consommation au centre, les
sources en jetons dessous, et à droite la consommation du jour, son coût et
quatre chiffres. Dessous, les bilans du mois et de l'année.

**L'historique sur quatre périodes** — jour, semaine, mois, année —, avec
flèches pour remonter, bascule « Comparer » à la période précédente, infobulle
au survol et totaux en en-tête. Une journée se lit en **courbe**, le reste en
**barres** : vingt-quatre points dessinent un relief, trente-et-un jours
comparent des totaux.

**Les quatre tuiles de mesure** : autosuffisance, électricité bas-carbone, gaz
et eau. Le composant vient du système de dessin (`MetricTile`), où il sert déjà
les grilles de la Sécurité et du Système.

**Les cartes de postes au gabarit de la maquette** : l'illustration en grand et
très pâle dans le coin, le nom et les chiffres poussés en bas.

**Le calendrier des douze derniers mois**, en damier, avec consommation,
production ou coût.

**La carte « Le tarif »** : prix du moment, prochaine bascule, barre des
vingt-quatre heures, et les lignes de coût.

**Les bilans du mois et de l'année**, en tuiles à côté du tarif.

**Les piles dans leur propre onglet**, avec sur le bouton le compte de celles à
surveiller, et un filtre Toutes / À surveiller. Elles suivaient les postes ; la
page venait de tripler de longueur, et personne ne descend jusqu'en bas pour
apprendre qu'une télécommande est à plat.

## Ce qu'on a écarté, et pourquoi

**Le schéma de maison de la maquette** — maisons dessinées, traits animés le
long des câbles. « pour la maison par contre garde les flux d'energie actuel
j'aime pas trop les nouveaux ». Le schéma de Loggia reste, **sous l'onglet
« Maison »** : les deux faces de l'aperçu occupent la même place, la synthèse
donne sa hauteur à la carte, le schéma se pose dessus. La bascule ne fait pas
changer la carte de taille.

**La batterie domestique, la borne de recharge, le gaz, l'eau** : la maquette
les invente. Loggia les affiche déjà quand les capteurs existent, et se tait
sinon.

**Le contrat « 9 kVA, 16,33 € » écrit en dur** : la carte lit les entités de
l'installation, ou ne s'affiche pas.

## Les créneaux d'heures creuses, retrouvés dans l'historique

Home Assistant ne publie **nulle part** les créneaux d'un contrat. Les
intégrations de compteur donnent un capteur **binaire**, vrai quand on y est.

La barre des vingt-quatre heures se reconstitue donc depuis **l'historique de ce
binaire** (`src/tarif.js`). C'est la seule source honnête, et elle a l'avantage
de montrer ce qui s'est **vraiment** passé aujourd'hui plutôt que ce qu'un
contrat promettait. Elle marche avec n'importe quel fournisseur.

Trois règles y tiennent : une plage encore ouverte se ferme **sur la fenêtre**,
pas sur son dernier changement ; un trou (`unavailable`) **coupe** la plage au
lieu d'être comblé ; et sans capteur binaire, deux prix ne permettent **pas**
d'en choisir un — on ne devine pas l'heure creuse à l'horloge.

## Un bug que cette vue a mis au jour

`resolveEnergy` cherchait `grid.flow_from[0]`. C'est l'**ancienne** structure du
tableau de bord Énergie : une source `grid` portant toutes ses connexions.

Les versions récentes de Home Assistant écrivent **une source par connexion**,
`stat_energy_from` posé directement dessus — un contrat heures creuses / heures
pleines en donne donc deux. Sur une installation récente, `flow_from[0]` ne
trouvait **rien** : ni consommation, ni coût, ni injection. Et même à l'ancien
format, ne lire que la première connexion ne donnait que la moitié d'un compteur
bi-horaire.

Les deux formes sont maintenant aplaties, et **toutes** les parts gardées
(`consoJourParts`, `injectionJourParts`, `coutJourParts`). Quand il y en a
plusieurs, aucune n'est élue pour le tout : l'historique les additionne. La
puissance vient de `power_config` quand la configuration la nomme, plutôt que
d'une déduction par voisinage.

## Chargé à la demande

Ces trois sections pèsent vingt-sept kilo-octets. Le budget du boot
(`tests/lot14_chargement.test.mjs`) les a refusées, et il a eu raison :
l'Accueil n'en affiche rien.

Elles vivent dans `src/views/energiehisto.jsx`, chargé à la demande comme
Paramètres et Système (ADR 0104, 0145). Le boot repasse de 1 110 ko à 1 085 ko,
et la vue Énergie peut continuer de grandir sans peser sur l'écran d'accueil.

Le module n'importe **rien** d'`App.jsx` : ses briques viennent de `ui.jsx`,
`format.js` et `i18n.js`, et les identifiants d'entités arrivent en prop.

## Deux détails de rendu

**La carte « Sources de puissance » s'en va.** La maquette ne l'a pas :
l'historique feuilletable la remplace, et sa période « Jour » montre les mêmes
vingt-quatre heures. Partent avec elle `EnPuissances`, `EnBarresConso`,
`EnDemiJauge` et leurs aides — les deux demi-jauges deviennent des tuiles de
mesure.

**La barre de période ne glisse pas.** `.o-bar` met une barre sur une seule
ligne qui défile, sous 760 px. Celle-ci porte quatre réglages distincts dont une
bascule : au téléphone, « Comparer » devenait inatteignable. Elle passe à la
ligne, comme celle des ambiances.

## Côté installation

Le package refait la veille ne publiait ni coût, ni économie, ni total de
consommation : dix rôles de la fiche Entités désignaient des capteurs disparus.
Dix capteurs ont été ajoutés au package — prix du moment, tarif en cours, totaux
jour / mois / année, coûts, économie solaire — et la fiche réalignée. Les quatre
rôles `energie_appareils_*` ont été **retirés** plutôt que recréés : Loggia ne
s'en servait que pour une pastille, et mieux vaut un rôle vide qu'un rôle qui
ment.

Les prix viennent des deux aides `input_number` quand elles sont renseignées,
sinon du contrat. Les changer se fait dans l'interface, sans toucher au fichier.

## Ce qui reste ouvert

La démonstration fabrique une année de statistiques plausibles, déterministes —
une même journée rend la même valeur, sinon le calendrier scintillerait sous les
yeux. Elle sait aussi rendre l'historique d'un capteur binaire, ce qu'elle ne
savait pas faire : `parseFloat('off')` rendait `NaN` et la série repartait vide.

Les vingt-six clés polonaises ajoutées ici attendent la relecture de Seba882,
comme les précédentes.
