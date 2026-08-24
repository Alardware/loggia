# Loggia Dashboard

Un tableau de bord Home Assistant qui se remplit tout seul.

Loggia lit les registres de votre installation — zones, appareils, entités — et
en déduit ce qu'il peut afficher. **Aucun identifiant d'entité n'est écrit dans
le code** : ce qui n'existe pas chez vous n'apparaît pas, ce que vous ajoutez
plus tard apparaît sans rien toucher.

- Pièces déduites de vos zones Home Assistant
- Vue Énergie alimentée par le tableau de bord Énergie natif
- Une vue sans contenu se masque, et revient d'elle-même
- Réglages **par utilisateur**, côté serveur : mêmes pièces et même thème sur
  tous vos appareils
- Appels de service filtrés par une liste blanche fermée par défaut
- Aucune ressource externe, aucune télémétrie

Après installation : Paramètres → Appareils et services → Ajouter → **Loggia**.
Rien à copier dans `www/`, aucun tableau de bord YAML à écrire.
