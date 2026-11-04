# Loggia Dashboard

A Home Assistant dashboard that fills itself in.

Loggia reads the registries of your installation — areas, devices, entities —
and works out what it can show. **No entity ID is written in the code**: what
you don't have doesn't appear, what you add later shows up without touching
anything.

- Rooms worked out from your Home Assistant areas
- Energy view fed by the native Energy dashboard
- A view with nothing to show hides itself, and comes back by itself
- Settings **per user**, on the server: the same rooms and theme on all your
  devices
- Writing the configuration is reserved for Home Assistant administrators
- No external resource, no telemetry

After installing: Settings → Devices & services → Add → **Loggia**. Nothing to
copy into `www/`, no YAML dashboard to write.

---

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
- Écriture de la configuration réservée aux administrateurs Home Assistant
- Aucune ressource externe, aucune télémétrie

Après installation : Paramètres → Appareils et services → Ajouter → **Loggia**.
Rien à copier dans `www/`, aucun tableau de bord YAML à écrire.
