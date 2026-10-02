# 0130 — Une démonstration qui montre vraiment la maison

Date : 02/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(mise à jour d'un composant personnalisé) ; le paquet est rebâti.

La démonstration sert depuis des mois à montrer Loggia. En la filmant vue par
vue, plusieurs de ses pages se sont révélées à moitié vides — non par défaut
d'affichage, mais parce que la maison factice n'avait pas de quoi les remplir.

**La maison du schéma Énergie n'avait aucune valeur.** Ni arc du jour, ni
pastilles. La cause est un garde-fou correct : `SunArc` refuse de dessiner un
arc faux sans **position déclarée** dans Home Assistant, et la démonstration
n'en déclarait aucune. Elle en a une maintenant — Paris, un point qui
n'appartient à personne. S'y ajoutent une **borne de recharge** et une
**batterie** : sans elles, les pastilles voiture et batterie n'avaient rien à
dire, et il manquait la moitié de ce que cette vue sait montrer.

**Le réseau exportait vingt-quatre heures sur vingt-quatre.** Le générateur
d'historique multipliait simplement la valeur du moment par une courbe de
journée. Le réseau valant −460 W, toute la journée sortait négative : la maison
aurait exporté en pleine nuit, et le graphique affichait un bloc d'un bout à
l'autre. Le réseau a désormais une vraie journée — on **importe** la nuit et le
soir, on **exporte** quand le soleil donne — et sa courbe **rejoint le chiffre
affiché à côté**, sinon les deux se contrediraient sous les yeux du lecteur.

**La vue Sécurité tenait sur un quart de ligne.** Une seule porte, donc « 1/1
fermée » ; deux caméras ; deux personnes. Elle en a quatre, quatre, et trois.
Les caméras passent à **trois par ligne** sur grand écran : à quatre, « auto »
en mettait deux et la rangée mangeait la moitié de la page. La caméra hors ligne
le reste — c'est elle que la carte « À surveiller » signale, et ça montre une
vraie fonction.

**La carte Alarme passe sur deux colonnes.** Elle porte un état, un message et
trois gestes à la suite ; à une colonne, les boutons se serrent au point de ne
plus se lire. Loggia sait déjà élargir une tuile : c'est son propre réglage
`larges`, pas une exception écrite pour la démonstration.

**Les tuiles de pièces s'emboîtent sur tablette et téléphone**, deux hauteurs au
lieu d'une grille régulière — « je trouve ça plus joli ». Rangé **par format**,
comme l'exige `disposition.js` : l'ordinateur garde sa grille à lui.

**Un piège, pour la prochaine fois.** Le premier élargissement de l'Alarme a été
écrit puis **ignoré en silence** : l'agencement se range par vue, `clé[scope]`,
et non à la racine. Rien ne proteste quand on écrit au mauvais niveau. Il a
fallu compter les tuiles larges dans la page rendue pour s'en apercevoir.

Tous les noms sont inventés — Léa, la porte de service, la Terrasse. Rien d'une
installation réelle n'entre dans le dépôt.
