# 0129 — Le tableau de bord natif ne se mélange plus à la fiche

Date : 02/10/2026. Statut : appliqué.

« J'ai retiré les entités mais sur le schéma elles sont toujours présentes. »
Trois défauts distincts se cachaient derrière la même carte Énergie,
découverts un par un en vérifiant chaque rapport contre le code plutôt que
contre l'écran.

**Le vrai fond du problème.** `enHaids()` mélangeait deux sources : la fiche
(Paramètres → Entités) et le tableau de bord Énergie NATIF de Home Assistant,
que `resolve.js` sait déduire tout seul (`energy_sources`) quand rien n'est
configuré. Un premier correctif a bien arrêté la fuite d'une case VIDÉE dans
la fiche — mais le tableau de bord natif ne nomme pas ses capteurs comme la
fiche (`solarNow`/`gridNow` côté natif, `solarOutput`/`consoNow` côté fiche) :
aucune case de la fiche ne pouvait donc jamais éteindre un capteur détecté
côté natif, quel que soit son état. **Décidé :** dès que la fiche a été
enregistrée une seule fois, elle fait foi SEULE, sans aucun mélange — la même
règle que le véhicule et la batterie, qui n'ont jamais eu ce repli. Le tableau
de bord natif ne reste proposé que pour une installation qui n'a JAMAIS ouvert
la fiche.

**Deux symptômes du même mélange, sur le schéma de la maison.** Les panneaux
solaires (l'illustration du toit) et le chip de production se dessinaient sans
aucune condition, contrairement au véhicule et à la batterie qui ne
s'affichent déjà que si on les renseigne. Sans capteur de production
configuré, le toit affichait des panneaux et un badge « 0 W » qui ne
représentaient rien de réel. Les deux suivent maintenant `solarPresente`,
alimenté par le même signal que « Solaire actif / inactif » dans l'en-tête.

**Un bug plus ancien, sans rapport avec la fuite, repéré en vérifiant une
capture prise après le coucher du soleil.** Le rond du « soleil / lune » de
`SunArc` se dessinait jour ET nuit ; `sunInfo().t` n'a de sens qu'entre le
lever et le coucher et se plafonne à 0 ou 1 en dehors — le rond retombait donc
chaque nuit exactement sur le repère fixe du lever ou du coucher, deux ronds
collés au même endroit. Il ne se dessine plus que le jour. Au passage, la
pastille d'irradiance (qui suit le soleil) ne vérifiait sa collision qu'avec
UN des deux badges fixes de la scène ; elle évite maintenant les deux, et reste
plafonnée pour ne plus sortir du dôme de l'arc au lever et au coucher.

La leçon commune aux trois : vérifier contre le CODE qui produit l'écran,
pas seulement contre une nouvelle capture — un correctif qui « a l'air » de
régler le symptôme peut laisser filer la cause si deux chemins différents
alimentent la même valeur.
