# 0126 — Une mise à jour demande un redémarrage, et on le dit

Date : 01/10/2026. Statut : appliqué.

Vingt décisions annonçaient : « Aucun redémarrage de Home Assistant n'est
nécessaire : rechargez la page après la mise à jour. »

C'était faux. Loggia n'est pas un thème ni une carte Lovelace : c'est un
**composant personnalisé**. Son code Python — le magasin, les commandes
WebSocket, la découverte, les scénarios — est chargé en mémoire au démarrage de
Home Assistant. Recharger la page sert le nouveau paquet au navigateur et laisse
l'ancien serveur tourner derrière : moitié neuve, moitié vieille, et des
symptômes qui ne ressemblent à rien.

**Décidé :** toute note de version, toute décision et tout message de sortie qui
accompagne une mise à jour du composant dit **« Redémarrage de Home Assistant
requis »**. Les trente-trois occurrences de l'ancienne formule ont été corrigées
dans les vingt décisions concernées.

La formule optimiste ne faisait gagner à personne les quarante secondes d'un
redémarrage ; elle faisait perdre des heures à chercher pourquoi une correction
« ne marchait pas ».
