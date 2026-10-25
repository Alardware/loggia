/**
 * Mode démonstration : une maison qui n'existe pas, jouable.
 *
 * `index.html?demo` — la page directe, pas le panneau — monte le dashboard sur
 * cette maison : personne à espionner, rien à installer, et l'on peut TOUT
 * essayer, y compris les vues d'administration. C'est aussi le banc d'essai
 * des branches que l'installation réelle n'exerce pas : la 2.8.0 est morte
 * dans une branche que seul un compte administrateur atteignait.
 *
 * Trois principes :
 *
 * 1. AUCUNE trace. `localStorage` est remplacé par un magasin en mémoire,
 *    préchargé avec la configuration de la maison : la vraie configuration du
 *    navigateur n'est ni lue ni écrite, et tout s'évapore à la fermeture.
 * 2. VIVANTE. `callService` mute les états factices ; le poll du dashboard
 *    voit la nouvelle signature et redessine. Une lampe basculée bascule.
 * 3. HONNÊTE. Un badge « Démonstration » reste à l'écran. Ce qui exige un
 *    serveur (websocket, journal, templates) est simplement absent, comme sur
 *    une installation qui n'a pas ces moyens.
 *
 * L'ancien `scripts/demo.js` (injection DevTools pour les captures du README)
 * est remplacé par ce module.
 */

/* Le calcul du planning de chauffe, celui de l'écran : le faux moteur de la
 * démo décide avec lui, comme le serveur avec son jumeau (plus bas). */
import { JOURS, MODES, FROID, changementEnCours, ecrireHeure, lireHeure, modeVoulu, prochainChangement } from './chauffage.js';
/* Le planning des volets, celui du serveur (son jumeau) : la démo en tire les
 * mouvements à venir de chaque volet (chantier Volets, § 9). */
import { aVenir, regleDe } from './voletsplanning.js';
/* Ce qu'est un volet pour l'écran (sa classe, miroir de `est_volet`) : les scénarios de la démo ne visent qu'eux.
 * Recopié, pas importé, comme `phaseRobotDemo` plus bas : un import de voletecran.js depuis la démo — chargée à la
 * demande — tirait du démarrage un morceau partagé de 43 849 octets, chargé avec lui (mesuré le 19/10 : `boot-*.js`
 * 1 060 194 octets, plus ce morceau, au-delà de la borne). tests/demo_volets.test.mjs compare la copie à l'original. */
export const CLASSES_VOLETS_DEMO = ['shutter', 'blind', 'shade', 'curtain', 'awning'];
export const estVoletDemo = (st) => !!(st && st.attributes && CLASSES_VOLETS_DEMO.indexOf(st.attributes.device_class) >= 0);
export const estMuetVoletDemo = (st) => !st || st.state === 'unavailable' || st.state === 'unknown';
const estVolet = estVoletDemo;
const estMuetVolet = estMuetVoletDemo;

const maintenant = () => new Date().toISOString();
/* Un seul endroit traduit les noms : ici. Chaque etat factice passe par `s`,
 * les cent-vingt `friendly_name` sont donc couverts sans les toucher un par
 * un. `toucher()` ne fait que FUSIONNER des attributs deja batis : il ne
 * retraduit rien, et `etiquette` est de toute facon sans effet sur un nom
 * qu'elle ne connait pas. */
const s = (state, attributes = {}) => ({
  state: String(state),
  attributes: attributes.friendly_name
    ? { ...attributes, friendly_name: etiquette(attributes.friendly_name) }
    : attributes,
  last_updated: maintenant(), last_changed: maintenant(),
});
const ilYaMin = (min) => new Date(Date.now() - min * 60000).toISOString();

/* Les noms des lieux de la maison factice (23/09/2026).
 *
 * Dans une VRAIE installation, un nom de pièce vient de Home Assistant : il est
 * déjà dans la langue de la maison, et Loggia ne le traduit jamais. Ici la
 * maison est inventée, ses noms sont les nôtres — et une démonstration en
 * polonais qui annonçait « Salle de bain » ne montrait pas ce qu'elle promet.
 *
 * Le nom d'une pièce sert aussi de CLÉ : il relie la configuration, l'index des
 * zones, les scénarios, la règle des fenêtres et le journal. Il ne s'écrit donc
 * qu'ICI, en français, et TOUT le reste passe par `lieu()` — un seul endroit à
 * traduire, et les deux côtés d'une comparaison parlent toujours la même langue.
 *
 * Les noms d'APPAREILS, eux, restent tels quels : chacun nomme ses lampes comme
 * il veut, et une démonstration qui les traduirait mentirait sur ce qu'on voit
 * chez soi. */
const LIEUX = {
  'Salon': { en: 'Living room', de: 'Wohnzimmer', nl: 'Woonkamer', it: 'Soggiorno', es: 'Salón', pl: 'Salon' },
  'Cuisine': { en: 'Kitchen', de: 'Küche', nl: 'Keuken', it: 'Cucina', es: 'Cocina', pl: 'Kuchnia' },
  'Chambre': { en: 'Bedroom', de: 'Schlafzimmer', nl: 'Slaapkamer', it: 'Camera', es: 'Dormitorio', pl: 'Sypialnia' },
  'Bureau': { en: 'Office', de: 'Büro', nl: 'Kantoor', it: 'Studio', es: 'Despacho', pl: 'Biuro' },
  'Entrée': { en: 'Entrance', de: 'Eingang', nl: 'Entree', it: 'Ingresso', es: 'Entrada', pl: 'Wejście' },
  'Salle de bain': { en: 'Bathroom', de: 'Badezimmer', nl: 'Badkamer', it: 'Bagno', es: 'Baño', pl: 'Łazienka' },
  'Jardin': { en: 'Garden', de: 'Garten', nl: 'Tuin', it: 'Giardino', es: 'Jardín', pl: 'Ogród' },
  // Les lieux des deux caméras du dehors (audit du 03/10) : sans entrée ici,
  // `CAMERAS()` les nommait « Garage » et « Terrasse » dans toutes les langues.
  'Garage': { en: 'Garage', de: 'Garage', nl: 'Garage', it: 'Garage', es: 'Garaje', pl: 'Garaż' },
  'Terrasse': { en: 'Terrace', de: 'Terrasse', nl: 'Terras', it: 'Terrazza', es: 'Terraza', pl: 'Taras' },
  // La zone des deux capteurs de plante (chantier Capteurs, étapes 2 et 3, § 12 ; C29) : une zone d'appareils, pas une pièce de Loggia. Polonais nouveau, à relire par Seba882.
  'Technique': { en: 'Utility room', de: 'Technikraum', nl: 'Technische ruimte', it: 'Locale tecnico', es: 'Cuarto técnico', pl: 'Pomieszczenie techniczne' },
};

/* La langue de la maison factice, posée une fois par `installerDemo`. Elle se
 * lit AVANT que le magasin mémoire ne remplace `localStorage` : après, le choix
 * venu de l'URL n'y serait plus. */
let LANGUE_DEMO = 'fr';

/** Le nom d'un lieu dans la langue de la démonstration. */
const lieu = (fr) => (LIEUX[fr] && LIEUX[fr][LANGUE_DEMO]) || fr;

/* Les deux cameras. Une fonction, pas une table : leurs noms sont des lieux,
 * et la langue n'est connue qu'apres l'import. */
/* Quatre cameras, dont une hors ligne : assez pour que la vue Securite
 * ressemble a une vraie maison et que « cameras par ligne » ait un sens, et la
 * hors-ligne garde son role — c'est elle que la carte « A surveiller » signale. */
const CAMERAS = () => [
  { name: lieu('Jardin'), online: false },
  { name: lieu('Entrée'), haid: 'camera.entree', online: true },
  { name: lieu('Garage'), haid: 'camera.garage', online: true },
  { name: lieu('Terrasse'), haid: 'camera.terrasse', online: true },
];

/* Les noms d'APPAREILS de la maison factice (23/09/2026).
 *
 * Meme raison que `LIEUX` : cette maison est inventee, ses appareils portent
 * les noms que NOUS avons ecrits. Une demonstration polonaise qui annonce
 * « Enceinte salon » ne montre pas ce qu'elle promet.
 *
 * Difference avec une VRAIE installation : la, un nom d'appareil est celui que
 * la maison a tape, et Loggia n'y touche jamais. Restent donc en l'etat, ici
 * aussi, les noms qu'une INTEGRATION donne — « System Monitor Memory use »,
 * « Home Assistant Core Update » — parce qu'ils sont anglais meme dans une
 * maison francaise, et les prenoms.
 *
 * Contrairement aux lieux, ces noms ne sont PAS des cles : `etiquette()` est
 * appliquee une fois, quand l'etat factice est bati.
 *
 * Un nom ABSENT d'ici sort en français, sans bruit : `etiquette()` rend tel
 * quel ce qu'elle ne connaît pas. Les rappels (« Arroser les plantes »),
 * leurs listes (« Liste partagée »), l'agenda, treize états (« Porte de
 * garage », « Baie vitrée »…) et les appareils du registre restaient ainsi
 * français dans une démo polonaise (audit du 03/10). Tout nom écrit en clair
 * passe donc par ici, et `tests/demo_noms.test.mjs` refuse celui qui n'a pas
 * ses six langues. Restent tels quels les noms d'intégration et les prénoms. */
const APPAREILS = {
  'humidité': { en: 'humidity', de: 'Luftfeuchte', nl: 'luchtvochtigheid', it: 'umidità', es: 'humedad', pl: 'wilgotność' },
  'température': { en: 'temperature', de: 'Temperatur', nl: 'temperatuur', it: 'temperatura', es: 'temperatura', pl: 'temperatura' },
  'Alarme': { en: 'Alarm', de: 'Alarm', nl: 'Alarm', it: 'Allarme', es: 'Alarma', pl: 'Alarm' },
  'Rez-de-chaussée': { en: 'Ground floor', de: 'Erdgeschoss', nl: 'Begane grond', it: 'Piano terra', es: 'Planta baja', pl: 'Parter' },
  'Étage': { en: 'Upstairs', de: 'Obergeschoss', nl: 'Verdieping', it: 'Piano superiore', es: 'Piso superior', pl: 'Piętro' },
  'Coût du jour': { en: 'Cost today', de: 'Kosten heute', nl: 'Kosten vandaag', it: 'Costo di oggi', es: 'Coste de hoy', pl: 'Koszt dzisiaj' },
  'Revente du jour': { en: 'Feed-in today', de: 'Einspeisung heute', nl: 'Teruglevering vandaag', it: 'Rivendita di oggi', es: 'Venta de hoy', pl: 'Odsprzedaż dzisiaj' },
  'Collectes': { en: 'Waste collection', de: 'Abfuhr', nl: 'Inzameling', it: 'Raccolta', es: 'Recogida', pl: 'Odbiór odpadów' },
  'Anniversaires': { en: 'Birthdays', de: 'Geburtstage', nl: 'Verjaardagen', it: 'Compleanni', es: 'Cumpleaños', pl: 'Urodziny' },
  'Recyclables': { en: 'Recycling', de: 'Wertstoffe', nl: 'Recyclebaar', it: 'Riciclabili', es: 'Reciclables', pl: 'Surowce wtórne' },
  'Verre': { en: 'Glass', de: 'Glas', nl: 'Glas', it: 'Vetro', es: 'Vidrio', pl: 'Szkło' },
  'Ordures ménagères': { en: 'Household waste', de: 'Restmüll', nl: 'Restafval', it: 'Rifiuti indifferenziati', es: 'Basura doméstica', pl: 'Odpady zmieszane' },
  'Repas du matin': { en: 'Morning meal', de: 'Morgenmahlzeit', nl: 'Ochtendmaaltijd', it: 'Pasto del mattino', es: 'Comida de la mañana', pl: 'Poranny posiłek' },
  'Repas du soir': { en: 'Evening meal', de: 'Abendmahlzeit', nl: 'Avondmaaltijd', it: 'Pasto della sera', es: 'Comida de la noche', pl: 'Wieczorny posiłek' },
  'Activer le programme': { en: 'Enable feeding plan', de: 'Fütterungsplan aktivieren', nl: 'Voerschema inschakelen', it: 'Attiva il programma', es: 'Activar el programa', pl: 'Włącz harmonogram karmienia' },
  'Alerte bac presque vide': { en: 'Low hopper alert', de: 'Warnung Futterbehälter fast leer', nl: 'Melding voerbak bijna leeg', it: 'Avviso serbatoio quasi vuoto', es: 'Aviso de depósito casi vacío', pl: 'Alert: zbiornik prawie pusty' },
  'Alarme : armement en partant': { en: 'Alarm: arm on leaving', de: 'Alarm: beim Verlassen scharf', nl: 'Alarm: inschakelen bij vertrek', it: 'Allarme: attiva quando esci', es: 'Alarma: armar al salir', pl: 'Alarm: uzbrojenie przy wyjściu' },
  'Ampoules': { en: 'Light bulbs', de: 'Glühbirnen', nl: 'Lampen', it: 'Lampadine', es: 'Bombillas', pl: 'Żarówki' },
  'Apéro': { en: 'Drinks', de: 'Aperitif', nl: 'Borrel', it: 'Aperitivo', es: 'Aperitivo', pl: 'Aperitif' },
  'Arrivée d’eau': { en: 'Water inlet', de: 'Wasserzulauf', nl: 'Wateraanvoer', it: 'Ingresso acqua', es: 'Entrada de agua', pl: 'Dopływ wody' },
  'Arrosage du potager': { en: 'Vegetable patch watering', de: 'Bewässerung Gemüsebeet', nl: 'Bewatering moestuin', it: 'Irrigazione dell’orto', es: 'Riego del huerto', pl: 'Podlewanie warzywnika' },
  'Arroser les plantes': { en: 'Water the plants', de: 'Pflanzen gießen', nl: 'Planten water geven', it: 'Annaffiare le piante', es: 'Regar las plantas', pl: 'Podlać rośliny' },
  'Aspirateur': { en: 'Vacuum', de: 'Staubsauger', nl: 'Stofzuiger', it: 'Aspirapolvere', es: 'Aspiradora', pl: 'Odkurzacz' },
  'Aspirateur Brosse latérale': { en: 'Vacuum Side brush', de: 'Staubsauger Seitenbürste', nl: 'Stofzuiger Zijborstel', it: 'Aspirapolvere Spazzola laterale', es: 'Aspiradora Cepillo lateral', pl: 'Odkurzacz Szczotka boczna' },
  'Aspirateur Brosse principale': { en: 'Vacuum Main brush', de: 'Staubsauger Hauptbürste', nl: 'Stofzuiger Hoofdborstel', it: 'Aspirapolvere Spazzola principale', es: 'Aspiradora Cepillo principal', pl: 'Odkurzacz Szczotka główna' },
  'Aspirateur Durée totale de nettoyage': { en: 'Vacuum Total cleaning time', de: 'Staubsauger Gesamtreinigungszeit', nl: 'Stofzuiger Totale schoonmaaktijd', it: 'Aspirapolvere Tempo totale di pulizia', es: 'Aspiradora Tiempo total de limpieza', pl: 'Odkurzacz Łączny czas sprzątania' },
  "Aspirateur Débit d'eau": { en: 'Vacuum Water flow', de: 'Staubsauger Wasserdurchfluss', nl: 'Stofzuiger Waterstroom', it: 'Aspirapolvere Flusso d’acqua', es: 'Aspiradora Caudal de agua', pl: 'Odkurzacz Przepływ wody' },
  'Aspirateur Détection tapis': { en: 'Vacuum Carpet detection', de: 'Staubsauger Teppicherkennung', nl: 'Stofzuiger Tapijtdetectie', it: 'Aspirapolvere Rilevamento tappeti', es: 'Aspiradora Detección de alfombras', pl: 'Odkurzacz Wykrywanie dywanów' },
  'Aspirateur Filtre': { en: 'Vacuum Filter', de: 'Staubsauger Filter', nl: 'Stofzuiger Filter', it: 'Aspirapolvere Filtro', es: 'Aspiradora Filtro', pl: 'Odkurzacz Filtr' },
  // Tranche robots 2 : la carte active, le compteur de passages, et le script et les interrupteurs de la variante `scripts`.
  'Aspirateur Carte active': { en: 'Vacuum Active map', de: 'Staubsauger Aktive Karte', nl: 'Stofzuiger Actieve kaart', it: 'Aspirapolvere Mappa attiva', es: 'Aspiradora Mapa activo', pl: 'Odkurzacz Aktywna mapa' },
  'Aspirateur Compteur de nettoyage': { en: 'Vacuum Clean count', de: 'Staubsauger Reinigungsdurchgänge', nl: 'Stofzuiger Aantal beurten', it: 'Aspirapolvere Numero di passaggi', es: 'Aspiradora Número de pasadas', pl: 'Odkurzacz Liczba przejazdów' },
  'Nettoyer les pièces choisies': { en: 'Clean the chosen rooms', de: 'Gewählte Räume reinigen', nl: 'Gekozen kamers schoonmaken', it: 'Pulire le stanze scelte', es: 'Limpiar las habitaciones elegidas', pl: 'Sprzątanie wybranych pokoi' },
  'Nettoyer le salon': { en: 'Clean the living room', de: 'Wohnzimmer reinigen', nl: 'Woonkamer schoonmaken', it: 'Pulire il soggiorno', es: 'Limpiar el salón', pl: 'Sprzątanie salonu' },
  'Nettoyer la cuisine': { en: 'Clean the kitchen', de: 'Küche reinigen', nl: 'Keuken schoonmaken', it: 'Pulire la cucina', es: 'Limpiar la cocina', pl: 'Sprzątanie kuchni' },
  // Ses scripts par rôle (passe bis de la tranche robots 2, 20/10 : `scripts-sans-pieces`, `scripts-avec-pieces`).
  'Nettoyer tout le logement': { en: 'Clean the whole home', de: 'Ganze Wohnung reinigen', nl: 'Hele woning schoonmaken', it: 'Pulire tutta la casa', es: 'Limpiar toda la casa', pl: 'Sprzątanie całego mieszkania' },
  'Pause de l’aspirateur': { en: 'Pause the vacuum', de: 'Staubsauger pausieren', nl: 'Stofzuiger pauzeren', it: 'Pausa dell’aspirapolvere', es: 'Pausa de la aspiradora', pl: 'Pauza odkurzacza' },
  'Reprendre l’aspirateur': { en: 'Resume the vacuum', de: 'Staubsauger fortsetzen', nl: 'Stofzuiger hervatten', it: 'Riprendere l’aspirapolvere', es: 'Reanudar la aspiradora', pl: 'Wznowienie odkurzacza' },
  'Retour à la base': { en: 'Return to base', de: 'Zurück zur Station', nl: 'Terug naar het station', it: 'Ritorno alla base', es: 'Volver a la base', pl: 'Powrót do stacji' },
  'Localiser l’aspirateur': { en: 'Locate the vacuum', de: 'Staubsauger finden', nl: 'Stofzuiger zoeken', it: 'Localizzare l’aspirapolvere', es: 'Localizar la aspiradora', pl: 'Lokalizacja odkurzacza' },
  'Arroser le jardin': { en: 'Water the garden', de: 'Garten gießen', nl: 'Tuin sproeien', it: 'Irrigare il giardino', es: 'Regar el jardín', pl: 'Podlewanie ogrodu' },
  'Aspirateur Mode avancé': { en: 'Vacuum Advanced mode', de: 'Staubsauger Erweiterter Modus', nl: 'Stofzuiger Geavanceerde modus', it: 'Aspirapolvere Modalità avanzata', es: 'Aspiradora Modo avanzado', pl: 'Odkurzacz Tryb zaawansowany' },
  'Aspirateur Mode de travail': { en: 'Vacuum Work mode', de: 'Staubsauger Arbeitsmodus', nl: 'Stofzuiger Werkmodus', it: 'Aspirapolvere Modalità di lavoro', es: 'Aspiradora Modo de trabajo', pl: 'Odkurzacz Tryb pracy' },
  'Aspirateur Nombre total de nettoyages': { en: 'Vacuum Total cleanings', de: 'Staubsauger Reinigungen gesamt', nl: 'Stofzuiger Aantal schoonmaakbeurten', it: 'Aspirapolvere Numero totale di pulizie', es: 'Aspiradora Número total de limpiezas', pl: 'Odkurzacz Łączna liczba sprzątań' },
  'Aspirateur Réinitialiser le filtre': { en: 'Vacuum Reset filter', de: 'Staubsauger Filter zurücksetzen', nl: 'Stofzuiger Filter resetten', it: 'Aspirapolvere Reimposta filtro', es: 'Aspiradora Reiniciar filtro', pl: 'Odkurzacz Zresetuj filtr' },
  'Aspirateur Serpillière': { en: 'Vacuum Mop', de: 'Staubsauger Wischmopp', nl: 'Stofzuiger Dweil', it: 'Aspirapolvere Panno', es: 'Aspiradora Mopa', pl: 'Odkurzacz Mop' },
  'Aspirateur Surface nettoyée': { en: 'Vacuum Cleaned area', de: 'Staubsauger Gereinigte Fläche', nl: 'Stofzuiger Schoongemaakt oppervlak', it: 'Aspirapolvere Superficie pulita', es: 'Aspiradora Superficie limpiada', pl: 'Odkurzacz Posprzątana powierzchnia' },
  'Aspirateur Surface totale nettoyée': { en: 'Vacuum Total cleaned area', de: 'Staubsauger Gesamte gereinigte Fläche', nl: 'Stofzuiger Totaal schoongemaakt oppervlak', it: 'Aspirapolvere Superficie totale pulita', es: 'Aspiradora Superficie total limpiada', pl: 'Odkurzacz Łączna posprzątana powierzchnia' },
  'Avant mise à jour': { en: 'Before update', de: 'Vor dem Update', nl: 'Voor de update', it: 'Prima dell’aggiornamento', es: 'Antes de actualizar', pl: 'Przed aktualizacją' },
  'Baie vitrée': { en: 'Patio door', de: 'Terrassentür', nl: 'Schuifpui', it: 'Portafinestra', es: 'Ventanal', pl: 'Drzwi tarasowe' },
  'Basilic': { en: 'Basil', de: 'Basilikum', nl: 'Basilicum', it: 'Basilico', es: 'Albahaca', pl: 'Bazylia' },
  'Basilic conductivité': { en: 'Basil conductivity', de: 'Basilikum Leitfähigkeit', nl: 'Basilicum geleidbaarheid', it: 'Basilico conducibilità', es: 'Albahaca conductividad', pl: 'Bazylia przewodność' },
  'Basilic humidité du sol': { en: 'Basil soil moisture', de: 'Basilikum Bodenfeuchte', nl: 'Basilicum bodemvochtigheid', it: 'Basilico umidità del terreno', es: 'Albahaca humedad del suelo', pl: 'Bazylia wilgotność gleby' },
  'Basilic lumière': { en: 'Basil light', de: 'Basilikum Licht', nl: 'Basilicum licht', it: 'Basilico luce', es: 'Albahaca luz', pl: 'Bazylia światło' },
  'Basilic pile': { en: 'Basil battery', de: 'Basilikum Batterie', nl: 'Basilicum batterij', it: 'Basilico batteria', es: 'Albahaca batería', pl: 'Bazylia bateria' },
  'Basilic température': { en: 'Basil temperature', de: 'Basilikum Temperatur', nl: 'Basilicum temperatuur', it: 'Basilico temperatura', es: 'Albahaca temperatura', pl: 'Bazylia temperatura' },
  'Batterie maison': { en: 'Home battery', de: 'Hausbatterie', nl: 'Thuisbatterij', it: 'Batteria di casa', es: 'Batería de casa', pl: 'Bateria domowa' },
  'Batterie niveau': { en: 'Battery level', de: 'Batteriestand', nl: 'Batterijniveau', it: 'Livello batteria', es: 'Nivel de batería', pl: 'Poziom baterii' },
  // Le motif d'un passage interrompu (chantier IoT, § 10).
  'Bloqué sous le canapé': { en: 'Stuck under the sofa', de: 'Unter dem Sofa festgefahren', nl: 'Vast onder de bank', it: 'Bloccato sotto il divano', es: 'Atascado bajo el sofá', pl: 'Utknął pod kanapą' },
  'Borne de recharge': { en: 'Charging station', de: 'Ladestation', nl: 'Laadpaal', it: 'Stazione di ricarica', es: 'Punto de recarga', pl: 'Stacja ładowania' },
  'Bouton Cuisine': { en: 'Kitchen button', de: 'Taster Küche', nl: 'Knop keuken', it: 'Pulsante cucina', es: 'Botón cocina', pl: 'Przycisk kuchnia' },
  'Boîtier TV': { en: 'TV box', de: 'TV-Box', nl: 'Tv-box', it: 'Box TV', es: 'Reproductor de TV', pl: 'Przystawka TV' },
  'Café avec Sam': { en: 'Coffee with Sam', de: 'Kaffee mit Sam', nl: 'Koffie met Sam', it: 'Caffè con Sam', es: 'Café con Sam', pl: 'Kawa z Samem' },
  'Calendrier maison': { en: 'Home calendar', de: 'Kalender Zuhause', nl: 'Agenda thuis', it: 'Calendario di casa', es: 'Calendario de casa', pl: 'Kalendarz domowy' },
  'Caméra': { en: 'Camera', de: 'Kamera', nl: 'Camera', it: 'Telecamera', es: 'Cámara', pl: 'Kamera' },
  'Caméra entrée': { en: 'Entrance camera', de: 'Kamera Eingang', nl: 'Camera entree', it: 'Telecamera ingresso', es: 'Cámara entrada', pl: 'Kamera wejście' },
  'Caméra entrée Détection de mouvement': { en: 'Entrance camera Motion detection', de: 'Kamera Eingang Bewegungserkennung', nl: 'Camera entree Bewegingsdetectie', it: 'Telecamera ingresso Rilevamento movimento', es: 'Cámara entrada Detección de movimiento', pl: 'Kamera wejście Wykrywanie ruchu' },
  'Caméra entrée Détection des pleurs': { en: 'Entrance camera Crying detection', de: 'Kamera Eingang Weinerkennung', nl: 'Camera entree Huildetectie', it: 'Telecamera ingresso Rilevamento pianto', es: 'Cámara entrada Detección de llanto', pl: 'Kamera wejście Wykrywanie płaczu' },
  'Caméra entrée Mode privé': { en: 'Entrance camera Privacy mode', de: 'Kamera Eingang Privatmodus', nl: 'Camera entree Privémodus', it: 'Telecamera ingresso Modalità privata', es: 'Cámara entrada Modo privado', pl: 'Kamera wejście Tryb prywatny' },
  'Caméra entrée Mouvement': { en: 'Entrance camera Motion', de: 'Kamera Eingang Bewegung', nl: 'Camera entree Beweging', it: 'Telecamera ingresso Movimento', es: 'Cámara entrada Movimiento', pl: 'Kamera wejście Ruch' },
  'Caméra entrée Personne': { en: 'Entrance camera Person', de: 'Kamera Eingang Person', nl: 'Camera entree Persoon', it: 'Telecamera ingresso Persona', es: 'Cámara entrada Persona', pl: 'Kamera wejście Osoba' },
  'Caméra entrée Suivi de mouvement': { en: 'Entrance camera Motion tracking', de: 'Kamera Eingang Bewegungsverfolgung', nl: 'Camera entree Bewegingsvolging', it: 'Telecamera ingresso Inseguimento movimento', es: 'Cámara entrada Seguimiento de movimiento', pl: 'Kamera wejście Śledzenie ruchu' },
  'Caméra entrée Voyant': { en: 'Entrance camera Indicator light', de: 'Kamera Eingang Kontrollleuchte', nl: 'Camera entree Indicatielampje', it: 'Telecamera ingresso Spia', es: 'Cámara entrada Piloto', pl: 'Kamera wejście Kontrolka' },
  'Carte météo animée': { en: 'Animated weather map', de: 'Animierte Wetterkarte', nl: 'Geanimeerde weerkaart', it: 'Mappa meteo animata', es: 'Mapa del tiempo animado', pl: 'Animowana mapa pogody' },
  'Chauffage : consigne de nuit': { en: 'Heating: night setpoint', de: 'Heizung: Nachttemperatur', nl: 'Verwarming: nachtinstelling', it: 'Riscaldamento: temperatura notturna', es: 'Calefacción: consigna nocturna', pl: 'Ogrzewanie: temperatura nocna' },
  'Cinéma': { en: 'Cinema', de: 'Kino', nl: 'Bioscoop', it: 'Cinema', es: 'Cine', pl: 'Kino' },
  'Climatisation': { en: 'Air conditioner', de: 'Klimaanlage', nl: 'Airconditioner', it: 'Climatizzatore', es: 'Aire acondicionado', pl: 'Klimatyzator' },
  'Consommation du jour': { en: 'Today’s consumption', de: 'Verbrauch heute', nl: 'Verbruik vandaag', it: 'Consumo di oggi', es: 'Consumo de hoy', pl: 'Zużycie dzisiaj' },
  'Consommation heures creuses': { en: 'Off-peak consumption', de: 'Verbrauch Nebenzeit', nl: 'Verbruik daltarief', it: 'Consumo fuori punta', es: 'Consumo en horas valle', pl: 'Zużycie poza szczytem' },
  'Consommation heures pleines': { en: 'Peak consumption', de: 'Verbrauch Hauptzeit', nl: 'Verbruik piektarief', it: 'Consumo di punta', es: 'Consumo en horas punta', pl: 'Zużycie w szczycie' },
  'Contrôle chaudière': { en: 'Boiler service', de: 'Heizungswartung', nl: 'Onderhoud cv-ketel', it: 'Controllo caldaia', es: 'Revisión de la caldera', pl: 'Przegląd kotła' },
  'Courses': { en: 'Shopping', de: 'Einkäufe', nl: 'Boodschappen', it: 'Spesa', es: 'Compras', pl: 'Zakupy' },
  'Croquettes distribuées aujourd’hui': { en: 'Kibble served today', de: 'Heute ausgegebenes Futter', nl: 'Vandaag gegeven brokken', it: 'Crocchette erogate oggi', es: 'Pienso servido hoy', pl: 'Karma wydana dzisiaj' },
  'Croquettes du chat': { en: 'Cat food', de: 'Katzenfutter', nl: 'Kattenbrokjes', it: 'Crocchette del gatto', es: 'Pienso del gato', pl: 'Karma dla kota' },
  'Croquettes du midi': { en: 'Midday kibble', de: 'Mittagsfutter', nl: 'Middagbrokjes', it: 'Crocchette di mezzogiorno', es: 'Pienso del mediodía', pl: 'Karma w południe' },
  'Croquettes matin et soir': { en: 'Kibble morning and evening', de: 'Futter morgens und abends', nl: 'Brokjes ’s ochtends en ’s avonds', it: 'Crocchette mattina e sera', es: 'Pienso mañana y noche', pl: 'Karma rano i wieczorem' },
  'Croquettes presque épuisées': { en: 'Food low', de: 'Futter fast leer', nl: 'Voer bijna op', it: 'Crocchette quasi finite', es: 'Pienso casi agotado', pl: 'Mało karmy' },
  'Dernier repas': { en: 'Last feed', de: 'Letzte Fütterung', nl: 'Laatste voerbeurt', it: 'Ultimo pasto', es: 'Última comida', pl: 'Ostatni posiłek' },
  'Distribuer': { en: 'Serve', de: 'Ausgeben', nl: 'Geven', it: 'Eroga', es: 'Servir', pl: 'Wydaj' },
  'Distributeur de croquettes': { en: 'Pet feeder', de: 'Futterautomat', nl: 'Voerautomaat', it: 'Distributore di crocchette', es: 'Comedero automático', pl: 'Podajnik karmy' },
  'Distribution manuelle': { en: 'Manual feed', de: 'Manuelle Fütterung', nl: 'Handmatig voeren', it: 'Erogazione manuale', es: 'Dispensación manual', pl: 'Karmienie ręczne' },
  'Déshydratant': { en: 'Desiccant', de: 'Trockenmittel', nl: 'Droogmiddel', it: 'Essiccante', es: 'Desecante', pl: 'Pochłaniacz wilgoci' },
  'Délestage du chauffe-eau': { en: 'Water heater load shedding', de: 'Lastabwurf Warmwasserspeicher', nl: 'Afschakeling boiler', it: 'Distacco dello scaldacqua', es: 'Deslastre del calentador', pl: 'Odłączanie bojlera' },
  'Détecteur de fumée cuisine': { en: 'Kitchen smoke detector', de: 'Rauchmelder Küche', nl: 'Rookmelder keuken', it: 'Rilevatore di fumo cucina', es: 'Detector de humo cocina', pl: 'Czujnik dymu kuchnia' },
  'Détecteur de fumée entrée': { en: 'Entrance smoke detector', de: 'Rauchmelder Eingang', nl: 'Rookmelder entree', it: 'Rilevatore di fumo ingresso', es: 'Detector de humo entrada', pl: 'Czujnik dymu wejście' },
  'Détecteur de monoxyde salon': { en: 'Living room CO detector', de: 'CO-Melder Wohnzimmer', nl: 'CO-melder woonkamer', it: 'Rilevatore di CO soggiorno', es: 'Detector de CO salón', pl: 'Czujnik czadu salon' },
  'Echo de la cuisine': { en: 'Kitchen Echo', de: 'Echo Küche', nl: 'Echo keuken', it: 'Echo cucina', es: 'Echo cocina', pl: 'Echo kuchnia' },
  // Les lecteurs de sa maquette « Cartes médias » (chantier Médias, § 8). L'officielle et sa jumelle HACS portent les mêmes mots, dans chaque langue :
  // c'est ainsi que l'appariement les retrouve. Les noms de produit (« Echo Dot », « Apple TV 4K ») se lisent pareil partout. Polonais nouveau, à relire par Seba882.
  'Apple TV Chambre': { en: 'Bedroom Apple TV', de: 'Apple TV Schlafzimmer', nl: 'Apple TV slaapkamer', it: 'Apple TV camera', es: 'Apple TV dormitorio', pl: 'Apple TV sypialnia' },
  'Echo Dot - Chambre': { en: 'Echo Dot - Bedroom', de: 'Echo Dot - Schlafzimmer', nl: 'Echo Dot - Slaapkamer', it: 'Echo Dot - Camera', es: 'Echo Dot - Dormitorio', pl: 'Echo Dot - Sypialnia' },
  'Echo Dot Chambre': { en: 'Echo Dot Bedroom', de: 'Echo Dot Schlafzimmer', nl: 'Echo Dot Slaapkamer', it: 'Echo Dot Camera', es: 'Echo Dot Dormitorio', pl: 'Echo Dot Sypialnia' },
  'Echo Show Salon': { en: 'Living room Echo Show', de: 'Echo Show Wohnzimmer', nl: 'Echo Show woonkamer', it: 'Echo Show soggiorno', es: 'Echo Show salón', pl: 'Echo Show salon' },
  'Echo Dot - Bureau': { en: 'Echo Dot - Office', de: 'Echo Dot - Büro', nl: 'Echo Dot - Kantoor', it: 'Echo Dot - Studio', es: 'Echo Dot - Despacho', pl: 'Echo Dot - Biuro' },
  'Partout': { en: 'Everywhere', de: 'Überall', nl: 'Overal', it: 'Ovunque', es: 'En todas partes', pl: 'Wszędzie' },
  'Apple TV 4K': { en: 'Apple TV 4K', de: 'Apple TV 4K', nl: 'Apple TV 4K', it: 'Apple TV 4K', es: 'Apple TV 4K', pl: 'Apple TV 4K' },
  'Echo Dot (3e génération)': { en: 'Echo Dot (3rd Gen)', de: 'Echo Dot (3. Generation)', nl: 'Echo Dot (3e generatie)', it: 'Echo Dot (3ª generazione)', es: 'Echo Dot (3.ª generación)', pl: 'Echo Dot (3. generacji)' },
  'Echo Dot': { en: 'Echo Dot', de: 'Echo Dot', nl: 'Echo Dot', it: 'Echo Dot', es: 'Echo Dot', pl: 'Echo Dot' },
  'Echo': { en: 'Echo', de: 'Echo', nl: 'Echo', it: 'Echo', es: 'Echo', pl: 'Echo' },
  'Echo Show': { en: 'Echo Show', de: 'Echo Show', nl: 'Echo Show', it: 'Echo Show', es: 'Echo Show', pl: 'Echo Show' },
  'Annoncer': { en: 'Announce', de: 'Durchsage', nl: 'Aankondigen', it: 'Annuncia', es: 'Anunciar', pl: 'Ogłoś' },
  'Parler': { en: 'Speak', de: 'Sprechen', nl: 'Spreken', it: 'Parla', es: 'Hablar', pl: 'Mów' },
  'Annonces': { en: 'Announcements', de: 'Durchsagen', nl: 'Aankondigingen', it: 'Annunci', es: 'Anuncios', pl: 'Ogłoszenia' },
  'Prochaine alarme': { en: 'Next alarm', de: 'Nächster Wecker', nl: 'Volgende wekker', it: 'Prossima sveglia', es: 'Próxima alarma', pl: 'Następny alarm' },
  'Enceinte': { en: 'Speaker', de: 'Lautsprecher', nl: 'Speaker', it: 'Diffusore', es: 'Altavoz', pl: 'Głośnik' },
  'Enceinte salon': { en: 'Living room speaker', de: 'Lautsprecher Wohnzimmer', nl: 'Speaker woonkamer', it: 'Diffusore soggiorno', es: 'Altavoz salón', pl: 'Głośnik salon' },
  'En ligne': { en: 'Online', de: 'Online', nl: 'Online', it: 'Online', es: 'En línea', pl: 'Online' },
  'Erreur du distributeur': { en: 'Feeder error', de: 'Fehler des Futterautomaten', nl: 'Fout voerautomaat', it: 'Errore del distributore', es: 'Error del comedero', pl: 'Błąd podajnika' },
  // La mangeoire et la seconde erreur de l'Aqara (passe bis de l'étape 2 IoT, 19/10). Polonais nouveau, à relire par Seba882 : les quatre noms qui suivent.
  'Erreur moteur': { en: 'Motor error', de: 'Motorfehler', nl: 'Motorfout', it: 'Errore motore', es: 'Error del motor', pl: 'Błąd silnika' },
  'Taille de ration': { en: 'Serving size', de: 'Portionsgröße', nl: 'Portiegrootte', it: 'Dimensione della razione', es: 'Tamaño de la ración', pl: 'Wielkość porcji' },
  'Poids d’une portion': { en: 'Portion weight', de: 'Gewicht einer Portion', nl: 'Gewicht van een portie', it: 'Peso di una porzione', es: 'Peso de una porción', pl: 'Waga porcji' },
  'Portions distribuées aujourd’hui': { en: 'Portions served today', de: 'Heute ausgegebene Portionen', nl: 'Vandaag gegeven porties', it: 'Porzioni erogate oggi', es: 'Porciones servidas hoy', pl: 'Porcje wydane dzisiaj' },
  'État de la distribution': { en: 'Dispenser state', de: 'Ausgabestatus', nl: 'Status van de uitgifte', it: 'Stato dell’erogazione', es: 'Estado de la dispensación', pl: 'Stan wydawania' },
  'Fenêtre chambre': { en: 'Bedroom window', de: 'Fenster Schlafzimmer', nl: 'Raam slaapkamer', it: 'Finestra camera', es: 'Ventana dormitorio', pl: 'Okno sypialnia' },
  'Fenêtre salon': { en: 'Living room window', de: 'Fenster Wohnzimmer', nl: 'Raam woonkamer', it: 'Finestra soggiorno', es: 'Ventana salón', pl: 'Okno salon' },
  'Fermer les volets du bureau': { en: 'Close the office blinds', de: 'Rollläden im Büro schließen', nl: 'Rolluiken in het kantoor sluiten', it: 'Chiudere le tapparelle dello studio', es: 'Cerrar las persianas del despacho', pl: 'Zamknąć rolety w biurze' },
  'Fréquence du déshydratant': { en: 'Desiccant frequency', de: 'Wechselintervall Trockenmittel', nl: 'Vervangfrequentie droogmiddel', it: 'Frequenza dell’essiccante', es: 'Frecuencia del desecante', pl: 'Częstotliwość wymiany pochłaniacza' },
  'Fuite sous l’évier': { en: 'Leak under the sink', de: 'Leck unter der Spüle', nl: 'Lekkage onder de gootsteen', it: 'Perdita sotto il lavello', es: 'Fuga bajo el fregadero', pl: 'Wyciek pod zlewem' },
  'Injection du jour': { en: 'Today’s export', de: 'Einspeisung heute', nl: 'Teruglevering vandaag', it: 'Immissione di oggi', es: 'Inyección de hoy', pl: 'Oddanie dzisiaj' },
  'Interrupteur Chambre': { en: 'Bedroom switch', de: 'Schalter Schlafzimmer', nl: 'Schakelaar slaapkamer', it: 'Interruttore camera', es: 'Interruptor dormitorio', pl: 'Włącznik sypialnia' },
  'Interrupteur Couloir': { en: 'Hallway switch', de: 'Schalter Flur', nl: 'Schakelaar gang', it: 'Interruttore corridoio', es: 'Interruptor pasillo', pl: 'Włącznik korytarz' },
  'Invité': { en: 'Guest', de: 'Gast', nl: 'Gast', it: 'Ospite', es: 'Invitado', pl: 'Gość' },
  'Je rentre': { en: 'Coming home', de: 'Ich komme heim', nl: 'Ik kom thuis', it: 'Torno a casa', es: 'Vuelvo a casa', pl: 'Wracam' },
  'Lave-linge terminé': { en: 'Washing machine finished', de: 'Waschmaschine fertig', nl: 'Wasmachine klaar', it: 'Lavatrice finita', es: 'Lavadora terminada', pl: 'Pralka skończyła' },
  'Liste partagée': { en: 'Shared list', de: 'Geteilte Liste', nl: 'Gedeelde lijst', it: 'Lista condivisa', es: 'Lista compartida', pl: 'Lista wspólna' },
  'Livrable client': { en: 'Client deliverable', de: 'Abgabe beim Kunden', nl: 'Oplevering klant', it: 'Consegna al cliente', es: 'Entrega al cliente', pl: 'Oddanie projektu klientowi' },
  'Poste de nuit': { en: 'Night shift', de: 'Nachtschicht', nl: 'Nachtdienst', it: 'Turno di notte', es: 'Turno de noche', pl: 'Nocna zmiana' },
  'Livraison colis': { en: 'Parcel delivery', de: 'Paketzustellung', nl: 'Pakketbezorging', it: 'Consegna pacco', es: 'Entrega de paquete', pl: 'Dostawa paczki' },
  'Lumière couloir la nuit': { en: 'Hallway light at night', de: 'Flurlicht bei Nacht', nl: 'Ganglicht ’s nachts', it: 'Luce corridoio di notte', es: 'Luz del pasillo de noche', pl: 'Światło korytarza w nocy' },
  'Maison': { en: 'Home', de: 'Zu Hause', nl: 'Huis', it: 'Casa', es: 'Casa', pl: 'Dom' },
  'Mode de distribution': { en: 'Feeding mode', de: 'Fütterungsmodus', nl: 'Voermodus', it: 'Modalità di erogazione', es: 'Modo de dispensación', pl: 'Tryb karmienia' },
  'Module fil pilote': { en: 'Pilot wire module', de: 'Fil-Pilote-Modul', nl: 'Fil-pilote-module', it: 'Modulo filo pilota', es: 'Módulo de hilo piloto', pl: 'Moduł fil pilote' },
  'Mouvement entrée': { en: 'Entrance motion', de: 'Bewegung Eingang', nl: 'Beweging entree', it: 'Movimento ingresso', es: 'Movimiento entrada', pl: 'Ruch wejście' },
  'Météo': { en: 'Weather', de: 'Wetter', nl: 'Weer', it: 'Meteo', es: 'Tiempo', pl: 'Pogoda' },
  'Nuit': { en: 'Night', de: 'Nacht', nl: 'Nacht', it: 'Notte', es: 'Noche', pl: 'Noc' },
  'Part fossile du réseau': { en: 'Fossil share of the grid', de: 'Fossiler Anteil im Netz', nl: 'Fossiel aandeel van het net', it: 'Quota fossile della rete', es: 'Parte fósil de la red', pl: 'Udział paliw kopalnych w sieci' },
  // Les aires de la tondeuse au carnet des robots (chantier IoT, § 10) : le nom de leur interrupteur, sans « Tondeuse Zone ».
  'Côté garage': { en: 'Garage side', de: 'Garagenseite', nl: 'Garagekant', it: 'Lato garage', es: 'Lado garaje', pl: 'Przy garażu' },
  'Pelouse arrière': { en: 'Back lawn', de: 'Rasen hinten', nl: 'Achtergazon', it: 'Prato dietro', es: 'Césped trasero', pl: 'Trawnik z tyłu' },
  'Pelouse avant': { en: 'Front lawn', de: 'Rasen vorne', nl: 'Voorgazon', it: 'Prato davanti', es: 'Césped delantero', pl: 'Trawnik z przodu' },
  'Pile porte entrée': { en: 'Entrance door battery', de: 'Batterie Eingangstür', nl: 'Batterij voordeur', it: 'Batteria porta ingresso', es: 'Batería puerta entrada', pl: 'Bateria drzwi wejściowych' },
  'Plafonnier': { en: 'Ceiling light', de: 'Deckenleuchte', nl: 'Plafondlamp', it: 'Plafoniera', es: 'Plafón', pl: 'Lampa sufitowa' },
  // Le motif d'un passage interrompu, tel qu'un appareil le publie dans la langue de la maison (chantier IoT, § 10).
  'Pluie détectée': { en: 'Rain detected', de: 'Regen erkannt', nl: 'Regen gedetecteerd', it: 'Pioggia rilevata', es: 'Lluvia detectada', pl: 'Wykryto deszcz' },
  'Point d’équipe': { en: 'Team meeting', de: 'Teambesprechung', nl: 'Teamoverleg', it: 'Riunione di team', es: 'Reunión de equipo', pl: 'Spotkanie zespołu' },
  'Poêle': { en: 'Stove', de: 'Ofen', nl: 'Kachel', it: 'Stufa', es: 'Estufa', pl: 'Piec' },
  'Poêle à granulés': { en: 'Pellet stove', de: 'Pelletofen', nl: 'Pelletkachel', it: 'Stufa a pellet', es: 'Estufa de pellets', pl: 'Piec na pellet' },
  // L'apostrophe droite du capteur de la porte, la courbe de sa serrure : deux clés.
  "Porte d'entrée": { en: 'Front door', de: 'Eingangstür', nl: 'Voordeur', it: 'Porta d’ingresso', es: 'Puerta de entrada', pl: 'Drzwi wejściowe' },
  'Porte de garage': { en: 'Garage door', de: 'Garagentor', nl: 'Garagedeur', it: 'Porta del garage', es: 'Puerta del garaje', pl: 'Brama garażowa' },
  'Porte de service': { en: 'Back door', de: 'Hintertür', nl: 'Achterdeur', it: 'Porta di servizio', es: 'Puerta de servicio', pl: 'Tylne drzwi' },
  'Porte d’entrée': { en: 'Front door', de: 'Eingangstür', nl: 'Voordeur', it: 'Porta d’ingresso', es: 'Puerta de entrada', pl: 'Drzwi wejściowe' },
  'Portion du distributeur': { en: 'Feeder portion', de: 'Portion des Futterautomaten', nl: 'Portie voederautomaat', it: 'Porzione del distributore', es: 'Ración del dispensador', pl: 'Porcja podajnika' },
  'Prendre les médicaments': { en: 'Take the medication', de: 'Medikamente nehmen', nl: 'Medicijnen innemen', it: 'Prendere le medicine', es: 'Tomar los medicamentos', pl: 'Wziąć leki' },
  'Prochain repas': { en: 'Next feed', de: 'Nächste Fütterung', nl: 'Volgende voerbeurt', it: 'Prossimo pasto', es: 'Próxima comida', pl: 'Następny posiłek' },
  'Production du jour': { en: 'Today’s production', de: 'Erzeugung heute', nl: 'Productie vandaag', it: 'Produzione di oggi', es: 'Producción de hoy', pl: 'Produkcja dzisiaj' },
  'Production solaire': { en: 'Solar production', de: 'Solarerzeugung', nl: 'Zonneproductie', it: 'Produzione solare', es: 'Producción solar', pl: 'Produkcja słoneczna' },
  'Programme des repas': { en: 'Feeding schedule', de: 'Fütterungsplan', nl: 'Voerschema', it: 'Programma dei pasti', es: 'Programa de comidas', pl: 'Harmonogram posiłków' },
  'Quantité de la distribution manuelle': { en: 'Manual feed quantity', de: 'Menge der manuellen Fütterung', nl: 'Hoeveelheid handmatig voeren', it: 'Quantità dell’erogazione manuale', es: 'Cantidad de la dispensación manual', pl: 'Ilość karmienia ręcznego' },
  'Quantité distribuée aujourd’hui': { en: 'Amount fed today', de: 'Heute ausgegebene Menge', nl: 'Vandaag gegeven hoeveelheid', it: 'Quantità erogata oggi', es: 'Cantidad servida hoy', pl: 'Ilość wydana dzisiaj' },
  "Qualité de l'air": { en: 'Air quality', de: 'Luftqualität', nl: 'Luchtkwaliteit', it: 'Qualità dell’aria', es: 'Calidad del aire', pl: 'Jakość powietrza' },
  'Radiateur bureau': { en: 'Office radiator', de: 'Heizkörper Büro', nl: 'Radiator kantoor', it: 'Radiatore studio', es: 'Radiador despacho', pl: 'Grzejnik biuro' },
  'Radiateur bureau hors gel': { en: 'Office radiator frost protection', de: 'Heizkörper Büro Frostschutz', nl: 'Radiator kantoor vorstbeveiliging', it: 'Radiatore studio antigelo', es: 'Radiador despacho antihielo', pl: 'Grzejnik biuro ochrona przed mrozem' },
  'Radiateur chambre': { en: 'Bedroom radiator', de: 'Heizkörper Schlafzimmer', nl: 'Radiator slaapkamer', it: 'Radiatore camera', es: 'Radiador dormitorio', pl: 'Grzejnik sypialnia' },
  'Radiateur salon': { en: 'Living room radiator', de: 'Heizkörper Wohnzimmer', nl: 'Radiator woonkamer', it: 'Radiatore soggiorno', es: 'Radiador salón', pl: 'Grzejnik salon' },
  'Ramassage des poubelles': { en: 'Bin collection', de: 'Müllabfuhr', nl: 'Afvalophaling', it: 'Ritiro dei rifiuti', es: 'Recogida de basura', pl: 'Wywóz śmieci' },
  'Réinitialiser le déshydratant': { en: 'Reset desiccant', de: 'Trockenmittel zurücksetzen', nl: 'Droogmiddel resetten', it: 'Reimposta l’essiccante', es: 'Reiniciar el desecante', pl: 'Zresetuj pochłaniacz wilgoci' },
  'Réseau': { en: 'Grid', de: 'Netz', nl: 'Net', it: 'Rete', es: 'Red', pl: 'Sieć' },
  'Réservoir de croquettes': { en: 'Kibble tank', de: 'Futterbehälter', nl: 'Brokkenreservoir', it: 'Serbatoio crocchette', es: 'Depósito de pienso', pl: 'Zbiornik karmy' },
  'Réveil': { en: 'Wake up', de: 'Aufwachen', nl: 'Opstaan', it: 'Sveglia', es: 'Despertar', pl: 'Pobudka' },
  'Salon Bruit': { en: 'Living room Noise', de: 'Wohnzimmer Lärm', nl: 'Woonkamer Geluid', it: 'Soggiorno Rumore', es: 'Salón Ruido', pl: 'Salon Hałas' },
  'Sauvegarde automatique': { en: 'Automatic backup', de: 'Automatische Sicherung', nl: 'Automatische back-up', it: 'Backup automatico', es: 'Copia automática', pl: 'Kopia automatyczna' },
  'Sirène intérieure': { en: 'Indoor siren', de: 'Innensirene', nl: 'Binnensirene', it: 'Sirena interna', es: 'Sirena interior', pl: 'Syrena wewnętrzna' },
  'Source du dernier repas': { en: 'Last meal source', de: 'Quelle der letzten Mahlzeit', nl: 'Bron laatste maaltijd', it: 'Origine dell’ultimo pasto', es: 'Origen de la última comida', pl: 'Źródło ostatniego posiłku' },
  'Soleil': { en: 'Sun', de: 'Sonne', nl: 'Zon', it: 'Sole', es: 'Sol', pl: 'Słońce' },
  'Sonnette vers le téléphone': { en: 'Doorbell to phone', de: 'Türklingel aufs Handy', nl: 'Deurbel naar telefoon', it: 'Campanello al telefono', es: 'Timbre al teléfono', pl: 'Dzwonek na telefon' },
  'Sortir le linge': { en: 'Take out the laundry', de: 'Wäsche herausnehmen', nl: 'Was uit de machine halen', it: 'Tirare fuori il bucato', es: 'Sacar la ropa', pl: 'Wyjąć pranie' },
  'Surplus': { en: 'Surplus', de: 'Überschuss', nl: 'Overschot', it: 'Surplus', es: 'Excedente', pl: 'Nadwyżka' },
  'TV du salon': { en: 'Living room TV', de: 'Fernseher Wohnzimmer', nl: 'Tv woonkamer', it: 'TV soggiorno', es: 'TV salón', pl: 'Telewizor salon' },
  'Température extérieure': { en: 'Outdoor temperature', de: 'Außentemperatur', nl: 'Buitentemperatuur', it: 'Temperatura esterna', es: 'Temperatura exterior', pl: 'Temperatura zewnętrzna' },
  'Thermostat chambre': { en: 'Bedroom thermostat', de: 'Thermostat Schlafzimmer', nl: 'Thermostaat slaapkamer', it: 'Termostato camera', es: 'Termostato dormitorio', pl: 'Termostat sypialnia' },
  'Thermostat salon': { en: 'Living room thermostat', de: 'Thermostat Wohnzimmer', nl: 'Thermostaat woonkamer', it: 'Termostato soggiorno', es: 'Termostato salón', pl: 'Termostat salon' },
  'Tondeuse': { en: 'Mower', de: 'Mähroboter', nl: 'Grasmaaier', it: 'Tosaerba', es: 'Cortacésped', pl: 'Kosiarka' },
  'Tondeuse Cycles de batterie': { en: 'Mower Battery cycles', de: 'Mähroboter Akkuzyklen', nl: 'Grasmaaier Accucycli', it: 'Tosaerba Cicli batteria', es: 'Cortacésped Ciclos de batería', pl: 'Kosiarka Cykle baterii' },
  "Tondeuse Durée d'utilisation des lames": { en: 'Mower Blade usage time', de: 'Mähroboter Nutzungsdauer der Klingen', nl: 'Grasmaaier Gebruiksduur messen', it: 'Tosaerba Tempo di utilizzo lame', es: 'Cortacésped Tiempo de uso de cuchillas', pl: 'Kosiarka Czas użytkowania ostrzy' },
  'Tondeuse Détection de pluie': { en: 'Mower Rain detection', de: 'Mähroboter Regenerkennung', nl: 'Grasmaaier Regendetectie', it: 'Tosaerba Rilevamento pioggia', es: 'Cortacésped Detección de lluvia', pl: 'Kosiarka Wykrywanie deszczu' },
  'Tondeuse En charge': { en: 'Mower Charging', de: 'Mähroboter Lädt', nl: 'Grasmaaier Opladen', it: 'Tosaerba In carica', es: 'Cortacésped Cargando', pl: 'Kosiarka Ładowanie' },
  'Tondeuse Hauteur des lames': { en: 'Mower Blade height', de: 'Mähroboter Schnitthöhe', nl: 'Grasmaaier Maaihoogte', it: 'Tosaerba Altezza lame', es: 'Cortacésped Altura de cuchillas', pl: 'Kosiarka Wysokość ostrzy' },
  'Tondeuse Kilométrage total': { en: 'Mower Total distance', de: 'Mähroboter Gesamtstrecke', nl: 'Grasmaaier Totale afstand', it: 'Tosaerba Distanza totale', es: 'Cortacésped Distancia total', pl: 'Kosiarka Łączny dystans' },
  'Tondeuse Micrologiciel': { en: 'Mower Firmware', de: 'Mähroboter Firmware', nl: 'Grasmaaier Firmware', it: 'Tosaerba Firmware', es: 'Cortacésped Firmware', pl: 'Kosiarka Oprogramowanie' },
  "Tondeuse Seuil d'usure des lames": { en: 'Mower Blade wear threshold', de: 'Mähroboter Verschleißgrenze der Klingen', nl: 'Grasmaaier Slijtagedrempel messen', it: 'Tosaerba Soglia di usura lame', es: 'Cortacésped Umbral de desgaste de cuchillas', pl: 'Kosiarka Próg zużycia ostrzy' },
  'Tondeuse Signal Wi-Fi': { en: 'Mower Wi-Fi signal', de: 'Mähroboter WLAN-Signal', nl: 'Grasmaaier Wifi-signaal', it: 'Tosaerba Segnale Wi-Fi', es: 'Cortacésped Señal Wi-Fi', pl: 'Kosiarka Sygnał Wi-Fi' },
  'Tondeuse Surface': { en: 'Mower Area', de: 'Mähroboter Fläche', nl: 'Grasmaaier Oppervlak', it: 'Tosaerba Superficie', es: 'Cortacésped Superficie', pl: 'Kosiarka Powierzchnia' },
  'Tondeuse Sécurité faune': { en: 'Mower Wildlife safety', de: 'Mähroboter Tierschutz', nl: 'Grasmaaier Dierbeveiliging', it: 'Tosaerba Sicurezza fauna', es: 'Cortacésped Seguridad fauna', pl: 'Kosiarka Ochrona zwierząt' },
  'Tondeuse Temps de travail total': { en: 'Mower Total working time', de: 'Mähroboter Gesamtarbeitszeit', nl: 'Grasmaaier Totale werktijd', it: 'Tosaerba Tempo di lavoro totale', es: 'Cortacésped Tiempo total de trabajo', pl: 'Kosiarka Łączny czas pracy' },
  'Tondeuse Voix': { en: 'Mower Voice', de: 'Mähroboter Stimme', nl: 'Grasmaaier Stem', it: 'Tosaerba Voce', es: 'Cortacésped Voz', pl: 'Kosiarka Głos' },
  'Tondeuse Zone Côté garage': { en: 'Mower Zone Garage side', de: 'Mähroboter Zone Garagenseite', nl: 'Grasmaaier Zone Garagekant', it: 'Tosaerba Zona Lato garage', es: 'Cortacésped Zona Lado garaje', pl: 'Kosiarka Strefa Przy garażu' },
  'Tondeuse Zone Pelouse arrière': { en: 'Mower Zone Back lawn', de: 'Mähroboter Zone Rasen hinten', nl: 'Grasmaaier Zone Achtergazon', it: 'Tosaerba Zona Prato dietro', es: 'Cortacésped Zona Césped trasero', pl: 'Kosiarka Strefa Trawnik z tyłu' },
  'Tondeuse Zone Pelouse avant': { en: 'Mower Zone Front lawn', de: 'Mähroboter Zone Rasen vorne', nl: 'Grasmaaier Zone Voorgazon', it: 'Tosaerba Zona Prato davanti', es: 'Cortacésped Zona Césped delantero', pl: 'Kosiarka Strefa Trawnik z przodu' },
  'Travail': { en: 'Work', de: 'Arbeit', nl: 'Werk', it: 'Lavoro', es: 'Trabajo', pl: 'Praca' },
  'Téléphone de Camille': { en: 'Camille’s phone', de: 'Camilles Telefon', nl: 'Telefoon van Camille', it: 'Telefono di Camille', es: 'Teléfono de Camille', pl: 'Telefon Camille' },
  'Variateur Salon': { en: 'Living room dimmer', de: 'Dimmer Wohnzimmer', nl: 'Dimmer woonkamer', it: 'Dimmer soggiorno', es: 'Regulador salón', pl: 'Ściemniacz salon' },
  'Veilleuse chambre au coucher': { en: 'Bedroom night light at bedtime', de: 'Nachtlicht Schlafzimmer zur Schlafenszeit', nl: 'Nachtlampje slaapkamer bij bedtijd', it: 'Luce notturna camera all’ora di dormire', es: 'Luz nocturna dormitorio al acostarse', pl: 'Lampka nocna sypialnia przed snem' },
  'Verrouillage enfant': { en: 'Child lock', de: 'Kindersicherung', nl: 'Kinderslot', it: 'Blocco bambini', es: 'Bloqueo infantil', pl: 'Blokada rodzicielska' },
  'Vigilance météo': { en: 'Weather warning', de: 'Wetterwarnung', nl: 'Weerwaarschuwing', it: 'Allerta meteo', es: 'Aviso meteorológico', pl: 'Ostrzeżenie pogodowe' },
  'Visite du ramoneur': { en: 'Chimney sweep visit', de: 'Besuch des Schornsteinfegers', nl: 'Bezoek van de schoorsteenveger', it: 'Visita dello spazzacamino', es: 'Visita del deshollinador', pl: 'Wizyta kominiarza' },
  'Volet bureau': { en: 'Office blind', de: 'Rollladen Büro', nl: 'Rolluik kantoor', it: 'Tapparella studio', es: 'Persiana despacho', pl: 'Roleta biuro' },
  'Volet chambre': { en: 'Bedroom blind', de: 'Rollladen Schlafzimmer', nl: 'Rolluik slaapkamer', it: 'Tapparella camera', es: 'Persiana dormitorio', pl: 'Roleta sypialnia' },
  'Volet cuisine': { en: 'Kitchen blind', de: 'Rollladen Küche', nl: 'Rolluik keuken', it: 'Tapparella cucina', es: 'Persiana cocina', pl: 'Roleta kuchnia' },
  'Volet salon': { en: 'Living room blind', de: 'Rollladen Wohnzimmer', nl: 'Rolluik woonkamer', it: 'Tapparella soggiorno', es: 'Persiana salón', pl: 'Roleta salon' },
  // Les ouvrants que la carte sait dire et que la démo n'avait pas (audit du 19/10) : un store banne, un rideau sans position, un volet muet, un volet à la Netatmo, un garage, un portail.
  'Store banne': { en: 'Awning', de: 'Markise', nl: 'Zonnescherm', it: 'Tenda da sole', es: 'Toldo', pl: 'Markiza' },
  'Rideau chambre': { en: 'Bedroom curtain', de: 'Vorhang Schlafzimmer', nl: 'Gordijn slaapkamer', it: 'Tenda camera', es: 'Cortina dormitorio', pl: 'Zasłona sypialnia' },
  'Volet entrée': { en: 'Entrance blind', de: 'Rollladen Eingang', nl: 'Rolluik entree', it: 'Tapparella ingresso', es: 'Persiana entrada', pl: 'Roleta wejście' },
  'Volet salle de bain': { en: 'Bathroom blind', de: 'Rollladen Badezimmer', nl: 'Rolluik badkamer', it: 'Tapparella bagno', es: 'Persiana baño', pl: 'Roleta łazienka' },
  'Porte de garage motorisée': { en: 'Motorised garage door', de: 'Elektrisches Garagentor', nl: 'Elektrische garagedeur', it: 'Porta del garage motorizzata', es: 'Puerta de garaje motorizada', pl: 'Brama garażowa z napędem' },
  'Portail': { en: 'Gate', de: 'Hoftor', nl: 'Poort', it: 'Cancello', es: 'Portón', pl: 'Brama wjazdowa' },
  'Volets : fermeture au coucher du soleil': { en: 'Blinds: close at sunset', de: 'Rollläden: schließen bei Sonnenuntergang', nl: 'Rolluiken: sluiten bij zonsondergang', it: 'Tapparelle: chiusura al tramonto', es: 'Persianas: cerrar al atardecer', pl: 'Rolety: zamknięcie o zachodzie' },
  'Volets : ouverture du matin': { en: 'Blinds: open in the morning', de: 'Rollläden: Öffnen am Morgen', nl: 'Rolluiken: openen ’s ochtends', it: 'Tapparelle: apertura al mattino', es: 'Persianas: apertura por la mañana', pl: 'Rolety: otwarcie rano' },
  'Éclairage terrasse au crépuscule': { en: 'Terrace lighting at dusk', de: 'Terrassenbeleuchtung bei Dämmerung', nl: 'Terrasverlichting bij schemering', it: 'Illuminazione terrazza al crepuscolo', es: 'Iluminación de la terraza al anochecer', pl: 'Oświetlenie tarasu o zmierzchu' },
  'PC bureau': { en: 'Desktop PC', de: 'Büro-PC', nl: 'Bureau-pc', it: 'PC ufficio', es: 'PC de oficina', pl: 'Komputer biurowy' },
  'PC bureau du jour': { en: 'Desktop PC today', de: 'Büro-PC heute', nl: 'Bureau-pc vandaag', it: 'PC ufficio oggi', es: 'PC de oficina hoy', pl: 'Komputer biurowy dzisiaj' },
  'Serveur de fichiers': { en: 'File server', de: 'Dateiserver', nl: 'Bestandsserver', it: 'Server di file', es: 'Servidor de archivos', pl: 'Serwer plików' },
  'Serveur de fichiers du jour': { en: 'File server today', de: 'Dateiserver heute', nl: 'Bestandsserver vandaag', it: 'Server di file oggi', es: 'Servidor de archivos hoy', pl: 'Serwer plików dzisiaj' },
  'Lave-vaisselle': { en: 'Dishwasher', de: 'Geschirrspüler', nl: 'Vaatwasser', it: 'Lavastoviglie', es: 'Lavavajillas', pl: 'Zmywarka' },
  'Lave-vaisselle du jour': { en: 'Dishwasher today', de: 'Geschirrspüler heute', nl: 'Vaatwasser vandaag', it: 'Lavastoviglie oggi', es: 'Lavavajillas hoy', pl: 'Zmywarka dzisiaj' },
  // Les prises de la démo (chantier Prises, § 10) : leurs noms, ceux de leurs capteurs et de leurs appareils.
  'Prise NAS (Zephyr)': { en: 'NAS plug (Zephyr)', de: 'NAS-Steckdose (Zephyr)', nl: 'NAS-stopcontact (Zephyr)', it: 'Presa NAS (Zephyr)', es: 'Enchufe NAS (Zephyr)', pl: 'Gniazdko NAS (Zephyr)' },
  'Prise PC Bureau (Atlas)': { en: 'Office PC plug (Atlas)', de: 'PC-Steckdose Büro (Atlas)', nl: 'Pc-stopcontact kantoor (Atlas)', it: 'Presa PC studio (Atlas)', es: 'Enchufe PC despacho (Atlas)', pl: 'Gniazdko PC biuro (Atlas)' },
  'Prise lave-vaisselle': { en: 'Dishwasher plug', de: 'Steckdose Geschirrspüler', nl: 'Stopcontact vaatwasser', it: 'Presa lavastoviglie', es: 'Enchufe lavavajillas', pl: 'Gniazdko zmywarki' },
  'Puissance': { en: 'Power', de: 'Leistung', nl: 'Vermogen', it: 'Potenza', es: 'Potencia', pl: 'Moc' },
  'Énergie': { en: 'Energy', de: 'Energie', nl: 'Energie', it: 'Energia', es: 'Energía', pl: 'Energia' },
  'Prise connectée': { en: 'Smart plug', de: 'Smarte Steckdose', nl: 'Slim stopcontact', it: 'Presa smart', es: 'Enchufe inteligente', pl: 'Inteligentne gniazdko' },
  'Alarme sirène Siren on': { en: 'Alarm siren Siren on', de: 'Alarmsirene Siren on', nl: 'Alarmsirene Siren on', it: 'Sirena allarme Siren on', es: 'Sirena de alarma Siren on', pl: 'Syrena alarmu Siren on' },
  'Alarme sirène': { en: 'Alarm siren', de: 'Alarmsirene', nl: 'Alarmsirene', it: 'Sirena allarme', es: 'Sirena de alarma', pl: 'Syrena alarmu' },
  'Sirène': { en: 'Siren', de: 'Sirene', nl: 'Sirene', it: 'Sirena', es: 'Sirena', pl: 'Syrena' },
  'Matin': { en: 'Morning', de: 'Morgen', nl: 'Ochtend', it: 'Mattina', es: 'Mañana', pl: 'Poranek' },
  'Radiateur chambre du jour': { en: 'Bedroom heater today', de: 'Heizung Schlafzimmer heute', nl: 'Radiator slaapkamer vandaag', it: 'Radiatore camera oggi', es: 'Radiador dormitorio hoy', pl: 'Grzejnik w sypialni dzisiaj' },
  'Box internet': { en: 'Internet router', de: 'Internet-Router', nl: 'Internetrouter', it: 'Router internet', es: 'Rúuter de internet', pl: 'Router internetowy' },
  'Box internet du jour': { en: 'Internet router today', de: 'Internet-Router heute', nl: 'Internetrouter vandaag', it: 'Router internet oggi', es: 'Rúuter de internet hoy', pl: 'Router internetowy dzisiaj' },
  'Heures creuses actives': { en: 'Off-peak hours active', de: 'Niedertarif aktiv', nl: 'Daluren actief', it: 'Fascia economica attiva', es: 'Horas valle activas', pl: 'Taryfa nocna aktywna' },
  'Prix heures creuses': { en: 'Off-peak price', de: 'Niedertarif-Preis', nl: 'Dalurenprijs', it: 'Prezzo fascia economica', es: 'Precio horas valle', pl: 'Cena taryfy nocnej' },
  'Prix heures pleines': { en: 'Peak price', de: 'Hochtarif-Preis', nl: 'Piekurenprijs', it: 'Prezzo fascia piena', es: 'Precio horas punta', pl: 'Cena taryfy dziennej' },
  'Abonnement': { en: 'Standing charge', de: 'Grundpreis', nl: 'Vastrecht', it: 'Quota fissa', es: 'Cuota fija', pl: 'Opłata abonamentowa' },
  'Coût du mois': { en: 'Cost this month', de: 'Kosten diesen Monat', nl: 'Kosten deze maand', it: 'Costo del mese', es: 'Coste del mes', pl: 'Koszt w tym miesiącu' },
  'Économie du mois': { en: 'Savings this month', de: 'Ersparnis diesen Monat', nl: 'Besparing deze maand', it: 'Risparmio del mese', es: 'Ahorro del mes', pl: 'Oszczędność w tym miesiącu' },
  'Consommation du mois': { en: 'Consumption this month', de: 'Verbrauch diesen Monat', nl: 'Verbruik deze maand', it: 'Consumo del mese', es: 'Consumo del mes', pl: 'Zużycie w tym miesiącu' },
  'Production du mois': { en: 'Production this month', de: 'Erzeugung diesen Monat', nl: 'Opbrengst deze maand', it: 'Produzione del mese', es: 'Producción del mes', pl: 'Produkcja w tym miesiącu' },
  'Consommation de l’année': { en: 'Consumption this year', de: 'Verbrauch dieses Jahr', nl: 'Verbruik dit jaar', it: 'Consumo dell’anno', es: 'Consumo del año', pl: 'Zużycie w tym roku' },
  'Production de l’année': { en: 'Production this year', de: 'Erzeugung dieses Jahr', nl: 'Opbrengst dit jaar', it: 'Produzione dell’anno', es: 'Producción del año', pl: 'Produkcja w tym roku' },
  // Les lampes de sa maquette « Cartes lumières » et les automatisations qui les allument (chantier Lumières, § 9).
  'Ampoule': { en: 'Bulb', de: 'Glühbirne', nl: 'Lamp', it: 'Lampadina', es: 'Bombilla', pl: 'Żarówka' },
  'Veilleuse': { en: 'Night light', de: 'Nachtlicht', nl: 'Nachtlampje', it: 'Luce notturna', es: 'Luz nocturna', pl: 'Lampka nocna' },
  'Applique Extérieur': { en: 'Outdoor wall light', de: 'Außenwandleuchte', nl: 'Buitenwandlamp', it: 'Applique esterna', es: 'Aplique exterior', pl: 'Kinkiet zewnętrzny' },
  'Coucher de Lino': { en: 'Lino’s bedtime', de: 'Linos Schlafenszeit', nl: 'Bedtijd van Lino', it: 'Nanna di Lino', es: 'Hora de dormir de Lino', pl: 'Usypianie Lina' },
  'Coucher du soleil': { en: 'Sunset', de: 'Sonnenuntergang', nl: 'Zonsondergang', it: 'Tramonto', es: 'Puesta de sol', pl: 'Zachód słońca' },
  // Les mesures de sa maquette « Cartes capteurs » et le thermomètre du salon (chantier Capteurs, § 9).
  // Polonais nouveau, à relire par Seba882 — les huit noms de ce bloc et du suivant : jasność, pyły, LZO, les trois « Termometr »,
  // wiatr, Stacja pogodowa (liste : docs/chantier-capteurs-plan-1-mesures.md, tâche 8).
  'luminosité': { en: 'brightness', de: 'Helligkeit', nl: 'lichtsterkte', it: 'luminosità', es: 'luminosidad', pl: 'jasność' },
  'particules': { en: 'particles', de: 'Feinstaub', nl: 'fijnstof', it: 'particolato', es: 'partículas', pl: 'pyły' },
  'COV': { en: 'VOC', de: 'VOC', nl: 'VOS', it: 'COV', es: 'COV', pl: 'LZO' },
  'Thermomètre salon': { en: 'Living room thermometer', de: 'Thermometer Wohnzimmer', nl: 'Thermometer woonkamer', it: 'Termometro soggiorno', es: 'Termómetro salón', pl: 'Termometr salon' },
  'Thermomètre salon pile': { en: 'Living room thermometer battery', de: 'Thermometer Wohnzimmer Batterie', nl: 'Thermometer woonkamer batterij', it: 'Termometro soggiorno batteria', es: 'Termómetro salón pila', pl: 'Termometr salon bateria' },
  'Thermomètre': { en: 'Thermometer', de: 'Thermometer', nl: 'Thermometer', it: 'Termometro', es: 'Termómetro', pl: 'Termometr' },
  // La station du jardin (chantier Capteurs, C14, C15) : une mesure du dehors.
  'vent': { en: 'wind', de: 'Wind', nl: 'wind', it: 'vento', es: 'viento', pl: 'wiatr' },
  'Station météo': { en: 'Weather station', de: 'Wetterstation', nl: 'Weerstation', it: 'Stazione meteo', es: 'Estación meteorológica', pl: 'Stacja pogodowa' },
  // Les capteurs des pièces (chantier Capteurs, passe 1 ter, 16/10 ; C16). Polonais nouveau, à relire par Seba882 : les onze noms de ce bloc.
  'Capteur': { en: 'Sensor', de: 'Sensor', nl: 'Sensor', it: 'Sensore', es: 'Sensor', pl: 'Czujnik' },
  'Capteur salon': { en: 'Living room sensor', de: 'Sensor Wohnzimmer', nl: 'Sensor woonkamer', it: 'Sensore soggiorno', es: 'Sensor salón', pl: 'Czujnik salon' },
  'Luxmètre salon': { en: 'Living room light meter', de: 'Luxmeter Wohnzimmer', nl: 'Luxmeter woonkamer', it: 'Luxmetro soggiorno', es: 'Luxómetro salón', pl: 'Luksomierz salon' },
  'Purificateur salon': { en: 'Living room air purifier', de: 'Luftreiniger Wohnzimmer', nl: 'Luchtreiniger woonkamer', it: 'Purificatore soggiorno', es: 'Purificador salón', pl: 'Oczyszczacz salon' },
  'Capteur COV salon': { en: 'Living room VOC sensor', de: 'VOC-Sensor Wohnzimmer', nl: 'VOS-sensor woonkamer', it: 'Sensore COV soggiorno', es: 'Sensor COV salón', pl: 'Czujnik LZO salon' },
  'Capteur cuisine': { en: 'Kitchen sensor', de: 'Sensor Küche', nl: 'Sensor keuken', it: 'Sensore cucina', es: 'Sensor cocina', pl: 'Czujnik kuchnia' },
  'Capteur chambre': { en: 'Bedroom sensor', de: 'Sensor Schlafzimmer', nl: 'Sensor slaapkamer', it: 'Sensore camera', es: 'Sensor dormitorio', pl: 'Czujnik sypialnia' },
  'Capteur chambre Lino': { en: 'Lino’s bedroom sensor', de: 'Sensor Linos Zimmer', nl: 'Sensor kamer Lino', it: 'Sensore camera di Lino', es: 'Sensor dormitorio de Lino', pl: 'Czujnik pokój Lina' },
  'Capteur bureau': { en: 'Office sensor', de: 'Sensor Büro', nl: 'Sensor kantoor', it: 'Sensore studio', es: 'Sensor despacho', pl: 'Czujnik biuro' },
  'Capteur entrée': { en: 'Entrance sensor', de: 'Sensor Eingang', nl: 'Sensor entree', it: 'Sensore ingresso', es: 'Sensor entrada', pl: 'Czujnik wejście' },
  'Capteur salle de bain': { en: 'Bathroom sensor', de: 'Sensor Badezimmer', nl: 'Sensor badkamer', it: 'Sensore bagno', es: 'Sensor baño', pl: 'Czujnik łazienka' },
  // Les cas de l'audit du 19/10 (point 15) : un monoxyde en ppm, une mesure muette, un binaire à part, une vigilance active.
  'Capteur CO cuisine': { en: 'Kitchen CO sensor', de: 'CO-Sensor Küche', nl: 'CO-sensor keuken', it: 'Sensore CO cucina', es: 'Sensor CO cocina', pl: 'Czujnik CO kuchnia' },
  'Capteur de monoxyde': { en: 'Carbon monoxide sensor', de: 'Kohlenmonoxidsensor', nl: 'Koolmonoxidesensor', it: 'Sensore di monossido', es: 'Sensor de monóxido', pl: 'Czujnik tlenku węgla' },
  'monoxyde': { en: 'carbon monoxide', de: 'Kohlenmonoxid', nl: 'koolmonoxide', it: 'monossido', es: 'monóxido', pl: 'tlenek węgla' },
  'Capteur d’air bureau': { en: 'Office air sensor', de: 'Luftsensor Büro', nl: 'Luchtsensor kantoor', it: 'Sensore aria studio', es: 'Sensor de aire despacho', pl: 'Czujnik powietrza biuro' },
  'Capteur de vibration': { en: 'Vibration sensor', de: 'Vibrationssensor', nl: 'Trillingssensor', it: 'Sensore di vibrazione', es: 'Sensor de vibración', pl: 'Czujnik wibracji' },
  'Lave-linge vibration': { en: 'Washing machine vibration', de: 'Waschmaschine Vibration', nl: 'Wasmachine trilling', it: 'Lavatrice vibrazione', es: 'Lavadora vibración', pl: 'Pralka wibracje' },
  'Vigilance Météo-France': { en: 'Météo-France warning', de: 'Météo-France-Warnung', nl: 'Météo-France-waarschuwing', it: 'Allerta Météo-France', es: 'Aviso de Météo-France', pl: 'Ostrzeżenie Météo-France' },
  // Le frigo (chantier Capteurs, passe 1 quater, 16/10 ; C17) : un capteur SANS zone, sa carte neutre. Polonais nouveau, à relire par Seba882.
  'Capteur Frigo': { en: 'Fridge sensor', de: 'Kühlschranksensor', nl: 'Koelkastsensor', it: 'Sensore frigo', es: 'Sensor nevera', pl: 'Czujnik lodówki' },
  /* Les capteurs binaires, les plantes et les piles de sa maquette « Cartes capteurs » (chantier Capteurs, étapes 2 et 3, § 12) : les appareils
   * des ouvrants, des détecteurs et des détecteurs de présence, leurs piles, les deux plantes découvertes et un bouton. Les deux noms latins se
   * lisent pareil partout. Polonais nouveau, à relire par Seba882. */
  'Contact porte entrée': { en: 'Entrance door contact', de: 'Kontakt Eingangstür', nl: 'Contact voordeur', it: 'Contatto porta ingresso', es: 'Contacto puerta entrada', pl: 'Czujnik drzwi wejściowych' },
  'Contact baie vitrée': { en: 'Patio door contact', de: 'Kontakt Terrassentür', nl: 'Contact schuifpui', it: 'Contatto portafinestra', es: 'Contacto puerta acristalada', pl: 'Czujnik drzwi tarasowych' },
  'Contact fenêtre salon': { en: 'Living room window contact', de: 'Kontakt Fenster Wohnzimmer', nl: 'Contact raam woonkamer', it: 'Contatto finestra soggiorno', es: 'Contacto ventana salón', pl: 'Czujnik okna w salonie' },
  'Contact fenêtre chambre': { en: 'Bedroom window contact', de: 'Kontakt Fenster Schlafzimmer', nl: 'Contact raam slaapkamer', it: 'Contatto finestra camera', es: 'Contacto ventana dormitorio', pl: 'Czujnik okna w sypialni' },
  'Contact porte de garage': { en: 'Garage door contact', de: 'Kontakt Garagentor', nl: 'Contact garagedeur', it: 'Contatto porta garage', es: 'Contacto puerta garaje', pl: 'Czujnik bramy garażowej' },
  'Contact porte de service': { en: 'Side door contact', de: 'Kontakt Nebeneingang', nl: 'Contact zijdeur', it: 'Contatto porta di servizio', es: 'Contacto puerta de servicio', pl: 'Czujnik drzwi bocznych' },
  'Contact de porte': { en: 'Door contact', de: 'Türkontakt', nl: 'Deurcontact', it: 'Contatto porta', es: 'Contacto de puerta', pl: 'Czujnik drzwi' },
  'Contact de fenêtre': { en: 'Window contact', de: 'Fensterkontakt', nl: 'Raamcontact', it: 'Contatto finestra', es: 'Contacto de ventana', pl: 'Czujnik okna' },
  'Détecteur de fumée': { en: 'Smoke detector', de: 'Rauchmelder', nl: 'Rookmelder', it: 'Rilevatore di fumo', es: 'Detector de humo', pl: 'Czujnik dymu' },
  'Détecteur de monoxyde': { en: 'Carbon monoxide detector', de: 'Kohlenmonoxidmelder', nl: 'Koolmonoxidemelder', it: 'Rilevatore di monossido', es: 'Detector de monóxido', pl: 'Czujnik czadu' },
  'Détecteur de fuite': { en: 'Leak detector', de: 'Leckmelder', nl: 'Lekkagemelder', it: 'Rilevatore di perdite', es: 'Detector de fugas', pl: 'Czujnik zalania' },
  'Détecteur de fuite évier': { en: 'Sink leak detector', de: 'Leckmelder Spüle', nl: 'Lekkagemelder gootsteen', it: 'Rilevatore di perdite lavello', es: 'Detector de fugas fregadero', pl: 'Czujnik zalania przy zlewie' },
  'Radar bureau': { en: 'Office radar', de: 'Radar Büro', nl: 'Radar kantoor', it: 'Radar studio', es: 'Radar despacho', pl: 'Radar biuro' },
  'Radar de présence': { en: 'Presence radar', de: 'Präsenzradar', nl: 'Aanwezigheidsradar', it: 'Radar di presenza', es: 'Radar de presencia', pl: 'Radar obecności' },
  'Détecteur de mouvement salon': { en: 'Living room motion detector', de: 'Bewegungsmelder Wohnzimmer', nl: 'Bewegingsmelder woonkamer', it: 'Rilevatore di movimento soggiorno', es: 'Detector de movimiento salón', pl: 'Czujnik ruchu salon' },
  'Détecteur de mouvement entrée': { en: 'Entrance motion detector', de: 'Bewegungsmelder Eingang', nl: 'Bewegingsmelder entree', it: 'Rilevatore di movimento ingresso', es: 'Detector de movimiento entrada', pl: 'Czujnik ruchu wejście' },
  'Détecteur de mouvement': { en: 'Motion detector', de: 'Bewegungsmelder', nl: 'Bewegingsmelder', it: 'Rilevatore di movimento', es: 'Detector de movimiento', pl: 'Czujnik ruchu' },
  'Bouton salon': { en: 'Living room button', de: 'Taster Wohnzimmer', nl: 'Knop woonkamer', it: 'Pulsante soggiorno', es: 'Botón salón', pl: 'Przycisk salon' },
  'Bouton sans fil': { en: 'Wireless button', de: 'Funktaster', nl: 'Draadloze knop', it: 'Pulsante senza fili', es: 'Botón inalámbrico', pl: 'Przycisk bezprzewodowy' },
  'Dracaena Marginata': { en: 'Dracaena Marginata', de: 'Dracaena Marginata', nl: 'Dracaena Marginata', it: 'Dracaena Marginata', es: 'Dracaena Marginata', pl: 'Dracaena Marginata' },
  'Schefflera': { en: 'Schefflera', de: 'Schefflera', nl: 'Schefflera', it: 'Schefflera', es: 'Schefflera', pl: 'Schefflera' },
  'Capteur de plante': { en: 'Plant sensor', de: 'Pflanzensensor', nl: 'Plantsensor', it: 'Sensore per piante', es: 'Sensor de planta', pl: 'Czujnik rośliny' },
  'MeteoAlarm': { en: 'MeteoAlarm', de: 'MeteoAlarm', nl: 'MeteoAlarm', it: 'MeteoAlarm', es: 'MeteoAlarm', pl: 'MeteoAlarm' },
  'Basilic besoin eau': { en: 'Basil needs water', de: 'Basilikum braucht Wasser', nl: 'Basilicum heeft water nodig', it: 'Basilico ha bisogno d’acqua', es: 'Albahaca necesita agua', pl: 'Bazylia potrzebuje wody' },
  'pile': { en: 'battery', de: 'Batterie', nl: 'batterij', it: 'batteria', es: 'pila', pl: 'bateria' },
  'sabotage': { en: 'tamper', de: 'Sabotage', nl: 'sabotage', it: 'manomissione', es: 'sabotaje', pl: 'sabotaż' },
  'humidité du sol': { en: 'soil moisture', de: 'Bodenfeuchte', nl: 'bodemvochtigheid', it: 'umidità del terreno', es: 'humedad del suelo', pl: 'wilgotność gleby' },
  'conductivité': { en: 'conductivity', de: 'Leitfähigkeit', nl: 'geleidbaarheid', it: 'conducibilità', es: 'conductividad', pl: 'przewodność' },
  'lumière': { en: 'light', de: 'Licht', nl: 'licht', it: 'luce', es: 'luz', pl: 'światło' },
};

/** Le nom d'un appareil, sinon d'un lieu, dans la langue de la demonstration. */
const etiquette = (fr) => (APPAREILS[fr] && APPAREILS[fr][LANGUE_DEMO]) || lieu(fr);

/* Quelle piece a quel etage (05/10). Le garage n'y figure pas : une zone sans
 * etage reste visible quel que soit le filtre. */
const ETAGE_DE = { salon: 'rdc', cuisine: 'rdc', entree: 'rdc', chambre: 'etage', bureau: 'etage', salle_de_bain: 'etage' };

const PIECES = [
  ['salon', 'Salon', 21.4, 47, 612],
  ['cuisine', 'Cuisine', 22.8, 51, null],
  ['chambre', 'Chambre', 19.6, 49, 1659],  // « Confiné » (rouge), la chambre de sa maquette « Cartes capteurs » : la carte « A surveiller » a de quoi montrer
  ['bureau', 'Bureau', 20.9, 45, 538],
  ['entree', 'Entrée', 20.1, 46, null],
  ['salle_de_bain', 'Salle de bain', 23.2, 68, null],  // « Humide » : la salle de bain de sa maquette, après la douche
];

function etatsInitiaux() {
  const states = {
    // Le soleil des volets (§ 9) : levé à 07:47, couché à 20:24, sa position à l'heure de la démo.
    'sun.sun': etatSoleilDemo(horlogeVolets()),
    'weather.maison': s('partlycloudy', { friendly_name: 'Météo', temperature: 24.3, humidity: 52, temperature_unit: '°C', supported_features: 3,
      apparent_temperature: 26, wind_speed: 9, wind_gust_speed: 20, wind_bearing: 281, wind_speed_unit: 'km/h',
      pressure: 1014, uv_index: 3, visibility: 12 }),
    /* 39 = maison (1) + absent (2) + nuit (4) + vacances (32), les quatre modes
     * que `callService` modelise plus bas. Un vrai panneau publie ce masque, et
     * c'est lui qui dit au moteur d'actions quels armements l'entite accepte :
     * sans lui, aucun mode n'etait declare, et chaque armement se faisait
     * refuser des qu'il passait par la verification. Desarmer, lui, n'a pas de
     * bit — on en sort toujours. */
    'alarm_control_panel.maison': s('disarmed', { friendly_name: 'Alarme', supported_features: 39 }),
    'lock.porte_entree': s('locked', { friendly_name: 'Porte d’entrée' }),
    // La sirene de la vue Securite (ADR 0034) : deux sonneries, pas de duree
    // geree — le test sonore l'eteint lui-meme apres trois secondes.
    'siren.interieure': s('off', { friendly_name: 'Sirène intérieure', supported_features: 7, available_tones: ['alarme', 'carillon'] }),
    // La camera de l'entree et ses reglages : cinq interrupteurs du meme appareil.
    'camera.entree': s('idle', { friendly_name: 'Caméra entrée' }),
    'switch.camera_entree_detection_mouvement': s('on', { friendly_name: 'Caméra entrée Détection de mouvement' }),
    'switch.camera_entree_suivi': s('off', { friendly_name: 'Caméra entrée Suivi de mouvement' }),
    'switch.camera_entree_pleurs': s('off', { friendly_name: 'Caméra entrée Détection des pleurs' }),
    'switch.camera_entree_prive': s('off', { friendly_name: 'Caméra entrée Mode privé' }),
    'switch.camera_entree_voyant': s('on', { friendly_name: 'Caméra entrée Voyant' }),
    // Ses deux detecteurs : ce que la tuile raconte en dernier evenement (ADR 0031).
    'binary_sensor.camera_entree_mouvement': s('off', { friendly_name: 'Caméra entrée Mouvement', device_class: 'motion' }),
    'binary_sensor.camera_entree_personne': s('off', { friendly_name: 'Caméra entrée Personne' }),
    // Le sonometre du salon : la pastille « Bruit » de la barre de confort (ADR 0039).
    'sensor.salon_bruit': s(34, { friendly_name: 'Salon Bruit', unit_of_measurement: 'dB', device_class: 'sound_pressure' }),
    /* La machine de la vue Systeme (ADR 0037) : un System Monitor tel que la
     * decouverte le reconnait — la charge processeur, et ses freres sur le meme
     * appareil — puis les trois mises a jour que publie le Superviseur. */
    'sensor.system_monitor_processor_use': s(18, { friendly_name: 'System Monitor Processor use', unit_of_measurement: '%' }),
    'sensor.system_monitor_memory_use_percent': s(31, { friendly_name: 'System Monitor Memory usage', unit_of_measurement: '%' }),
    'sensor.system_monitor_memory_use': s(2540, { friendly_name: 'System Monitor Memory use', unit_of_measurement: 'MiB', device_class: 'data_size' }),
    'sensor.system_monitor_memory_free': s(5652, { friendly_name: 'System Monitor Memory free', unit_of_measurement: 'MiB', device_class: 'data_size' }),
    'sensor.system_monitor_disk_use_percent': s(46, { friendly_name: 'System Monitor Disk usage', unit_of_measurement: '%' }),
    'sensor.system_monitor_processor_temperature': s(52, { friendly_name: 'System Monitor Processor temperature', unit_of_measurement: '°C', device_class: 'temperature' }),
    'sensor.system_monitor_last_boot': s(new Date(Date.now() - (12 * 24 + 6) * 3600000).toISOString(), { friendly_name: 'System Monitor Last boot', device_class: 'timestamp' }),
    'sensor.system_monitor_swap_use_percent': s(4, { friendly_name: 'System Monitor Swap usage', unit_of_measurement: '%' }),
    'sensor.system_monitor_swap_use': s(82, { friendly_name: 'System Monitor Swap use', unit_of_measurement: 'MiB', device_class: 'data_size' }),
    'sensor.system_monitor_swap_free': s(1966, { friendly_name: 'System Monitor Swap free', unit_of_measurement: 'MiB', device_class: 'data_size' }),
    'sensor.system_monitor_network_throughput_in_eth0': s(4.2, { friendly_name: 'System Monitor Network throughput in eth0', unit_of_measurement: 'Mbit/s', device_class: 'data_rate' }),
    'sensor.system_monitor_network_throughput_out_eth0': s(1.1, { friendly_name: 'System Monitor Network throughput out eth0', unit_of_measurement: 'Mbit/s', device_class: 'data_rate' }),
    'update.home_assistant_core_update': s('on', { friendly_name: 'Home Assistant Core Update', title: 'Home Assistant Core', installed_version: '2026.3.4', latest_version: '2026.4.0' }),
    'update.home_assistant_supervisor_update': s('off', { friendly_name: 'Home Assistant Supervisor Update', title: 'Home Assistant Supervisor', installed_version: '2026.03.2', latest_version: '2026.03.2' }),
    'update.home_assistant_operating_system_update': s('off', { friendly_name: 'Home Assistant Operating System Update', title: 'Home Assistant Operating System', installed_version: '16.2', latest_version: '16.2' }),
    // Des firmwares Zigbee et un module HACS en attente : la section des mises
    // a jour les range par integration (maquettes du 18/09).
    'update.interrupteur_couloir_firmware': s('on', { friendly_name: 'Interrupteur Couloir', installed_version: '1124102917', latest_version: '1124103169' }),
    'update.interrupteur_chambre_firmware': s('on', { friendly_name: 'Interrupteur Chambre', installed_version: '1107324829', latest_version: '1124103169' }),
    'update.carte_meteo_animee_update': s('on', { friendly_name: 'Carte météo animée', installed_version: 'v2.0.1', latest_version: 'v2.0.2' }),
    // Des automatisations Home Assistant : Loggia les liste, les allume, les
    // lance — il ne les ecrit pas. Sans elles, leur section serait vide ici.
    'automation.lumiere_couloir_la_nuit': s('on', { friendly_name: 'Lumière couloir la nuit', last_triggered: ilYaMin(420) }),
    'automation.veilleuse_chambre_au_coucher': s('on', { friendly_name: 'Veilleuse chambre au coucher', last_triggered: ilYaMin(900) }),
    'automation.eclairage_terrasse_au_crepuscule': s('off', { friendly_name: 'Éclairage terrasse au crépuscule', last_triggered: ilYaMin(8600) }),
    'automation.volets_ouverture_du_matin': s('on', { friendly_name: 'Volets : ouverture du matin', last_triggered: ilYaMin(560) }),
    'automation.volets_fermeture_au_coucher_du_soleil': s('on', { friendly_name: 'Volets : fermeture au coucher du soleil', last_triggered: ilYaMin(80) }),
    'automation.chauffage_consigne_de_nuit': s('on', { friendly_name: 'Chauffage : consigne de nuit', last_triggered: ilYaMin(1000) }),
    'automation.radiateur_bureau_hors_gel': s('off', { friendly_name: 'Radiateur bureau hors gel' }),
    'automation.alarme_armement_en_partant': s('on', { friendly_name: 'Alarme : armement en partant', last_triggered: ilYaMin(2900) }),
    'automation.sonnette_vers_le_telephone': s('on', { friendly_name: 'Sonnette vers le téléphone', last_triggered: ilYaMin(190) }),
    'automation.delestage_du_chauffe_eau': s('on', { friendly_name: 'Délestage du chauffe-eau', last_triggered: ilYaMin(1300) }),
    'automation.arrosage_du_potager': s('on', { friendly_name: 'Arrosage du potager', last_triggered: ilYaMin(700) }),
    'automation.lave_linge_termine': s('on', { friendly_name: 'Lave-linge terminé', last_triggered: ilYaMin(1500) }),
    // Le réservoir du distributeur et une plante : ce que la vue Objets et
    // leurs fiches ont a montrer. Le réservoir est un helper SANS appareil,
    // comme chez l'utilisateur ; le distributeur lui-même et ses
    // automatisations viennent de `etatsDistributeur()`, selon la variante.
    'input_number.croquettes_reservoir': s(760, { friendly_name: 'Réservoir de croquettes', min: 0, max: 2000, step: 10, unit_of_measurement: 'g' }),
    // Un repas de l'ANCIENNE liste qui ne distribuait rien : l'encart de
    // migration le compte « non relié » (ADR 0155).
    'input_boolean.repas_matin': s('on', { friendly_name: 'Repas du matin' }),
    'sensor.basilic_moisture': s(62, { friendly_name: 'Basilic humidité du sol', device_class: 'moisture', unit_of_measurement: '%' }),
    'sensor.basilic_temperature': s(21.4, { friendly_name: 'Basilic température', device_class: 'temperature', unit_of_measurement: '°C' }),
    'sensor.basilic_illuminance': s(1800, { friendly_name: 'Basilic lumière', device_class: 'illuminance', unit_of_measurement: 'lx' }),
    'sensor.basilic_conductivity': s(640, { friendly_name: 'Basilic conductivité', unit_of_measurement: 'µS/cm' }),
    'sensor.basilic_battery': s(81, { friendly_name: 'Basilic pile', device_class: 'battery', unit_of_measurement: '%' }),
    'sensor.production_solaire': s(1840, { friendly_name: 'Production solaire', unit_of_measurement: 'W', device_class: 'power' }),
    'sensor.reseau': s(-460, { friendly_name: 'Réseau', unit_of_measurement: 'W', device_class: 'power' }),
    'sensor.surplus': s(460, { friendly_name: 'Surplus', unit_of_measurement: 'W', device_class: 'power' }),
    /* Les kWh du jour : sans eux, pas de bilan ni de cadran d'autosuffisance.
     *
     * Chacun porte `last_reset`, comme un `utility_meter` remis a zero cette
     * nuit. C'est a cet attribut que l'apercu reconnait un compteur dont
     * l'etat EST le total de la journee, au lieu d'aller chercher la variation
     * du jour dans les statistiques (jourstat.js, ADR 0162). Une maison de
     * demonstration doit se comporter comme une vraie. */
    'sensor.conso_jour': s(6.16, { friendly_name: 'Consommation du jour', unit_of_measurement: 'kWh', device_class: 'energy', last_reset: MINUIT }),
    'sensor.production_jour': s(4.32, { friendly_name: 'Production du jour', unit_of_measurement: 'kWh', device_class: 'energy', last_reset: MINUIT }),
    'sensor.injection_jour': s(0.96, { friendly_name: 'Injection du jour', unit_of_measurement: 'kWh', device_class: 'energy', last_reset: MINUIT }),
    'sensor.conso_jour_hc': s(3.90, { friendly_name: 'Consommation heures creuses', unit_of_measurement: 'kWh', device_class: 'energy', last_reset: MINUIT }),
    'sensor.conso_jour_hp': s(2.26, { friendly_name: 'Consommation heures pleines', unit_of_measurement: 'kWh', device_class: 'energy', last_reset: MINUIT }),
    /* Le cout du jour : Home Assistant le calcule lui-meme a partir du tarif
     * declare dans son tableau de bord Energie (`stat_cost`). La devise se lit
     * sur l'entite, jamais supposee en euros. */
    'sensor.cout_du_jour': s(1.84, { friendly_name: etiquette('Coût du jour'), unit_of_measurement: '€', device_class: 'monetary', last_reset: MINUIT }),
    /* Ce que le surplus RAPPORTE. Home Assistant le tient lui-meme des qu'un
     * tarif de rachat est declare (`stat_compensation`), comme il tient le
     * cout : 0,96 kWh injectes a 0,1269 EUR. */
    'sensor.revente_du_jour': s(0.12, { friendly_name: etiquette('Revente du jour'), unit_of_measurement: '€', device_class: 'monetary', last_reset: MINUIT }),
    'sensor.part_fossile_reseau': s(38, { friendly_name: 'Part fossile du réseau', unit_of_measurement: '%' }),
    /* Les POSTES de consommation (06/10) : la section existait, la demo n'avait
     * jamais de quoi la remplir. Chacun sa puissance et ses kWh du jour, comme
     * ce qu'un tableau de bord Energie declare. */
    'sensor.pc_bureau_puissance': s(153, { friendly_name: etiquette('PC bureau'), unit_of_measurement: 'W', device_class: 'power' }),
    'sensor.pc_bureau_jour': s(1.42, { friendly_name: etiquette('PC bureau du jour'), unit_of_measurement: 'kWh', device_class: 'energy' }),
    'sensor.nas_puissance': s(34, { friendly_name: etiquette('Serveur de fichiers'), unit_of_measurement: 'W', device_class: 'power' }),
    'sensor.nas_jour': s(0.81, { friendly_name: etiquette('Serveur de fichiers du jour'), unit_of_measurement: 'kWh', device_class: 'energy' }),
    'sensor.lave_vaisselle_puissance': s(0, { friendly_name: etiquette('Lave-vaisselle'), unit_of_measurement: 'W', device_class: 'power' }),
    'sensor.lave_vaisselle_jour': s(0.94, { friendly_name: etiquette('Lave-vaisselle du jour'), unit_of_measurement: 'kWh', device_class: 'energy' }),
    'sensor.radiateur_chambre_puissance': s(0, { friendly_name: etiquette('Radiateur chambre'), unit_of_measurement: 'W', device_class: 'power' }),
    'sensor.radiateur_chambre_jour': s(0.61, { friendly_name: etiquette('Radiateur chambre du jour'), unit_of_measurement: 'kWh', device_class: 'energy' }),
    // La puissance du module du bureau (planning de chauffe) : le moteur de la démo la fait suivre le mode.
    'sensor.radiateur_bureau_puissance': s(0, { friendly_name: etiquette('Radiateur bureau'), unit_of_measurement: 'W', device_class: 'power' }),
    'sensor.box_internet_puissance': s(11, { friendly_name: etiquette('Box internet'), unit_of_measurement: 'W', device_class: 'power' }),
    'sensor.box_internet_jour': s(0.26, { friendly_name: etiquette('Box internet du jour'), unit_of_measurement: 'kWh', device_class: 'energy' }),
    /* Le TARIF (06/10) : deux prix, et le capteur binaire qui dit lequel court.
     * Home Assistant ne publie jamais les CRENEAUX d'un contrat — la barre des
     * vingt-quatre heures se reconstitue depuis l'historique de ce binaire
     * (tarif.js), ce que la demo doit donc savoir rendre. */
    'binary_sensor.heures_creuses': s('off', { friendly_name: etiquette('Heures creuses actives') }),
    'sensor.prix_hc': s(0.1605, { friendly_name: etiquette('Prix heures creuses'), unit_of_measurement: '€/kWh', device_class: 'monetary' }),
    'sensor.prix_hp': s(0.2092, { friendly_name: etiquette('Prix heures pleines'), unit_of_measurement: '€/kWh', device_class: 'monetary' }),
    'sensor.abonnement_mois': s(16.73, { friendly_name: etiquette('Abonnement'), unit_of_measurement: '€/mois', device_class: 'monetary' }),
    // Les bilans du mois et de l'annee : les tuiles a cote du tarif.
    'sensor.cout_du_mois': s(41.27, { friendly_name: etiquette('Coût du mois'), unit_of_measurement: '€', device_class: 'monetary' }),
    'sensor.eco_du_mois': s(18.40, { friendly_name: etiquette('Économie du mois'), unit_of_measurement: '€', device_class: 'monetary' }),
    'sensor.conso_mois': s(184.6, { friendly_name: etiquette('Consommation du mois'), unit_of_measurement: 'kWh', device_class: 'energy' }),
    'sensor.production_mois': s(97.3, { friendly_name: etiquette('Production du mois'), unit_of_measurement: 'kWh', device_class: 'energy' }),
    'sensor.conso_annee': s(2140, { friendly_name: etiquette('Consommation de l’année'), unit_of_measurement: 'kWh', device_class: 'energy' }),
    'sensor.production_annee': s(1386, { friendly_name: etiquette('Production de l’année'), unit_of_measurement: 'kWh', device_class: 'energy' }),
    // De quoi remplir les cartes de la vue Meteo : indice d'air et vigilance.
    'sensor.qualite_air_exterieur': s(62, { friendly_name: "Qualité de l'air", device_class: 'aqi' }),
    'sensor.vigilance_meteo': s('Jaune', { friendly_name: 'Vigilance météo', vent_violent: 'Jaune', orages: 'Jaune' }),
    'person.camille': s('home', { friendly_name: 'Camille' }),
    'person.alex': s('not_home', { friendly_name: 'Alex' }),
    'person.lea': s('home', { friendly_name: 'Léa' }),
    /* Un appareil de streaming, pour que la grille d'applications ait de
     * quoi se montrer. Les valeurs sont celles d'une vraie Apple TV :
     * 450487 = les bits de lecture, plus SELECT_SOURCE et BROWSE_MEDIA. */
    // Sa telecommande : une entite a part, sur le MEME appareil. C'est par
    // la que passent les touches, et c'est l'unique chemin d'un Android TV.
    'remote.tv_salon': s('on', { friendly_name: 'TV du salon', supported_features: 0 }),
    // `device_class: tv` : le glyphe de l'écran sur sa carte (passe bis Médias, 17/10).
    'media_player.tv_salon': s('playing', { friendly_name: 'TV du salon', supported_features: 450487, device_class: 'tv',
      source_list: ['Netflix', 'Disney+', 'YouTube', 'Prime Video', 'Free TV', 'Plex', 'Musique', 'Photos', 'Arcade', 'App Store', 'Crunchyroll'],
      app_name: 'Netflix', app_id: 'com.netflix.Netflix',
      media_title: 'Stranger Things', media_artist: 'S4 - E1', media_duration: 4672, media_position: 1591,
      media_position_updated_at: new Date().toISOString(), volume_level: .4 }),
    // Une durée et une position : la progression de sa carte existe (passe bis Médias, 17/10).
    'media_player.salon': s('playing', { friendly_name: 'Enceinte salon', media_title: 'Clair de Lune', media_artist: 'Debussy', volume_level: .35, supported_features: 20925,
      media_duration: 318, media_position: 74, media_position_updated_at: new Date().toISOString(), entity_picture: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2096%2096%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%234c1d95%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%230ea5e9%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20fill%3D%22url(%23g)%22%2F%3E%3Ccircle%20cx%3D%2248%22%20cy%3D%2248%22%20r%3D%2226%22%20fill%3D%22%23111827%22%2F%3E%3Ccircle%20cx%3D%2248%22%20cy%3D%2248%22%20r%3D%225%22%20fill%3D%22%23f4f4f5%22%2F%3E%3C%2Fsvg%3E' }),
    // Un vrai robot annonce ce qu'il sait faire : sans supported_features ni
    // liste de vitesses, la fiche n'avait ni boutons ni selecteur a montrer.
    // 8828 + 16384 : le bit CLEAN_AREA (tranche robots 2, R1) — il sait viser des pièces, et Home Assistant lui offre l'association.
    'vacuum.aspirateur': s('docked', { friendly_name: 'Aspirateur', battery_level: 92,
      supported_features: 25212, fan_speed: 'max_plus',
      fan_speed_list: ['quiet', 'normal', 'max', 'max_plus'],
      // Les pieces que le robot annonce, avec leurs segments (vue du robot, ADR 0042).
      // En minuscules comme un robot les annonce, dans la langue de la démo :
      // la fiche les met en forme (`vacNom`), et « salon » restait « Salon »
      // dans une démo anglaise (relecture du 03/10).
      rooms: Object.fromEntries([['Salon', 1], ['Cuisine', 2], ['Bureau', 3], ['Chambre', 4], ['Entrée', 5]]
        .map(([nom, segment]) => [lieu(nom).toLowerCase(), segment])) }),
    // Ses soeurs : pieces d'usure en %, surface de la session, compteurs, reglages.
    'sensor.aspirateur_filtre': s(32, { friendly_name: 'Aspirateur Filtre', unit_of_measurement: '%' }),
    'sensor.aspirateur_brosse_principale': s(58, { friendly_name: 'Aspirateur Brosse principale', unit_of_measurement: '%' }),
    'sensor.aspirateur_brosse_laterale': s(81, { friendly_name: 'Aspirateur Brosse latérale', unit_of_measurement: '%' }),
    'sensor.aspirateur_serpilliere': s(47, { friendly_name: 'Aspirateur Serpillière', unit_of_measurement: '%' }),
    'sensor.aspirateur_surface_nettoyee': s(42, { friendly_name: 'Aspirateur Surface nettoyée', device_class: 'area', unit_of_measurement: 'm²' }),
    'sensor.aspirateur_surface_totale': s(1843, { friendly_name: 'Aspirateur Surface totale nettoyée', device_class: 'area', unit_of_measurement: 'm²' }),
    'sensor.aspirateur_duree_totale': s(164, { friendly_name: 'Aspirateur Durée totale de nettoyage', device_class: 'duration', unit_of_measurement: 'h' }),
    'sensor.aspirateur_nombre_total': s(212, { friendly_name: 'Aspirateur Nombre total de nettoyages' }),
    'button.aspirateur_reinitialiser_filtre': s('unknown', { friendly_name: 'Aspirateur Réinitialiser le filtre' }),
    'select.aspirateur_mode_de_travail': s('vacuum', { friendly_name: 'Aspirateur Mode de travail', options: ['vacuum', 'mop', 'vacuum_and_mop'] }),
    'select.aspirateur_debit_d_eau': s('medium', { friendly_name: "Aspirateur Débit d'eau", options: ['low', 'medium', 'high'] }),
    // Sa carte active (tranche robots 2, R11) : une seule carte ; `?demo&robots=etages` en donne deux.
    'select.aspirateur_carte_active': s(etiquette('Maison'), { friendly_name: 'Aspirateur Carte active', options: [etiquette('Maison')] }),
    'switch.aspirateur_detection_tapis': s('on', { friendly_name: 'Aspirateur Détection tapis' }),
    'switch.aspirateur_mode_avance': s('off', { friendly_name: 'Aspirateur Mode avancé' }),
    // La tondeuse en pleine tonte : une fiche au repos ne montrerait ni la
    // couleur active du cadran ni le bouton pause.
    'lawn_mower.tondeuse': s('mowing', { friendly_name: 'Tondeuse', battery_level: 64,
      supported_features: 7 }),
    // Ses soeurs : les zones sont des interrupteurs, les lames se comptent en heures.
    'binary_sensor.tondeuse_en_charge': s('off', { friendly_name: 'Tondeuse En charge', device_class: 'battery_charging' }),
    'switch.tondeuse_zone_pelouse_avant': s('off', { friendly_name: 'Tondeuse Zone Pelouse avant' }),
    'switch.tondeuse_zone_pelouse_arriere': s('on', { friendly_name: 'Tondeuse Zone Pelouse arrière' }),
    'switch.tondeuse_zone_cote_garage': s('off', { friendly_name: 'Tondeuse Zone Côté garage' }),
    // 52 h sur 60 : les lames à 13 %, sous 15 % — le rouge, que la maquette ne montre pas (chantier IoT, § 10).
    'sensor.tondeuse_usage_des_lames': s(52, { friendly_name: "Tondeuse Durée d'utilisation des lames", device_class: 'duration', unit_of_measurement: 'h' }),
    'sensor.tondeuse_seuil_des_lames': s(60, { friendly_name: "Tondeuse Seuil d'usure des lames", device_class: 'duration', unit_of_measurement: 'h' }),
    'sensor.tondeuse_surface': s(210, { friendly_name: 'Tondeuse Surface', unit_of_measurement: 'm²' }),
    'sensor.tondeuse_cycles_de_batterie': s(86, { friendly_name: 'Tondeuse Cycles de batterie', unit_of_measurement: 'cycles' }),
    'sensor.tondeuse_temps_de_travail_total': s(212, { friendly_name: 'Tondeuse Temps de travail total', device_class: 'duration', unit_of_measurement: 'h' }),
    'sensor.tondeuse_kilometrage_total': s(148, { friendly_name: 'Tondeuse Kilométrage total', device_class: 'distance', unit_of_measurement: 'km' }),
    'sensor.tondeuse_signal_wi_fi': s(-58, { friendly_name: 'Tondeuse Signal Wi-Fi', device_class: 'signal_strength', unit_of_measurement: 'dBm' }),
    'number.tondeuse_hauteur_des_lames': s(40, { friendly_name: 'Tondeuse Hauteur des lames', min: 20, max: 70, step: 5, unit_of_measurement: 'mm' }),
    'switch.tondeuse_detection_de_pluie': s('on', { friendly_name: 'Tondeuse Détection de pluie' }),
    'select.tondeuse_securite_faune': s('high', { friendly_name: 'Tondeuse Sécurité faune', options: ['off', 'low', 'high'] }),
    'switch.tondeuse_voix': s('on', { friendly_name: 'Tondeuse Voix' }),
    'update.tondeuse_micrologiciel': s('off', { friendly_name: 'Tondeuse Micrologiciel', installed_version: '1.14.0', latest_version: '1.14.0' }),
    /* Borne de recharge et batterie : sans elles, la maison du schema n'avait
     * ni pastille voiture ni pastille batterie, et il manquait la moitie de ce
     * que la vue Energie sait montrer (02/10). */
    'sensor.borne_recharge': s(0, { friendly_name: 'Borne de recharge', device_class: 'power', unit_of_measurement: 'W' }),
    'sensor.batterie_maison': s(-310, { friendly_name: 'Batterie maison', device_class: 'power', unit_of_measurement: 'W' }),
    'sensor.batterie_niveau': s(78, { friendly_name: 'Batterie niveau', device_class: 'battery', unit_of_measurement: '%' }),
    'binary_sensor.porte_entree': s('off', { friendly_name: "Porte d'entrée", device_class: 'door' }),
    // Trois portes de plus (02/10) : a une seule, la vue Securite annoncait
    // « 1/1 fermee » et sa rangee d'ouvrants tenait sur un quart de ligne.
    'binary_sensor.porte_garage': s('off', { friendly_name: 'Porte de garage', device_class: 'door' }),
    'binary_sensor.porte_service': s('off', { friendly_name: 'Porte de service', device_class: 'door' }),
    // Ouverte devant le volet du salon (chantier Volets, § 9) : sa fermeture du soir l'attend.
    'binary_sensor.baie_vitree': s('on', { friendly_name: 'Baie vitrée', device_class: 'door' }),
    // Le thermomètre du dehors, celui de la protection solaire des volets.
    'sensor.temperature_exterieure': s(26.4, { friendly_name: 'Température extérieure', unit_of_measurement: '°C', device_class: 'temperature' }),
    'binary_sensor.mouvement_entree': s('off', { friendly_name: 'Mouvement entrée', device_class: 'motion' }),
    'sensor.pile_porte_entree': s(9, { friendly_name: 'Pile porte entrée', device_class: 'battery', unit_of_measurement: '%' }),
    'person.demo': s('home', { friendly_name: 'Démo' }),
    'person.sam': s('not_home', { friendly_name: 'Sam' }),
    'binary_sensor.fenetre_chambre': s('on', { friendly_name: 'Fenêtre chambre', device_class: 'window' }),  // ouverte : la carte Chambre le dit
    'binary_sensor.fenetre_salon': s('off', { friendly_name: 'Fenêtre salon', device_class: 'window' }),
    'switch.radiateur_chambre': s('on', { friendly_name: 'Radiateur chambre' }),
    'switch.radiateur_salon': s('on', { friendly_name: 'Radiateur salon' }),
    /* Le planning de chauffe (chantier Chauffage, plan 2) : deux modules fil
     * pilote, chacun son `select` — les ordres tels que Zigbee2MQTT les publie
     * pour un module NodOn —, son interrupteur et son capteur de puissance, sur
     * le MÊME appareil (`indexDemo`). Celui de la chambre reprend l'interrupteur
     * qui précède : la règle des fenêtres de la démo le coche encore, c'est le
     * cas de la tâche 14. Le radiateur du salon reste sur une simple prise. Les
     * options partent d'un mode quelconque : le moteur de la démo les règle
     * avant le premier rendu (`demarrerChauffageDemo`). */
    'select.radiateur_chambre_fil_pilote': s('eco', { friendly_name: 'Radiateur chambre', options: OPTIONS_FIL_PILOTE.slice() }),
    'switch.radiateur_bureau': s('on', { friendly_name: 'Radiateur bureau' }),
    'select.radiateur_bureau_fil_pilote': s('eco', { friendly_name: 'Radiateur bureau', options: OPTIONS_FIL_PILOTE.slice() }),
    'binary_sensor.detecteur_fumee': s('off', { friendly_name: 'Détecteur de fumée cuisine', device_class: 'smoke' }),
    // Les autres familles que la section Alertes compte, et la vanne qu'elle
    // coupe sur une fuite : une maison equipee, pas une liste vide.
    'binary_sensor.detecteur_fumee_entree': s('off', { friendly_name: 'Détecteur de fumée entrée', device_class: 'smoke' }),
    'binary_sensor.detecteur_co_salon': s('off', { friendly_name: 'Détecteur de monoxyde salon', device_class: 'carbon_monoxide' }),
    'binary_sensor.fuite_evier': s('off', { friendly_name: 'Fuite sous l’évier', device_class: 'moisture' }),
    'valve.arrivee_eau': s('open', { friendly_name: 'Arrivée d’eau', device_class: 'water' }),
    // Le telephone de l'app compagnon : son traceur donne son nom au service notify.
    'device_tracker.telephone_de_camille': s('home', { friendly_name: 'Téléphone de Camille', source_type: 'gps' }),
    'climate.salon': s('heat', { friendly_name: 'Thermostat salon', current_temperature: 21.4, temperature: 22, hvac_action: 'heating', hvac_modes: ['off', 'heat'], min_temp: 7, max_temp: 30, target_temp_step: .5 }),
    'climate.chambre': s('off', { friendly_name: 'Thermostat chambre', current_temperature: 19.6, temperature: 19, hvac_action: 'off', hvac_modes: ['off', 'heat'], min_temp: 7, max_temp: 30, target_temp_step: .5 }),
    /* Le poêle du salon (planning de chauffe) : un thermostat pour le serveur —
     * il reçoit une consigne, le bit 1 de `supported_features` (1 + 16 + 128 +
     * 256 : consigne, préréglages, arrêt, marche) —, dont le planning n'a
     * jamais été allumé. Ses préréglages sont ceux d'un poêle à granulés. */
    'climate.poele': s('heat', { friendly_name: 'Poêle', current_temperature: 21, temperature: 20, hvac_action: 'idle', hvac_modes: ['off', 'heat'], min_temp: 5, max_temp: 35, target_temp_step: .5,
      supported_features: 401, preset_modes: ['turbo', 'manual', 'comfort', 'auto', 'overnight'], preset_mode: 'manual' }),
    /* Une climatisation réversible dans le bureau (relecture de la tâche 10,
     * prise à la tâche 10 bis B) : la démo n'avait aucun appareil qui
     * refroidit, et l'Accueil de sa fiche — ses modes, ses préréglages,
     * « Refroidit », sa plage — ne s'y voyait pas. Un thermostat pour le
     * serveur (il reçoit une consigne : 1 + 2 + 16 + 128 + 256, consigne,
     * plage, préréglages, arrêt, marche), jamais configuré ; elle refroidit. */
    'climate.climatisation': s('cool', { friendly_name: 'Climatisation', current_temperature: 23.5, temperature: 22, hvac_action: 'cooling',
      hvac_modes: ['off', 'heat', 'cool', 'heat_cool', 'dry', 'fan_only'], min_temp: 16, max_temp: 30, target_temp_step: .5,
      supported_features: 403, preset_modes: ['eco', 'comfort', 'boost'], preset_mode: 'comfort' }),
    'cover.volet_salon': s('open', { friendly_name: 'Volet salon', current_position: 100, supported_features: 15, device_class: 'shutter' }),
    'cover.volet_cuisine': s('open', { friendly_name: 'Volet cuisine', current_position: 60, supported_features: 15, device_class: 'shutter' }),
    'cover.volet_chambre': s('closed', { friendly_name: 'Volet chambre', current_position: 0, supported_features: 15, device_class: 'shutter' }),
    'cover.volet_bureau': s('open', { friendly_name: 'Volet bureau', current_position: 30, supported_features: 15, device_class: 'shutter' }),
    /* Les cas que l'écran sait afficher et que la démo ne portait pas (audit du
     * 19/10) — des entités FICTIVES, des noms génériques :
     *  - un store banne, rentré (`awning`, avec position) ;
     *  - un rideau sans position (`supported_features` 3 : ouvrir, fermer) ;
     *  - un volet muet (`unavailable`) : la carte dit « Indisponible » ;
     *  - un volet « façon Netatmo » (`VOLETS_NETATMO_DEMO`) : jamais `opening`
     *    ni `closing`, l'état bascule d'abord, la position arrive après — et
     *    une fermeture finit `open` à 1 %, comme sa chambre ;
     *  - une porte de garage et un portail (`garage`, `gate`, features 3) : des
     *    ouvrants, pas des volets — aucun ordre groupé ne les touche. */
    'cover.store_banne': s('closed', { friendly_name: 'Store banne', current_position: 0, supported_features: 15, device_class: 'awning' }),
    'cover.rideau_chambre': s('closed', { friendly_name: 'Rideau chambre', supported_features: 3, device_class: 'curtain' }),
    'cover.volet_entree': s('unavailable', { friendly_name: 'Volet entrée', supported_features: 15, device_class: 'shutter', restored: true }),
    'cover.volet_sdb': s('open', { friendly_name: 'Volet salle de bain', current_position: 100, supported_features: 15, device_class: 'shutter' }),
    'cover.porte_garage': s('closed', { friendly_name: 'Porte de garage motorisée', supported_features: 3, device_class: 'garage' }),
    'cover.portail': s('closed', { friendly_name: 'Portail', supported_features: 3, device_class: 'gate' }),
    'scene.reveil': s('unknown', { friendly_name: 'Réveil' }),
    'scene.je_rentre': s('unknown', { friendly_name: 'Je rentre' }),
    'scene.cinema': s('unknown', { friendly_name: 'Cinéma' }),
    'scene.nuit': s('unknown', { friendly_name: 'Nuit' }),
  };
  PIECES.forEach(([cle, nom, t, h, co2]) => {
    states['sensor.' + cle + '_temperature'] = s(t, { friendly_name: lieu(nom) + ' ' + etiquette('température'), unit_of_measurement: '°C', device_class: 'temperature' });
    states['sensor.' + cle + '_humidite'] = s(h, { friendly_name: lieu(nom) + ' ' + etiquette('humidité'), unit_of_measurement: '%', device_class: 'humidity' });
    if (co2 != null) states['sensor.' + cle + '_co2'] = s(co2, { friendly_name: lieu(nom) + ' CO2', unit_of_measurement: 'ppm', device_class: 'carbon_dioxide' });
    /* Le salon a une lampe de COULEUR, les autres non : c'est ce qui permet
     * de voir que Loggia ne propose une teinte que la ou elle existe. Elle publie aussi des EFFETS (retouches du 19/10, R4 :
     * la démo porte chaque cas) — la liste d'une Hue sous Zigbee2MQTT, `effect` à « None », et la fonction annoncée dans
     * `supported_features` (44 = effet + flash + transition), sans quoi le moteur refuserait l'ordre. */
    states['light.' + cle] = s(cle === 'salon' || cle === 'cuisine' ? 'on' : 'off', cle === 'salon'
      ? { friendly_name: etiquette('Plafonnier') + ' ' + lieu(nom), brightness: 180, color_mode: 'rgb', rgb_color: [255, 176, 92], hs_color: [31, 64], color_temp_kelvin: 2900,
          min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6535, supported_color_modes: ['color_temp', 'rgb'],
          supported_features: 44, effect_list: ['None', 'candle', 'fireplace', 'colorloop'], effect: 'None' }
      : { friendly_name: etiquette('Plafonnier') + ' ' + lieu(nom), brightness: 180, supported_color_modes: ['brightness'] });
  });
  // Les lampes de sa maquette « Cartes lumières » (chantier Lumières, § 9) : le bureau, la chambre et la cuisine prennent les leurs.
  Object.assign(states, etatsDistributeur(), etatsPrisesDemo(), etatsLumieresDemo());
  // Les mesures de sa maquette « Cartes capteurs » (chantier Capteurs, § 9).
  // Les capteurs binaires, les plantes et les piles de sa maquette « Cartes capteurs » (chantier Capteurs, étapes 2 et 3, § 12).
  // Les lecteurs de sa maquette « Cartes médias » (chantier Médias, § 8) : chaque état de la maquette, et la paire jumelle d'une Echo.
  return Object.assign(states, etatsMesuresDemo(states), etatsCapteursDemo(states), etatsMediasDemo(states));
}

/* La configuration de la maison, servie par le magasin mémoire : le dashboard
 * la lit comme s'il lisait le localStorage. */
function configDemo() {
  return {
    /* La demo se donne un assistant, pour que le bouton du bas existe et que
     * la popup ait quelque chose a raconter. Le nom vaut ce qu'il dit : c'est
     * un reglage, chacun met le sien. */
    loggia_assistant: 'demo',
    /* Le mode enfant de sa maquette (chantier Mode enfant, § 10) : le profil « Lino » sur la chambre, l'Apple TV ajoutée. Le faux
     * serveur le relit à chaque réglage (`enfantPatch`) et le réécrit ici, comme `loggia/config/suivre` le ferait chez lui. */
    loggia_enfant: ENFANT_CFG,
    /* L'applique extérieure est une prise que la maison déclare lumière, comme chez lui (chantier Lumières, § 9). */
    loggia_switchlights: ['switch.applique_exterieur'],
    /* Les quatre phrases de sa maquette, gardées pour l'Echo de la cuisine (chantier Médias, § 8 ; M19) : des boutons de « Dire à
     * Alexa », rangés comme le navigateur de l'utilisateur les range — par lecteur, la phrase entière pour identifiant (favlecture.js). */
    loggia_favlecture: { 'media_player.echo_cuisine': PHRASES_MEDIAS_DEMO.map(([phrase]) => ({ t: phrase, i: phrase, c: 'custom', v: null })) },
    /* La démo a toujours sa rangée de scénarios sur l'Accueil : elle le sait
     * d'avance, comme un navigateur qui y est déjà passé (lot 14 de l'audit
     * du 03/10, `rangeeVue` dans App.jsx). Son magasin mémoire repart vide à
     * chaque chargement : sans cette ligne, la rangée poussait les pièces de
     * 94 px à chaque visite. */
    'loggia-scnrangee': 1,
    // Les alertes de surete : un telephone choisi, les familles de danger
    // allumees. La demo n'envoie rien — il n'y a pas de composant.
    loggia_alertes: { actif: true, service: 'mobile_app_telephone_de_camille', cooldown_min: 5,
      categories: { fumee: true, gaz: true, co: true, fuite: true, alarme: true, portes: true },
      calme: { actif: false, debut: '22:00', fin: '07:00' },
      actions: { actif: true, lumieres: true, volets: true, vanne: { actif: true, entite: '' } } },
    /* Le jardin est une pièce du DEHORS (chantier Capteurs, C17, 16/10), comme son « Extérieur » : une mesure n'est jugée que dans
     * une pièce de Loggia, et sa station perdait sinon ses jauges du dehors. Une pièce de la configuration seulement, pas de
     * `PIECES` : ni plafonnier, ni thermomètre de plus — la pièce lit ceux de la station. */
    loggia_rooms: [...PIECES.map(([cle, nom, , , co2]) => ({
      room: lieu(nom),
      haid: { temp: 'sensor.' + cle + '_temperature', humidity: 'sensor.' + cle + '_humidite', co2: co2 != null ? 'sensor.' + cle + '_co2' : null },
    })), { room: lieu('Jardin'), haid: { temp: 'sensor.jardin_temperature', humidity: 'sensor.jardin_humidite', co2: null } }],
    // `loggia_energyHaids` est la cle que lisent `enHaids()` ET la disponibilite
    // des vues : sans elle, la vue Energie restait masquee en demonstration.
    // `loggia_cameras` est la cle que lit l'agregat — `loggia_entities.cameras`
    // sert ailleurs. Sans `haid`, la tuile prend son rendu de repli : degrade,
    // halo et badge « Direct », au lieu d'attendre un flux qui n'existe pas ici.
    loggia_cameras: CAMERAS(),
    /* Les postes suivis : `enDevices` les lit ici en priorite. L'habillage
     * (icone, couleur, illustration) suit la palette de la vue. */
    loggia_energyDevices: [
      { name: etiquette('PC bureau'), power: 'sensor.pc_bureau_puissance', kwh: 'sensor.pc_bureau_jour', art: 'pc', icon: 'briefcase', c: 'var(--o-cyan)' },
      { name: etiquette('Serveur de fichiers'), power: 'sensor.nas_puissance', kwh: 'sensor.nas_jour', art: 'nas', icon: 'microchip', c: 'var(--o-purple)' },
      { name: etiquette('Lave-vaisselle'), power: 'sensor.lave_vaisselle_puissance', kwh: 'sensor.lave_vaisselle_jour', art: 'dishwasher', icon: 'utensils', c: 'var(--o-accent-soft)' },
      { name: etiquette('Radiateur chambre'), power: 'sensor.radiateur_chambre_puissance', kwh: 'sensor.radiateur_chambre_jour', art: 'radiator', icon: 'thermometer-half', c: 'var(--o-orange)' },
      { name: etiquette('Box internet'), power: 'sensor.box_internet_puissance', kwh: 'sensor.box_internet_jour', art: null, icon: 'bolt', c: 'var(--o-rose)' },
    ],
    loggia_energyHaids: { solarOutput: 'sensor.production_solaire', consoNow: 'sensor.reseau', surplusNow: 'sensor.surplus', consoJour: 'sensor.conso_jour', prodJour: 'sensor.production_jour', injectionJour: 'sensor.injection_jour', revenuJour: 'sensor.revente_du_jour', consoJourHc: 'sensor.conso_jour_hc', consoJourHp: 'sensor.conso_jour_hp', coutJour: 'sensor.cout_du_jour',
      hcActive: 'binary_sensor.heures_creuses', hcPrice: 'sensor.prix_hc', hpPrice: 'sensor.prix_hp',
      abonnement: 'sensor.abonnement_mois', coutMois: 'sensor.cout_du_mois', ecoMois: 'sensor.eco_du_mois',
      consoMois: 'sensor.conso_mois', prodMois: 'sensor.production_mois',
      consoAnnee: 'sensor.conso_annee', prodAnnee: 'sensor.production_annee',
      evNow: 'sensor.borne_recharge', batNow: 'sensor.batterie_maison', batSoc: 'sensor.batterie_niveau' },
    loggia_entities: {
      weather: ['weather.maison', 'sun.sun'],
      alarm: 'alarm_control_panel.maison',
      cameras: CAMERAS(),
      people: [{ name: 'Camille', haid: 'person.camille' }, { name: 'Alex', haid: 'person.alex' },
        { name: 'Léa', haid: 'person.lea' }],
      energy: { solarOutput: 'sensor.production_solaire', consoNow: 'sensor.reseau', surplusNow: 'sensor.surplus', consoJour: 'sensor.conso_jour', prodJour: 'sensor.production_jour', injectionJour: 'sensor.injection_jour', revenuJour: 'sensor.revente_du_jour', consoJourHc: 'sensor.conso_jour_hc', consoJourHp: 'sensor.conso_jour_hp', coutJour: 'sensor.cout_du_jour',
      hcActive: 'binary_sensor.heures_creuses', hcPrice: 'sensor.prix_hc', hpPrice: 'sensor.prix_hp',
      abonnement: 'sensor.abonnement_mois', coutMois: 'sensor.cout_du_mois', ecoMois: 'sensor.eco_du_mois',
      consoMois: 'sensor.conso_mois', prodMois: 'sensor.production_mois',
      consoAnnee: 'sensor.conso_annee', prodAnnee: 'sensor.production_annee',
        evNow: 'sensor.borne_recharge', batNow: 'sensor.batterie_maison', batSoc: 'sensor.batterie_niveau' },
      /* `?demo&robots=scripts` (tranche robots 2, Q1 A) : ses interrupteurs de pièces et son script, qui gardent la main sur les
       * pièces devant les zones de Home Assistant — la maison de la démo les gagne pour cette variante seulement.
       * `scripts-sans-pieces` et `scripts-avec-pieces` (passe bis du 20/10, sa décision « Mon script garde la main ») : SON cas —
       * ses interrupteurs, ses cinq scripts par rôle sans celui des pièces, puis avec lui, une fois désigné dans la roue. */
      ...(VARIANTE_ROBOTS === 'scripts' || VARIANTE_ROBOTS === 'scripts-sans-pieces' || VARIANTE_ROBOTS === 'scripts-avec-pieces' ? {
        vacuumRooms: [{ id: 'salon', name: lieu('Salon'), segments: [1], toggle: 'input_boolean.nettoyer_salon_demo' },
          { id: 'cuisine', name: lieu('Cuisine'), segments: [2], toggle: 'input_boolean.nettoyer_cuisine_demo' }],
        vacuumScripts: VARIANTE_ROBOTS === 'scripts' ? { pieces_selectionnees: 'script.nettoyer_pieces_demo' }
          : { nettoyer_tout: 'script.aspirateur_nettoyer_tout', pause: 'script.aspirateur_pause', reprendre: 'script.aspirateur_reprendre',
            retour_base: 'script.aspirateur_retour_base', localiser: 'script.aspirateur_localiser',
            ...(VARIANTE_ROBOTS === 'scripts-avec-pieces' ? { pieces_selectionnees: 'script.nettoyer_pieces_demo' } : {}) },
      } : {}),
    },
    // Deux profils : la demo doit exercer les DEUX branches, admin comprise.
    loggia_users: [{ name: 'Démo', role: 'Admin', c: 'var(--o-accent)' }, { name: etiquette('Invité'), role: 'Famille', c: 'var(--o-purple)' }],
    loggia_plants: [{ base: 'sensor.basilic', name: etiquette('Basilic'), room: lieu('Cuisine') }],
    // Le distributeur a sa cle (alias `feeder` → `loggia_feeder`) : `loggia_entities`
    // ne se lit qu'avec un serveur, que la demo n'a pas. Sa forme suit la variante.
    loggia_feeder: feederDemo(),
    /* La mosaique des pieces sur TABLETTE et TELEPHONE (02/10).
     *
     * « Dispose les cartes pieces comme ceci, je trouve plus joli » : des
     * tuiles de deux hauteurs qui s'emboitent, et non une grille reguliere.
     * `s` = standard (deux rangees), `c` = compacte (une seule).
     *
     * La cle est rangee par FORMAT : l'ordinateur garde sa grille a lui, et
     * personne ne range pour les autres ecrans — c'est la regle de
     * `disposition.js`. */
    loggia_accueil: {
      formats: {
        tablette: { tailles: {
          [lieu('Salon')]: 's', [lieu('Cuisine')]: 'c', [lieu('Chambre')]: 's',
          [lieu('Bureau')]: 's', [lieu('Entrée')]: 'c', [lieu('Salle de bain')]: 'c',
        } },
        mobile: { tailles: {
          [lieu('Salon')]: 's', [lieu('Cuisine')]: 'c', [lieu('Chambre')]: 's',
          [lieu('Bureau')]: 'c', [lieu('Entrée')]: 'c', [lieu('Salle de bain')]: 'c',
        } },
      },
    },
    /* La carte Alarme sur DEUX colonnes (02/10) : « la carte alarme en double,
     * s'il te plait ». Elle porte un etat, un message, et trois gestes a la
     * suite — a une seule colonne les boutons se serrent au point de ne plus
     * se lire. Loggia sait deja elargir une tuile : c'est son propre reglage
     * (`larges`), pas une exception ecrite pour la demonstration. */
    // L'agencement se range PAR VUE : `layoutOf` lit `cle[scope]`, pas la
    // racine. Sans ce niveau, le reglage etait ecrit et simplement ignore.
    loggia_seclayout: { securite: { larges: ['alarm_control_panel.maison'] } },
    // Trois cameras par ligne sur grand ecran : a quatre cameras, « auto » en
    // mettait deux et la rangee prenait la moitie de la page.
    loggia_camdispo: { pc: '3' },
    loggia_onboarded: 1,
  };
}

/* ── Les scénarios (ADR 0027) ─────────────────────────────────────────────────
 * Le faux serveur : les huit de Loggia, résolus contre la maison de
 * démonstration comme le vrai le ferait — on compte ce qui a quelque chose à
 * faire —, deux déjà liés à une scène (ce que la reprise des anciennes scènes
 * rapides donne), un scénario personnel. Le magasin est en mémoire : ce qu'on
 * enregistre tient le temps de l'onglet. */
const SCN_A = (famille, geste, portee = 'maison', reste = {}) => ({ famille, geste, portee, ...reste });
const SCN_INTEGRES = [
  { id: 'reveil', icone: 'sunrise', teinte: 'ambre', actions: [SCN_A('volets', 'ouvrir'), SCN_A('lumieres', 'allumer', 'maison', { valeur: 30, si: 'nuit' }), SCN_A('chauffage', 'confort')] },
  { id: 'depart', icone: 'running', teinte: 'bain', actions: [SCN_A('lumieres', 'eteindre'), SCN_A('medias', 'eteindre'), SCN_A('chauffage', 'eco'), SCN_A('alarme', 'absent'), SCN_A('serrures', 'verrouiller')] },
  { id: 'retour', icone: 'home', teinte: 'accent', actions: [SCN_A('lumieres', 'allumer', 'vie', { valeur: 60, si: 'nuit' }), SCN_A('chauffage', 'confort')] },
  { id: 'nuit', icone: 'moon', teinte: 'chambre', actions: [SCN_A('lumieres', 'eteindre', 'maison'), SCN_A('volets', 'fermer'), SCN_A('medias', 'eteindre'), SCN_A('alarme', 'nuit'), SCN_A('serrures', 'verrouiller')] },
  { id: 'cinema', icone: 'film', teinte: 'vert', actions: [SCN_A('medias', 'pause'), SCN_A('lumieres', 'allumer', 'piece', { valeur: 10 }), SCN_A('volets', 'fermer', 'piece'), SCN_A('medias', 'allumer_tv', 'piece')] },
  { id: 'musique', icone: 'music', teinte: 'tendre', actions: [SCN_A('medias', 'lecture', 'piece'), SCN_A('lumieres', 'allumer', 'piece', { valeur: 50 })] },
  { id: 'invites', icone: 'users', teinte: 'ambre', actions: [SCN_A('lumieres', 'allumer', 'vie', { valeur: 100 }), SCN_A('chauffage', 'confort')] },
  { id: 'tout_eteindre', icone: 'power', teinte: 'gris', actions: [SCN_A('lumieres', 'eteindre'), SCN_A('medias', 'eteindre')] },
];
const SCN_PIECE = {
  'light.salon': 'Salon', 'cover.volet_salon': 'Salon', 'cover.store_banne': 'Salon', 'media_player.salon': 'Salon', 'media_player.tv_salon': 'Salon', 'media_player.enceinte_salon': 'Salon', 'media_player.echo_cuisine': 'Cuisine', 'climate.salon': 'Salon', 'climate.poele': 'Salon',
  'light.cuisine': 'Cuisine', 'cover.volet_cuisine': 'Cuisine',
  'light.chambre': 'Chambre', 'cover.volet_chambre': 'Chambre', 'cover.rideau_chambre': 'Chambre', 'climate.chambre': 'Chambre',
  'light.bureau': 'Bureau', 'cover.volet_bureau': 'Bureau', 'light.entree': 'Entrée', 'lock.porte_entree': 'Entrée', 'light.sdb': 'Salle de bain',
  'cover.volet_entree': 'Entrée', 'cover.porte_garage': 'Entrée', 'cover.portail': 'Entrée', 'cover.volet_sdb': 'Salle de bain',
};
const SCN_INTIME = /chambre|bain/i;
/* Bati au PREMIER ACCES, jamais a l'import : il porte un nom de piece, et la
 * langue de la maison n'est connue qu'a `installerDemo`. Une table evaluee a
 * l'import figerait ses libelles dans la langue de demarrage — la meme
 * meprise que `HUE_CATS()` le 23/09. C'est aussi un MAGASIN : les scenarios
 * qu'on enregistre y restent le temps de l'onglet. */
let SCN_CFG_ = null;
const SCN_CFG = () => (SCN_CFG_ || (SCN_CFG_ = {
  integres: { reveil: { lien: 'scene.reveil' }, cinema: { lien: 'scene.cinema' } },
  persos: [{ id: 'perso_apero', nom: etiquette('Apéro'), icone: 'glass-cheers', teinte: 'tendre', accueil: true, masque: false, lien: null, piece: null,
    actions: [SCN_A('medias', 'lecture', 'piece', { piece: lieu('Salon') }), SCN_A('lumieres', 'allumer', 'piece', { piece: lieu('Salon'), valeur: 40 })] }],
  ordre: [],
}));
const SCN_DERNIERS = { nuit: Date.now() / 1000 - 9 * 3600, depart: Date.now() / 1000 - 86400 - 1800 };
function scnEffectifs() {
  const out = SCN_INTEGRES.map(b => {
    const o = SCN_CFG().integres[b.id] || {};
    return { id: b.id, integre: true, nom: o.nom || null, icone: o.icone || b.icone, teinte: o.teinte || b.teinte, masque: !!o.masque, accueil: o.accueil !== false,
      lien: o.lien || null, piece: o.piece || null, actions: (Array.isArray(o.actions) ? o.actions : b.actions).map(a => ({ ...a })), modifie: Object.keys(o).length > 0 };
  }).concat(SCN_CFG().persos.map(p => ({ ...p, integre: false, modifie: true, actions: (p.actions || []).map(a => ({ ...a })) })));
  if (SCN_CFG().ordre.length) { const rang = {}; SCN_CFG().ordre.forEach((id, i) => { rang[id] = i; }); out.sort((a, b) => (rang[a.id] == null ? 99 : rang[a.id]) - (rang[b.id] == null ? 99 : rang[b.id])); }
  return out;
}
/* Une veilleuse de la règle Nuit, ou un groupe (`attributes.entity_id`) qui en contient une, de proche en proche sans boucler. */
function scnEpargnee(id, states, vus = new Set()) {
  if (NUI_CFG().veilleuse.lampes.indexOf(id) >= 0) return true;
  if (vus.has(id)) return false;
  vus.add(id);
  const membres = states[id] && states[id].attributes ? states[id].attributes.entity_id : null;
  return Array.isArray(membres) && membres.some(m => typeof m === 'string' && scnEpargnee(m, states, vus));
}
function scnCibles(a, states, piece) {
  const dom = { lumieres: 'light.', volets: 'cover.', medias: 'media_player.', chauffage: 'climate.', alarme: 'alarm_control_panel.', serrures: 'lock.' }[a.famille];
  const nuit = !!(states['sun.sun'] && states['sun.sun'].state === 'below_horizon');
  if ((a.si === 'nuit' && !nuit) || (a.si === 'jour' && nuit) || !dom) return [];
  const ou = a.piece || piece;
  return Object.keys(states).filter(id => {
    if (id.indexOf(dom) !== 0) return false;
    const st = states[id].state, p = SCN_PIECE[id] ? lieu(SCN_PIECE[id]) : null;
    if (a.portee === 'piece' && (!ou || !p || p.toLowerCase() !== ou.toLowerCase())) return false;
    if (a.portee === 'vie' && (!p || SCN_INTIME.test(p))) return false;
    /* Les veilleuses sont épargnées PARTOUT (sa décision, retouches du 19/10, R6) : une EXTINCTION de la famille lumières épargne
     * la veilleuse de la règle Nuit — et un groupe qui en contient une —, que l'option « sauf les veilleuses » soit cochée ou
     * non, comme au serveur (scenarios.py) ; un allumage n'est pas concerné. */
    if (a.famille === 'lumieres' && a.geste === 'eteindre' && scnEpargnee(id, states)) return false;
    if (a.famille === 'lumieres') return a.geste === 'eteindre' ? st === 'on' : true;
    /* Des volets par leur CLASSE, comme le serveur (`est_volet`, scenarios.py) : le garage et le portail de la démo
     * gardent leur carte, mais « fermer les volets » ne les touche pas ; un volet muet ne reçoit rien. */
    if (a.famille === 'volets') return estVolet(states[id]) && !estMuetVolet(states[id]) && (a.geste === 'fermer' ? st !== 'closed' : st !== 'open');
    if (a.famille === 'medias') { const tv = (states[id].attributes || {}).device_class === 'tv'; return a.geste === 'eteindre' ? st !== 'off' : a.geste === 'pause' ? st === 'playing' : a.geste === 'lecture' ? (!tv && st !== 'playing') : tv; }
    if (a.famille === 'serrures') return st !== 'locked';
    return true;
  }).sort();
}
const scnPieceDe = (s) => s.piece || ((s.id === 'cinema' || s.id === 'musique') ? lieu('Salon') : null);
function scenariosDemo(states) {
  const liens = Object.keys(states).filter(id => /^(scene|script)\./.test(id)).sort().map(id => ({ haid: id, nom: (states[id].attributes || {}).friendly_name || id }));
  const scenarios = scnEffectifs().map(s => {
    const piece = scnPieceDe(s);
    const resume = s.lien ? [] : s.actions.map(a => ({ famille: a.famille, geste: a.geste, portee: a.portee || 'maison', piece: a.piece || (a.portee === 'piece' ? piece : null), valeur: a.valeur, si: a.si, n: scnCibles(a, states, piece).length }));
    // La suggestion suit la même règle de mots-clés que le serveur : « je_rentre » va à Je rentre, « nuit » à Bonne nuit.
    const suggestion = s.integre && !s.lien ? ({ retour: 'scene.je_rentre', nuit: 'scene.nuit' }[s.id] || null) : null;
    return { ...s, piece_effective: piece, resume, dernier: SCN_DERNIERS[s.id] || null, suggestion: suggestion && states[suggestion] ? suggestion : null, lien_absent: !!s.lien && !states[s.lien] };
  });
  return { scenarios, liens, pieces: ['Bureau', 'Chambre', 'Cuisine', 'Entrée', 'Salle de bain', 'Salon'].map(lieu).sort(), alarme: 'alarm_control_panel.maison', journal: [] };
}
function scenariosPatch(patch) {
  const p = patch || {};
  if (p.enregistrer) {
    const s = { ...p.enregistrer };
    if (SCN_INTEGRES.some(b => b.id === s.id)) {
      const o = { ...(SCN_CFG().integres[s.id] || {}), ...s }; delete o.id; if (o.actions == null) delete o.actions;
      SCN_CFG().integres[s.id] = o;
    } else {
      const ex = s.id ? SCN_CFG().persos.find(x => x.id === s.id) : null;
      if (ex) Object.assign(ex, s, { actions: s.actions || [] });
      else {
        const base = 'perso_' + String(s.nom || 'scenario').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        let id = base, n = 2;
        while (SCN_CFG().persos.some(x => x.id === id)) { id = base + '_' + n; n += 1; }
        SCN_CFG().persos.push({ id, nom: s.nom || id, icone: s.icone || 'sparkles', teinte: s.teinte || 'accent', lien: s.lien || null, piece: s.piece || null, actions: s.actions || [], accueil: s.accueil !== false, masque: !!s.masque });
      }
    }
  }
  if (p.supprimer) SCN_CFG().persos = SCN_CFG().persos.filter(x => x.id !== p.supprimer);
  if (p.reinitialiser) delete SCN_CFG().integres[p.reinitialiser];
  if (Array.isArray(p.ordre)) SCN_CFG().ordre = p.ordre.slice();
  return SCN_CFG();
}
function scenariosLancer(id, states) {
  const s = scnEffectifs().find(x => x.id === id);
  if (!s) return null;
  const fait = []; let n = 0;
  if (s.lien) { fait.push({ famille: 'lien', geste: s.lien.split('.')[0], n: 1 }); n = 1; }
  else {
    const piece = scnPieceDe(s);
    s.actions.forEach(a => {
      const ids = scnCibles(a, states, piece);
      ids.forEach(hid => {
        const st = states[hid]; if (!st) return;
        const etat = { lumieres: a.geste === 'eteindre' ? 'off' : 'on', volets: a.geste === 'fermer' ? 'closed' : 'open',
          medias: a.geste === 'eteindre' ? 'off' : a.geste === 'pause' ? 'paused' : a.geste === 'lecture' ? 'playing' : 'on',
          serrures: 'locked', alarme: { absent: 'armed_away', nuit: 'armed_night', maison: 'armed_home' }[a.geste] }[a.famille];
        if (etat) { states[hid] = { ...st, state: etat, last_changed: new Date().toISOString() }; minuteurSiEteint(hid, etat); }
      });
      fait.push({ famille: a.famille, geste: a.geste, n: ids.length }); n += ids.length;
    });
  }
  SCN_DERNIERS[id] = Date.now() / 1000;
  return { id, fait, n };
}

/* Un agenda pour la carte de l'accueil : demain, et les jours d'après. */
/* Historique factice, au format de l'API REST de Home Assistant.
 *
 * Sans lui, toutes les courbes de la démo affichaient « historique
 * indisponible » : la démo montrait un dashboard sans mémoire. On fabrique
 * donc 24 h de points autour de la valeur ACTUELLE du capteur — une marche
 * lente, plus une bosse de journée pour ce qui suit le soleil, et rien
 * d'inventé pour un capteur qui n'existe pas.
 */
/* L'historique d'un robot (ADR 0042) : son etat, session par session, et la
 * surface que son capteur atteignait. La tondeuse de la demo est en pleine
 * tonte : sa derniere session est en cours. */
function historiqueRobotDemo(ids, states) {
  const jour = (n, h, m) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, m, 0, 0); return d.getTime(); };
  const iso = (t) => new Date(t).toISOString();
  const robot = ids.find(id => /^(vacuum|lawn_mower)\./.test(id));
  const tond = robot.indexOf('lawn_mower.') === 0;
  const travail = tond ? 'mowing' : 'cleaning';
  // [il y a n jours, heure, minute, duree en minutes, issue, surface]
  const passes = tond
    ? [[5, 6, 0, 161, 'docked', 365], [3, 19, 30, 28, 'docked', 35], [2, 6, 0, 130, 'docked', 330]]
    : [[5, 14, 2, 94, 'docked', 68], [3, 8, 30, 22, 'idle', 19], [1, 8, 30, 51, 'docked', 42], [0, 8, 31, 48, 'docked', 42]];
  const etats = [{ entity_id: robot, state: 'docked', last_changed: iso(jour(8, 12, 0)) }];
  const surfaces = [];
  const capteur = ids.find(id => id !== robot) || null;
  passes.forEach(([n, h, m, duree, issue, surface]) => {
    const debut = jour(n, h, m);
    if (debut > Date.now()) return;
    etats.push({ state: travail, last_changed: iso(debut) });
    if (issue === 'docked') { etats.push({ state: 'returning', last_changed: iso(debut + duree * 60000) }); etats.push({ state: 'docked', last_changed: iso(debut + (duree + 3) * 60000) }); }
    else etats.push({ state: issue, last_changed: iso(debut + duree * 60000) });
    if (capteur) { surfaces.push({ state: '0', last_changed: iso(debut) }); surfaces.push({ state: String(surface), last_changed: iso(debut + duree * 60000) }); }
  });
  const actuel = states[robot] && states[robot].state;
  if (actuel === travail) { const t = Date.now() - 37 * 60000; etats.push({ state: travail, last_changed: iso(t) }); if (capteur) surfaces.push({ state: String(states[capteur] ? states[capteur].state : 0), last_changed: iso(t + 60000) }); }
  const listes = [etats];
  if (capteur && surfaces.length) { surfaces[0].entity_id = capteur; listes.push(surfaces); }
  return listes;
}

/* --- Les creneaux d'heures creuses de la demo ------------------------------
 *
 * Deux plages, comme un contrat courant : 2 h - 7 h et 13 h - 16 h. La vue les
 * retrouve dans l'HISTORIQUE du capteur binaire (tarif.js), jamais dans une
 * liste ecrite quelque part -- c'est tout l'interet, et la demo joue donc le
 * jeu jusqu'au bout. */
const CRENEAUX_HC = [[2, 7], [13, 16]];

/** Vrai si cette heure (decimale) tombe en heures creuses. */
function enCreuse(heure) {
  return CRENEAUX_HC.some(([a, b]) => heure >= a && heure < b);
}

/* L'historique d'un capteur BINAIRE : une bascule a chaque bord de creneau,
 * plus l'etat qui courait au debut de la fenetre. */
function historiqueBinaireDemo(t0, t1) {
  const etatA = (ms) => (enCreuse(new Date(ms).getHours() + new Date(ms).getMinutes() / 60) ? 'on' : 'off');
  const pts = [{ state: etatA(t0), last_changed: new Date(t0).toISOString() }];
  // Un passage heure par heure suffit : les creneaux tombent sur des heures rondes.
  for (let ms = t0 + 3600e3; ms <= t1; ms += 3600e3) {
    const e = etatA(ms);
    if (e !== pts[pts.length - 1].state) pts.push({ state: e, last_changed: new Date(ms).toISOString() });
  }
  return [pts];
}

/* --- Les STATISTIQUES longue duree (06/10) ---------------------------------
 *
 * `recorder/statistics_during_period` : ce que lit l'historique de la vue
 * Energie au-dela des dernieres vingt-quatre heures. La demo n'a pas de base,
 * elle fabrique donc une annee plausible.
 *
 * DETERMINISTE, et c'est le point : une meme journee doit rendre la meme
 * valeur a chaque lecture. Le calendrier des douze mois relit les memes jours
 * a chaque changement d'onglet, et des valeurs tirees au hasard le feraient
 * scintiller sous les yeux.
 *
 * Rien apres MAINTENANT : une case vide dit « pas encore », un zero dirait
 * « rien consomme » (ADR 0030).
 */
function hasardStable(graine) {
  let x = (graine + 0x6D2B79F5) >>> 0;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

const MINUIT = (() => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
})();

function statistiquesDemo(msg) {
  const ids = Array.isArray(msg.statistic_ids) ? msg.statistic_ids : [];
  const t0 = Date.parse(msg.start_time);
  const t1 = Date.parse(msg.end_time || new Date().toISOString());
  const pas = msg.period === 'month' ? 'month' : msg.period === 'day' ? 'day' : 'hour';
  if (!ids.length || isNaN(t0)) return {};
  const maintenant = Date.now();
  const out = {};
  for (const id of ids) {
    // Le capteur d'une prise : sa journée, tranche par tranche (chantier Prises, § 10).
    if (priseDuCapteurDemo(id)) { out[id] = statsPriseDemo(id, msg); continue; }
    // La plante MUETTE de sa maquette (chantier Capteurs, § 7.3, § 12) : ses relevés à l'heure, jusqu'à ce qu'elle se taise.
    if (STATS_PLANTES_DEMO[id]) { out[id] = statsPlanteDemo(id, msg); continue; }
    /* Une mesure de sa maquette « Cartes capteurs » (chantier Capteurs, § 9) : ses 24 heures sur 5 minutes. Une autre
     * n'en a pas, comme un capteur sans `state_class` chez Home Assistant : la fiche lit alors son histoire. */
    if (msg.period === '5minute') { const l = statsMesureDemo(id, msg); if (l) out[id] = l; continue; }
    /* Ce que l'entite MESURE se lit sur son nom : la demo se donne ici le droit
     * de connaitre ses propres capteurs, comme partout ailleurs dans ce
     * fichier. */
    const hc = /_hc$/.test(id), hp = /_hp$/.test(id);
    const prod = /production|solaire/.test(id);
    const cout = /cout/.test(id);
    const lignes = [];
    let curseur = new Date(t0);
    while (curseur.getTime() < t1 && curseur.getTime() < maintenant) {
      const suivant = pas === 'month' ? new Date(curseur.getFullYear(), curseur.getMonth() + 1, 1)
        : pas === 'day' ? new Date(curseur.getFullYear(), curseur.getMonth(), curseur.getDate() + 1)
          : new Date(curseur.getTime() + 3600e3);
      const jours = Math.max(1, Math.round((suivant - curseur) / 864e5));
      const h = curseur.getHours();
      /* La saison : l'hiver chauffe, l'ete produit. Un cosinus cale sur le
       * solstice, comme le vrai ciel. */
      const doy = Math.round((curseur - new Date(curseur.getFullYear(), 0, 1)) / 864e5);
      const saison = Math.cos(2 * Math.PI * (doy - 172) / 365);
      const alea = hasardStable(doy * 7919 + h * 31 + id.length * 104729);
      // Le solaire en cloche, la consommation en deux pointes : matin et soir.
      const soleil = Math.max(0, Math.sin((h - 6.5) / 11 * Math.PI));
      const pointe = Math.exp(-(((h - 7.5) / 1.6) ** 2)) + Math.exp(-(((h - 20) / 2.2) ** 2));
      const parHeure = 0.14 + 0.1 * Math.max(0, saison) + 0.3 * pointe;
      const parJour = jours * (3.1 + 2.6 * Math.max(0, saison)) * (0.85 + 0.3 * alea);
      let v;
      if (cout) {
        // Le cout suit la consommation, au tarif de son creneau.
        const kwh = pas === 'hour' ? parHeure : parJour;
        v = kwh * (pas === 'hour' && enCreuse(h) ? 0.1605 : 0.1905);
      } else if (prod) {
        v = pas === 'hour'
          ? 1.35 * (0.55 + 0.45 * -saison) * soleil * (0.75 + 0.5 * alea)
          : jours * 3.4 * (0.5 + 0.5 * -saison) * (0.6 + 0.8 * alea);
      } else if (pas === 'hour') {
        // Les heures creuses ne comptent que pendant leurs creneaux.
        v = enCreuse(h) ? (hp ? 0 : parHeure * 1.35) : (hc ? 0 : parHeure);
      } else {
        v = parJour * (hc ? 0.42 : hp ? 0.58 : 1);
      }
      lignes.push({ start: curseur.getTime(), end: suivant.getTime(), change: Math.round(Math.max(0, v) * 1000) / 1000 });
      curseur = suivant;
    }
    out[id] = lignes;
  }
  return out;
}

/* La température d'une pièce, sur la fenêtre demandée (tâche 10 bis D du
 * chantier Chauffage) : une sinusoïde douce autour de sa valeur, ± 1,6 °C — la
 * journée a son creux à 6 h et son haut à 18 h —, qui rejoint sur les quatre
 * dernières heures la valeur du moment, celle de la carte ; un point par
 * quart d'heure, le pas de la courbe de la fiche. Le générateur des
 * puissances multipliait la valeur par une courbe de journée : −0,8° au
 * milieu d'une journée à 21°. Le CO₂, les puissances et les autres capteurs
 * gardent le leur. */
const PAS_TEMPERATURE_DEMO = 15 * 60000;
const AMPLITUDE_TEMPERATURE_DEMO = 1.6;           // °C, de part et d'autre de la valeur
const RACCORD_TEMPERATURE_DEMO = 4 * 3600000;     // les dernières heures, qui rejoignent la valeur du moment
// La journée, de −1 (6 h) à 1 (18 h), à l'heure de la maison — avec UN décalage, celui de
// `fin` : un changement d'heure dans la fenêtre faisait sauter la courbe d'une heure, jusqu'à
// 0,4 °C d'un quart d'heure au suivant (le 25/10/2026, test « doucement »).
const JOUR_DEMO = 86400000;
const journeeDemo = (t, fin) => {
  const decalage = new Date(fin).getTimezoneOffset() * 60000;
  const heure = (((t - decalage) % JOUR_DEMO) + JOUR_DEMO) % JOUR_DEMO / 3600000;
  return Math.sin((heure - 12) / 24 * 2 * Math.PI);
};
/** La pièce à l'instant `t` quand elle vaut `cur` à `fin` : au plus 1,6 °C d'elle, au dixième de degré. */
function temperatureDemo(cur, t, fin) {
  const raccord = Math.max(0, 1 - (fin - t) / RACCORD_TEMPERATURE_DEMO);
  const ecart = Math.round(AMPLITUDE_TEMPERATURE_DEMO * (journeeDemo(t, fin) - journeeDemo(fin, fin) * raccord) * 10) / 10;
  return Math.round((cur + ecart) * 100) / 100;
}
/* Les instants de la fenêtre : un par quart d'heure depuis `t0`, puis `t1`, maintenant. */
function instantsDemo(t0, t1) {
  const sortie = [];
  for (let t = t0; t < t1; t += PAS_TEMPERATURE_DEMO) sortie.push(t);
  sortie.push(t1);
  return sortie;
}
function historiqueTemperatureDemo(id, cur, t0, t1) {
  const pts = instantsDemo(t0, t1).map(t => ({ state: String(t === t1 ? cur : temperatureDemo(cur, t, t1)), last_changed: new Date(t).toISOString() }));
  pts[0].entity_id = id;
  return [pts];
}

/* L'historique de la démo, au format de `history/period` : exportée pour
 * tests/demo_chauffage.test.mjs, qui tient la température plausible. */
export function historiqueDemo(chemin, states) {
  const m = String(chemin).match(/filter_entity_id=([^&]+)/);
  const plusieurs = m ? decodeURIComponent(m[1]).split(',') : [];
  if (plusieurs.some(x => /^(vacuum|lawn_mower)\./.test(x))) return historiqueRobotDemo(plusieurs, states);
  if (plusieurs.some(x => SERIES_DIST.has(x))) return historiqueDistributeurDemo(plusieurs, String(chemin), states);
  const id = m ? decodeURIComponent(m[1]) : null;
  const d = String(chemin).match(/history\/period\/([^?]+)/);
  const t0 = d ? Date.parse(decodeURIComponent(d[1])) : Date.now() - 86400000;
  const finVoulue = String(chemin).match(/end_time=([^&]+)/);
  const t1 = Math.min(Date.now(), finVoulue ? Date.parse(decodeURIComponent(finVoulue[1])) : Date.now());
  // Les capteurs binaires de sa maquette « Cartes capteurs » (chantier Capteurs, § 9, § 12) : l'histoire du jour, plusieurs d'un coup, à l'horloge des capteurs.
  if (plusieurs.length && plusieurs.every(x => CAPTEURS_DEMO.has(x))) return historiqueCapteursDemo(plusieurs, t0, Math.min(horlogeCapteurs(), t1), states);
  // Un chauffage : ses modes et sa consigne n'ont rien d'une courbe à multiplier (tâche 10 du plan 2).
  if (id && (estModuleChauffageDemo(id) || id.indexOf('climate.') === 0)) return historiqueChauffageDemo(id, t0, t1, states);
  // Un volet : son histoire de la semaine (chantier Volets, § 9), à l'horloge des volets.
  if (id && VOLETS_DEMO.includes(id)) return historiqueVoletDemo(id, t0, Math.min(horlogeVolets(), finVoulue ? Date.parse(decodeURIComponent(finVoulue[1])) : Infinity), states);
  /* Un capteur BINAIRE n'a pas de valeur a multiplier : `parseFloat('off')`
   * rendait NaN et la fonction repartait les mains vides. C'est pourtant d'un
   * binaire que la vue Energie tire les creneaux d'heures creuses. */
  const brut = id && states[id] ? String(states[id].state) : '';
  if (id && (brut === 'on' || brut === 'off')) return historiqueBinaireDemo(t0, t1);
  const cur = id && states[id] ? parseFloat(states[id].state) : NaN;
  if (!id || isNaN(cur)) return [];
  if (((states[id] && states[id].attributes) || {}).device_class === 'temperature' && t1 > t0) return historiqueTemperatureDemo(id, cur, t0, t1);
  const solaire = /solaire|solar|production/i.test(id);
  /* Le RESEAU n'est pas une courbe comme les autres : il change de SIGNE.
   *
   * Le generateur multipliait simplement la valeur du moment par une courbe de
   * journee. Le reseau valant -460 W (on exporte), les vingt-quatre heures
   * sortaient negatives — la maison aurait exporte toute la nuit, ce qui ne se
   * peut pas, et le graphe affichait un bloc bleu d'un bout a l'autre.
   *
   * On lui donne donc une vraie journee : on IMPORTE la nuit et le soir, on
   * EXPORTE quand le soleil donne. Et on recale la fin sur la valeur du moment,
   * sinon la courbe et le chiffre affiche se contrediraient a l'instant meme. */
  const reseau = !solaire && /reseau|grid/i.test(id);
  // Un compteur d'ÉNERGIE ne redescend pas : il monte jusqu'à sa valeur du
  // moment. Une puissance, elle, va et vient. Les deux courbes n'ont donc pas
  // la même forme, et le graphe de consommation lit bien des différences.
  const attrs = (states[id] && states[id].attributes) || {};
  const cumul = attrs.device_class === 'energy' || /kwh/i.test(attrs.unit_of_measurement || '');
  // Le CO2 ne descend jamais sous l'air du dehors : une journee plausible, la nuit qui charge.
  const co2 = attrs.device_class === 'carbon_dioxide';
  const pas = (t1 - t0) / 48;
  const pts = [];
  let acc = 0;
  const parts = [];
  for (let i = 0; i <= 48; i++) {
    const heure = new Date(t0 + pas * i).getHours() + new Date(t0 + pas * i).getMinutes() / 60;
    const jour = Math.max(0, Math.sin((heure - 6) / 12 * Math.PI));
    parts.push(solaire ? jour * (0.6 + 0.5 * Math.abs(Math.sin(i))) : (0.5 + 0.5 * Math.abs(Math.sin(i / 3.7))));
  }
  const somme = parts.reduce((a, v) => a + v, 0) || 1;
  for (let i = 0; i <= 48; i++) {
    const t = t0 + pas * i;
    let v;
    if (cumul) { acc += cur * parts[i] / somme; v = acc; }
    else {
      const heure = new Date(t).getHours() + new Date(t).getMinutes() / 60;
      const jour = Math.max(0, Math.sin((heure - 6) / 12 * Math.PI));
      v = co2 ? 430 + (cur - 430) * (0.45 + 0.55 * Math.max(0, Math.sin((heure - 18) / 14 * Math.PI))) * (0.9 + 0.1 * Math.sin(i))
        : reseau ? (880 + 430 * Math.max(0, Math.sin((heure - 17.5) / 8 * Math.PI)) + 95 * Math.sin(i / 3.1)) - 2300 * jour
          : solaire ? cur * jour * (0.8 + 0.4 * Math.sin(i)) : cur * (0.7 + 0.6 * Math.sin(i / 3.7) + 0.15 * Math.sin(i));
      // Une mesure positive ne passe pas sous zéro (audit du 19/10, point 15) : l'indice de qualité de l'air descendait à −2,5.
      if (!reseau && cur >= 0 && attrs.device_class !== 'temperature') v = Math.max(0, v);
    }
    pts.push({ state: String(Math.round(v * 100) / 100), last_changed: new Date(t).toISOString() });
  }
  if (reseau && pts.length) {
    // La fin rejoint la valeur affichee : une courbe qui finit ailleurs que le
    // chiffre d'a cote se contredit sous les yeux du lecteur.
    const ecart = cur - parseFloat(pts[pts.length - 1].state);
    for (const p of pts) p.state = String(Math.round((parseFloat(p.state) + ecart) * 100) / 100);
  }
  return [pts];
}

/* Prévisions factices, au format du service `weather.get_forecasts` : une
 * journée qui se réchauffe puis retombe, et une semaine qui alterne. */
function previsionsDemo(type) {
  const CONDS = ['partlycloudy', 'sunny', 'cloudy', 'rainy', 'partlycloudy', 'sunny', 'cloudy'];
  const out = [];
  if (type === 'daily') {
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i); d.setHours(12, 0, 0, 0);
      out.push({ datetime: d.toISOString(), condition: CONDS[i % CONDS.length],
        temperature: 26 - Math.round(Math.abs(Math.sin(i)) * 7), templow: 13 + Math.round(Math.cos(i) * 3),
        precipitation: i === 3 ? 4.2 : 0, precipitation_probability: i === 3 ? 70 : 10 });
    }
    return out;
  }
  for (let i = 1; i <= 12; i++) {
    const d = new Date(Date.now() + i * 3600000);
    const h = d.getHours();
    out.push({ datetime: d.toISOString(), condition: h >= 20 || h <= 6 ? 'clear-night' : CONDS[i % CONDS.length],
      temperature: Math.round(19.5 + 6.5 * Math.sin((h - 10) / 24 * 2 * Math.PI)),
      precipitation: 0, precipitation_probability: 5 * (i % 4) });
  }
  return out;
}

/* Interrupteurs sans fil : deux telecommandes, l'une deja reglee, l'autre a
 * decouvrir. Les noms de boutons sont ceux que zigbee2mqtt donne vraiment a un
 * variateur Hue et a un bouton IKEA — la demonstration ne doit pas apprendre
 * un vocabulaire qui n'existe pas. */
const INTER_AFF = {
  'z2m/Variateur Salon': {
    nom: etiquette('Variateur Salon'),
    source: 'z2m',
    actions: {
      on_press_release: [{ service: 'homeassistant.turn_on', data: { entity_id: 'light.salon' } }],
      off_press_release: [{ service: 'homeassistant.turn_off', data: { entity_id: 'light.salon' } }],
      up_press_release: [{ service: 'light.turn_on', data: { brightness_step_pct: 10, entity_id: 'light.salon' } }],
    },
  },
};
const INTER_DEPART = Date.now() / 1000;
// L'ecoute d'apprentissage de la demo : coupee au depart, comme le serveur.
const INTER_ECOUTE = { fin: 0 };
const interEcoute = () => {
  const reste = Math.max(0, Math.round((INTER_ECOUTE.fin - Date.now()) / 1000));
  return { active: reste > 0, reste };
};

function interDemo() {
  return {
    appareils: [
      {
        cle: 'z2m/Variateur Salon', source: 'z2m', nom: etiquette('Variateur Salon'),
        affectees: ['off_press_release', 'on_press_release', 'up_press_release'],
        vues: ['down_press_release', 'off_press_release', 'on_press_release', 'up_press_release'],
      },
      {
        cle: 'z2m/Bouton Cuisine', source: 'z2m', nom: etiquette('Bouton Cuisine'),
        affectees: [], vues: ['on', 'off', 'brightness_move_up'],
      },
    ],
    sources: { mqtt_present: true, z2m: true, zha: false, deconz: false },
    ecoute: interEcoute(),
    affectations: INTER_AFF,
    journal: [
      { cle: 'z2m/Bouton Cuisine', source: 'z2m', nom: etiquette('Bouton Cuisine'), action: 'on', ts: INTER_DEPART - 4 },
      { cle: 'z2m/Variateur Salon', source: 'z2m', nom: etiquette('Variateur Salon'), action: 'up_press_release', ts: INTER_DEPART - 26 },
      { cle: 'z2m/Variateur Salon', source: 'z2m', nom: etiquette('Variateur Salon'), action: 'on_press_release', ts: INTER_DEPART - 71 },
    ],
  };
}

function interAffecter(msg) {
  const enr = INTER_AFF[msg.cle] || { nom: msg.nom || msg.cle, source: 'z2m', actions: {} };
  if (msg.gestes && msg.gestes.length) enr.actions[msg.action] = msg.gestes;
  else delete enr.actions[msg.action];
  if (Object.keys(enr.actions).length) INTER_AFF[msg.cle] = enr;
  else delete INTER_AFF[msg.cle];
  return INTER_AFF;
}

/* Une ligne de journal telle que `regles.noter` l'écrit (ADR 0070) : un champ
 * composé se donne par ses PARTIES — `[[gabarit, args], …]` — et la ligne
 * garde, à côté du français rendu, le `g` que l'écran traduit. Écrits en
 * clair, « soleil à 225° », « mouvement : Entrée » ou « 3 min sans
 * mouvement » n'étaient la clé de rien : `tr` les rendait tels quels, en
 * français dans les sept langues, nom de pièce compris (relecture du 03/10).
 * Le français rendu compte aussi : la vue Veilles y lit le nom du capteur. */
function ligneJournal(champs) {
  const ligne = { ...champs };
  const g = {};
  ['quoi', 'motif', 'detail'].forEach((champ) => {
    if (!Array.isArray(champs[champ])) return;
    g[champ] = champs[champ];
    ligne[champ] = champs[champ].map(([gabarit, args]) => Object.keys(args)
      .reduce((texte, k) => texte.split('{' + k + '}').join(String(args[k])), gabarit)).join(' · ');
  });
  if (Object.keys(g).length) ligne.g = g;
  return ligne;
}

/* ── Les volets de la démo (chantier Volets, § 9) ─────────────────────────────
 *
 * Les quatre volets de sa maquette, à toute heure :
 *  - la cuisine à 60 %, déplacée à la main plusieurs fois cette semaine ;
 *  - le salon ouvert, façade sud-ouest, sa baie vitrée OUVERTE devant lui ;
 *    avant-hier, sa fermeture a attendu la baie (« Après fermeture : Baie
 *    vitrée ») ; ce soir, passé l'heure, elle attend encore ;
 *  - le bureau, nouveau, façade ouest, tenu à 30 % par la protection
 *    solaire — jusque vers 18:30, puis « quand le soleil quitte la façade »
 *    (`jusqu_a` à null : un cas du § 6.1) ; le soleil couché, plus rien ne
 *    le tient, un geste à la main l'a laissé à 30 % ; ses manœuvres de
 *    protection chaque après-midi ;
 *  - la chambre fermée, à ses heures à elle : +30 min, du lundi au vendredi.
 * Le soleil se lève à 07:47 et se couche à 20:24 AUJOURD'HUI ; les autres
 * jours glissent comme dans la maquette (+1,4 min et −1,8 min par jour).
 *
 * Les mouvements à venir se calculent avec le jumeau du serveur
 * (voletsplanning.js), sur ces heures du soleil ; l'histoire de la semaine —
 * historique et journal, qui se répondent — se bâtit une fois, à l'heure où
 * la démo s'installe, et finit sur la position de chaque volet. Un faux
 * moteur fait le reste (`installerDemo`). `maisonVoletsDemo` l'expose à
 * tests/demo_volets.test.mjs, son horloge réglée.
 */
const VOLETS_DEMO = ['cover.volet_cuisine', 'cover.volet_salon', 'cover.volet_bureau', 'cover.volet_chambre'];
/* Les autres volets — par leur classe, comme `_tous_les_covers()` au serveur
 * (audit du 19/10) : le store banne, le rideau sans position, le volet muet,
 * celui « façon Netatmo ». Ils ont leur état du § 6.1, sans histoire de la
 * semaine. Le garage et le portail n'en sont pas. */
const VOLETS_AUTRES_DEMO = ['cover.store_banne', 'cover.rideau_chambre', 'cover.volet_entree', 'cover.volet_sdb'];
/* Le volet « façon Netatmo » (§ 0 et § 5 de la conception) : son faux moteur ne
 * publie jamais `opening` ni `closing` (`moteurVolet`). */
const VOLETS_NETATMO_DEMO = new Set(['cover.volet_sdb']);
// Où en est chaque volet quand la démo s'installe (§ 9) ; l'histoire de la semaine y aboutit.
const POSITIONS_DEMO = { 'cover.volet_cuisine': 60, 'cover.volet_salon': 100, 'cover.volet_bureau': 30, 'cover.volet_chambre': 0 };
const MINUTE_MS = 60000;
const BAIE_DEMO = 'binary_sensor.baie_vitree';
const FACADE_BUREAU = 270;

/* L'horloge des volets : celle du navigateur ; `maisonVoletsDemo` la règle.
 * `DEPART_VOLETS` est l'heure où l'histoire s'arrête — l'installation. */
let horlogeVolets = () => Date.now();
let DEPART_VOLETS = null;
let HISTOIRE_VOLETS = null;
const departVolets = () => (DEPART_VOLETS == null ? (DEPART_VOLETS = horlogeVolets()) : DEPART_VOLETS);

/* Le jour `d` (0 : aujourd'hui) à l'horloge de la maison, à `h`:`m`. */
const aJour = (ref, d, h, m) => { const x = new Date(ref); return new Date(x.getFullYear(), x.getMonth(), x.getDate() + d, h, m, 0, 0).getTime(); };

/** Le lever et le coucher du jour `d` : 07:47 et 20:24 aujourd'hui, +84 s et −108 s par jour. */
function soleilDuJour(ref, d) {
  return { lever: aJour(ref, d, 7, 47) + d * 84000, coucher: aJour(ref, d, 20, 24) - d * 108000 };
}

/** Le soleil à l'instant `t` : azimut et hauteur, cohérents avec ses heures. */
function soleilA(t) {
  const { lever, coucher } = soleilDuJour(t, 0);
  if (t >= lever && t <= coucher) {
    const f = (t - lever) / (coucher - lever);
    return { azimut: Math.round(105 + 150 * f), elevation: Math.round(32 * Math.sin(Math.PI * f) * 10) / 10, leve: true };
  }
  const veille = t < lever ? soleilDuJour(t, -1).coucher : coucher;
  const matin = t < lever ? lever : soleilDuJour(t, 1).lever;
  const f = (t - veille) / (matin - veille);
  return { azimut: Math.round(255 + 210 * f) % 360, elevation: Math.round(-12 * Math.sin(Math.PI * f) * 10) / 10, leve: false };
}

/** L'état `sun.sun` de la démo à l'instant `t`. */
function etatSoleilDemo(t) {
  const { lever, coucher } = soleilDuJour(t, 0);
  const p = soleilA(t);
  return s(p.leve ? 'above_horizon' : 'below_horizon', { friendly_name: 'Soleil', elevation: p.elevation, azimuth: p.azimut, rising: t < aJour(t, 0, 14, 5),
    next_rising: new Date(t < lever ? lever : soleilDuJour(t, 1).lever).toISOString(),
    next_setting: new Date(t < coucher ? coucher : soleilDuJour(t, 1).coucher).toISOString() });
}

/** `soleil_jours` (§ 6.1) : du lundi de la semaine à aujourd'hui + 7, à l'heure de la maison. */
function soleilJoursDemo(t) {
  const lundi = -((new Date(t).getDay() + 6) % 7);
  const jours = [];
  for (let d = lundi; d <= 7; d++) {
    const { lever, coucher } = soleilDuJour(t, d);
    jours.push({ date: isoCha(new Date(aJour(t, d, 12, 0))).slice(0, 10), lever: isoCha(new Date(lever)), coucher: isoCha(new Date(coucher)) });
  }
  return jours;
}

/* La configuration des volets : des entités qui existent. Paresseuse, et
 * remise à neuf par `maisonVoletsDemo` : une écriture d'un test ne déborde pas sur l'autre. */
let VOL_CFG_ = null;
const VOL_CFG = () => (VOL_CFG_ || (VOL_CFG_ = {
  planning: { actif: true, mode: 'auto', ouverture: { decalage: 30 }, fermeture: { decalage: 30 }, jours: [0, 1, 2, 3, 4, 5, 6],
    volets: { 'cover.volet_chambre': { perso: true, ouverture: 30, fermeture: null, jours_ouverture: [0, 1, 2, 3, 4] } } },
  velux: { actif: false },
  soleil: {
    actif: true, position: 30, elevation_min: 15, temp_min: 25,
    temp_entite: 'sensor.temperature_exterieure',
    volets: { 'cover.volet_salon': { orientation: 225, ouverture: 90 }, 'cover.volet_bureau': { orientation: FACADE_BUREAU, ouverture: 90 } },
  },
  vent: { actif: false, entite: '', seuil: 50 },
  baies: { actif: true, volets: { 'cover.volet_salon': BAIE_DEMO } },
}));

/**
 * L'histoire de la semaine, bâtie une fois : `{ mouvements, journal }`.
 * `mouvements` : `[{ id, t, pos }]`, dans l'ordre ; `journal` : les lignes
 * que le moteur aurait écrites, `cible` comprise, et `orientation` et
 * `dehors` sur celles de la protection (§ 6.4). Ce que la main a fait n'a pas
 * de ligne. Elle s'arrête à `depart` et finit, pour chaque volet, sur sa
 * position de la démo : au besoin, un dernier geste à la main.
 */
function histoireVolets(depart) {
  const mouvements = [];
  const journal = [];
  const bouger = (id, t, pos) => { if (t <= depart) mouvements.push({ id, t, pos }); };
  const noter = (t, champs) => { if (t <= depart) journal.push(ligneJournal({ detail: '', simule: false, ts: t / 1000, ...champs })); };
  const planifier = (t, quoi, ids, motif, cible) => {
    ids.forEach(id => bouger(id, t, cible));
    noter(t, { module: 'volets', regle: 'planning', quoi, cibles: ids, n: ids.length, motif: [[motif, { d: '+30' }]], cible });
  };
  const proteger = (t, dehors) => {
    bouger('cover.volet_bureau', t, 30);
    noter(t, { module: 'volets', regle: 'soleil', quoi: 'proteger', cibles: ['cover.volet_bureau'], n: 1, motif: [['soleil a {a}°', { a: soleilA(t).azimut }]],
      cible: 30, orientation: FACADE_BUREAU, dehors });
  };
  VOLETS_DEMO.forEach(id => mouvements.push({ id, t: aJour(depart, -8, 21, 0), pos: 0 }));
  for (let d = -7; d <= 0; d++) {
    const { lever, coucher } = soleilDuJour(depart, d);
    const ouvre = lever + 30 * MINUTE_MS, ferme = coucher + 30 * MINUTE_MS;
    const ouvree = (new Date(aJour(depart, d, 12, 0)).getDay() + 6) % 7 <= 4;
    /* Aujourd'hui, le soleil levé, la protection tient le bureau depuis 13:05 — ou depuis 40 min le matin, jamais
     * avant le lever : rien ne la relâche avant l'installation. Le soleil couché, la journée se raconte comme les
     * autres et finit par un geste à la main : la nuit, la protection ne monte aucun volet (relecture du 13/10, point 7). */
    const tient = d === 0 && soleilA(depart).leve;
    const tp = tient ? Math.max(lever, Math.min(aJour(depart, 0, 13, 5), depart - 40 * MINUTE_MS)) : aJour(depart, d, 13, 5);
    const bureau = !tient || ouvre < tp ? ['cover.volet_bureau'] : [];
    planifier(ouvre, 'ouvrir', ['cover.volet_cuisine', 'cover.volet_salon', ...bureau, ...(ouvree ? ['cover.volet_chambre'] : [])], 'lever du soleil {d} min', 100);
    proteger(tp, 26.4 - (d % 3) * 0.7);
    if (!tient) {
      bouger('cover.volet_bureau', aJour(depart, d, 18, 30), 100);
      noter(aJour(depart, d, 18, 30), { module: 'volets', regle: 'soleil', quoi: 'rouvrir', cibles: ['cover.volet_bureau'], n: 1, motif: 'soleil parti',
        cible: 100, orientation: FACADE_BUREAU, dehors: 23.8 });
    }
    // La cuisine, à la main : deux gestes à deux minutes (une manœuvre), puis un aller-retour.
    if (d === -4) { bouger('cover.volet_cuisine', aJour(depart, d, 14, 10), 40); bouger('cover.volet_cuisine', aJour(depart, d, 14, 12), 60); }
    if (d === -1) { bouger('cover.volet_cuisine', aJour(depart, d, 16, 45), 50); bouger('cover.volet_cuisine', aJour(depart, d, 17, 20), 100); }
    // Le salon : sa baie était ouverte à l'heure — avant-hier, et ce soir.
    const salon = d === -2 || d === 0 ? [] : ['cover.volet_salon'];
    planifier(ferme, 'fermer', ['cover.volet_cuisine', ...salon, ...(!tient ? ['cover.volet_bureau'] : []), 'cover.volet_chambre'], 'coucher du soleil {d} min', 0);
    if (d === -2) {
      const t = aJour(depart, d, 22, 40);
      bouger('cover.volet_salon', t, 0);
      noter(t, { module: 'volets', regle: 'rattrapage', quoi: 'fermer', cibles: ['cover.volet_salon'], n: 1, motif: 'baie refermee', cible: 0 });
    }
  }
  mouvements.sort((a, b) => a.t - b.t);
  // La fin de l'histoire : chaque volet sur sa position de la démo, au besoin d'un geste à la main.
  const avance = { 'cover.volet_cuisine': 25, 'cover.volet_salon': 15, 'cover.volet_bureau': 10, 'cover.volet_chambre': 50 };
  VOLETS_DEMO.forEach(id => {
    const dernier = mouvements.filter(m => m.id === id).pop();
    if (dernier.pos !== POSITIONS_DEMO[id]) mouvements.push({ id, t: Math.max(dernier.t + MINUTE_MS, depart - avance[id] * MINUTE_MS), pos: POSITIONS_DEMO[id] });
  });
  mouvements.sort((a, b) => a.t - b.t);
  journal.sort((a, b) => b.ts - a.ts);
  return { mouvements, journal };
}
const histoire = () => HISTOIRE_VOLETS || (HISTOIRE_VOLETS = histoireVolets(departVolets()));

/** L'historique d'un volet, au format de `history/period` : son état au début, puis chaque mouvement. */
function historiqueVoletDemo(id, t0, t1, states) {
  const st = states[id];
  if (!st) return [];
  const siens = histoire().mouvements.filter(m => m.id === id);
  const point = (t, pos) => ({ state: pos > 0 ? 'open' : 'closed', attributes: { ...st.attributes, current_position: pos },
    last_changed: new Date(t).toISOString(), last_updated: new Date(t).toISOString() });
  const avant = siens.filter(m => m.t <= t0).pop();
  const liste = [...(avant ? [point(t0, avant.pos)] : []), ...siens.filter(m => m.t > t0 && m.t <= t1).map(m => point(m.t, m.pos))];
  if (!liste.length) return [];
  liste[0].entity_id = id;
  return [liste];
}

/** `loggia/volets/manoeuvres` (§ 6.5) : les lignes du journal qui nomment ce volet, les plus récentes d'abord. */
function manoeuvresVoletsDemo(msg, states) {
  const id = msg && msg.entity_id;
  const depuis = Number(msg && msg.depuis);
  if (typeof id !== 'string' || !id || !Number.isFinite(depuis) || depuis < 0) return Promise.reject({ code: 'invalid_format', message: 'entity_id, depuis' });
  const tout = reglesDemo(states).journal;
  const lignes = tout.filter(l => l.ts >= depuis && ((Array.isArray(l.cibles) && l.cibles.includes(id)) || (typeof l.detail === 'string' && l.detail.split(/[^a-z0-9_.]/).includes(id))))
    .sort((a, b) => b.ts - a.ts).slice(0, 200);
  return Promise.resolve({ lignes, couvre_depuis: tout.length ? Math.min(...tout.map(l => l.ts)) : null });
}

/** `loggia/volets/etat`, les champs d'avant et ceux du § 6.1. */
function voletsDemo(states) {
  const t = horlogeVolets();
  const cfg = VOL_CFG();
  const plan = cfg.planning;
  const maintenant = isoCha(new Date(t));
  const jours = soleilJoursDemo(t);
  const p = soleilA(t);
  // Passé l'heure de la fermeture d'aujourd'hui, une baie ouverte la retient jusqu'au matin.
  const fermeAujourdhui = soleilDuJour(t, 0).coucher + 30 * MINUTE_MS;
  const finProtection = aJour(t, 0, 18, 30);
  // Le soleil couché, la protection ne tient rien (relecture du 13/10, point 7).
  const protege = p.leve && !!(cfg.soleil.actif && cfg.soleil.volets && cfg.soleil.volets['cover.volet_bureau']);
  const etatDe = (capteur) => {
    const b = states[capteur];
    return !b || b.state === 'unavailable' || b.state === 'unknown' ? 'muette' : b.state === 'on' ? 'ouverte' : 'fermee';
  };
  const capteurs = (cfg.baies && cfg.baies.volets) || {};
  const facades = (cfg.soleil && cfg.soleil.volets) || {};
  const volets = {};
  [...VOLETS_DEMO, ...VOLETS_AUTRES_DEMO].filter(id => states[id]).forEach(id => {
    volets[id] = {
      regle: regleDe(plan, id),
      a_venir: aVenir(plan, id, jours, maintenant),
      protection: id === 'cover.volet_bureau' && protege ? { jusqu_a: t < finProtection ? isoCha(new Date(finProtection)) : null, position: 100, orientation: FACADE_BUREAU } : null,
      abri: false,
      attente: capteurs[id] && cfg.baies.actif && etatDe(capteurs[id]) === 'ouverte' && t >= fermeAujourdhui && plan.actif
        ? { sens: 'fermer', motif: 'baie ouverte', expire: isoCha(new Date(soleilDuJour(t, 1).lever + 30 * MINUTE_MS)) } : null,
      porte: capteurs[id] ? { entite: capteurs[id], etat: etatDe(capteurs[id]) } : null,
      orientation: facades[id] && Number.isFinite(Number(facades[id].orientation)) ? ((Number(facades[id].orientation) % 360) + 360) % 360 : null,
      manoeuvre: null,
    };
  });
  // Plus de `prochains` (audit du 19/10) : le serveur ne le publie plus, l'écran lit `a_venir`.
  return {
    config: cfg,
    soleil: { azimut: p.azimut, elevation: p.elevation },
    abaisses: protege ? ['cover.volet_bureau'] : [],
    a_l_abri: false,
    journal: histoire().journal,
    maintenant,
    soleil_jours: jours,
    volets,
  };
}

function voletsPatch(patch) {
  Object.keys(patch || {}).forEach(section => {
    if (VOL_CFG()[section]) Object.assign(VOL_CFG()[section], patch[section]);
  });
  return VOL_CFG();
}

/**
 * La maison de la démo, son horloge réglée, pour tests/demo_volets.test.mjs :
 * l'état des volets, leur historique, leurs manœuvres, le journal des règles
 * et l'écriture de la configuration — une histoire et une configuration
 * neuves à chaque appel.
 */
export function maisonVoletsDemo({ quand = null } = {}) {
  const t = quand == null ? Date.now() : Number(quand);
  horlogeVolets = () => t;
  DEPART_VOLETS = t;
  HISTOIRE_VOLETS = null;
  VOL_CFG_ = null;
  const states = etatsInitiaux();
  return {
    states,
    etat: () => voletsDemo(states),
    historique: (id, jours) => historiqueDemo('history/period/' + new Date(t - jours * 86400000).toISOString() + '?filter_entity_id=' + encodeURIComponent(id)
      + '&end_time=' + encodeURIComponent(new Date(t).toISOString()) + '&significant_changes_only=0', states),
    manoeuvres: (msg) => manoeuvresVoletsDemo(msg, states),
    regles: () => reglesDemo(states),
    ecrire: (patch) => voletsPatch(patch),
  };
}

/* ── Les prises de la démo (chantier Prises, § 10) ────────────────────────────
 *
 * Les quatre prises de sa maquette « Cartes prises », à toute heure :
 *  - le NAS (Zephyr), PROTÉGÉ, vers 4 W ; sa sauvegarde de 02:00 à 02:45 vers
 *    23 W ; allumé depuis 41 jours (« le 2 sept. » un 13 octobre) ;
 *  - le PC du bureau (Atlas), de 95 à 165 W, allumé à 08:50 par le bouton de
 *    la prise — trente minutes avant l'heure de la démo si elle est plus
 *    matinale —, sa pause de midi vers 35 W ;
 *  - le lave-vaisselle, son cycle de 13:40 à 16:14 et ses deux pics à 1 950 W
 *    — fini vingt minutes avant la démo si elle est plus matinale, et alors il
 *    passe minuit si la démo s'ouvre dans la nuit ; trois jours plus tôt, le
 *    précédent ; « Prévenir à la fin du cycle » allumé ; 1,08 kWh, comme sa
 *    maquette, à quelque heure qu'on l'ouvre ;
 *  - le poêle, allumé à 06:30 par l'automatisation « Matin », muet depuis
 *    14:20 — une heure avant la démo si elle est plus matinale. Son nom ne dit
 *    pas ce qu'il est : son type est IMPOSÉ, « Radiateur » (P2).
 * Chacune a son appareil Zigbee (derrière le pont), son capteur de puissance
 * et son compteur d'énergie, leurs statistiques sur 5 min et à l'heure, et un
 * logbook avec ses contextes ; le minuteur de la démo note sa pose et coupe à
 * l'échéance. Le pont de Zigbee2MQTT et la sirène de l'alarme sont là : ni
 * l'un ni l'autre n'est une prise. `maisonPrisesDemo` l'expose à
 * tests/demo_prises.test.mjs, son horloge réglée. */
const PRISES_DEMO = ['switch.prise_nas_zephyr', 'switch.prise_pc_bureau_atlas', 'switch.prise_lave_vaisselle', 'switch.poele'];
const NOMS_PRISES_DEMO = { 'switch.prise_nas_zephyr': 'Prise NAS (Zephyr)', 'switch.prise_pc_bureau_atlas': 'Prise PC Bureau (Atlas)',
  'switch.prise_lave_vaisselle': 'Prise lave-vaisselle', 'switch.poele': 'Poêle' };
const PIECES_PRISES_DEMO = { 'switch.prise_nas_zephyr': 'bureau', 'switch.prise_pc_bureau_atlas': 'bureau', 'switch.prise_lave_vaisselle': 'cuisine', 'switch.poele': 'salon' };
/* Le type que le serveur devine de leur nom (son jumeau de `typeDePrise`, § 6.2) : écrit ici, pas
 * importé — prises.js est au démarrage, et un import de la démo le ferait sortir du boot dans un
 * morceau partagé, que le démarrage chargerait quand même (tests/demo_prises.test.mjs les compare). */
const DEVINES_DEMO = { 'switch.prise_nas_zephyr': 'nas', 'switch.prise_pc_bureau_atlas': 'pc', 'switch.prise_lave_vaisselle': 'lv', 'switch.poele': 'prise' };
// Ce que chaque compteur affiche (sa maquette, `total`).
const TOTAUX_PRISES_DEMO = { 'switch.prise_nas_zephyr': 212.6, 'switch.prise_pc_bureau_atlas': 846.1, 'switch.prise_lave_vaisselle': 507.3, 'switch.poele': 391.4 };
const PONT_DEMO = 'switch.zigbee2mqtt_bridge_permit_join';
const SIRENE_SWITCH_DEMO = 'switch.alarme_sirene_siren_on';
/** Les capteurs d'une prise de la démo : `sensor.<nom>_power` et `_energy`, comme Zigbee2MQTT les nomme. */
const capteursPriseDemo = (id) => ({ power: 'sensor.' + id.slice(7) + '_power', energy: 'sensor.' + id.slice(7) + '_energy' });
/** La prise d'un de ses capteurs, ou null. */
const priseDuCapteurDemo = (id) => PRISES_DEMO.find(p => id === capteursPriseDemo(p).power || id === capteursPriseDemo(p).energy) || null;
/** L'appareil d'une prise de la démo (son interrupteur et ses deux capteurs), ou de la sirène de l'alarme ; null sinon. */
const appareilPriseDemo = (id) => (id === SIRENE_SWITCH_DEMO ? 'alarme_sirene'
  : (PRISES_DEMO.includes(id) ? 'prise_' + id.slice(7) : priseDuCapteurDemo(id) ? 'prise_' + priseDuCapteurDemo(id).slice(7) : null));
/* Le modèle que Zigbee2MQTT donne à son pont : un nom d'intégration, qui ne se traduit pas — c'est à lui que Loggia le reconnaît. */
const MODELE_PONT_DEMO = 'Bridge';
const CINQ_MIN_MS = 5 * MINUTE_MS;

/* L'horloge des prises : celle du navigateur ; `maisonPrisesDemo` la règle. */
let horlogePrises = () => Date.now();
/* L'histoire d'AUJOURD'HUI, fixée UNE fois (relecture des tâches 1 à 6, point 2 ; tâche 12 bis — B8) : à la
 * première lecture du jour, et gardée telle quelle. Recalculée à chaque lecture, elle suivait l'horloge — les
 * heures de la maquette ramenées avant « maintenant » —, et une démo ouverte avant 16:34 faisait avancer
 * « Terminé à » d'une minute à chaque relecture. `jour` (minuit) → son histoire : une démo laissée ouverte passé
 * minuit fixe celle du jour qui commence, et garde celle de la veille. */
const HISTOIRES_PRISES = new Map();
/* La configuration (§ 6.1) : le NAS protégé, le poêle IMPOSÉ en radiateur, le lave-vaisselle qui prévient. */
let PRI_CFG_ = null;
const PRI_CFG = () => (PRI_CFG_ || (PRI_CFG_ = { protegees: ['switch.prise_nas_zephyr'], types: { 'switch.poele': 'radia' }, prevenir: { 'switch.prise_lave_vaisselle': true } }));
/* Ce que la session ajoute à l'histoire : les gestes sur une prise (le logbook, `context_user_id`
 * du compte de la démo), et les lignes du minuteur (le journal de Loggia). */
const PRISES_GESTES = [];
const PRISES_JOURNAL = [];

/* Le cycle du lave-vaisselle : 154 minutes, de son début à sa fin — le prélavage, le premier pic à 1 950 W, le
 * lavage, le second pic, le séchage. Le lavage tient à 66 W : le cycle fait 1,079 kWh, « 1,08 » comme sa
 * maquette (à 62 W il en faisait 1,074 — « 1,07 »). La puissance se lit à `m` minutes DU DÉBUT du cycle, jamais
 * à l'heure du jour : un cycle qui passe minuit garde sa forme entière. */
const DUREE_CYCLE_LV = 154;
const puissanceCycleLv = (m) => (m < 0 || m >= DUREE_CYCLE_LV ? 0 : m < 15 ? 38 : m < 35 ? 1950 : m < 115 ? 66 : m < 125 ? 1950 : 14);

/**
 * L'histoire d'une journée : les heures de sa maquette, ramenées avant `t`
 * quand la démo s'ouvre plus tôt. `t` est l'heure de la démo pour aujourd'hui,
 * la fin de la journée pour un jour passé (`passe`) : un jour passé suit les
 * heures de la maquette, et le lave-vaisselle n'y tourne qu'un jour sur trois.
 */
function histoirePrises(t, passe = false) {
  const avant = (h, m, recul) => (passe ? aJour(t, 0, h, m) : Math.min(aJour(t, 0, h, m), t - recul * MINUTE_MS));
  const finLv = avant(16, 14, 20);
  const muet = passe ? Infinity : avant(14, 20, 60);
  const jour = Math.round(aJour(t, 0, 12, 0) / 86400000);
  return {
    nas: aJour(t, -41, 9, 0), sauvegarde: [aJour(t, 0, 2, 0), aJour(t, 0, 2, 45)],
    pc: avant(8, 50, 30),
    lv: !passe || jour % 3 === 0 ? [finLv - DUREE_CYCLE_LV * MINUTE_MS, finLv] : null,
    poele: [Math.min(aJour(t, 0, 6, 30), muet - 120 * MINUTE_MS), muet],
  };
}
/** L'histoire d'aujourd'hui, fixée à la première lecture du jour (voir `HISTOIRES_PRISES`). */
function histoireAujourdhui() {
  const t = horlogePrises();
  const jour = aJour(t, 0, 0, 0);
  if (!HISTOIRES_PRISES.has(jour)) HISTOIRES_PRISES.set(jour, histoirePrises(t));
  return HISTOIRES_PRISES.get(jour);
}
/** L'histoire du jour de l'instant `x`, à l'horloge des prises : celle qu'on a fixée, sinon celle des jours passés. */
function histoireDuJour(x) {
  const jour = aJour(x, 0, 0, 0);
  if (jour === aJour(horlogePrises(), 0, 0, 0)) return histoireAujourdhui();
  return HISTOIRES_PRISES.get(jour) || histoirePrises(aJour(x, 0, 23, 59), true);
}
/* Un aléa stable par tranche de 5 minutes : la courbe ne scintille pas d'une lecture à l'autre. */
const aleaPrise = (x, graine) => hasardStable(Math.floor(x / CINQ_MIN_MS) * 31 + graine);

/** Le cycle du lave-vaisselle qui couvre l'instant `x`, ou null : celui de son jour, ou — avant minuit — celui du
 * jour qui vient, commencé la veille au soir (une démo ouverte à 00:30 : de 21:36 à 00:10). Chaque jour a l'histoire
 * du sien, et un instant d'avant minuit ne se lit pas dans l'histoire d'hier : elle ne connaît pas ce cycle-là. */
function cycleLvA(x) {
  for (const d of [0, 1]) {
    const lv = histoireDuJour(aJour(x, d, 12, 0)).lv;
    if (lv && x >= lv[0] && x < lv[1]) return lv;
  }
  return null;
}

/** La puissance d'une prise à l'instant `x` (W), ou null quand elle est muette. */
function wattsPriseDemo(id, x, H = histoireDuJour(x)) {
  if (id === 'switch.prise_nas_zephyr') return x >= H.sauvegarde[0] && x < H.sauvegarde[1] ? 21 + 4 * aleaPrise(x, 1) : 3.4 + 1.4 * aleaPrise(x, 1);
  if (id === 'switch.prise_pc_bureau_atlas') {
    if (x < H.pc) return 0;
    const h = new Date(x).getHours() + new Date(x).getMinutes() / 60;
    return h >= 12.5 && h < 13.5 ? 32 + 6 * aleaPrise(x, 2) : 95 + 70 * aleaPrise(x, 2);
  }
  // Le cycle qui couvre `x`, même commencé la veille au soir : sa puissance se lit à ses minutes à lui, pas dans l'histoire du jour de `x`.
  if (id === 'switch.prise_lave_vaisselle') {
    const lv = cycleLvA(x);
    return lv ? puissanceCycleLv((x - lv[0]) / MINUTE_MS) : 0;
  }
  if (id === 'switch.poele') {
    if (x >= H.poele[1]) return null;
    if (x < H.poele[0]) return 0;
    return x < H.poele[0] + 45 * MINUTE_MS ? 310 : 38 + 10 * aleaPrise(x, 4);
  }
  return null;
}

/** L'énergie d'une prise entre deux instants (kWh), par tranches de 5 minutes — ce que son compteur compte. */
function kwhPriseDemo(id, t0, t1) {
  let wh = 0;
  for (let x = t0; x < t1; x += CINQ_MIN_MS) {
    const w = wattsPriseDemo(id, x + CINQ_MIN_MS / 2);
    if (w != null) wh += w * Math.min(CINQ_MIN_MS, t1 - x) / 3600000;
  }
  return Math.round(wh) / 1000;
}

/** Les états des prises de la démo, de leurs capteurs, du pont et de la sirène, à l'horloge des prises. */
function etatsPrisesDemo() {
  const t = horlogePrises();
  const H = histoireAujourdhui();
  const depuis = (x) => new Date(x).toISOString();
  const etat = (state, attributs, x) => ({ ...s(state, attributs), last_changed: depuis(x), last_updated: depuis(x) });
  const allumee = { 'switch.prise_nas_zephyr': H.nas, 'switch.prise_pc_bureau_atlas': H.pc, 'switch.prise_lave_vaisselle': aJour(t, -15, 19, 5), 'switch.poele': H.poele[1] };
  const out = {};
  PRISES_DEMO.forEach(id => {
    const muet = id === 'switch.poele';
    const nom = NOMS_PRISES_DEMO[id];
    const w = wattsPriseDemo(id, t, H);
    out[id] = etat(muet ? 'unavailable' : 'on', { friendly_name: nom }, allumee[id]);
    out[capteursPriseDemo(id).power] = etat(muet ? 'unavailable' : String(Math.round(w * 10) / 10), { friendly_name: etiquette(nom) + ' ' + etiquette('Puissance'),
      device_class: 'power', state_class: 'measurement', unit_of_measurement: 'W' }, muet ? H.poele[1] : t);
    out[capteursPriseDemo(id).energy] = etat(muet ? 'unavailable' : String(TOTAUX_PRISES_DEMO[id]), { friendly_name: etiquette(nom) + ' ' + etiquette('Énergie'),
      device_class: 'energy', state_class: 'total_increasing', unit_of_measurement: 'kWh' }, muet ? H.poele[1] : t);
  });
  out[PONT_DEMO] = s('off', { friendly_name: 'Zigbee2MQTT Bridge Permit join', icon: 'mdi:human-greeting-proximity' });
  out[SIRENE_SWITCH_DEMO] = s('off', { friendly_name: 'Alarme sirène Siren on' });
  return out;
}

/** Les cycles du lave-vaisselle des sept derniers jours (§ 6.1), du plus ancien au plus récent (le contrat du plan 1).
 * Les kWh sont ceux du cycle ENTIER, minuit franchi ou non : `kwhPriseDemo` lit sa puissance dans le cycle, pas dans le jour. */
function cyclesLvDemo(t) {
  const out = [];
  for (let d = -7; d <= 0; d++) {
    const H = histoireDuJour(aJour(t, d, 12, 0));
    if (!H.lv || H.lv[1] > t) continue;
    out.push({ debut: isoCha(new Date(H.lv[0])), fin: isoCha(new Date(H.lv[1])), kwh: kwhPriseDemo('switch.prise_lave_vaisselle', H.lv[0], H.lv[1]) });
  }
  return out;
}

/* Les lignes du journal des cycles du lave-vaisselle (le contrat du plan 1) :
 * « cycle démarré » une minute après le début, « cycle terminé » dix minutes
 * après la baisse — l'instant RÉEL dans leurs parties (`ts`, en secondes), et
 * les kWh à part, trois décimales au plus. */
function journalCyclesDemo() {
  const t = horlogePrises();
  const id = 'switch.prise_lave_vaisselle';
  const hm = (ms) => new Date(ms).toTimeString().slice(0, 5);
  return cyclesLvDemo(t).flatMap(c => {
    const a = Date.parse(c.debut), b = Date.parse(c.fin);
    const lignes = [ligneJournal({ module: 'prises', regle: 'cycle', quoi: 'cycle démarré', cibles: [id], n: 1, motif: [['à {h}', { h: hm(a), ts: Math.round(a / 1000) }]], detail: '', simule: false, ts: a / 1000 + 60 })];
    if (b + 600000 <= t) {
      lignes.push(ligneJournal({ module: 'prises', regle: 'cycle', quoi: 'cycle terminé', cibles: [id], n: 1, detail: '', simule: false, ts: b / 1000 + 600,
        motif: [['à {h}', { h: hm(b), ts: Math.round(b / 1000) }], ['{kwh} kWh', { kwh: Math.round(c.kwh * 1000) / 1000 }]] }));
    }
    return lignes;
  });
}

/** `loggia/prises/etat` (§ 6.1) : la configuration, et pour chaque prise son type, sa protection, son alerte, ses cycles. */
function prisesDemo() {
  const t = horlogePrises();
  const cfg = PRI_CFG();
  const prises = {};
  PRISES_DEMO.forEach(id => {
    const impose = (cfg.types && cfg.types[id]) || null;
    const type = impose || DEVINES_DEMO[id];
    // `suivi` (audit du 19/10) : le serveur suit le cycle de l'électroménager qui mesure — toutes les prises de la démo mesurent.
    prises[id] = { type, impose: !!impose, protegee: (cfg.protegees || []).includes(id), prevenir: !!(cfg.prevenir && cfg.prevenir[id]),
      suivi: ['lv', 'll', 'sl'].includes(type), cycle: null, cycles: id === 'switch.prise_lave_vaisselle' ? cyclesLvDemo(t) : [] };
  });
  return { maintenant: isoCha(new Date(t)), config: JSON.parse(JSON.stringify(cfg)), prises, notifier: true };
}

/** `loggia/prises/config` (le contrat du plan 1) : `protegees` arrive ENTIÈRE et remplace la liste ;
 * `types` et `prevenir` se posent prise par prise — un type `null` rend la prise à son nom, `false` coupe. */
function prisesPatch(patch) {
  const cfg = PRI_CFG();
  if (patch && Array.isArray(patch.protegees)) cfg.protegees = [...new Set(patch.protegees)].sort();
  for (const [id, t] of Object.entries((patch && patch.types) || {})) { if (t) cfg.types[id] = t; else delete cfg.types[id]; }
  for (const [id, v] of Object.entries((patch && patch.prevenir) || {})) { if (v) cfg.prevenir[id] = true; else delete cfg.prevenir[id]; }
  return JSON.parse(JSON.stringify(cfg));
}

/**
 * Les statistiques d'un capteur de prise, au format de
 * `recorder/statistics_during_period` : des tranches de 5 min ou d'une heure,
 * jamais celle en cours ; `mean` pour une puissance (W), `change` pour un
 * compteur (kWh). Une tranche où la prise était muette n'existe pas.
 */
function statsPriseDemo(id, msg) {
  const prise = priseDuCapteurDemo(id);
  const pas = msg.period === '5minute' ? CINQ_MIN_MS : msg.period === 'hour' ? 3600000 : 0;
  const t0 = Date.parse(msg.start_time);
  if (!prise || !pas || isNaN(t0)) return [];
  const t1 = Math.min(horlogePrises(), msg.end_time ? Date.parse(msg.end_time) : Infinity);
  const energie = id === capteursPriseDemo(prise).energy;
  const lignes = [];
  for (let debut = Math.ceil(t0 / pas) * pas; debut + pas <= t1; debut += pas) {
    let wh = 0, duree = 0;
    for (let x = debut; x < debut + pas; x += CINQ_MIN_MS) {
      const w = wattsPriseDemo(prise, x + CINQ_MIN_MS / 2);
      if (w == null) continue;
      wh += w * CINQ_MIN_MS / 3600000;
      duree += CINQ_MIN_MS;
    }
    if (!duree) continue;
    // Le compteur compte au dixième de Wh : arrondi au Wh, chaque tranche de 5 minutes à 66 W (5,5 Wh) montait à 6 et le jour
    // dépassait de 8 Wh le cycle qui l'a consommé (« 1,09 » contre « 1,08 »).
    lignes.push(energie ? { start: debut, end: debut + pas, change: Math.round(wh * 10) / 10000 } : { start: debut, end: debut + pas, mean: Math.round(wh * 3600000 / duree * 10) / 10 });
  }
  return lignes;
}

/** `logbook/get_events` : ce que le logbook dit des prises depuis `start_time`, contextes compris, dans l'ordre du temps. */
function logbookPrisesDemo(msg, states) {
  const t = horlogePrises();
  const H = histoireAujourdhui();
  const nom = (id) => (states[id] && states[id].attributes ? states[id].attributes.friendly_name : id);
  const debut = Date.parse(msg && msg.start_time) || 0;
  const ids = Array.isArray(msg && msg.entity_ids) ? msg.entity_ids : null;
  const evts = [
    // Le PC : allumé au bouton de la prise — aucun contexte.
    { when: H.pc / 1000, entity_id: 'switch.prise_pc_bureau_atlas', state: 'on', name: nom('switch.prise_pc_bureau_atlas') },
    // Le poêle : allumé par l'automatisation « Matin », puis muet.
    { when: H.poele[0] / 1000, entity_id: 'switch.poele', state: 'on', name: nom('switch.poele'), context_id: 'demo-matin', context_event_type: 'automation_triggered',
      context_domain: 'automation', context_name: etiquette('Matin'), context_entity_id: 'automation.matin' },
    { when: H.poele[1] / 1000, entity_id: 'switch.poele', state: 'unavailable', name: nom('switch.poele') },
    ...PRISES_GESTES,
  ];
  return evts.filter(e => e.when * 1000 >= debut && e.when * 1000 <= t && (!ids || ids.includes(e.entity_id))).sort((a, b) => a.when - b.when);
}

/**
 * La maison de la démo, son horloge des prises réglée, pour
 * tests/demo_prises.test.mjs : les états, l'index, l'état du § 6.1, les
 * statistiques, le logbook, l'écriture de la configuration — une
 * configuration et une histoire neuves à chaque appel. L'histoire d'aujourd'hui
 * est fixée à la première lecture (ici, aussitôt) ; `avancer(ms)` fait passer le
 * temps SANS la refaire, comme une démo restée ouverte : le test relit, et vérifie
 * que « Terminé à » n'a pas bougé.
 */
export function maisonPrisesDemo({ quand = null } = {}) {
  let t = quand == null ? Date.now() : Number(quand);
  horlogePrises = () => t;
  PRI_CFG_ = null;
  HISTOIRES_PRISES.clear();
  PRISES_GESTES.length = 0;
  PRISES_JOURNAL.length = 0;
  const states = etatsInitiaux();
  return {
    states,
    avancer: (ms) => { t += Number(ms) || 0; },
    index: () => indexDemo(states),
    etat: () => prisesDemo(),
    statistiques: (msg) => statistiquesDemo(msg),
    logbook: (msg) => logbookPrisesDemo(msg, states),
    ecrire: (patch) => ({ config: prisesPatch(patch), etat: prisesDemo() }),
  };
}

/* ── Les lumières de la démo (chantier Lumières, § 9) ─────────────────────────
 *
 * Les six lampes de sa maquette « Cartes lumières », à toute heure :
 *  - le Plafonnier Bureau, un variateur, allumé à 18:05 à l'interrupteur, à 100 % ;
 *  - l'Ampoule Chambre, en blanc réglable : 45 %, 2 700 K, allumée à 20:10 depuis
 *    Loggia, un minuteur jusqu'à 21:10 ;
 *  - le Plafonnier Chambre, éteint à 07:50 — son dernier niveau, 80 % ;
 *  - la Veilleuse Chambre Lino, en couleur : violet (275°), 15 %, allumée à 20:30
 *    par l'automatisation « Coucher de Lino » — la veilleuse de la règle Nuit ;
 *  - le Plafonnier Cuisine, éteint ;
 *  - l'Applique Extérieur, tout ou rien — un switch déclaré lumière, comme chez
 *    lui —, allumée à 20:24 par l'automatisation « Coucher du soleil ».
 * Leurs journées sont celles de la maquette, vue à 20:40 ; à toute autre heure, la
 * démo les décale TOUTES d'autant, ses 20:40 à l'heure de la démo : la même
 * scène, le minuteur de l'ampoule compris — la nuit, une lampe allumée « depuis
 * hier ». (Gardées à leurs heures après 20:40, le minuteur aurait éteint
 * l'ampoule à 21:10, et la scène se serait défaite.) L'histoire d'aujourd'hui est fixée à
 * la première lecture du jour (`HISTOIRES_LUMIERES`, la leçon de la démo des
 * prises) : une démo restée ouverte ne la refait pas. Le salon, l'entrée et la
 * salle de bain gardent leurs lampes : la pièce du salon, l'interrupteur sans fil
 * et la règle Nuit s'en servent.
 * Le faux serveur répond au carnet (`loggia/lumieres/etat`,
 * `loggia/lumieres/journal`, § 6.2) d'après cette histoire et les gestes de la
 * session ; il applique la luminosité, le blanc et la couleur
 * (`gesteLumiereDemo`), et son minuteur éteint aussi les lumières.
 * `maisonLumieresDemo` l'expose à tests/demo_lumieres.test.mjs, son horloge réglée. */
const LUMIERES_DEMO = ['light.bureau', 'light.ampoule_chambre', 'light.chambre', 'light.veilleuse_chambre_lino', 'light.cuisine', 'switch.applique_exterieur'];
/* Une lumière de la démo, celles du salon, de l'entrée et de la salle de bain comprises. */
const lampeDemo = (id) => String(id).indexOf('light.') === 0 || LUMIERES_DEMO.includes(id);
/* Leur pièce : les trois plafonniers sont déjà dans la leur ; l'applique, faute de jardin, à l'entrée. */
const PIECES_LUMIERES_DEMO = { 'light.ampoule_chambre': 'chambre', 'light.veilleuse_chambre_lino': 'chambre', 'switch.applique_exterieur': 'entree' };
/* Ce que chaque lampe sait faire : ses modes, les bornes de son blanc, et la couleur qu'elle a allumée. */
const LAMPES_DEMO = {
  'light.bureau': { modes: ['brightness'], allumee: { color_mode: 'brightness' } },
  'light.ampoule_chambre': { modes: ['color_temp'], min: 2200, max: 6500, allumee: { color_mode: 'color_temp', color_temp_kelvin: 2700 } },
  'light.chambre': { modes: ['brightness'], allumee: { color_mode: 'brightness' } },
  'light.veilleuse_chambre_lino': { modes: ['color_temp', 'xy'], min: 2000, max: 6535, allumee: { color_mode: 'xy', hs_color: [275, 100], rgb_color: [149, 0, 255] } },
  'light.cuisine': { modes: ['brightness'], allumee: { color_mode: 'brightness' } },
  'switch.applique_exterieur': { modes: null, allumee: {} },
};
const nomLampeDemo = (id) => ({
  'light.bureau': etiquette('Plafonnier') + ' ' + lieu('Bureau'), 'light.ampoule_chambre': etiquette('Ampoule') + ' ' + lieu('Chambre'),
  'light.chambre': etiquette('Plafonnier') + ' ' + lieu('Chambre'), 'light.veilleuse_chambre_lino': etiquette('Veilleuse') + ' ' + lieu('Chambre') + ' Lino',
  'light.cuisine': etiquette('Plafonnier') + ' ' + lieu('Cuisine'), 'switch.applique_exterieur': etiquette('Applique Extérieur'),
})[id];
/* La journée de chaque lampe, celle de sa maquette : [heure, état, luminosité, qui, automatisation]. `qui` :
 * `inter`, l'interrupteur mural (aucun contexte) ; `loggia`, le compte de la démo ; `auto`, une automatisation. */
const JOURNEES_LUMIERES = {
  'light.bureau': [['08:55', 'on', 100, 'inter'], ['12:10', 'off', null, 'inter'], ['18:05', 'on', 100, 'inter']],
  'light.ampoule_chambre': [['07:05', 'on', 30, 'auto', 'Réveil'], ['07:40', 'off', null, 'loggia'], ['20:10', 'on', 45, 'loggia']],
  'light.chambre': [['07:20', 'on', 80, 'inter'], ['07:50', 'off', null, 'inter']],
  /* La veilleuse : allumée à la main au réveil de Lino, éteinte par la règle Nuit une heure plus tard en un fondu de 5 min —
   * ses paliers et son extinction arrivent sans contexte, après la ligne de Loggia (§ 8) —, rallumée au coucher. */
  'light.veilleuse_chambre_lino': [['05:50', 'on', 15, 'inter'], ['06:51', 'on', 9, 'inter'], ['06:53', 'on', 4, 'inter'], ['06:55', 'off', null, 'inter'],
    ['20:30', 'on', 15, 'auto', 'Coucher de Lino']],
  'light.cuisine': [['07:15', 'on', 100, 'inter'], ['08:20', 'off', null, 'inter'], ['19:05', 'on', 100, 'inter'], ['20:20', 'off', null, 'inter']],
  'switch.applique_exterieur': [['20:24', 'on', null, 'auto', 'Coucher du soleil']],
};
// Le minuteur de l'ampoule : posé depuis Loggia quelques secondes après l'avoir allumée, pour une heure.
const MINUTEUR_LUMIERE_DEMO = { id: 'light.ampoule_chambre', heure: [20, 10], minutes: 60 };
// La ligne de la règle Nuit qui éteint la veilleuse, une heure après son allumage à la main (§ 8).
const VEILLEUSE_ETEINTE_DEMO = [6, 50];

/* L'horloge des lumières : celle du navigateur ; `maisonLumieresDemo` la règle. */
let horlogeLumieres = () => Date.now();
const HISTOIRES_LUMIERES = new Map();
/* Ce que la session ajoute : les gestes sur une lampe, au carnet (§ 6.2), avec leur réglage. */
const LUMIERES_GESTES = [];
/* `niveau_a` du serveur (lumieres_calcul.py) : l'instant où le niveau d'une lampe a été noté pour la dernière fois, en secondes —
 * son allumage, ou son dernier réglage. Un réglage qui le suit à moins de 30 s se fond dans la note ; une extinction l'efface. */
const NIVEAUX_LUMIERES = new Map();
const FONDRE_S = 30;

/** La journée d'aujourd'hui : celle de sa maquette, décalée tout entière pour que ses 20:40 soient `t`. */
function histoireLumieres(t) {
  const decalage = t - aJour(t, 0, 20, 40);
  const quand = ([h, m]) => (aJour(t, 0, h, m) + decalage) / 1000;
  const evenements = [];
  for (const id of LUMIERES_DEMO) {
    // La note d'avant la fenêtre (le contrat du plan 1) : éteinte l'avant-veille à 23:00 — l'état de la lampe quand la fenêtre s'ouvre.
    evenements.push({ when: aJour(t, -2, 23, 0) / 1000, entity_id: id, state: 'off', bri: null, reglage: false, context_user_id: null });
    let avant = 'off';
    for (const [hm, state, bri, qui, auto] of JOURNEES_LUMIERES[id]) {
      const contexte = qui === 'loggia' ? { context_user_id: 'demo' }
        : qui === 'auto' ? { context_user_id: null, context_event_type: 'automation_triggered', context_name: etiquette(auto) } : { context_user_id: null };
      // Allumée, puis allumée encore : un réglage de niveau seul (les paliers du fondu de la veilleuse).
      evenements.push({ when: quand(hm.split(':').map(Number)), entity_id: id, state, bri, reglage: state === 'on' && avant === 'on', ...contexte });
      avant = state;
    }
  }
  const pose = quand(MINUTEUR_LUMIERE_DEMO.heure) + 5;
  return { evenements: evenements.sort((a, b) => a.when - b.when), minuteur: { id: MINUTEUR_LUMIERE_DEMO.id, pose, fin: pose - 5 + MINUTEUR_LUMIERE_DEMO.minutes * 60 },
    veilleuse: quand(VEILLEUSE_ETEINTE_DEMO) };
}
/** L'histoire d'aujourd'hui, fixée à la première lecture du jour. */
function histoireLumieresAujourdhui() {
  const t = horlogeLumieres();
  const jour = aJour(t, 0, 0, 0);
  if (!HISTOIRES_LUMIERES.has(jour)) HISTOIRES_LUMIERES.set(jour, histoireLumieres(t));
  return HISTOIRES_LUMIERES.get(jour);
}

/* Les attributs d'une lampe allumée à `bri` %, dans le réglage `r` ; éteinte, Home Assistant les efface. */
const ETEINTE_DEMO = { brightness: null, color_mode: null, color_temp_kelvin: null, hs_color: null, rgb_color: null };
const allumeeDemo = (bri, r) => ({ brightness: bri == null ? null : Math.round(bri * 255 / 100), color_temp_kelvin: null, hs_color: null, rgb_color: null, ...r });
const capacitesDemo = (id) => {
  const l = LAMPES_DEMO[id];
  return !l || !l.modes ? {} : { supported_color_modes: l.modes, ...(l.min ? { min_color_temp_kelvin: l.min, max_color_temp_kelvin: l.max } : {}) };
};

/** Les états des six lampes, à l'horloge des lumières : la dernière ligne de leur journée, `last_changed` compris. */
function etatsLumieresDemo() {
  const t = horlogeLumieres();
  const H = histoireLumieresAujourdhui();
  const out = {};
  for (const id of LUMIERES_DEMO) {
    const e = H.evenements.filter(x => x.entity_id === id && x.when * 1000 <= t).pop();
    const on = !!e && e.state === 'on';
    const iso = new Date(e ? e.when * 1000 : aJour(t, -1, 23, 0)).toISOString();
    const attributs = id.indexOf('light.') === 0 ? { ...capacitesDemo(id), ...(on ? allumeeDemo(e.bri, LAMPES_DEMO[id].allumee) : ETEINTE_DEMO) } : {};
    out[id] = { ...s(on ? 'on' : 'off', { friendly_name: nomLampeDemo(id), ...attributs }), last_changed: iso, last_updated: iso };
  }
  return out;
}

/* Une couleur `hs` vue par Home Assistant : la teinte et la saturation, à pleine valeur (`color_hs_to_RGB`). */
function rgbDeHsDemo([h, sat]) {
  const c = Math.max(0, Math.min(100, Number(sat) || 0)) / 100, x = c * (1 - Math.abs(((((Number(h) || 0) % 360) + 360) % 360 / 60) % 2 - 1));
  const secteur = Math.floor(((((Number(h) || 0) % 360) + 360) % 360) / 60);
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][secteur];
  return [r, g, b].map(v => Math.round((v + 1 - c) * 255));
}

/* La couleur qu'une lampe reprend en se rallumant : celle que le carnet garde (`memoire`), sinon celle de sa journée. */
function couleurReprise(id, memoire) {
  const m = memoire || {};
  if (m.mode === 'color_temp' && m.kelvin) return { color_mode: 'color_temp', color_temp_kelvin: m.kelvin };
  if (Array.isArray(m.hs) && m.mode) return { color_mode: m.mode, hs_color: m.hs, rgb_color: rgbDeHsDemo(m.hs) };
  if (m.mode) return { color_mode: m.mode };
  return { ...(LAMPES_DEMO[id] ? LAMPES_DEMO[id].allumee : {}) };
}

/**
 * Ce que fait un service sur une lampe de la démo, comme Home Assistant :
 * `turn_on` allume, et pose ce qu'on lui donne — `brightness_pct` (ou un pas,
 * `brightness_step_pct`), `color_temp_kelvin` (borné à l'ampoule), `hs_color`
 * (sa couleur en `rgb_color`) ; sans rien, une lampe éteinte reprend son
 * dernier réglage (`memoire`, `{ bri, mode, kelvin, hs }` : « se rallumera à
 * 80 % »). `turn_off` éteint et efface ces attributs ; `toggle` bascule. Une
 * lampe muette ne répond pas. Rend le nouvel état `{ state, attributes }`, ou
 * null quand le service n'y change rien.
 */
export function appliquerLumiereDemo(cur, id, service, data = {}, memoire = null) {
  if (!cur || cur.state === 'unavailable') return null;
  const a = cur.attributes || {};
  const allumer = service === 'turn_on' || (service === 'toggle' && cur.state !== 'on');
  if (!allumer) return service === 'turn_off' || service === 'toggle' ? { state: 'off', attributes: id.indexOf('light.') === 0 ? { ...a, ...ETEINTE_DEMO, ...effetDemo(a, cur, null, false) } : a } : null;
  if (id.indexOf('light.') !== 0) return { state: 'on', attributes: a };
  const modes = Array.isArray(a.supported_color_modes) ? a.supported_color_modes : [];
  const avant = cur.state === 'on' && a.brightness != null ? a.brightness : memoire && memoire.bri ? Math.round(memoire.bri * 255 / 100) : 255;
  let brightness = data.brightness_pct != null ? Math.round(Math.max(1, Math.min(100, Number(data.brightness_pct))) * 255 / 100)
    : data.brightness_step_pct != null ? Math.round(Math.max(1, Math.min(100, avant / 2.55 + Number(data.brightness_step_pct))) * 2.55) : avant;
  if (!modes.some(m => m !== 'onoff')) brightness = null;
  let couleur = cur.state === 'on' ? { color_mode: a.color_mode, color_temp_kelvin: a.color_temp_kelvin, hs_color: a.hs_color, rgb_color: a.rgb_color }
    : couleurReprise(id, memoire);
  if (data.color_temp_kelvin != null && modes.includes('color_temp')) {
    const k = Math.round(Math.max(Number(a.min_color_temp_kelvin) || 2000, Math.min(Number(a.max_color_temp_kelvin) || 6535, Number(data.color_temp_kelvin))));
    couleur = { color_mode: 'color_temp', color_temp_kelvin: k, hs_color: null, rgb_color: null };
  } else if (Array.isArray(data.hs_color) && modes.some(m => ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].includes(m))) {
    const hs = [Number(data.hs_color[0]) || 0, Number(data.hs_color[1]) || 0];
    couleur = { color_mode: modes.includes('hs') ? 'hs' : modes.includes('xy') ? 'xy' : 'rgb', color_temp_kelvin: null, hs_color: hs, rgb_color: rgbDeHsDemo(hs) };
  }
  if (!couleur.color_mode) couleur = { color_mode: modes.includes('brightness') ? 'brightness' : modes[0] || 'onoff' };
  return { state: 'on', attributes: { ...a, ...allumeeDemo(brightness == null ? null : brightness * 100 / 255, couleur), ...effetDemo(a, cur, data, true) } };
}

/* L'effet d'une lampe qui en publie (`effect_list`), comme Home Assistant le tient (retouches du 19/10, R4) : rien pour une lampe
 * sans liste ; éteinte (`data` vide, `turn_off`), effacé ; `turn_on` avec un `effect` de la liste le pose, un nom hors liste est
 * ignoré ; allumée, un réglage garde l'effet en cours ; rallumée sans rien dire, « aucun » (le nom que la liste lui donne). */
function effetDemo(a, cur, data, allume) {
  const liste = Array.isArray(a.effect_list) ? a.effect_list : null;
  if (!liste) return {};
  if (!allume) return { effect: null };
  const d = data || {};
  if (typeof d.effect === 'string' && liste.includes(d.effect)) return { effect: d.effect };
  if (cur.state === 'on' && a.effect) return { effect: a.effect };
  return { effect: liste.find(e => ['off', 'none', 'stop_effect'].includes(String(e).toLowerCase())) || null };
}

/* Le réglage qu'une lampe allumée garde au carnet (§ 6.2) : sa luminosité, son mode, son blanc ou sa couleur. */
const reglageCarnetDemo = (a) => ({ bri: a.brightness == null ? null : Math.max(1, Math.round(a.brightness / 2.55)), mode: a.color_mode || null,
  kelvin: a.color_mode === 'color_temp' ? a.color_temp_kelvin : null, hs: Array.isArray(a.hs_color) && a.color_mode !== 'color_temp' ? a.hs_color : null });

/**
 * Un geste sur une lampe de la démo : le service appliqué (`appliquerLumiereDemo`),
 * l'état écrit — `last_changed` ne bouge que si l'état change, comme dans Home
 * Assistant —, et le carnet qui le note, comme `noter` du serveur : un allumage,
 * une extinction, ou un réglage de niveau seul (`reglage`). Un réglage à moins de
 * 30 s du dernier niveau noté — l'allumage ou le réglage d'avant — se fond dans SA
 * note, à la dernière valeur : « Allumée à 60 % » (et non « Réglée à »), ou « Réglée
 * à 40 % » ; la note garde l'heure du PREMIER changement, et chaque pas prolonge les
 * 30 s. Seulement chez le même auteur, ou sans auteur (l'écho de l'ampoule) ; une
 * couleur seule n'est pas une note. `utilisateur` : le compte de la démo, ou null
 * (le minuteur du serveur). Rend vrai si quelque chose a changé.
 */
export function gesteLumiereDemo(states, id, service, data = {}, { utilisateur = 'demo', maintenant = Date.now() } = {}) {
  const cur = states[id];
  /* Une lampe sans histoire (le salon, l'entrée…), vue allumée et que le carnet n'a jamais notée : son réglage courant s'y
   * inscrit AVANT le premier geste, à l'heure où elle s'est allumée — la ligne que son journal lui prêtait déjà. Sans lui,
   * éteinte elle perdait son repère gris (`dernier: null`), et rallumée elle revenait à 100 % en `color_temp` sans kelvin, en or. */
  if (cur && cur.state === 'on' && !dernierCarnetDemo(id)) {
    const vu = reglageCarnetDemo(cur.attributes || {});
    const depuis = Math.min(Date.parse(cur.last_changed) || maintenant, maintenant) / 1000;
    LUMIERES_GESTES.push({ when: depuis, entity_id: id, state: 'on', bri: vu.bri, reglage: false, context_user_id: null, reglageLampe: vu });
    NIVEAUX_LUMIERES.set(id, depuis);
  }
  const suite = appliquerLumiereDemo(cur, id, service, data, dernierCarnetDemo(id));
  if (!suite) return false;
  const iso = new Date(maintenant).toISOString();
  const t = maintenant / 1000;
  states[id] = { ...cur, state: suite.state, attributes: suite.attributes, last_updated: iso, last_changed: suite.state !== cur.state ? iso : cur.last_changed };
  minuteurSiEteint(id, suite.state);
  const r = suite.state === 'on' ? reglageCarnetDemo(suite.attributes) : null;
  if (suite.state !== cur.state) {
    LUMIERES_GESTES.push({ when: t, entity_id: id, state: suite.state, bri: r ? r.bri : null, reglage: false, context_user_id: utilisateur, reglageLampe: r });
    // Le niveau est noté à l'allumage ; une extinction l'efface (`niveau_a`).
    if (r) NIVEAUX_LUMIERES.set(id, t); else NIVEAUX_LUMIERES.delete(id);
  } else if (r && r.bri !== reglageCarnetDemo(cur.attributes || {}).bri) {
    /* Un réglage se fond dans la DERNIÈRE NOTE de la lampe, qu'elle soit son allumage ou un réglage — « Allumée à 60 % » —, à
     * moins de 30 s du dernier niveau noté, chez le même auteur ou sans auteur : comme chez le serveur. La note garde son heure (celle
     * du premier changement) et son auteur ; le niveau est noté à chaque pas, et prolonge les 30 s. La note silencieuse d'une couleur
     * ou d'un blanc, qui garde le dernier réglage sans faire de ligne, n'est pas une note : elle ne compte pas, et ne reporte pas les
     * 30 s (« Réglée à 70 % » ne paraissait jamais quand elle avalait le réglage). `maj` : l'instant où la note a eu son dernier mot,
     * pour que `dernierCarnetDemo` ne prenne pas, derrière elle, une couleur seule plus récente que son heure. */
    const avant = LUMIERES_GESTES.filter(x => x.entity_id === id && !x.silencieux).pop();
    const niveauA = NIVEAUX_LUMIERES.get(id);
    const memeAuteur = utilisateur == null || (avant && (avant.context_user_id || null) === utilisateur && !avant.context_event_type && !avant.context_name);
    if (avant && avant.state === 'on' && niveauA != null && t - niveauA < FONDRE_S && memeAuteur) Object.assign(avant, { bri: r.bri, reglageLampe: r, maj: t });
    else LUMIERES_GESTES.push({ when: t, entity_id: id, state: 'on', bri: r.bri, reglage: true, context_user_id: utilisateur, reglageLampe: r });
    NIVEAUX_LUMIERES.set(id, t);
  } else if (r) {
    // Le blanc ou la couleur seuls : rien au journal, le dernier réglage le garde.
    LUMIERES_GESTES.push({ when: maintenant / 1000, entity_id: id, state: 'on', bri: r.bri, reglage: true, silencieux: true, context_user_id: utilisateur, reglageLampe: r });
  }
  return true;
}

/**
 * Ce que le carnet sait d'une lampe depuis la veille à 00:00 — son histoire, puis les gestes de la
 * session, dans l'ordre du temps —, précédé de sa dernière note d'AVANT : l'état de la lampe quand
 * la fenêtre s'ouvre (le contrat du plan 1). L'écran ne l'affiche pas, il s'en sert.
 */
function carnetLumiereDemo(id) {
  const t = horlogeLumieres();
  const depuis = aJour(t, -1, 0, 0) / 1000;
  const siens = [...histoireLumieresAujourdhui().evenements, ...LUMIERES_GESTES].filter(e => e.entity_id === id && e.when * 1000 <= t)
    .sort((a, b) => a.when - b.when);
  const avant = siens.filter(e => e.when < depuis).pop();
  return [...(avant ? [avant] : []), ...siens.filter(e => e.when >= depuis)];
}

/**
 * `loggia/lumieres/journal` (§ 6.2) : les allumages, extinctions et réglages d'une lampe, contextes
 * compris. Une lampe sans histoire ni geste (le salon, l'entrée…) : allumée, le carnet l'a vue
 * s'allumer à l'heure de son état — sa fiche ne dit pas « Rien depuis minuit » sous une lampe allumée.
 */
function journalLumiereDemo(msg, states = {}) {
  const id = msg && msg.entity_id;
  if (typeof id !== 'string' || !id) return Promise.reject({ code: 'invalid_format', message: 'entity_id' });
  let evenements = carnetLumiereDemo(id).filter(e => !e.silencieux).map(e => ({ when: e.when, state: e.state, bri: e.bri, reglage: !!e.reglage,
    context_user_id: e.context_user_id || null, context_event_type: e.context_event_type || null, context_name: e.context_name || null }));
  const st = states[id];
  if (!evenements.length && !LUMIERES_DEMO.includes(id) && st && st.state === 'on' && st.last_changed) {
    const b = st.attributes && st.attributes.brightness;
    evenements = [{ when: Date.parse(st.last_changed) / 1000, state: 'on', bri: b == null ? null : Math.max(1, Math.round(b / 2.55)), reglage: false,
      context_user_id: null, context_event_type: null, context_name: null }];
  }
  return Promise.resolve({ evenements });
}

/** Le dernier réglage d'une lampe que le carnet garde — celui de son dernier allumage ou réglage : `{ bri, mode, kelvin, hs }`, ou null. */
function dernierCarnetDemo(id) {
  // La note qui a eu le DERNIER mot : un réglage fondu dans une note plus ancienne (`maj`) passe devant une couleur seule posée entre-temps.
  const e = carnetLumiereDemo(id).filter(x => x.state === 'on').reduce((a, x) => (!a || (x.maj != null ? x.maj : x.when) >= (a.maj != null ? a.maj : a.when) ? x : a), null);
  if (!e) return null;
  if (e.reglageLampe) return e.reglageLampe;
  const lampe = LAMPES_DEMO[id];
  return lampe ? { ...reglageCarnetDemo(allumeeDemo(e.bri, lampe.allumee)), bri: e.bri } : null;
}

/** `loggia/lumieres/etat` (§ 6.2) : le dernier niveau de chaque lampe suivie ; une lampe sans histoire, celui de son état si elle est allumée. */
function lumieresDemo(states) {
  const t = horlogeLumieres();
  const lumieres = {};
  for (const id of Object.keys(states)) {
    if (id.indexOf('light.') !== 0 && !LUMIERES_DEMO.includes(id)) continue;
    // Chaque lampe suivie ; `dernier` reste null tant qu'elle n'a jamais été vue allumée (le contrat du plan 1).
    lumieres[id] = { dernier: dernierCarnetDemo(id) || (states[id].state === 'on' ? reglageCarnetDemo(states[id].attributes || {}) : null) };
  }
  // Des secondes, un nombre : le format du contrat, qui n'est pas celui de `loggia/prises/etat`.
  return { maintenant: t / 1000, lumieres };
}

/* La pose du minuteur de l'ampoule, au journal de Loggia, comme le serveur l'écrit (chantier Prises, § 6.3). */
function journalLumieresDemo() {
  const m = histoireLumieresAujourdhui().minuteur;
  if (m.pose * 1000 > horlogeLumieres()) return [];
  return [ligneJournal({ module: 'minuteurs', regle: 'minuteur', quoi: 'poser', cibles: [m.id], n: 1, motif: [['{n} min', { n: MINUTEUR_LUMIERE_DEMO.minutes }]], detail: '', simule: false, ts: m.pose })];
}

/**
 * La maison de la démo, son horloge des lumières réglée, pour
 * tests/demo_lumieres.test.mjs : les états, l'index, le carnet, la règle Nuit,
 * le journal de Loggia, et un geste (`geste(id, service, data)`) — une histoire
 * neuve à chaque appel, fixée aussitôt ; `avancer(ms)` fait passer le temps SANS
 * la refaire, comme une démo restée ouverte.
 */
export function maisonLumieresDemo({ quand = null } = {}) {
  let t = quand == null ? Date.now() : Number(quand);
  horlogeLumieres = () => t;
  HISTOIRES_LUMIERES.clear();
  LUMIERES_GESTES.length = 0;
  NIVEAUX_LUMIERES.clear();
  for (const k of Object.keys(MIN_DEMO)) delete MIN_DEMO[k];
  const states = etatsInitiaux();
  return {
    states,
    avancer: (ms) => { t += Number(ms) || 0; },
    index: () => indexDemo(states),
    etat: () => lumieresDemo(states),
    journal: (id) => journalLumiereDemo({ entity_id: id }, states),
    minuteur: () => ({ ...histoireLumieresAujourdhui().minuteur }),
    // Les minuteurs d'extinction que lit `loggia/minuteurs/etat` (à l'heure du navigateur, comme la démo) : `{ <id>: { fin, duree } }`, et la pose d'un minuteur.
    minuteurs: () => minuteursDemo().minuteurs,
    poserMinuteur: (id, minutes) => minuteursPoser(id, minutes).minuteurs,
    nuit: () => nuitDemo().config,
    regles: () => reglesDemo(states).journal,
    // Les scénarios de la maison, tels que `loggia/scenarios/etat` les rend : leur résumé compte les cibles (`scnCibles`).
    scenarios: () => scenariosDemo(states).scenarios,
    // Les cibles d'une action de scénario (`scnCibles`), et le lancement d'un scénario, comme `loggia/scenarios/lancer`.
    cibles: (a) => scnCibles(a, states, null),
    lancerScenario: (id) => scenariosLancer(id, states),
    geste: (id, service, data = {}) => gesteLumiereDemo(states, id, service, data, { maintenant: t }),
  };
}

/* Fenetre ouverte, chauffage coupe : la regle armee sur une piece, pour que la
 * page se montre remplie plutot que vide. */
/* Paresseux pour la meme raison que `SCN_CFG()` : la piece est ici une CLE. */
let FEN_CFG_ = null;
const FEN_CFG = () => (FEN_CFG_ || (FEN_CFG_ = {
  actif: true, delai: 3, reprise: 0,
  pieces: { [lieu('Chambre')]: { actif: true, ouvrants: ['binary_sensor.fenetre_chambre'], chauffages: ['switch.radiateur_chambre'] } },
}));

function fenetresDemo() {
  return {
    config: FEN_CFG(),
    coupes: {},
    en_attente: [],
    journal: [{ module: 'fenetres', regle: 'fenetre', quoi: 'rendre', cibles: ['switch.radiateur_chambre'], n: 1, motif: lieu('Chambre'), detail: '', simule: false, ts: Date.now() / 1000 - 5400 }],
  };
}

function fenetresPatch(patch) {
  Object.keys(patch || {}).forEach(k => {
    if (k === 'pieces') {
      Object.keys(patch.pieces || {}).forEach(nom => {
        if (patch.pieces[nom] === null) delete FEN_CFG().pieces[nom];
        else FEN_CFG().pieces[nom] = { ...(FEN_CFG().pieces[nom] || {}), ...patch.pieces[nom] };
      });
    } else FEN_CFG()[k] = patch[k];
  });
  return FEN_CFG();
}

/* Le Superviseur de la demonstration (vue Systeme, ADR 0037) : une machine, six
 * modules complementaires dont un arrete, une sauvegarde de la nuit. Les
 * modules se demarrent et s'arretent pour de vrai — la bascule doit repondre. */
const MODULES_DEMO = [
  { slug: 'demo_zigbee2mqtt', name: 'Zigbee2MQTT', version: '2.1.3', version_latest: '2.1.3', update_available: false, state: 'started', icon: false },
  { slug: 'demo_mosquitto', name: 'Mosquitto broker', version: '6.5.1', version_latest: '6.5.1', update_available: false, state: 'started', icon: false },
  { slug: 'demo_esphome', name: 'ESPHome', version: '2026.3.1', version_latest: '2026.3.2', update_available: true, state: 'started', icon: false },
  { slug: 'demo_mariadb', name: 'MariaDB', version: '2.7.2', version_latest: '2.7.2', update_available: false, state: 'started', icon: false },
  { slug: 'demo_samba', name: 'Samba share', version: '12.5.0', version_latest: '12.5.0', update_available: false, state: 'started', icon: false },
  { slug: 'demo_vscode', name: 'Studio Code Server', version: '5.19.0', version_latest: '5.19.0', update_available: false, state: 'stopped', icon: false },
];
const MESURES_MODULES_DEMO = {
  demo_zigbee2mqtt: [5.2, 412], demo_mosquitto: [0.4, 38], demo_esphome: [1.8, 264], demo_mariadb: [3.1, 356], demo_samba: [0.2, 24], demo_vscode: [2.4, 310],
};

function superviseurDemo(msg) {
  const chemin = String(msg.endpoint || '');
  const geste = chemin.match(/^\/addons\/([^/]+)\/(start|stop)$/);
  if (geste && msg.method === 'post') {
    const m = MODULES_DEMO.find(x => x.slug === geste[1]);
    if (m) m.state = geste[2] === 'start' ? 'started' : 'stopped';
    return Promise.resolve({});
  }
  const mesures = chemin.match(/^\/addons\/([^/]+)\/stats$/);
  if (mesures) {
    const [cpu, mio] = MESURES_MODULES_DEMO[mesures[1]] || [0, 0];
    const total = 8192 * 1048576;
    return Promise.resolve({ cpu_percent: cpu, memory_usage: mio * 1048576, memory_limit: total, memory_percent: Math.round(mio * 1048576 / total * 1000) / 10 });
  }
  const nuit = new Date(); nuit.setHours(3, 0, 0, 0);
  if (nuit > new Date()) nuit.setDate(nuit.getDate() - 1);
  const reponses = {
    '/host/info': { hostname: 'homeassistant', operating_system: 'Home Assistant OS 16.2', chassis: 'embedded', disk_total: 128.0, disk_used: 58.4, disk_free: 69.6,
      boot_timestamp: (Date.now() - (12 * 24 + 6) * 3600000) * 1000 },
    '/os/info': { version: '16.2', version_latest: '16.2', update_available: false, board: 'rpi5-64' },
    '/core/info': { version: '2026.3.4', version_latest: '2026.4.0', update_available: true },
    '/supervisor/info': { version: '2026.03.2', version_latest: '2026.03.2', update_available: false },
    '/addons': { addons: MODULES_DEMO.map(m => ({ ...m })) },
    '/backups': { backups: [
      { slug: 'demo1', name: etiquette('Sauvegarde automatique'), date: nuit.toISOString(), type: 'full', size: 1945.6 },
      { slug: 'demo0', name: etiquette('Avant mise à jour'), date: new Date(nuit.getTime() - 5 * 86400000).toISOString(), type: 'partial', size: 412.3 },
    ] },
    '/network/info': { interfaces: [{ interface: 'eth0', type: 'ethernet', enabled: true, connected: true, primary: true, ipv4: { method: 'auto', address: ['192.0.2.20/24'], gateway: '192.0.2.1' } }] },
  };
  return reponses[chemin] ? Promise.resolve(reponses[chemin]) : Promise.reject(new Error('démonstration : point du Superviseur inconnu'));
}

/* Le journal d'erreurs de Home Assistant, et le logbook des mises a jour : de
 * quoi montrer les trois niveaux du journal de la vue Systeme.
 * Relecture du 03/10 : messages en ANGLAIS, dans toutes les langues de la démo.
 * Home Assistant écrit ainsi son journal, quelle que soit la langue de l'écran,
 * et la vue Système affiche `message[0]` tel quel : écrits en français, ils
 * passaient sous des titres anglais (mqtt, rest, zha…), même en polonais. Pas
 * d'etiquette() : une vraie installation ne les traduit pas. */
function erreursDemo() {
  const ilYA = (min) => (Date.now() - min * 60000) / 1000;
  return [
    { name: 'homeassistant.components.mqtt.client', message: ['Disconnected from MQTT server core-mosquitto:1883, reconnecting in 10 seconds'], level: 'WARNING', timestamp: ilYA(95), first_occurred: ilYA(95), count: 1, source: ['components/mqtt/client.py', 712], exception: '' },
    { name: 'homeassistant.components.rest.data', message: ['Timeout while fetching data from the remote resource'], level: 'ERROR', timestamp: ilYA(340), first_occurred: ilYA(700), count: 3, source: ['components/rest/data.py', 118], exception: '' },
    // Assez de lignes pour que le journal DEFILE dans sa carte : c'est ce qu'il y a a montrer.
    { name: 'homeassistant.components.zha.core.device', message: ['Device did not respond, retrying'], level: 'WARNING', timestamp: ilYA(180), first_occurred: ilYA(260), count: 4, source: ['components/zha/core/device.py', 301], exception: '' },
    { name: 'homeassistant.components.recorder.util', message: ['Purging the database took 41 seconds'], level: 'WARNING', timestamp: ilYA(505), first_occurred: ilYA(505), count: 1, source: ['components/recorder/util.py', 220], exception: '' },
    { name: 'homeassistant.components.camera', message: ['Stream interrupted, reconnecting'], level: 'WARNING', timestamp: ilYA(640), first_occurred: ilYA(900), count: 6, source: ['components/camera/__init__.py', 512], exception: '' },
    { name: 'homeassistant.helpers.template', message: ["Template returned 'unknown' where a numeric sensor value was expected"], level: 'ERROR', timestamp: ilYA(820), first_occurred: ilYA(820), count: 1, source: ['helpers/template.py', 644], exception: '' },
    { name: 'homeassistant.components.cast.media_player', message: ['Speaker disconnected from the network'], level: 'WARNING', timestamp: ilYA(1010), first_occurred: ilYA(1010), count: 2, source: ['components/cast/media_player.py', 188], exception: '' },
    { name: 'homeassistant.components.websocket_api.http.connection', message: ['Client unable to keep up with pending messages, disconnecting'], level: 'ERROR', timestamp: ilYA(1230), first_occurred: ilYA(1230), count: 1, source: ['components/websocket_api/http.py', 97], exception: '' },
  ];
}

function logbookDemo() {
  const ilYA = (min) => new Date(Date.now() - min * 60000).toISOString();
  return [
    { when: ilYA(610), name: 'ESPHome Update', entity_id: 'update.esphome_update', state: 'on' },
    { when: ilYA(420), name: 'Home Assistant Core Update', entity_id: 'update.home_assistant_core_update', state: 'on' },
  ];
}

/* ── Les mesures de la démo (chantier Capteurs, § 9) ─────────────────────────
 *
 * Celles de sa maquette « Cartes capteurs », à toute heure :
 *  - le CO₂ de la chambre à 1 659 ppm (Confiné), avec un pic à 2 018 la nuit ;
 *  - celui de la chambre de Lino à 1 177 (Moyen) ;
 *  - la température du salon à 21,4 °C, sur un thermomètre qui porte aussi
 *    l'hygromètre et une pile à 81 % ;
 *  - l'humidité de la salle de bain à 68 % (Humide, après la douche) ;
 *  - le bruit du salon à 34 dB ;
 *  - la luminosité du salon à 120 lx, les particules à 8 µg/m³ et l'indice COV à
 *    182 (Moyen) — les familles nouvelles de la table ;
 *  - la station du jardin (C14, C15) : 12,4 °C (Frais) et 81 % d'humidité (Humide),
 *    sur les zones du dehors (C15, révisé le 16/10 : leurs jauges), et un vent de
 *    9 km/h (Calme) — sur un appareil physique (C16), dans le jardin, une pièce du
 *    dehors de la démo depuis le 16/10 (C17 : une mesure n'est jugée que dans une
 *    pièce de Loggia).
 * Chacune a 24 heures de moyennes sur 5 minutes (`statsMesureDemo`), la courbe
 * de sa maquette : des points en heures avant maintenant, reliés en ligne
 * droite, et un aléa stable par tranche — la courbe ne scintille pas d'une
 * lecture à l'autre. Comptée depuis l'heure de la démo, elle finit toujours sur
 * la valeur de la carte. `maisonMesuresDemo` l'expose à
 * tests/demo_mesures.test.mjs, son horloge réglée. */
const COURBES_MESURES_DEMO = {
  'sensor.chambre_co2': [[[-24, 1000], [-22, 420], [-17, 373], [-14, 400], [-11, 900], [-8, 1250], [-5.5, 2018], [-4, 1450], [-1.5, 1420], [0, 1659]], 50, 1],
  'sensor.chambre_lino_co2': [[[-24, 900], [-20, 520], [-14, 480], [-9, 950], [-6, 1300], [-3, 1100], [0, 1177]], 40, 2],
  'sensor.salon_temperature': [[[-24, 22.1], [-18, 20.6], [-14, 20.4], [-9, 21.8], [-5, 23.2], [-2, 22], [0, 21.4]], 0.15, 3],
  'sensor.salle_de_bain_humidite': [[[-24, 55], [-15, 52], [-13.5, 82], [-12, 64], [-3, 58], [-1.2, 85], [0, 68]], 1.5, 4],
  'sensor.salon_bruit': [[[-24, 38], [-22, 32], [-14, 30], [-12, 52], [-8, 58], [-4, 47], [-2, 36], [0, 34]], 3, 5],
  'sensor.salon_luminosite': [[[-24, 140], [-23, 60], [-22.5, 1], [-15, 1], [-14, 180], [-12, 900], [-9, 1400], [-6, 600], [-4, 90], [-3, 40], [-2.5, 150], [0, 120]], 5, 8],
  'sensor.salon_particules': [[[-24, 7], [-20, 5], [-14, 4], [-10, 12], [-9, 30], [-8.5, 34], [-7, 14], [-4, 9], [0, 8]], 1.2, 6],
  'sensor.salon_cov': [[[-24, 110], [-18, 90], [-12, 140], [-10, 260], [-8, 200], [-3, 170], [0, 182]], 8, 7],
  // La station du jardin : la nuit fraîche, l'après-midi doux, le vent qui tombe le soir.
  'sensor.jardin_temperature': [[[-24, 13.1], [-20, 10.2], [-14, 8.1], [-10, 11.5], [-6, 16.8], [-3, 15.2], [0, 12.4]], 0.2, 9],
  'sensor.jardin_humidite': [[[-24, 78], [-18, 88], [-14, 92], [-9, 74], [-5, 58], [-2, 66], [0, 81]], 1.5, 10],
  'sensor.jardin_vent': [[[-24, 6], [-18, 4], [-12, 14], [-8, 22], [-5, 17], [-2, 11], [0, 9]], 2, 11],
  // Le frigo (C17) : 4 °C, la porte ouverte au dîner — « Trop froid » pour toujours, s'il était jugé sur le confort d'une pièce.
  'sensor.capteur_frigo_temperature': [[[-24, 4.1], [-14, 3.8], [-10.5, 6.2], [-9.5, 4.4], [-3.2, 6.8], [-2.5, 4.6], [0, 4.2]], 0.15, 12],
};
// Leur pièce : celles qui n'en avaient pas.
const PIECES_MESURES_DEMO = { 'sensor.chambre_lino_co2': 'chambre', 'sensor.salon_luminosite': 'salon', 'sensor.salon_particules': 'salon', 'sensor.salon_cov': 'salon',
  'sensor.salon_thermometre_pile': 'salon', 'sensor.salle_de_bain_temperature': 'sdb', 'sensor.salle_de_bain_humidite': 'sdb',
  // Le jardin : une zone de Home Assistant, et une pièce du dehors de la configuration (C17, 16/10).
  'sensor.jardin_temperature': 'jardin', 'sensor.jardin_humidite': 'jardin', 'sensor.jardin_vent': 'jardin', 'sensor.qualite_air_exterieur': 'jardin',
  // Les cas de l'audit du 19/10 (point 15) : le monoxyde de la cuisine, les particules muettes du bureau.
  'sensor.cuisine_monoxyde': 'cuisine', 'sensor.bureau_particules': 'bureau' };
/* Les appareils des mesures : le thermomètre du salon, la station du jardin, et — passe 1 ter, 16/10 (C16 : une carte de
 * mesure demande un appareil PHYSIQUE) — le capteur de chaque pièce, comme ses capteurs Netatmo et MQTT : la température,
 * l'humidité et le CO₂ ; le CO₂ de Lino a le sien. Sans eux, les mesures des pièces quittaient Objets › Capteurs. Une pièce
 * montre une carte par APPAREIL : au salon, la luminosité, les particules et les COV gardent chacun le leur, et sa vue les
 * mêmes cartes qu'avant. `[pièce, nom de l'appareil, son modèle, ses mesures]`. */
const APPAREILS_MESURES_DEMO = {
  thermo_salon: ['salon', 'Thermomètre salon', 'Thermomètre', ['sensor.salon_temperature', 'sensor.salon_humidite', 'sensor.salon_thermometre_pile']],
  capteur_salon: ['salon', 'Capteur salon', 'Capteur', ['sensor.salon_co2', 'sensor.salon_bruit']],
  luxmetre_salon: ['salon', 'Luxmètre salon', 'Capteur', ['sensor.salon_luminosite']],
  purificateur_salon: ['salon', 'Purificateur salon', 'Capteur', ['sensor.salon_particules']],
  capteur_cov_salon: ['salon', 'Capteur COV salon', 'Capteur', ['sensor.salon_cov']],
  capteur_cuisine: ['cuisine', 'Capteur cuisine', 'Capteur', ['sensor.cuisine_temperature', 'sensor.cuisine_humidite']],
  capteur_chambre: ['chambre', 'Capteur chambre', 'Capteur', ['sensor.chambre_temperature', 'sensor.chambre_humidite', 'sensor.chambre_co2']],
  capteur_lino: ['chambre', 'Capteur chambre Lino', 'Capteur', ['sensor.chambre_lino_co2']],
  capteur_bureau: ['bureau', 'Capteur bureau', 'Capteur', ['sensor.bureau_temperature', 'sensor.bureau_humidite', 'sensor.bureau_co2']],
  capteur_entree: ['entree', 'Capteur entrée', 'Capteur', ['sensor.entree_temperature']],
  capteur_sdb: ['sdb', 'Capteur salle de bain', 'Capteur', ['sensor.salle_de_bain_temperature', 'sensor.salle_de_bain_humidite']],
  /* Son indice de qualité de l'air (audit du 19/10, M8 : un capteur sans appareil n'entre plus dans Objets) : sur la station, dehors — neutre,
   * la table ne connaît pas d'échelle d'indice qui vaille pour tous. */
  station_jardin: ['jardin', 'Station météo', 'Station météo', ['sensor.jardin_temperature', 'sensor.jardin_humidite', 'sensor.jardin_vent', 'sensor.qualite_air_exterieur']],
  // Un monoxyde en ppm (H10) : 2 ppm, « Bon » ; et un capteur de particules MUET, au bureau — une mesure indisponible dans Air.
  capteur_co_cuisine: ['cuisine', 'Capteur CO cuisine', 'Capteur de monoxyde', ['sensor.cuisine_monoxyde']],
  capteur_air_bureau: ['bureau', 'Capteur d’air bureau', 'Capteur', ['sensor.bureau_particules']],
  // Le frigo (C17, 16/10) : un appareil SANS zone, comme son « Capteur Frigo » — sa carte entre dans Capteurs, neutre.
  capteur_frigo: [null, 'Capteur Frigo', 'Capteur', ['sensor.capteur_frigo_temperature']],
};
const appareilMesureDemo = (id) => Object.keys(APPAREILS_MESURES_DEMO).find(d => APPAREILS_MESURES_DEMO[d][3].includes(id)) || null;

/* L'horloge des mesures : celle du navigateur ; `maisonMesuresDemo` la règle. */
let horlogeMesures = () => Date.now();

/** La valeur d'une mesure de la démo à l'instant `x` : sa courbe, et l'aléa stable de sa tranche de 5 minutes. */
function valeurMesureDemo(id, x) {
  const [pts, bruit, graine] = COURBES_MESURES_DEMO[id];
  const h = (x - horlogeMesures()) / 3600000;
  let j = 0;
  while (j < pts.length - 2 && pts[j + 1][0] < h) j++;
  const [a, va] = pts[j], [b, vb] = pts[j + 1];
  const f = Math.max(0, Math.min(1, (h - a) / (b - a)));
  return Math.max(0, va + (vb - va) * f + (hasardStable(Math.floor(x / CINQ_MIN_MS) * 31 + graine) - 0.5) * bruit);
}

/** Les statistiques d'une mesure de la démo, au format de `recorder/statistics_during_period` : des tranches de 5 minutes, jamais celle en cours. */
function statsMesureDemo(id, msg) {
  if (!COURBES_MESURES_DEMO[id]) return null;
  const t0 = Date.parse(msg.start_time);
  const t1 = Math.min(horlogeMesures(), msg.end_time ? Date.parse(msg.end_time) : Infinity);
  if (isNaN(t0)) return [];
  const lignes = [];
  for (let debut = Math.ceil(t0 / CINQ_MIN_MS) * CINQ_MIN_MS; debut + CINQ_MIN_MS <= t1; debut += CINQ_MIN_MS) {
    lignes.push({ start: debut, end: debut + CINQ_MIN_MS, mean: Math.round(valeurMesureDemo(id, debut + CINQ_MIN_MS / 2) * 10) / 10 });
  }
  return lignes;
}

/** Les capteurs nouveaux, et la `state_class` des mesures qui ont des statistiques. */
function etatsMesuresDemo(states) {
  const mesure = (id) => ({ ...states[id], attributes: { ...states[id].attributes, state_class: 'measurement' } });
  return {
    ...Object.fromEntries(['sensor.chambre_co2', 'sensor.salon_temperature', 'sensor.salle_de_bain_humidite', 'sensor.salon_bruit'].map(id => [id, mesure(id)])),
    'sensor.chambre_lino_co2': s(1177, { friendly_name: lieu('Chambre') + ' Lino CO2', unit_of_measurement: 'ppm', device_class: 'carbon_dioxide', state_class: 'measurement' }),
    'sensor.salon_luminosite': s(120, { friendly_name: lieu('Salon') + ' ' + etiquette('luminosité'), unit_of_measurement: 'lx', device_class: 'illuminance', state_class: 'measurement' }),
    'sensor.salon_particules': s(8, { friendly_name: lieu('Salon') + ' ' + etiquette('particules'), unit_of_measurement: 'µg/m³', device_class: 'pm25', state_class: 'measurement' }),
    // Un INDICE, sans unité : celui que la table lit (chantier Capteurs, § 6).
    'sensor.salon_cov': s(182, { friendly_name: lieu('Salon') + ' ' + etiquette('COV'), device_class: 'volatile_organic_compounds', state_class: 'measurement' }),
    'sensor.salon_thermometre_pile': s(81, { friendly_name: etiquette('Thermomètre salon pile'), device_class: 'battery', unit_of_measurement: '%' }),
    /* La station du jardin (C14, C15) : dehors, la température et l'humidité se lisent sur les zones du dehors — 12,4 °C y est
     * « Frais », pas « Trop froid » (C15, révisé le 16/10) —, le vent garde les siennes ; rien n'y est une alerte. */
    'sensor.jardin_temperature': s(12.4, { friendly_name: lieu('Jardin') + ' ' + etiquette('température'), unit_of_measurement: '°C', device_class: 'temperature', state_class: 'measurement' }),
    'sensor.jardin_humidite': s(81, { friendly_name: lieu('Jardin') + ' ' + etiquette('humidité'), unit_of_measurement: '%', device_class: 'humidity', state_class: 'measurement' }),
    'sensor.jardin_vent': s(9, { friendly_name: lieu('Jardin') + ' ' + etiquette('vent'), unit_of_measurement: 'km/h', device_class: 'wind_speed', state_class: 'measurement' }),
    // Le monoxyde de la cuisine (audit du 19/10, H10) : 2 ppm, « Bon » ; et les particules du bureau, muettes — « Indisponible » dans Air.
    'sensor.cuisine_monoxyde': s(2, { friendly_name: lieu('Cuisine') + ' ' + etiquette('monoxyde'), unit_of_measurement: 'ppm', device_class: 'carbon_monoxide', state_class: 'measurement' }),
    'sensor.bureau_particules': s('unavailable', { friendly_name: lieu('Bureau') + ' ' + etiquette('particules'), unit_of_measurement: 'µg/m³', device_class: 'pm25' }),
    // Le frigo (C17, 16/10) : sans zone, sa carte est neutre — le chiffre, la courbe, le dernier signal.
    'sensor.capteur_frigo_temperature': s(4.2, { friendly_name: etiquette('Capteur Frigo'), unit_of_measurement: '°C', device_class: 'temperature', state_class: 'measurement' }),
  };
}

/**
 * La maison de la démo, son horloge des mesures réglée, pour
 * tests/demo_mesures.test.mjs : les états, l'index, les statistiques, et ses
 * pièces de Loggia (C17 : une mesure n'est jugée que dans l'une d'elles).
 */
export function maisonMesuresDemo({ quand = null } = {}) {
  const t = quand == null ? Date.now() : Number(quand);
  horlogeMesures = () => t;
  const states = etatsInitiaux();
  return { states, index: () => indexDemo(states), statistiques: (msg) => statistiquesDemo(msg), pieces: configDemo().loggia_rooms };
}

/* ── Les capteurs binaires, les plantes et les piles de sa maquette « Cartes capteurs » (chantier Capteurs, étapes 2 et 3, § 12) ──
 *
 * Ce que les groupes (Ouvertures, Sécurité, Présence), la carte d'une plante et la carte Piles ont à montrer, à toute heure :
 *  - les six ouvrants, chacun sur son APPAREIL physique (C21) avec sa pile — la porte d'entrée à 9 %, la fenêtre de la chambre à
 *    12 %, les autres au-dessus de 60 % — ; la baie vitrée et la fenêtre de la chambre ouvertes ; la porte d'entrée porte son
 *    sabotage ;
 *  - les deux fumées, le CO et la fuite, sur des appareils ; la fumée de l'entrée est MUETTE depuis 14:05 (C4 se voit) ;
 *  - un radar au bureau, allumé ; le mouvement du salon, vu par le journal il y a 3 minutes ; le mouvement de l'entrée ; le
 *    mouvement de la caméra, sur l'appareil de la caméra (§ 19.3 : les caméras comptent) ;
 *  - MeteoAlarm, éteinte, sans appareil (C28) ; un « Besoin eau » de modèle, sans appareil (C21) : aucune carte ;
 *  - le Dracaena Marginata, découvert (C29) : sol 28 %, 84 lx, 19,5 °C, 784 µS/cm, pile 100 % ; le Schefflera, découvert et muet
 *    depuis samedi 14:05 — ses statistiques portent le dernier relevé, sol 12 %, pile 4 % ; tous deux dans la zone « Technique »,
 *    qui n'est pas une pièce de Loggia ; le Basilic reste configuré (`loggia_plants`), sans appareil ;
 *  - un bouton du salon à 14 % : avec la porte et la fenêtre, « 3 piles à changer » au seuil de la veille des piles, 15 % (C32,
 *    § 19.8) ; la pile du Schefflera est muette ; la batterie de la maison reste celle d'Énergie, la tondeuse en charge est écartée.
 * Les heures suivent l'horloge des capteurs (`maisonCapteursDemo` la règle) : une démo ouverte le matin ramène « 14:05 » une
 * heure avant elle, comme les prises. */
let horlogeCapteurs = () => Date.now();
/** L'heure `h`:`m` d'aujourd'hui, ramenée `recul` minutes avant maintenant quand la démo s'ouvre plus tôt. */
const avantCapteurs = (t, h, m, recul) => Math.min(aJour(t, 0, h, m), t - recul * MINUTE_MS);
/** Samedi dernier à 14:05 — la semaine d'avant si l'on est samedi : toujours dans le passé. */
const samediCapteurs = (t) => aJour(t, -(((new Date(t).getDay() + 1) % 7) || 7), 14, 5);
/* Les appareils : `[zone, nom, modèle, [entités]]`. Les contacts, les détecteurs et le bouton sont Zigbee, derrière le pont ; les plantes en
 * Bluetooth. Les portes du garage et de service n'ont pas de zone : leurs cartes prennent le nom de l'appareil (§ 3). */
const APPAREILS_CAPTEURS_DEMO = {
  contact_porte_entree: ['entree', 'Contact porte entrée', 'Contact de porte', ['binary_sensor.porte_entree', 'sensor.pile_porte_entree', 'binary_sensor.porte_entree_sabotage']],
  contact_baie_vitree: ['salon', 'Contact baie vitrée', 'Contact de porte', ['binary_sensor.baie_vitree', 'sensor.baie_vitree_pile']],
  contact_fenetre_salon: ['salon', 'Contact fenêtre salon', 'Contact de fenêtre', ['binary_sensor.fenetre_salon', 'sensor.fenetre_salon_pile']],
  contact_fenetre_chambre: ['chambre', 'Contact fenêtre chambre', 'Contact de fenêtre', ['binary_sensor.fenetre_chambre', 'sensor.fenetre_chambre_pile']],
  contact_porte_garage: [null, 'Contact porte de garage', 'Contact de porte', ['binary_sensor.porte_garage', 'sensor.porte_garage_pile']],
  contact_porte_service: [null, 'Contact porte de service', 'Contact de porte', ['binary_sensor.porte_service', 'sensor.porte_service_pile']],
  detecteur_fumee_cuisine: ['cuisine', 'Détecteur de fumée cuisine', 'Détecteur de fumée', ['binary_sensor.detecteur_fumee', 'sensor.detecteur_fumee_pile']],
  detecteur_fumee_entree: ['entree', 'Détecteur de fumée entrée', 'Détecteur de fumée', ['binary_sensor.detecteur_fumee_entree', 'sensor.detecteur_fumee_entree_pile']],
  detecteur_co_salon: ['salon', 'Détecteur de monoxyde salon', 'Détecteur de monoxyde', ['binary_sensor.detecteur_co_salon', 'sensor.detecteur_co_salon_pile']],
  detecteur_fuite_evier: ['cuisine', 'Détecteur de fuite évier', 'Détecteur de fuite', ['binary_sensor.fuite_evier']],
  radar_bureau: ['bureau', 'Radar bureau', 'Radar de présence', ['binary_sensor.radar_bureau']],
  mouvement_salon: ['salon', 'Détecteur de mouvement salon', 'Détecteur de mouvement', ['binary_sensor.mouvement_salon', 'sensor.mouvement_salon_pile']],
  mouvement_entree: ['entree', 'Détecteur de mouvement entrée', 'Détecteur de mouvement', ['binary_sensor.mouvement_entree', 'sensor.mouvement_entree_pile']],
  bouton_salon: ['salon', 'Bouton salon', 'Bouton sans fil', ['sensor.bouton_salon_pile']],
  // Un binaire À PART (audit du 19/10, point 15) : la vibration du lave-linge, d'aucun groupe — sa carte, dans Maison.
  vibration_cuisine: ['cuisine', 'Capteur de vibration', 'Capteur de vibration', ['binary_sensor.lave_linge_vibration']],
  plante_dracaena: ['technique', 'Dracaena Marginata', 'Capteur de plante', ['sensor.dracaena_marginata_humidite_du_sol', 'sensor.dracaena_marginata_temperature', 'sensor.dracaena_marginata_lumiere', 'sensor.dracaena_marginata_conductivite', 'sensor.dracaena_marginata_pile']],
  plante_schefflera: ['technique', 'Schefflera', 'Capteur de plante', ['sensor.schefflera_humidite_du_sol', 'sensor.schefflera_temperature', 'sensor.schefflera_lumiere', 'sensor.schefflera_conductivite', 'sensor.schefflera_pile']],
};
const appareilCapteurDemo = (id) => Object.keys(APPAREILS_CAPTEURS_DEMO).find(d => APPAREILS_CAPTEURS_DEMO[d][3].includes(id)) || null;
/** La plateforme et la catégorie d'une entité de ces appareils : Zigbee2MQTT ou Bluetooth, les piles en diagnostic ; sinon celles de la démo. */
const metaCapteurDemo = (id) => { const d = appareilCapteurDemo(id); return d ? { platform: d.indexOf('plante_') === 0 ? 'xiaomi_ble' : 'mqtt', category: /(^sensor\.pile_|_pile$)/.test(id) ? 'diagnostic' : null } : { platform: 'demo', category: null }; };
// Les entités SANS appareil (C21, C28) : un modèle « Besoin eau » et la vigilance MeteoAlarm — l'index dit leur plateforme.
const SANS_APPAREIL_DEMO = { 'binary_sensor.basilic_besoin_eau': 'template', 'binary_sensor.meteoalarm': 'meteoalarm', 'sensor.paris_weather_alert': 'meteo_france' };
// Les binaires dont la démo tient l'histoire du jour : ceux de ces appareils, et le mouvement de la caméra.
const CAPTEURS_DEMO = new Set([...Object.keys(APPAREILS_CAPTEURS_DEMO).flatMap(d => APPAREILS_CAPTEURS_DEMO[d][3]).filter(id => id.indexOf('binary_sensor.') === 0), 'binary_sensor.camera_entree_mouvement']);

/** Les états de ces capteurs, et ce qu'ils changent aux états d'avant : « depuis quand » (`last_changed`) et la fumée muette. */
function etatsCapteursDemo(states) {
  const t = horlogeCapteurs();
  const iso = (ms) => new Date(ms).toISOString();
  const depuis = (etat, ms) => ({ ...etat, last_changed: iso(ms), last_updated: iso(ms) });
  const pile = (nom, n) => s(n, { friendly_name: etiquette(nom) + ' ' + etiquette('pile'), device_class: 'battery', unit_of_measurement: '%' });
  const plante = (nom, quoi, v, classe, unite) => s(v, { friendly_name: etiquette(nom) + ' ' + etiquette(quoi), ...(classe ? { device_class: classe } : {}), unit_of_measurement: unite });
  const samedi = samediCapteurs(t);
  const muette = (etat) => depuis({ ...etat, state: 'unavailable' }, samedi);
  return {
    // Les ouvrants ouverts : la baie depuis 47 minutes, la fenêtre de la chambre depuis 2 h 10 (`last_changed`, ce que la carte Ouvertures lit, § 3.1).
    'binary_sensor.baie_vitree': depuis(states['binary_sensor.baie_vitree'], t - 47 * MINUTE_MS),
    'binary_sensor.fenetre_chambre': depuis(states['binary_sensor.fenetre_chambre'], t - 130 * MINUTE_MS),
    'binary_sensor.porte_entree_sabotage': s('off', { friendly_name: etiquette('Contact porte entrée') + ' ' + etiquette('sabotage'), device_class: 'tamper' }),
    'sensor.baie_vitree_pile': pile('Contact baie vitrée', 96), 'sensor.fenetre_salon_pile': pile('Contact fenêtre salon', 88), 'sensor.fenetre_chambre_pile': pile('Contact fenêtre chambre', 12),
    'sensor.porte_garage_pile': pile('Contact porte de garage', 72), 'sensor.porte_service_pile': pile('Contact porte de service', 64),
    // La fumée de l'entrée est MUETTE depuis 14:05 (C4) ; les détecteurs gardent leur pile.
    'binary_sensor.detecteur_fumee_entree': depuis({ ...states['binary_sensor.detecteur_fumee_entree'], state: 'unavailable' }, avantCapteurs(t, 14, 5, 60)),
    'sensor.detecteur_fumee_pile': pile('Détecteur de fumée cuisine', 92), 'sensor.detecteur_fumee_entree_pile': pile('Détecteur de fumée entrée', 88), 'sensor.detecteur_co_salon_pile': pile('Détecteur de monoxyde salon', 76),
    // La présence : le radar du bureau allumé depuis 47 minutes ; le salon retombé il y a deux minutes et demie ; l'entrée il y a deux heures.
    'binary_sensor.radar_bureau': depuis(s('on', { friendly_name: 'Radar bureau', device_class: 'occupancy' }), t - 47 * MINUTE_MS),
    'binary_sensor.mouvement_salon': depuis(s('off', { friendly_name: 'Détecteur de mouvement salon', device_class: 'motion' }), t - 2.5 * MINUTE_MS),
    'binary_sensor.mouvement_entree': depuis(states['binary_sensor.mouvement_entree'], t - 124 * MINUTE_MS),
    'sensor.mouvement_salon_pile': pile('Détecteur de mouvement salon', 91), 'sensor.mouvement_entree_pile': pile('Détecteur de mouvement entrée', 67),
    // Sans appareil : la vigilance, éteinte, et le « Besoin eau » d'un modèle.
    'binary_sensor.meteoalarm': s('off', { friendly_name: 'MeteoAlarm', device_class: 'safety', attribution: 'Information provided by MeteoAlarm' }),
    'binary_sensor.basilic_besoin_eau': s('off', { friendly_name: 'Basilic besoin eau', device_class: 'moisture' }),
    /* Une vigilance ACTIVE, avec son niveau (audit du 19/10, point 15 ; décision D3) : le capteur d'alerte de Météo-France, en jaune pour le
     * vent — Dehors a « 1 à regarder ». Ses phénomènes sont des attributs, tels que l'intégration les nomme. */
    'sensor.paris_weather_alert': s('Jaune', { friendly_name: 'Vigilance Météo-France', 'Vent violent': 'Jaune', 'Orages': 'Vert', 'Pluie-inondation': 'Vert' }),
    'binary_sensor.lave_linge_vibration': s('off', { friendly_name: 'Lave-linge vibration', device_class: 'vibration' }),
    // Les plantes découvertes (C29) : le Dracaena, qui manque de lumière ; le Schefflera, muet depuis samedi 14:05.
    'sensor.dracaena_marginata_humidite_du_sol': plante('Dracaena Marginata', 'humidité du sol', 28, 'moisture', '%'),
    'sensor.dracaena_marginata_temperature': plante('Dracaena Marginata', 'température', 19.5, 'temperature', '°C'),
    'sensor.dracaena_marginata_lumiere': plante('Dracaena Marginata', 'lumière', 84, 'illuminance', 'lx'),
    'sensor.dracaena_marginata_conductivite': plante('Dracaena Marginata', 'conductivité', 784, 'conductivity', 'µS/cm'),
    'sensor.dracaena_marginata_pile': plante('Dracaena Marginata', 'pile', 100, 'battery', '%'),
    'sensor.schefflera_humidite_du_sol': muette(plante('Schefflera', 'humidité du sol', 12, 'moisture', '%')),
    'sensor.schefflera_temperature': muette(plante('Schefflera', 'température', 20.1, 'temperature', '°C')),
    'sensor.schefflera_lumiere': muette(plante('Schefflera', 'lumière', 310, 'illuminance', 'lx')),
    'sensor.schefflera_conductivite': muette(plante('Schefflera', 'conductivité', 520, 'conductivity', 'µS/cm')),
    'sensor.schefflera_pile': muette(plante('Schefflera', 'pile', 4, 'battery', '%')),
    // Le bouton du salon : la troisième pile à changer.
    'sensor.bouton_salon_pile': pile('Bouton salon', 14),
  };
}

/** Ce que le journal de Home Assistant a vu des détecteurs de présence (ADR 0031), à l'instant `t` : le salon il y a 3 minutes, le radar
 *  du bureau depuis 47 minutes, l'entrée il y a deux heures. Les lignes de la caméra restent celles d'avant. */
function journalCapteursDemo(t) {
  const ilYA = (min) => (t - min * MINUTE_MS) / 1000;
  return [
    { when: ilYA(2.9), entity_id: 'binary_sensor.mouvement_salon', state: 'on', name: etiquette('Détecteur de mouvement salon') },
    { when: ilYA(2.5), entity_id: 'binary_sensor.mouvement_salon', state: 'off', name: etiquette('Détecteur de mouvement salon') },
    { when: ilYA(47), entity_id: 'binary_sensor.radar_bureau', state: 'on', name: etiquette('Radar bureau') },
    { when: ilYA(125), entity_id: 'binary_sensor.mouvement_entree', state: 'on', name: etiquette('Mouvement entrée') },
    { when: ilYA(124), entity_id: 'binary_sensor.mouvement_entree', state: 'off', name: etiquette('Mouvement entrée') },
  ];
}

/* L'histoire du JOUR des binaires (§ 9, § 12) : ce que les popups des groupes et la fiche d'un binaire lisent, de minuit à maintenant —
 * les ouvertures de la journée, la fumée de l'entrée qui se tait à 14:05, les passages devant les détecteurs. `[instant, état]`, à
 * l'horloge des capteurs ; un binaire absent d'ici n'a pas changé de la journée. */
const HISTOIRES_CAPTEURS_DEMO = (t) => {
  // Un passage du matin, seulement s'il est fini avant l'épisode en cours : une démo ouverte tôt n'en garde que l'épisode.
  const matin = (h1, m1, h2, m2, avant) => (aJour(t, 0, h2, m2) < avant ? [[aJour(t, 0, h1, m1), 'on'], [aJour(t, 0, h2, m2), 'off']] : []);
  return {
    'binary_sensor.baie_vitree': [...matin(8, 12, 8, 19, t - 47 * MINUTE_MS), [t - 47 * MINUTE_MS, 'on']],
    'binary_sensor.fenetre_chambre': [[t - 130 * MINUTE_MS, 'on']],
    'binary_sensor.porte_entree': [[aJour(t, 0, 8, 12), 'on'], [aJour(t, 0, 8, 15), 'off'], [aJour(t, 0, 12, 40), 'on'], [aJour(t, 0, 12, 41), 'off']],
    'binary_sensor.detecteur_fumee_entree': [[avantCapteurs(t, 14, 5, 60), 'unavailable']],
    'binary_sensor.mouvement_salon': [...matin(7, 30, 7, 34, t - 3 * MINUTE_MS), [t - 2.9 * MINUTE_MS, 'on'], [t - 2.5 * MINUTE_MS, 'off']],
    'binary_sensor.radar_bureau': [...matin(9, 2, 11, 48, t - 47 * MINUTE_MS), [t - 47 * MINUTE_MS, 'on']],
    'binary_sensor.mouvement_entree': [[t - 125 * MINUTE_MS, 'on'], [t - 124 * MINUTE_MS, 'off']],
    'binary_sensor.camera_entree_mouvement': [[t - 3 * MINUTE_MS, 'on'], [t - 2.5 * MINUTE_MS, 'off']],
  };
};
/** `history/period`, la forme minimale : une liste par binaire, son état à `t0` d'abord (nommé), puis chaque changement jusqu'à `t1`. */
function historiqueCapteursDemo(ids, t0, t1, states) {
  const scripts = HISTOIRES_CAPTEURS_DEMO(horlogeCapteurs());
  const contraire = (etat) => (etat === 'on' ? 'off' : etat === 'off' ? 'on' : 'off');
  return ids.filter(id => states[id]).map(id => {
    const changements = (scripts[id] || []).filter(([ms]) => ms > t0 && ms <= t1).sort((a, b) => a[0] - b[0]).filter((c, i, l) => !i || c[1] !== l[i - 1][1]);
    const debut = changements.length ? contraire(changements[0][1]) : String(states[id].state);
    return [{ entity_id: id, state: debut, last_changed: new Date(t0).toISOString() }, ...changements.map(([ms, etat]) => ({ state: etat, last_changed: new Date(ms).toISOString() }))];
  });
}

/* Les statistiques de la plante MUETTE (§ 7.3, § 12) : ses relevés à l'heure jusqu'à samedi 14:05, plus rien après — le sol descendu de 30 à
 * 12 %, la pile de 6 à 4 %. C'est ce que lit sa fiche : « Dernier relevé samedi 14:05 : sol à 12 % », « Changez la pile. ». */
const STATS_PLANTES_DEMO = { 'sensor.schefflera_humidite_du_sol': [30, 12], 'sensor.schefflera_pile': [6, 4] };
function statsPlanteDemo(id, msg) {
  const [de, a] = STATS_PLANTES_DEMO[id];
  const fin = samediCapteurs(horlogeCapteurs());
  const t0 = Date.parse(msg.start_time);
  const lignes = [];
  for (let debut = Math.ceil(t0 / 3600e3) * 3600e3; debut + 3600e3 <= fin; debut += 3600e3) {
    // De `de` à `a`, au fil des heures ; la dernière tranche dit `a`.
    const f = debut + 2 * 3600e3 > fin ? 0 : (fin - debut - 3600e3) / (fin - t0 || 1);
    lignes.push({ start: debut, end: debut + 3600e3, mean: Math.round((a + (de - a) * f) * 10) / 10 });
  }
  return lignes;
}

/**
 * La maison des capteurs binaires, des plantes et des piles (§ 12), son horloge réglée, pour tests/demo_capteurs.test.mjs : les
 * états, l'index, le journal des détecteurs de présence, l'histoire du jour, les statistiques et les pièces de Loggia.
 */
export function maisonCapteursDemo({ quand = null } = {}) {
  const t = quand == null ? Date.now() : Number(quand);
  horlogeCapteurs = () => t;
  const states = etatsInitiaux();
  return { states, index: () => indexDemo(states), journal: () => journalCapteursDemo(t), historique: (chemin) => historiqueDemo(chemin, states),
    statistiques: (msg) => statistiquesDemo(msg), pieces: configDemo().loggia_rooms };
}

/* ── Les médias de la démo (chantier Médias, § 8 ; M1, M9, M13) ───────────────
 *
 * Les lecteurs de sa maquette « Cartes médias » entrent dans la maison, aux
 * côtés de la TV du salon et de l'Enceinte salon qui restent :
 *  - l'Apple TV de la chambre, éteinte, ses dix-neuf applications et sa
 *    `remote.` : « Allumer » la met en « Rien en lecture », une appli la réveille
 *    et devient sa source ;
 *  - l'Echo Dot de la chambre, en lecture, une file de trois morceaux (les
 *    titres, l'artiste et les durées de la maquette, une pochette par morceau),
 *    volume 30 % — DEUX entités, comme chez lui : l'officielle (« Alexa
 *    Devices », les bits 5644, les `notify` « Annoncer » et « Parler », la
 *    prochaine alarme) et la jumelle HACS (`alexa_media`, 318399), que
 *    l'appariement retrouve par leurs mots (M1 B, M14) — ce que le registre ne
 *    dit pas, l'identifiant de l'appareil, se lit dans leurs noms ;
 *  - l'Echo de la cuisine d'avant devient une jumelle HACS SANS officielle, rien
 *    en lecture : une phrase de la maquette la fait jouer, et son annonce passe
 *    par le service `notify.alexa_media` (M9) ;
 *  - l'Echo Show du salon, en pause sur une radio sans durée (« En direct ») ;
 *  - l'Echo Dot du bureau, indisponible depuis 14:05 — l'état que la maquette
 *    n'avait pas (1h, l'appel, ne se construit pas : M3) ;
 *  - « Partout », le groupe, officiel, rien en lecture, et sa `notify`
 *    « Annoncer » : « Toute la maison ».
 * Le faux serveur répond à chaque service de § 7.2 (`gesteMediaDemo`) : la
 * lecture et la pause, la file (suivant, précédent), le volume et le muet, la
 * marche et l'arrêt, `select_source`, la phrase (`custom` : la file change si la
 * phrase nomme un des quatre titres), `media_seek`, `shuffle_set`, `repeat_set` ;
 * une annonce (`notify`) ne change aucun état — Home Assistant ne raconte pas une
 * annonce. La position avance avec l'heure de la démo (`media_position_updated_at`).
 * Un lecteur mort reste mort. Les heures suivent l'horloge des médias
 * (`maisonMediasDemo` la règle).
 */
let horlogeMedias = () => Date.now();
const avantMedias = (t, h, m, recul) => Math.min(aJour(t, 0, h, m), t - recul * MINUTE_MS);
/* Les morceaux de sa maquette : le titre, l'artiste, la durée (null : une radio, sans durée), la teinte de la pochette. */
const MORCEAUX_DEMO = {
  xib: { titre: 'Bin K’uchul Xibalba', artiste: 'Metal_Chaos', duree: 256, teinte: '150,104,58' },
  temple: { titre: 'Templo de obsidiana', artiste: 'Metal_Chaos', duree: 231, teinte: '128,76,52' },
  ruinas: { titre: 'Ruinas', artiste: 'Metal_Chaos', duree: 298, teinte: '102,90,72' },
  inter: { titre: 'France Inter', artiste: 'Radio', duree: null, teinte: '186,72,98' },
  soir: { titre: 'Playlist du soir', artiste: 'Amazon Music', duree: 214, teinte: '92,100,186' },
  bruit: { titre: 'Bruit blanc', artiste: 'Sons pour dormir', duree: null, teinte: '112,132,152' },
  dodo: { titre: 'Musique pour dormir', artiste: 'Amazon Music', duree: 1800, teinte: '70,96,140' },
};
/* Les quatre phrases de sa maquette, et le morceau que chacune lance (M19) : une phrase pour Alexa qui nomme l'un d'eux. */
const PHRASES_MEDIAS_DEMO = [['Playlist du soir', 'soir'], ['France Inter', 'inter'], ['Bruit blanc', 'bruit'], ['Musique pour dormir', 'dodo']];
/* La pochette d'un morceau : un SVG de la teinte de la maquette, servi en adresse `data:` — de la même origine, donc lisible par le
 * canvas de la teinte (pochette.js) : la carte se teinte comme chez lui. */
const pochetteDemo = (teinte) => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="rgb(' + teinte + ')"/><circle cx="48" cy="48" r="26" fill="rgba(0,0,0,.35)"/><circle cx="48" cy="48" r="5" fill="rgba(255,255,255,.9)"/></svg>');
/* Les dix-neuf applications de l'Apple TV, telles qu'une Apple TV les écrit (`source_list`). */
const APPLIS_ATV_DEMO = ['App Store', 'Arcade', 'Crunchyroll', 'Disney+', 'FaceTime', 'Forme', 'Free TV', 'HBO Max', 'Netflix', 'YouTube', 'Prime Video', 'Apple TV', 'Musique', 'Photos', 'Plex', 'Arte', 'France TV', 'Podcasts', 'Infuse'];
/* Les appareils : `[zone, nom, modèle, intégration, [entités], empreintes]`. L'Echo Dot de la chambre est DEUX appareils, comme chez
 * lui, et les deux portent la même EMPREINTE — ce que le serveur fait du numéro de série que les deux intégrations écrivent au registre
 * (discovery.py) : c'est par elle que `resolveMedia` les apparie ; les mots des noms ne sont que le repli. « Partout » n'a pas de zone,
 * et son modèle est celui que les deux intégrations écrivent pour un groupe d'enceintes, « Speaker Group » : c'est à lui que le groupe
 * se reconnaît (ADR 0209). L'empreinte de la démo est une valeur inventée, de la forme de celles du serveur. */
const EMPREINTE_ECHO_DOT_DEMO = '3f9a1c7e5b2d';
const APPAREILS_MEDIAS_DEMO = {
  apple_tv_chambre: ['chambre', 'Apple TV Chambre', 'Apple TV 4K', 'apple_tv', ['media_player.apple_tv_chambre', 'remote.apple_tv_chambre']],
  echo_dot_chambre: ['chambre', 'Echo Dot - Chambre', 'Echo Dot (3e génération)', 'alexa_devices', ['media_player.chambre_echo_dot', 'notify.chambre_echo_dot_annoncer', 'notify.chambre_echo_dot_parler', 'sensor.chambre_echo_dot_prochaine_alarme', 'switch.chambre_echo_dot_annonces'], [EMPREINTE_ECHO_DOT_DEMO]],
  echo_dot_chambre_hacs: ['chambre', 'Echo Dot Chambre', 'Echo Dot', 'alexa_media', ['media_player.echo_dot_chambre'], [EMPREINTE_ECHO_DOT_DEMO]],
  echo_cuisine: ['cuisine', 'Echo de la cuisine', 'Echo', 'alexa_media', ['media_player.echo_cuisine']],
  echo_show_salon: ['salon', 'Echo Show Salon', 'Echo Show', 'alexa_media', ['media_player.echo_show']],
  echo_dot_bureau: ['bureau', 'Echo Dot - Bureau', 'Echo Dot (3e génération)', 'alexa_devices', ['media_player.bureau_echo_dot']],
  partout: [null, 'Partout', 'Speaker Group', 'alexa_devices', ['media_player.partout', 'notify.partout_annoncer']],
};
const appareilMediaDemo = (id) => Object.keys(APPAREILS_MEDIAS_DEMO).find(d => APPAREILS_MEDIAS_DEMO[d][4].includes(id)) || null;
/* La jumelle d'un lecteur de la démo : l'autre entité `media_player` qui partage son empreinte. Le faux serveur fait miroiter l'état
 * d'un geste sur les deux (lecture, pause, le volume) : chez lui, les deux intégrations lisent la même enceinte. */
const jumelleMediaDemo = (id) => {
  const d = appareilMediaDemo(id);
  const e = d && APPAREILS_MEDIAS_DEMO[d][5];
  if (!e) return null;
  const autre = Object.keys(APPAREILS_MEDIAS_DEMO).find(x => x !== d && APPAREILS_MEDIAS_DEMO[x][5] && APPAREILS_MEDIAS_DEMO[x][5].some(v => e.indexOf(v) >= 0));
  return autre ? APPAREILS_MEDIAS_DEMO[autre][4].find(x => x.indexOf('media_player.') === 0) || null : null;
};
/* La plateforme d'une entité d'un lecteur, et la clé de traduction de ses `notify` — c'est à elle que l'appariement reconnaît
 * « Annoncer » (`announce`) : rien ne se devine au nom. */
const metaMediaDemo = (id) => { const d = appareilMediaDemo(id); return d ? { platform: APPAREILS_MEDIAS_DEMO[d][3], key: /_annoncer$/.test(id) ? 'announce' : /_parler$/.test(id) ? 'speak' : null } : {}; };
/* La file de chaque Echo qui en a une : les morceaux, et celui qui joue. */
const FILES_MEDIAS_DEMO = { 'media_player.echo_dot_chambre': { file: ['xib', 'temple', 'ruinas'], i: 0 } };
/* Ce qu'un morceau pose sur l'entité qui le joue : le titre, l'artiste, le genre, la pochette ; la durée et la position publiée à `t`
 * quand il en a une — une radio n'en a pas. */
function attributsMorceau(cle, pos, t) {
  const m = MORCEAUX_DEMO[cle];
  return { media_title: m.titre, media_artist: m.artiste, media_content_type: m.duree ? 'music' : 'channel', entity_picture: pochetteDemo(m.teinte),
    media_duration: m.duree, media_position: m.duree ? pos : null, media_position_updated_at: m.duree ? new Date(t).toISOString() : null };
}
/* La position du moment d'un lecteur de la démo : celle qu'il a publiée, avancée du temps écoulé en lecture, bornée par la durée. */
function positionDemo(etat, t) {
  const a = (etat && etat.attributes) || {};
  if (a.media_position == null) return null;
  let p = Number(a.media_position) || 0;
  if (etat.state === 'playing' && a.media_position_updated_at) p += Math.max(0, (t - Date.parse(a.media_position_updated_at)) / 1000);
  return a.media_duration ? Math.min(p, Number(a.media_duration)) : p;
}
// Ce que la bibliothèque de la démo (`parcoursDemo`) sait jouer : un titre par identifiant.
const TITRES_PARCOURS_DEMO = { 'demo://radio/fip': ['FIP', true], 'demo://radio/inter': ['France Inter', true], 'demo://radio/classique': ['Radio Classique', true], 'demo://radio/nova': ['Nova', true],
  'demo://musique/gymnopedie': ['Gymnopedie n1', false], 'demo://musique/clair': ['Clair de Lune', false], 'demo://musique/arabesque': ['Arabesque n1', false] };
const RIEN_EN_LECTURE = { media_title: null, media_artist: null, media_content_type: null, entity_picture: null, media_duration: null, media_position: null, media_position_updated_at: null, app_name: null };

/** Les états des lecteurs de sa maquette, à l'horloge des médias. */
function etatsMediasDemo() {
  const t = horlogeMedias();
  const iso = (ms) => new Date(ms).toISOString();
  const depuis = (etat, ms) => ({ ...etat, last_changed: iso(ms), last_updated: iso(ms) });
  const soeur = (nom, quoi, attrs = {}) => s('unknown', { friendly_name: etiquette(nom) + ' ' + etiquette(quoi), ...attrs });
  return {
    // L'Apple TV de la chambre : éteinte, ses applications, sa télécommande sur le même appareil.
    'media_player.apple_tv_chambre': s('off', { friendly_name: 'Apple TV Chambre', supported_features: 450487, device_class: 'tv', source_list: APPLIS_ATV_DEMO }),
    'remote.apple_tv_chambre': s('off', { friendly_name: 'Apple TV Chambre', supported_features: 0 }),
    // L'Echo Dot de la chambre, deux fois : l'officielle (le volume, le muet, les annonces ; ni lecture ni pause) et la jumelle HACS, qui joue.
    // Son volume suit le mode enfant (§ 10) : 30 % dans les heures du profil, déjà ramené au plafond du coucher (20 %) en dehors.
    'media_player.chambre_echo_dot': s('playing', { friendly_name: 'Echo Dot - Chambre', supported_features: 5644, volume_level: journeeEnfantDemo(ENFANT_CFG.profils[ENFANT_ZONE_DEMO], t).dans ? .3 : .2, device_class: 'speaker' }),
    'notify.chambre_echo_dot_annoncer': soeur('Echo Dot - Chambre', 'Annoncer'),
    'notify.chambre_echo_dot_parler': soeur('Echo Dot - Chambre', 'Parler'),
    'sensor.chambre_echo_dot_prochaine_alarme': soeur('Echo Dot - Chambre', 'Prochaine alarme', { device_class: 'timestamp' }),
    // La sœur « Annonces » de l'officielle (chantier Mode enfant, E23) : un `switch`, allumé — « Recevoir les annonces ».
    'switch.chambre_echo_dot_annonces': { ...soeur('Echo Dot - Chambre', 'Annonces'), state: 'on' },
    'media_player.echo_dot_chambre': s('playing', { friendly_name: 'Echo Dot Chambre', supported_features: 318399, volume_level: journeeEnfantDemo(ENFANT_CFG.profils[ENFANT_ZONE_DEMO], t).dans ? .3 : .2, app_name: 'Amazon Music', shuffle: false, repeat: 'off', ...attributsMorceau('xib', 91, t) }),
    // L'Echo de la cuisine : la jumelle HACS seule, rien en lecture — une phrase de la maquette la fait jouer.
    'media_player.echo_cuisine': s('idle', { friendly_name: 'Echo de la cuisine', supported_features: 318399, volume_level: .35, shuffle: false, repeat: 'off' }),
    // L'Echo Show du salon : en pause sur une radio, sans durée.
    'media_player.echo_show': s('paused', { friendly_name: 'Echo Show Salon', supported_features: 318399, volume_level: .25, app_name: 'TuneIn', shuffle: false, repeat: 'off', ...attributsMorceau('inter', null, t) }),
    // L'Echo Dot du bureau : indisponible depuis 14:05, une heure au moins.
    'media_player.bureau_echo_dot': depuis(s('unavailable', { friendly_name: 'Echo Dot - Bureau', supported_features: 5644 }), avantMedias(t, 14, 5, 60)),
    // « Partout », le groupe : officiel, rien en lecture, et sa `notify` « Annoncer » — toute la maison.
    'media_player.partout': s('idle', { friendly_name: 'Partout', supported_features: 5644, volume_level: .4 }),
    'notify.partout_annoncer': soeur('Partout', 'Annoncer'),
  };
}

/**
 * Ce que le faux serveur fait d'un service des médias (§ 7.2), à l'instant `t` : les retouches à poser, `[entité, état, attributs]`
 * — `état` nul garde l'état. Une annonce ou une phrase « Parler » (`notify`) ne change rien : Home Assistant ne raconte pas une
 * annonce. Un lecteur mort reste mort. Rien ne bascule à l'aveugle : `media_play` et `media_pause` sont deux services.
 */
export function gesteMediaDemo(states, domaine, service, data = {}, t = Date.now()) {
  const retouches = gesteMediaSeul(states, domaine, service, data, t);
  // La paire jumelle : l'état et le volume d'un geste se lisent sur les deux entités de la même enceinte, jamais le titre
  // (l'officielle n'en porte pas) ; une jumelle morte reste morte.
  const id = data.entity_id;
  const jumelle = typeof id === 'string' ? jumelleMediaDemo(id) : null;
  if (!jumelle || !states[jumelle] || states[jumelle].state === 'unavailable') return retouches;
  const miroir = [];
  retouches.forEach(([ent, etat, attrs]) => {
    if (ent !== id) return;
    const reflet = {};
    ['volume_level', 'is_volume_muted'].forEach(k => { if (attrs && k in attrs) reflet[k] = attrs[k]; });
    if (etat != null || Object.keys(reflet).length) miroir.push([jumelle, etat, reflet]);
  });
  return [...retouches, ...miroir];
}

/* Le geste sur UNE entité : ce que le faux serveur en fait, sans la jumelle. */
function gesteMediaSeul(states, domaine, service, data, t) {
  if (domaine === 'notify') return [];
  const id = data.entity_id;
  const cur = domaine === 'media_player' && typeof id === 'string' ? states[id] : null;
  if (!cur || cur.state === 'unavailable') return [];
  const a = cur.attributes || {};
  const iso = new Date(t).toISOString();
  const file = FILES_MEDIAS_DEMO[id];
  const joue = (cle, pos = 0) => [[id, 'playing', attributsMorceau(cle, pos, t)]];
  switch (service) {
    case 'media_play':
      if (cur.state === 'paused') return [[id, 'playing', { media_position: positionDemo(cur, t), media_position_updated_at: iso }]];
      if (cur.state === 'idle' && file) return joue(file.file[file.i], 0);
      return [];
    case 'media_pause':
      return cur.state === 'playing' ? [[id, 'paused', { media_position: positionDemo(cur, t), media_position_updated_at: iso }]] : [];
    case 'media_play_pause':
      // Le service d'avant : plus aucune carte ne l'envoie (M13) ; la fiche universelle de Home Assistant peut encore.
      return cur.state === 'playing' ? [[id, 'paused', { media_position: positionDemo(cur, t), media_position_updated_at: iso }]] : cur.state === 'paused' ? [[id, 'playing', { media_position_updated_at: iso }]] : [];
    case 'media_stop':
      return [[id, 'idle', RIEN_EN_LECTURE]];
    case 'media_next_track':
    case 'media_previous_track': {
      if (!file) return [];
      const n = file.file.length;
      file.i = (file.i + (service === 'media_next_track' ? 1 : n - 1)) % n;
      return joue(file.file[file.i], 0);
    }
    case 'volume_set':
      return [[id, null, { volume_level: Math.max(0, Math.min(1, Number(data.volume_level) || 0)), is_volume_muted: false }]];
    case 'volume_mute':
      return [[id, null, { is_volume_muted: !!data.is_volume_muted }]];
    case 'turn_on':
      return cur.state === 'off' || cur.state === 'standby' ? [[id, 'idle', RIEN_EN_LECTURE]] : [];
    case 'turn_off':
      return [[id, 'off', RIEN_EN_LECTURE]];
    case 'select_source': {
      // Lancer une appli allume la TV (§ 6.8) : l'appli devient sa source, rien d'autre ne joue encore.
      const liste = Array.isArray(a.source_list) ? a.source_list : [];
      return liste.indexOf(data.source) >= 0 ? [[id, 'playing', { ...RIEN_EN_LECTURE, app_name: data.source, source: data.source }]] : [];
    }
    case 'play_media': {
      if (data.media_content_type === 'custom') {
        // Une phrase pour Alexa : la file change si elle nomme un des quatre titres de la maquette ; sinon l'Echo l'écoute, et rien ne se voit.
        const dite = String(data.media_content_id || '').toLowerCase();
        const hit = PHRASES_MEDIAS_DEMO.find(([phrase]) => dite.indexOf(phrase.toLowerCase()) >= 0);
        return hit ? joue(hit[1], 0) : [];
      }
      const connu = TITRES_PARCOURS_DEMO[data.media_content_id];
      if (connu) return [[id, 'playing', { ...RIEN_EN_LECTURE, media_title: connu[0], media_content_type: connu[1] ? 'channel' : 'music', media_duration: connu[1] ? null : 240, media_position: connu[1] ? null : 0, media_position_updated_at: connu[1] ? null : iso }]];
      return [[id, 'playing', { ...RIEN_EN_LECTURE, media_title: String(data.media_content_id || ''), media_content_type: data.media_content_type || 'music' }]];
    }
    case 'media_seek':
      return a.media_duration ? [[id, null, { media_position: Math.max(0, Math.min(Number(a.media_duration), Number(data.seek_position) || 0)), media_position_updated_at: iso }]] : [];
    case 'shuffle_set':
      return [[id, null, { shuffle: !!data.shuffle }]];
    case 'repeat_set':
      return ['off', 'all', 'one'].indexOf(data.repeat) >= 0 ? [[id, null, { repeat: data.repeat }]] : [];
    default:
      return [];
  }
}

/* ── Le mode enfant (chantier Mode enfant, § 10 ; E24) ───────────────────────
 *
 * Le profil « Lino » sur la chambre de la maquette : l'Echo Dot (ses deux entités, « Parler », la sœur « Annonces ») et l'Apple TV
 * ajoutée (`ajouts`). Le faux serveur répond aux six commandes du composant (`enfant.py`, spec 7.4), avec ses droits : `etat`,
 * `demander` et `dormir` à tout compte ; `config`, `lever` et `repondre` au code de la maison — cinq minutes après `pin/verifier` —
 * ou à un administrateur (E2 B), sinon `code_admin_requis`. Les TROIS situations de la maquette suivent l'heure de la démo : 55 min
 * d'écran utilisées avant 18:15 (« encore 35 min »), le temps écoulé ensuite, le coucher hors des heures du jour — celles du profil,
 * la semaine ou le week-end. Et la maison RAMÈNE (E24, `ramenerEnfantDemo`) : un volume au-dessus du plafond redescend une seconde
 * après le geste, un écran bloqué rallumé s'éteint vingt secondes après ; chaque geste s'écrit au journal de la maison avec les mots
 * du serveur. La notification de la demande (E13) se note au journal : la démo ne sonne pas et ne parle pas. */
const ENFANT_ZONE_DEMO = 'chambre';
const ENFANT_OFF_DEMO = 'media_player.chambre_echo_dot', ENFANT_HACS_DEMO = 'media_player.echo_dot_chambre', ENFANT_ECRAN_DEMO = 'media_player.apple_tv_chambre';
const ENFANT_SOEURS_DEMO = { parler: 'notify.chambre_echo_dot_parler', annonces: 'switch.chambre_echo_dot_annonces' };
// Les réglages par défaut de `profil_defaut` (enfant_calcul.py), sur la chambre ; le prénom de la maquette ne se traduit pas.
const ENFANT_CFG_DEFAUT = () => ({ profils: { [ENFANT_ZONE_DEMO]: { nom: 'Lino', zone: ENFANT_ZONE_DEMO, actif: true, ajouts: [ENFANT_ECRAN_DEMO], ecrans: null, volume_max: 40, coucher_max: 20,
  budget: { semaine: 90, weekend: 90 }, heures: { semaine: ['07:30', '20:30'], weekend: ['08:30', '21:00'] }, dormir: true, voix: true, phrases_dormir: ['joue du bruit blanc', 'joue de la musique pour dormir'] } }, simulation: { actif: false } });
let ENFANT_CFG = ENFANT_CFG_DEFAUT();
// L'état du jour, ce que le serveur garde dans `.storage/loggia_enfant_etat` : la levée, la demande, les minutes accordées, le son pour dormir.
const ENFANT_ETAT_DEFAUT = () => ({ leve_jusqua: null, demande: null, bonus_min: 0, dormir: null });
let ENFANT_ETAT = ENFANT_ETAT_DEFAUT();
const ENFANT_JOURNAL = [];
const minutesDe = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
const heureValide = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v));
/* La journée du mode enfant à l'instant `t` : les heures du jour (la semaine ou le week-end), si l'on est dedans, la reprise — le
 * début des heures d'aujourd'hui si l'on est encore avant, sinon celui du jour suivant, qui a les siennes (`reprise`, enfant_calcul.py). */
function journeeEnfantDemo(profil, t) {
  const dt = new Date(t);
  const weekend = (d) => d.getDay() === 0 || d.getDay() === 6;
  const heures = profil.heures[weekend(dt) ? 'weekend' : 'semaine'];
  const minutes = dt.getHours() * 60 + dt.getMinutes();
  const debut = minutesDe(heures[0]), fin = minutesDe(heures[1]);
  const dans = debut === fin ? true : debut < fin ? (minutes >= debut && minutes < fin) : (minutes >= debut || minutes < fin);
  let reprise = heures[0];
  if (minutes >= debut) { const demain = new Date(dt); demain.setDate(demain.getDate() + 1); reprise = profil.heures[weekend(demain) ? 'weekend' : 'semaine'][0]; }
  return { dans, reprise, budget_min: profil.budget[weekend(dt) ? 'weekend' : 'semaine'], minutes };
}
/** `loggia/enfant/etat` (spec 7.4) : les profils, leurs appareils, et ce que le mode enfant fait de chaque lecteur à l'heure de la démo. */
function enfantDemo(states) {
  const t = horlogeMedias();
  const p = ENFANT_CFG.profils[ENFANT_ZONE_DEMO];
  const j = journeeEnfantDemo(p, t);
  const leve = ENFANT_ETAT.leve_jusqua != null && ENFANT_ETAT.leve_jusqua * 1000 > t;
  const agit = !!p.actif && !leve;
  const plafond = j.dans ? p.volume_max : Math.min(p.volume_max, p.coucher_max);
  // Le temps d'écran de la maquette (§ 10) : 55 min utilisées avant 18:15, tout le budget du jour ensuite.
  const total_s = (j.budget_min + ENFANT_ETAT.bonus_min) * 60;
  const brut_s = j.minutes >= 18 * 60 + 15 ? (j.budget_min ? j.budget_min * 60 : 5400) : 3300;
  const utilise_s = j.budget_min ? Math.min(total_s, brut_s) : brut_s;
  const reste_s = j.budget_min ? Math.max(0, total_s - utilise_s) : null;
  const d = ENFANT_ETAT.demande;
  const demande = d && (d.reponse || t / 1000 - d.quand < 1800) ? { appareil: d.appareil, quand: d.quand, reponse: d.reponse } : null;
  const bloqueEcran = !agit ? null : !j.dans ? 'coucher' : (j.budget_min && reste_s === 0 ? 'temps' : null);
  const bloqueEcho = !agit ? null : !j.dans ? 'coucher' : null;
  const vue = (ecran) => ({ profil: ENFANT_ZONE_DEMO, nom: p.nom, actif: !!p.actif, leve_jusqua: leve ? ENFANT_ETAT.leve_jusqua : null, plafond: agit ? plafond : null,
    bloque: ecran ? bloqueEcran : bloqueEcho, reprise: j.reprise, ecran: ecran ? { budget_min: j.budget_min, utilise_s, bonus_min: ENFANT_ETAT.bonus_min, reste_s } : null,
    dormir: ENFANT_ETAT.dormir, demande });
  const appareils = [{ entite: ENFANT_OFF_DEMO, ajoute: false, ecran: false, parler: ENFANT_SOEURS_DEMO.parler, annonces: ENFANT_SOEURS_DEMO.annonces, hacs: ENFANT_HACS_DEMO }];
  const lecteurs = { [ENFANT_OFF_DEMO]: vue(false), [ENFANT_HACS_DEMO]: vue(false) };
  for (const haid of p.ajouts) {
    if (!states[haid] || lecteurs[haid]) continue;
    const ecran = (states[haid].attributes || {}).device_class === 'tv';
    appareils.push({ entite: haid, ajoute: true, ecran, parler: null, annonces: null, hacs: null });
    lecteurs[haid] = vue(ecran);
  }
  return { maintenant: t / 1000, demarre: true, simulation: !!ENFANT_CFG.simulation.actif,
    profils: { [ENFANT_ZONE_DEMO]: { nom: p.nom, zone: ENFANT_ZONE_DEMO, actif: !!p.actif, leve_jusqua: leve ? ENFANT_ETAT.leve_jusqua : null, demande, appareils, voix: !!p.voix, dormir: !!p.dormir } },
    lecteurs };
}
/* Un patch de `loggia_enfant`, champ par champ, comme `poser_patch` (enfant_calcul.py) : une valeur que l'écran n'envoie pas fait tout refuser, rien n'est écrit. */
function enfantPatch(patch) {
  if (!patch || typeof patch !== 'object') throw new Error('mode enfant : patch illisible');
  const neuf = { profils: { ...ENFANT_CFG.profils }, simulation: { ...ENFANT_CFG.simulation } };
  const entier = (v, bas, haut) => (Number.isInteger(v) && v >= bas && v <= haut ? v : null);
  if (patch.profils && typeof patch.profils === 'object') {
    for (const [ident, p] of Object.entries(patch.profils)) {
      if (p === null) { delete neuf.profils[ident]; continue; }
      if (!p || typeof p !== 'object') throw new Error('mode enfant : profil illisible');
      const cur = neuf.profils[ident] ? { ...neuf.profils[ident] } : { ...ENFANT_CFG_DEFAUT().profils[ENFANT_ZONE_DEMO], nom: typeof p.nom === 'string' && p.nom.trim() ? p.nom : ident, zone: ident, ajouts: [] };
      if ('nom' in p) { if (typeof p.nom !== 'string' || !p.nom.trim()) throw new Error('mode enfant : nom illisible'); cur.nom = p.nom; }
      for (const k of ['actif', 'dormir', 'voix']) if (k in p) { if (typeof p[k] !== 'boolean') throw new Error('mode enfant : ' + k + ' : vrai ou faux'); cur[k] = p[k]; }
      if ('volume_max' in p) { const v = entier(p.volume_max, 10, 100); if (v == null) throw new Error('mode enfant : volume_max : un entier de 10 a 100'); cur.volume_max = v; }
      if ('coucher_max' in p) { const v = entier(p.coucher_max, 0, 100); if (v == null) throw new Error('mode enfant : coucher_max : un entier de 0 a 100'); cur.coucher_max = v; }
      if ('budget' in p) {
        const b = p.budget;
        if (!b || typeof b !== 'object' || !['semaine', 'weekend'].every(k => entier(b[k], 0, 1440) != null)) throw new Error('mode enfant : budget : des minutes de 0 a 1440');
        cur.budget = { semaine: b.semaine, weekend: b.weekend };
      }
      if ('heures' in p) {
        const h = p.heures;
        if (!h || typeof h !== 'object' || !['semaine', 'weekend'].every(k => Array.isArray(h[k]) && h[k].length === 2 && h[k].every(heureValide))) throw new Error('mode enfant : heures illisibles');
        cur.heures = { semaine: [...h.semaine], weekend: [...h.weekend] };
      }
      if ('ajouts' in p) {
        if (!Array.isArray(p.ajouts) || !p.ajouts.every(x => typeof x === 'string' && x.indexOf('media_player.') === 0)) throw new Error('mode enfant : ajouts : une liste de lecteurs');
        cur.ajouts = [...new Set(p.ajouts)];
      }
      neuf.profils[ident] = cur;
    }
  }
  if ('simulation' in patch) {
    if (!patch.simulation || typeof patch.simulation.actif !== 'boolean') throw new Error('mode enfant : simulation : {actif: vrai ou faux}');
    neuf.simulation = { actif: patch.simulation.actif };
  }
  ENFANT_CFG = neuf;
  return ENFANT_CFG;
}
// Une ligne du journal de la maison, avec les mots du serveur (`enfant.py`) : la règle, ce qui est fait, les cibles, le motif en parties.
const noterEnfantDemo = (regle, quoi, cibles, motif = '', detail = '') => ENFANT_JOURNAL.push(ligneJournal({ module: 'enfant', regle, quoi, cibles, n: cibles.length, motif, detail, simule: false, ts: horlogeMedias() / 1000 }));
/* Le code de la maison (ADR 0045) : vérifié « par le serveur », les essais comptés ; un code juste vaut laissez-passer cinq minutes
 * (ADR 0080) — c'est lui qui ouvre les réglages du mode enfant à un compte ordinaire (E2 B). */
function repondrePinDemo(msg) {
  if (!msg) return null;
  if (msg.type === 'loggia/pin/verifier') {
    if (String(msg.pin) === PIN_DEMO.code) { PIN_DEMO.rates = 0; PIN_DEMO.passe = horlogeMedias() + 300000; return Promise.resolve({ ok: true }); }
    PIN_DEMO.rates += 1;
    return Promise.resolve({ ok: false, bloque: PIN_DEMO.rates >= 5 ? 60 : 0 });
  }
  if (msg.type === 'loggia/pin/definir') { PIN_DEMO.code = String(msg.pin); return Promise.resolve({ defini: true }); }
  return null;
}
/* Les six commandes du mode enfant, la forme exacte du serveur et ses refus. `ordinaire` : le compte n'est pas administrateur ;
 * `ecrireCfg` : où la configuration commune se réécrit ; `toucher` : comment un état change (celui d'`installerDemo` redessine l'écran). */
function repondreEnfantDemo(msg, states, { ordinaire = false, ecrireCfg = null, toucher = null } = {}) {
  if (!msg || typeof msg.type !== 'string' || msg.type.indexOf('loggia/enfant/') !== 0) return null;
  const t = horlogeMedias();
  const poser = toucher || ((x, et, attrs) => { const cur = states[x]; if (!cur) return; states[x] = { state: et != null ? String(et) : cur.state, attributes: { ...cur.attributes, ...(attrs || {}) }, last_updated: new Date(t).toISOString(), last_changed: new Date(t).toISOString() }; });
  const refus = (code, message) => Promise.reject({ code, message });
  const parent = () => !ordinaire || PIN_DEMO.passe > t;
  const etat = () => Promise.resolve(enfantDemo(states));
  const p = ENFANT_CFG.profils[ENFANT_ZONE_DEMO];
  switch (msg.type) {
    case 'loggia/enfant/etat': return etat();
    case 'loggia/enfant/config': {
      if (!parent()) return refus('code_admin_requis', 'le code de la maison est requis pour le mode enfant');
      try { enfantPatch(msg.patch); } catch (e) { return refus('invalid_format', e.message); }
      if (ecrireCfg) ecrireCfg(ENFANT_CFG);
      return Promise.resolve({ config: ENFANT_CFG, etat: enfantDemo(states) });
    }
    case 'loggia/enfant/lever': {
      if (!parent()) return refus('code_admin_requis', 'le code de la maison est requis pour le mode enfant');
      if (msg.profil !== ENFANT_ZONE_DEMO) return refus('invalid_format', 'mode enfant : profil inconnu');
      if ([0, 30].indexOf(msg.minutes) < 0) return refus('invalid_format', 'mode enfant : minutes : 0 ou 30');
      ENFANT_ETAT.leve_jusqua = msg.minutes ? t / 1000 + msg.minutes * 60 : null;
      noterEnfantDemo('levee', msg.minutes ? 'limites levées' : 'limites rétablies', [], msg.minutes ? [['{n} min', { n: msg.minutes }]] : '');
      return etat();
    }
    case 'loggia/enfant/repondre': {
      if (!parent()) return refus('code_admin_requis', 'le code de la maison est requis pour le mode enfant');
      const d = ENFANT_ETAT.demande;
      if (msg.profil !== ENFANT_ZONE_DEMO || !d || d.reponse || t / 1000 - d.quand >= 1800) return refus('invalid_format', 'mode enfant : aucune demande en attente');
      d.reponse = msg.accorder ? 'accordee' : 'refusee';
      if (msg.accorder) ENFANT_ETAT.bonus_min += 15;
      noterEnfantDemo('demande', msg.accorder ? '15 min accordées' : 'demande refusée', [d.appareil], 'depuis l’écran');
      return etat();
    }
    case 'loggia/enfant/demander': {
      if (msg.profil !== ENFANT_ZONE_DEMO) return refus('invalid_format', 'mode enfant : profil inconnu');
      const e = enfantDemo(states);
      const ecrans = Object.keys(e.lecteurs).filter(h => e.lecteurs[h].ecran && e.lecteurs[h].bloque === 'temps');
      const d = ENFANT_ETAT.demande;
      if (!ecrans.length) return refus('invalid_format', 'mode enfant : aucun écran n’est bloqué par le temps');
      if (d && ((!d.reponse && t / 1000 - d.quand < 1800) || d.reponse === 'refusee')) return refus('invalid_format', 'mode enfant : une demande a déjà été faite');
      ENFANT_ETAT.demande = { appareil: ecrans[0], quand: t / 1000, reponse: null };
      // La notification à boutons du téléphone (E13) : notée au journal, la démo ne sonne pas.
      noterEnfantDemo('demande', 'demande', [ecrans[0]], [['{n} min', { n: 15 }]]);
      return etat();
    }
    case 'loggia/enfant/dormir': {
      if (msg.profil !== ENFANT_ZONE_DEMO) return refus('invalid_format', 'mode enfant : profil inconnu');
      const phrases = Array.isArray(p.phrases_dormir) ? p.phrases_dormir : [];
      if (!Number.isInteger(msg.son) || msg.son < 0 || msg.son >= phrases.length) return refus('invalid_format', 'mode enfant : son inconnu');
      // La phrase pour Alexa, dite à la jumelle HACS (E10) : elle nomme un titre de la maquette, il joue.
      gesteMediaDemo(states, 'media_player', 'play_media', { entity_id: ENFANT_HACS_DEMO, media_content_type: 'custom', media_content_id: phrases[msg.son] }, t).forEach(([x, et, attrs]) => poser(x, et, attrs));
      ENFANT_ETAT.dormir = { depuis: t / 1000, titres: [] };
      noterEnfantDemo('coucher', 'son pour dormir', [ENFANT_HACS_DEMO]);
      return etat();
    }
    default: return null;
  }
}
/* La maison RAMÈNE (E24) : un `volume_set` au-dessus du plafond d'un lecteur sous profil redescend une seconde après — sur les deux
 * entités de l'Echo, par le miroir de `gesteMediaDemo` —, un écran bloqué rallumé (`turn_on`) s'éteint vingt secondes après ; le
 * journal le dit chaque fois. `plusTard` : le minuteur (celui des tests ne tourne pas). Jamais une montée, jamais un allumage. */
function ramenerEnfantDemo(states, service, data, toucher, plusTard = (f, ms) => setTimeout(f, ms)) {
  const id = data && data.entity_id;
  if (typeof id !== 'string') return;
  const vue = enfantDemo(states).lecteurs[id];
  if (!vue) return;
  if (service === 'volume_set' && vue.plafond != null) {
    const lu = Math.round((Number(data.volume_level) || 0) * 100);
    if (lu <= vue.plafond) return;
    plusTard(() => {
      const actuel = Math.round((Number((states[id] && states[id].attributes || {}).volume_level) || 0) * 100);
      if (actuel <= vue.plafond) return;
      gesteMediaDemo(states, 'media_player', 'volume_set', { entity_id: id, volume_level: vue.plafond / 100 }, horlogeMedias()).forEach(([x, et, attrs]) => toucher(x, et, attrs));
      noterEnfantDemo('plafond', 'volume ramené', [id], [['de {a} à {b} %', { a: lu, b: vue.plafond }], ['à la voix ou sur l’appareil', {}]]);
    }, 1000);
  }
  if (service === 'turn_on' && vue.ecran && vue.bloque) {
    plusTard(() => {
      const cur = states[id];
      if (!cur || cur.state === 'off' || cur.state === 'standby' || cur.state === 'unavailable') return;
      const e = enfantDemo(states).lecteurs[id];
      if (!e || !e.bloque) return;
      gesteMediaDemo(states, 'media_player', 'turn_off', { entity_id: id }, horlogeMedias()).forEach(([x, et, attrs]) => toucher(x, et, attrs));
      noterEnfantDemo('coupure', 'écran éteint', [id], 'rallumé');
    }, 20000);
  }
}
/* Tout remettre à sa base : la maison des tests repart neuve, la démo installée aussi. */
function remettreEnfantDemo() {
  ENFANT_CFG = ENFANT_CFG_DEFAUT();
  ENFANT_ETAT = ENFANT_ETAT_DEFAUT();
  ENFANT_JOURNAL.length = 0;
  PIN_DEMO.rates = 0;
  PIN_DEMO.passe = 0;
}

/**
 * La maison des médias (§ 8), son horloge réglée, pour tests/demo_medias.test.mjs : les états, l'index, et le faux serveur appliqué
 * aux états (`geste`), comme `installerDemo` l'applique. Et le mode enfant (chantier Mode enfant, § 10), pour tests/demo_enfant : son
 * état (`enfant`), ses commandes et le code de la maison (`ws`), le journal de la maison (`regles`), la maison qui ramène (`ramener`).
 */
export function maisonMediasDemo({ quand = null } = {}) {
  const t = quand == null ? Date.now() : Number(quand);
  horlogeMedias = () => t;
  Object.values(FILES_MEDIAS_DEMO).forEach(f => { f.i = 0; });
  remettreEnfantDemo();
  const states = etatsInitiaux();
  const toucher = (id, etat, attrs, a = t) => { const cur = states[id]; if (!cur) return; states[id] = { state: etat != null ? String(etat) : cur.state, attributes: { ...cur.attributes, ...(attrs || {}) }, last_updated: new Date(a).toISOString(), last_changed: new Date(a).toISOString() }; };
  const geste = (domaine, service, data, a = t) => {
    const retouches = gesteMediaDemo(states, domaine, service, data, a);
    retouches.forEach(([id, etat, attrs]) => toucher(id, etat, attrs, a));
    return retouches;
  };
  return {
    states, index: () => indexDemo(states), geste, config: () => configDemo(), position: (id, a = t) => positionDemo(states[id], a),
    enfant: () => enfantDemo(states),
    ws: (msg, { admin = true } = {}) => repondreEnfantDemo(msg, states, { ordinaire: !admin }) || repondrePinDemo(msg) || Promise.reject(new Error('démonstration : pas de composant serveur')),
    regles: () => reglesDemo(states),
    ramener: (service, data, plusTard) => ramenerEnfantDemo(states, service, data, (x, et, attrs) => toucher(x, et, attrs), plusTard),
  };
}

/* Les registres, tels que le composant les enverrait : des zones, et les
 * entites qui y sont rangees. Le dashboard croise ensuite avec les etats. */
function indexDemo(states) {
  const ZONES = [
    ['salon', lieu('Salon')], ['cuisine', lieu('Cuisine')], ['chambre', lieu('Chambre')],
    ['bureau', lieu('Bureau')], ['entree', lieu('Entrée')], ['sdb', lieu('Salle de bain')],
    // Le jardin (chantier Capteurs, C14, C17) : une zone de Home Assistant, du nom de sa pièce du dehors — sa station y vit.
    ['jardin', lieu('Jardin')],
    // La zone des capteurs de plante (chantier Capteurs, étapes 2 et 3, § 12 ; C29) : une zone d'appareils, qui n'est pas une pièce de Loggia.
    ['technique', lieu('Technique')],
  ];
  const ZONE_DE = {
    salon: ['light.salon', 'media_player.salon', 'sensor.salon_temperature', 'sensor.salon_humidite', 'sensor.salon_co2', 'sensor.salon_bruit', 'cover.volet_salon', 'cover.store_banne',
            'binary_sensor.fenetre_salon', 'binary_sensor.baie_vitree', 'switch.radiateur_salon', 'media_player.enceinte_salon', 'media_player.tv_salon', 'remote.tv_salon', 'binary_sensor.detecteur_co_salon',
            'climate.poele'],
    cuisine: ['light.cuisine', 'sensor.cuisine_temperature', 'sensor.cuisine_humidite', 'cover.volet_cuisine', 'binary_sensor.detecteur_fumee', 'binary_sensor.fuite_evier', 'valve.arrivee_eau'],
    chambre: ['light.chambre', 'sensor.chambre_temperature', 'sensor.chambre_humidite', 'sensor.chambre_co2', 'cover.volet_chambre', 'cover.rideau_chambre',
              'binary_sensor.fenetre_chambre', 'switch.radiateur_chambre', 'select.radiateur_chambre_fil_pilote', 'sensor.radiateur_chambre_puissance'],
    bureau: ['light.bureau', 'cover.volet_bureau', 'sensor.bureau_temperature', 'sensor.bureau_humidite', 'sensor.bureau_co2',
             'select.radiateur_bureau_fil_pilote', 'switch.radiateur_bureau', 'sensor.radiateur_bureau_puissance', 'climate.climatisation'],
    entree: ['light.entree', 'sensor.entree_temperature', 'binary_sensor.porte_entree', 'binary_sensor.detecteur_fumee_entree', 'binary_sensor.mouvement_entree', 'lock.porte_entree', 'siren.interieure',
             'camera.entree', 'switch.camera_entree_detection_mouvement', 'switch.camera_entree_suivi', 'switch.camera_entree_pleurs',
             'switch.camera_entree_prive', 'switch.camera_entree_voyant', 'binary_sensor.camera_entree_mouvement', 'binary_sensor.camera_entree_personne',
             'cover.volet_entree', 'cover.porte_garage', 'cover.portail'],
    sdb: ['light.sdb', 'sensor.sdb_temperature', 'cover.volet_sdb'],
    jardin: [],
    technique: [],
  };
  // La camera de l'entree et ses reglages forment UN appareil : c'est par lui
  // que la fiche retrouve les interrupteurs d'une camera. Un module fil pilote
  // aussi : son `select`, son interrupteur et sa puissance (planning de chauffe).
  const APPAREIL_DE = (id) => appareilChauffageDemo(id) || appareilPriseDemo(id) || appareilMesureDemo(id) || appareilCapteurDemo(id) || appareilMediaDemo(id) || (
    /^(media_player|remote)\.tv_salon$/.test(id) ? 'tv_salon'
    : /^(camera\.entree$|switch\.camera_entree_|binary_sensor\.camera_entree_)/.test(id) ? 'cam_entree' : null);
  // Les prises de la démo, leurs capteurs et la sirène de l'alarme : chacune dans sa pièce (chantier Prises, § 10).
  PRISES_DEMO.forEach(id => ZONE_DE[PIECES_PRISES_DEMO[id]].push(id, capteursPriseDemo(id).power, capteursPriseDemo(id).energy));
  // Les lampes de sa maquette qui n'avaient pas de pièce (chantier Lumières, § 9).
  Object.keys(PIECES_LUMIERES_DEMO).forEach(id => ZONE_DE[PIECES_LUMIERES_DEMO[id]].push(id));
  // Les mesures de sa maquette « Cartes capteurs », et la salle de bain, qui n'avait pas les siennes (chantier Capteurs, § 9).
  Object.keys(PIECES_MESURES_DEMO).forEach(id => ZONE_DE[PIECES_MESURES_DEMO[id]].push(id));
  // Les capteurs binaires, les plantes et les piles de sa maquette (chantier Capteurs, étapes 2 et 3, § 12) : chaque entité dans la zone de son appareil.
  Object.keys(APPAREILS_CAPTEURS_DEMO).forEach(d => { const z = APPAREILS_CAPTEURS_DEMO[d][0]; if (z) APPAREILS_CAPTEURS_DEMO[d][3].forEach(id => { if (ZONE_DE[z].indexOf(id) < 0) ZONE_DE[z].push(id); }); });
  // Les lecteurs de sa maquette « Cartes médias » (chantier Médias, § 8) : chaque entité dans la zone de son appareil ; « Partout » n'en a pas.
  Object.keys(APPAREILS_MEDIAS_DEMO).forEach(d => { const z = APPAREILS_MEDIAS_DEMO[d][0]; if (z) APPAREILS_MEDIAS_DEMO[d][4].forEach(id => { if (ZONE_DE[z].indexOf(id) < 0) ZONE_DE[z].push(id); }); });
  ZONE_DE.entree.push(SIRENE_SWITCH_DEMO);
  const entities = [];
  // Le pont de Zigbee2MQTT : un appareil sans pièce, son interrupteur d'appairage sans catégorie.
  if (states[PONT_DEMO]) entities.push({ id: PONT_DEMO, name: 'Zigbee2MQTT Bridge Permit join', device: 'pont_z2m', area: null, platform: 'mqtt', category: null, device_class: null, unit: null, hidden: false });
  // Le frigo (chantier Capteurs, C17, 16/10) : son appareil n'a pas de zone, son entité non plus — sa carte est neutre.
  const frigo = states['sensor.capteur_frigo_temperature'];
  if (frigo) entities.push({ id: 'sensor.capteur_frigo_temperature', name: frigo.attributes.friendly_name, device: 'capteur_frigo', area: null, platform: 'mqtt', category: null,
    device_class: 'temperature', unit: '°C', hidden: false });
  /* Les contacts des portes du garage et de service (chantier Capteurs, § 12) : des appareils SANS zone — leurs cartes prennent le nom de
   * l'appareil (§ 3) ; et les entités sans appareil (C21, C28), dont l'index dit la plateforme. */
  Object.keys(APPAREILS_CAPTEURS_DEMO).filter(d => !APPAREILS_CAPTEURS_DEMO[d][0]).forEach(d => APPAREILS_CAPTEURS_DEMO[d][3].forEach(id => {
    if (!states[id]) return;
    const at = states[id].attributes || {};
    entities.push({ id, name: at.friendly_name || id, device: d, area: null, ...metaCapteurDemo(id), device_class: at.device_class || null, unit: at.unit_of_measurement || null, hidden: false });
  }));
  // Le groupe « Partout » (chantier Médias, § 8) : un appareil sans zone, sa `notify` « Annoncer » reconnue à sa clé de traduction.
  Object.keys(APPAREILS_MEDIAS_DEMO).filter(d => !APPAREILS_MEDIAS_DEMO[d][0]).forEach(d => APPAREILS_MEDIAS_DEMO[d][4].forEach(id => {
    if (!states[id]) return;
    const at = states[id].attributes || {};
    entities.push({ id, name: at.friendly_name || id, device: d, area: null, ...metaCapteurDemo(id), ...metaMediaDemo(id), device_class: at.device_class || null, unit: at.unit_of_measurement || null, hidden: false });
  }));
  Object.keys(SANS_APPAREIL_DEMO).forEach(id => {
    if (!states[id]) return;
    const at = states[id].attributes || {};
    entities.push({ id, name: at.friendly_name || id, device: null, area: null, platform: SANS_APPAREIL_DEMO[id], category: null, device_class: at.device_class || null, unit: at.unit_of_measurement || null, hidden: false });
  });
  Object.keys(ZONE_DE).forEach(zone => {
    ZONE_DE[zone].forEach(id => {
      if (!states[id]) return;
      const at = states[id].attributes || {};
      // La famille d'un chauffage, que le composant pose dans l'index (plan 2,
      // choix 1) — et seulement quand il en reconnaît une : pas de champ vide en plus.
      const famille = familleChauffageDemo(id);
      // La plateforme et la catégorie : celles de la démo, sauf pour les capteurs de sa maquette « Cartes capteurs » (Zigbee, Bluetooth, les piles en diagnostic).
      entities.push({ id, name: at.friendly_name || id, device: APPAREIL_DE(id), area: zone,
        ...metaCapteurDemo(id), ...metaMediaDemo(id), device_class: at.device_class || null,
        unit: at.unit_of_measurement || null, hidden: false, ...(famille ? { famille } : {}) });
    });
  });
  // Les robots (ADR 0042) : un appareil chacun. C'est par lui que leur vue
  // retrouve pieces d'usure, zones et reglages — reconnus a la cle de traduction.
  const ROBOTS = {
    robot_aspirateur: ['ecovacs', {
      'vacuum.aspirateur': [null, null], 'sensor.aspirateur_filtre': ['lifespan_filter', 'diagnostic'],
      'sensor.aspirateur_brosse_principale': ['lifespan_brush', 'diagnostic'], 'sensor.aspirateur_brosse_laterale': ['lifespan_side_brush', 'diagnostic'],
      'sensor.aspirateur_serpilliere': ['lifespan_round_mop', 'diagnostic'], 'sensor.aspirateur_surface_nettoyee': ['stats_area', null],
      'sensor.aspirateur_surface_totale': ['total_stats_area', null], 'sensor.aspirateur_duree_totale': ['total_stats_time', null],
      'sensor.aspirateur_nombre_total': ['total_stats_cleanings', null], 'button.aspirateur_reinitialiser_filtre': ['reset_lifespan_filter', 'config'],
      'select.aspirateur_mode_de_travail': ['work_mode', 'config'], 'select.aspirateur_debit_d_eau': ['water_amount', 'config'],
      'switch.aspirateur_detection_tapis': ['carpet_auto_fan_boost', 'config'], 'switch.aspirateur_mode_avance': ['advanced_mode', 'config'],
      // La carte active et le compteur de passages (tranche robots 2, R11, Q2 A) : les clés de traduction de l'intégration Ecovacs.
      'select.aspirateur_carte_active': ['active_map', 'config'], 'number.aspirateur_compteur_de_nettoyage': ['clean_count', 'config'],
    }],
    robot_tondeuse: ['mammotion', {
      'lawn_mower.tondeuse': [null, null], 'binary_sensor.tondeuse_en_charge': [null, 'diagnostic'],
      'switch.tondeuse_zone_pelouse_avant': ['area', 'config'], 'switch.tondeuse_zone_pelouse_arriere': ['area', 'config'], 'switch.tondeuse_zone_cote_garage': ['area', 'config'],
      'sensor.tondeuse_usage_des_lames': ['blade_used_time', 'diagnostic'], 'sensor.tondeuse_seuil_des_lames': ['blade_used_warn_time', 'diagnostic'],
      'sensor.tondeuse_surface': ['area', 'diagnostic'], 'sensor.tondeuse_cycles_de_batterie': ['maintenance_bat_cycles', 'diagnostic'],
      'sensor.tondeuse_temps_de_travail_total': ['maintenance_work_time', 'diagnostic'], 'sensor.tondeuse_kilometrage_total': ['maintenance_distance', 'diagnostic'],
      'sensor.tondeuse_signal_wi_fi': ['wifi_rssi', 'diagnostic'], 'number.tondeuse_hauteur_des_lames': ['blade_height', 'config'],
      'switch.tondeuse_detection_de_pluie': ['rain_detection', 'config'], 'select.tondeuse_securite_faune': ['wildlife_safety', 'config'],
      'switch.tondeuse_voix': ['voice_on_off', 'config'], 'update.tondeuse_micrologiciel': ['update', 'config'],
    }],
  };
  Object.keys(ROBOTS).forEach(appareil => {
    const [plateforme, liste] = ROBOTS[appareil];
    Object.keys(liste).forEach(id => {
      if (!states[id]) return;
      const at = states[id].attributes || {};
      entities.push({ id, name: at.friendly_name || id, device: appareil, area: null, platform: plateforme, key: liste[id][0], category: liste[id][1],
        device_class: at.device_class || null, unit: at.unit_of_measurement || null, hidden: false });
    });
  });
  /* Le distributeur (ADR 0155) : un appareil aussi, sur le même patron. Sous
   * Zigbee2MQTT (`mqtt`), aucune clé de traduction : Loggia le lit aux
   * suffixes anglais, comme chez l'utilisateur. La pièce est celle de
   * l'APPAREIL ; l'entité n'en porte pas. */
  Object.keys(DISTRIBUTEURS_DEMO).forEach(appareil => {
    const [plateforme, liste] = DISTRIBUTEURS_DEMO[appareil];
    Object.keys(liste).forEach(id => {
      if (!states[id]) return;
      const at = states[id].attributes || {};
      entities.push({ id, name: at.friendly_name || id, device: appareil, area: null, platform: plateforme, key: liste[id][0], category: liste[id][1],
        device_class: at.device_class || null, unit: at.unit_of_measurement || null, hidden: false });
    });
  });
  const distribs = Object.keys(DISTRIBUTEURS_DEMO).filter(d => Object.keys(DISTRIBUTEURS_DEMO[d][1]).some(id => states[id]));
  // La machine : un appareil sans piece. C'est par lui que la vue Systeme
  // retrouve, autour de la charge processeur, la memoire, le swap et les debits.
  Object.keys(states).filter(id => id.indexOf('sensor.system_monitor_') === 0).forEach(id => {
    const at = states[id].attributes || {};
    entities.push({ id, name: at.friendly_name || id, device: 'sysmon', area: null,
      platform: 'systemmonitor', category: 'diagnostic', device_class: at.device_class || null,
      unit: at.unit_of_measurement || null, hidden: false });
  });
  // Les mises a jour : chacune publiee par son integration — c'est elle qui
  // fait le groupe dans la section des mises a jour.
  [['update.interrupteur_couloir_firmware', 'mqtt'], ['update.interrupteur_chambre_firmware', 'mqtt'], ['update.carte_meteo_animee_update', 'hacs'],
    ['update.home_assistant_core_update', 'hassio'], ['update.home_assistant_supervisor_update', 'hassio'], ['update.home_assistant_operating_system_update', 'hassio']].forEach(([id, plateforme]) => {
    if (!states[id]) return;
    const at = states[id].attributes || {};
    entities.push({ id, name: at.friendly_name || id, device: null, area: null, platform: plateforme, category: 'config',
      device_class: null, unit: null, hidden: false });
  });
  return {
    version: 1,
    /* Deux etages, pour que le filtre des pieces ait de quoi se montrer : sans
     * DEUX niveaux habites, l'en-tete n'affiche aucune puce — « Tous » et
     * l'unique etage diraient la meme chose. Le garage n'en a aucun : il reste
     * visible quel que soit le filtre. */
    areas: ZONES.map(([id, name]) => ({ id, name, floor: ETAGE_DE[id] || null, icon: null })),
    /* Le nom d'un APPAREIL passe par la même table que ceux de ses entités
     * (audit du 03/10) : `cameraModes` et `decrireSoeurs` le retirent en tête
     * du nom de chaque entité. Resté « Tondeuse » devant « Mower Zone Front
     * lawn », il ne se retirait plus : la puce de zone portait le nom entier,
     * et la fiche titrait en français. Le modèle aussi, qu'elle affiche. */
    devices: [{ id: 'tv_salon', name: etiquette('TV du salon'), area: 'salon', manufacturer: 'Démo', model: etiquette('Boîtier TV'), firmware: null, via: null, entry_type: null, integration: 'apple_tv' },
      /* Les lecteurs de sa maquette « Cartes médias » (chantier Médias, § 8 ; M1) : l'Echo Dot de la chambre est DEUX appareils, l'un par
       * intégration — comme chez lui — ; « Partout » n'a pas de zone. Le fabricant est celui du registre, le modèle dit le genre (§ 6.5). */
      // Les lecteurs de sa maquette ; les empreintes des identifiants, comme le composant les pose pour un appareil qui porte un lecteur.
      ...Object.keys(APPAREILS_MEDIAS_DEMO).map(id => ({ id, name: etiquette(APPAREILS_MEDIAS_DEMO[id][1]), area: APPAREILS_MEDIAS_DEMO[id][0], manufacturer: APPAREILS_MEDIAS_DEMO[id][3] === 'apple_tv' ? 'Apple' : 'Amazon',
        model: etiquette(APPAREILS_MEDIAS_DEMO[id][2]), firmware: null, via: null, entry_type: null, integration: APPAREILS_MEDIAS_DEMO[id][3],
        ...(APPAREILS_MEDIAS_DEMO[id][5] ? { empreintes: APPAREILS_MEDIAS_DEMO[id][5] } : {}) })),
      { id: 'cam_entree', name: etiquette('Caméra entrée'), area: 'entree', manufacturer: 'Démo', model: etiquette('Caméra'), firmware: null, via: null, entry_type: null, integration: 'demo' },
      { id: 'sysmon', name: 'System Monitor', area: null, manufacturer: 'Démo', model: 'System Monitor', firmware: null, via: null, entry_type: 'service', integration: 'systemmonitor' },
      { id: 'robot_aspirateur', name: etiquette('Aspirateur'), area: null, manufacturer: 'Démo', model: 'Orbit V3', firmware: null, via: null, entry_type: null, integration: 'ecovacs' },
      { id: 'robot_tondeuse', name: etiquette('Tondeuse'), area: null, manufacturer: 'Démo', model: 'Meadow M2', firmware: null, via: null, entry_type: null, integration: 'mammotion' },
      // Les appareils du planning de chauffe : deux modules fil pilote, le poêle du salon.
      { id: 'radiateur_chambre', name: etiquette('Radiateur chambre'), area: 'chambre', manufacturer: 'Démo', model: etiquette('Module fil pilote'), firmware: null, via: null, entry_type: null, integration: 'demo' },
      { id: 'radiateur_bureau', name: etiquette('Radiateur bureau'), area: 'bureau', manufacturer: 'Démo', model: etiquette('Module fil pilote'), firmware: null, via: null, entry_type: null, integration: 'demo' },
      { id: 'poele', name: etiquette('Poêle'), area: 'salon', manufacturer: 'Démo', model: etiquette('Poêle à granulés'), firmware: null, via: null, entry_type: null, integration: 'demo' },
      // Les prises (chantier Prises, § 10) : des prises Zigbee, derrière le pont de Zigbee2MQTT ; la sirène de l'alarme aussi.
      { id: 'pont_z2m', name: 'Zigbee2MQTT Bridge', area: null, manufacturer: 'Zigbee2MQTT', model: MODELE_PONT_DEMO, firmware: null, via: null, entry_type: 'service', integration: 'mqtt' },
      ...PRISES_DEMO.map(id => ({ id: appareilPriseDemo(id), name: etiquette(NOMS_PRISES_DEMO[id]), area: PIECES_PRISES_DEMO[id], manufacturer: 'Démo', model: etiquette('Prise connectée'),
        firmware: null, via: 'pont_z2m', entry_type: null, integration: 'mqtt' })),
      { id: 'alarme_sirene', name: etiquette('Alarme sirène'), area: 'entree', manufacturer: 'Démo', model: etiquette('Sirène'), firmware: null, via: 'pont_z2m', entry_type: null, integration: 'mqtt' },
      /* Les appareils des mesures (chantier Capteurs, § 9 ; C14, C16) : chacun PHYSIQUE, dans sa pièce — le thermomètre du salon, sa
       * température, son hygromètre et sa pile ; le capteur de chaque pièce ; la station du jardin, dans sa pièce du dehors (C17). */
      ...Object.keys(APPAREILS_MESURES_DEMO).map(id => ({ id, name: etiquette(APPAREILS_MESURES_DEMO[id][1]), area: APPAREILS_MESURES_DEMO[id][0], manufacturer: 'Démo',
        model: etiquette(APPAREILS_MESURES_DEMO[id][2]), firmware: null, via: null, entry_type: null, integration: id === 'station_jardin' ? 'netatmo' : 'demo' })),
      /* Les capteurs de sa maquette « Cartes capteurs » (chantier Capteurs, étapes 2 et 3, § 12 ; C21, C29) : des appareils PHYSIQUES — les contacts, les
       * détecteurs et le bouton derrière le pont de Zigbee2MQTT, les deux plantes en Bluetooth. Deux contacts n'ont pas de zone. */
      ...Object.keys(APPAREILS_CAPTEURS_DEMO).map(id => ({ id, name: etiquette(APPAREILS_CAPTEURS_DEMO[id][1]), area: APPAREILS_CAPTEURS_DEMO[id][0], manufacturer: 'Démo',
        model: etiquette(APPAREILS_CAPTEURS_DEMO[id][2]), firmware: null, via: id.indexOf('plante_') === 0 ? null : 'pont_z2m', entry_type: null, integration: id.indexOf('plante_') === 0 ? 'xiaomi_ble' : 'mqtt' })),
      ...distribs.map(id => ({ id, name: etiquette('Distributeur de croquettes'), area: 'cuisine', manufacturer: APPAREIL_DIST[id].fabricant,
        model: APPAREIL_DIST[id].modele, firmware: null, via: null, entry_type: null, integration: DISTRIBUTEURS_DEMO[id][0] }))],
    entities,
    floors: [
      { id: 'rdc', name: etiquette('Rez-de-chaussée'), level: 0 },
      { id: 'etage', name: etiquette('Étage'), level: 1 },
    ],
    services: {},
    component_version: null,
  };
}

/* Depart et retour : la regle armee, alarme comprise, mais le desarmement au
 * retour laisse ferme — c'est le defaut, et la demonstration doit le montrer. */
const PRE_CFG = {
  actif: true, delai_depart: 5, personnes: ['person.demo', 'person.sam'],
  depart: { lumieres: true, chauffage: { actif: true, consigne: 17, confort: 20 },
    alarme: { actif: true, entite: 'alarm_control_panel.maison', mode: 'away' } },
  retour: { lumieres: true, seulement_la_nuit: true, chauffage: true, desarmer: false },
  indices: { actif: true, mains: true },
};

function presenceDemo() {
  return {
    config: PRE_CFG,
    dehors: false,
    en_attente: false,
    eteintes: [],
    indices: { capteurs: ['binary_sensor.fenetre_chambre', 'binary_sensor.fenetre_salon', 'binary_sensor.porte_entree'],
      // Le nom que le serveur lirait sur l'état, donc traduit comme lui (audit du 03/10).
      dernier: { entite: 'binary_sensor.porte_entree', nom: etiquette("Porte d'entrée"), genre: 'ouverture', ts: Date.now() / 1000 - 600 } },
    journal: [
      // Le gabarit de presence.py, et le nom que porte l'état du capteur.
      ligneJournal({ module: 'presence', regle: 'depart', quoi: 'reporter', cibles: [], n: 0, motif: [['ouverture : {nom}', { nom: etiquette("Porte d'entrée") }]], detail: '', simule: false, ts: Date.now() / 1000 - 600 }),
      { module: 'presence', regle: 'retour', quoi: 'rallumer', cibles: ['light.salon', 'light.cuisine'], n: 2, motif: 'retour', detail: '', simule: false, ts: Date.now() / 1000 - 7200 },
      { module: 'presence', regle: 'depart', quoi: 'eteindre', cibles: ['light.salon', 'light.cuisine', 'light.bureau'], n: 3, motif: 'maison vide', detail: '', simule: false, ts: Date.now() / 1000 - 34000 },
    ],
  };
}

function presencePatch(patch) {
  const objet = (x) => x && typeof x === 'object' && !Array.isArray(x);
  Object.keys(patch || {}).forEach(k => {
    if (objet(PRE_CFG[k]) && objet(patch[k])) {
      Object.keys(patch[k]).forEach(kk => {
        if (objet(PRE_CFG[k][kk]) && objet(patch[k][kk])) Object.assign(PRE_CFG[k][kk], patch[k][kk]);
        else PRE_CFG[k][kk] = patch[k][kk];
      });
    } else PRE_CFG[k] = patch[k];
  });
  return PRE_CFG;
}

/* La nuit : la veilleuse d'une chambre reglee, l'extinction du soir armee et
 * la veilleuse mise de cote — c'est l'usage le plus courant, autant le
 * montrer plutot qu'un formulaire vide. */
/* Paresseux, comme `FEN_CFG()` (audit du 03/10) : la pièce de l'éclairage
 * nocturne est une CLÉ, comparée au nom de la zone. Bâtie à l'import, elle
 * restait « Entrée » quand la zone s'appelait « Wejście » : la puce de la
 * pièce se montrait éteinte, et la toucher en rangeait une seconde. */
let NUI_CFG_ = null;
const NUI_CFG = () => (NUI_CFG_ || (NUI_CFG_ = {
  // La veilleuse de Lino (chantier Lumières, § 9) : celle de sa maquette, réglée comme chez lui — éteinte une heure après son allumage.
  veilleuse: { actif: true, lampes: ['light.veilleuse_chambre_lino'], duree: 60, fondu: 5, depuis: '19:00' },
  coucher: { actif: true, heure: '23:30', sauf: ['light.veilleuse_chambre_lino'], jours: [0, 1, 2, 3, 4, 5, 6] },
  eclairage: { actif: true, luminosite: 10, duree: 3, pieces: { [lieu('Entrée')]: { actif: true, capteurs: ['binary_sensor.mouvement_entree'], lampes: ['light.entree'] } } },
}));

function nuitDemo() {
  return {
    config: NUI_CFG(),
    en_cours: [],
    eclairees: {},
    journal: [
      // Les gabarits de nuit.py et du socle (« sous la main »), parties comprises.
      ligneJournal({ module: 'nuit', regle: 'eclairage', quoi: 'allumer', cibles: ['light.entree'], n: 1, motif: [['mouvement : {piece}', { piece: lieu('Entrée') }]], detail: '', simule: false, ts: Date.now() / 1000 - 30000 }),
      ligneJournal({ module: 'nuit', regle: 'eclairage', quoi: 'eteindre', cibles: ['light.entree'], n: 1, motif: [['{n} min sans mouvement', { n: 3 }]], detail: '', simule: false, ts: Date.now() / 1000 - 29700 }),
      // La veilleuse de Lino, éteinte dans sa journée (chantier Lumières, § 8 et 9) : le fondu qui suit est à cette ligne.
      ligneJournal({ module: 'nuit', regle: 'veilleuse', quoi: 'eteindre', cibles: ['light.veilleuse_chambre_lino'], n: 1, motif: [['{n} min', { n: 60 }]], detail: '', simule: false, ts: histoireLumieresAujourdhui().veilleuse }),
      ligneJournal({ module: 'nuit', regle: 'coucher', quoi: 'eteindre', cibles: ['light.salon', 'light.cuisine'], n: 2, motif: '23:30', detail: [['{n} sous la main de quelqu’un', { n: 1 }]], simule: false, ts: Date.now() / 1000 - 54000 }),
    ],
  };
}

function nuitPatch(patch) {
  Object.keys(patch || {}).forEach(k => {
    if (!NUI_CFG()[k]) return;
    // Les pièces de l'éclairage nocturne arrivent une à la fois, comme sur le serveur.
    if (k === 'eclairage' && patch[k] && patch[k].pieces) {
      const pieces = { ...(NUI_CFG().eclairage.pieces || {}) };
      Object.keys(patch[k].pieces).forEach(nom => {
        if (patch[k].pieces[nom] === null) delete pieces[nom];
        else pieces[nom] = { ...(pieces[nom] || {}), ...patch[k].pieces[nom] };
      });
      Object.assign(NUI_CFG()[k], patch[k], { pieces });
    } else Object.assign(NUI_CFG()[k], patch[k]);
  });
  return NUI_CFG();
}

/* Les trois veilles : l'air arme, les piles armees, le tarif au repos faute
 * de capteur de tarif dans la maison de demonstration. */
const VEI_CFG = {
  co2: { actif: true, seuil: 1400, capteurs: [], ventilation: [] },
  batterie: { actif: true, seuil: 15 },
  creuses: { actif: false, entite: '', valeur: '', prises: [] },
  // « Observer sans agir » (audit du 19/10, H3) : le drapeau du vrai composant, que l'interrupteur des Règles pose avec les autres.
  simulation: { actif: false },
};

/* Le journal de la maison : les lignes de chaque module, melees dans l'ordre
 * du temps, plus ce que le socle retient en ce moment. La demo montre une
 * main posee sur une lampe (le gel), un volet tenu par la protection
 * solaire, et une ligne simulee — de quoi voir chaque filtre agir. */
const GELS_DEMO = { 'light.salon': 1260 };
/* La ligne simulée de la chambre, une fermeture du soir : une heure après le
 * dernier coucher du soleil passé, à l'horloge des volets — « il y a une
 * heure » la montrait dans ses manœuvres à toute heure (relecture du 13/10,
 * point 8). */
function simuleeChambre() {
  const t = horlogeVolets();
  const ce = soleilDuJour(t, 0).coucher + 60 * MINUTE_MS;
  return ce <= t ? ce : soleilDuJour(t, -1).coucher + 60 * MINUTE_MS;
}
/* Exporté pour `tests/demo_noms.test.mjs`, qui lit ce journal tel que l'écran
 * le reçoit (relecture du 03/10). */
export function reglesDemo(states) {
  const { volets } = voletsDemo(states);
  const lignes = [
    // La règle d'un interrupteur porte son NOM : traduit comme sa fiche (audit du 03/10).
    { module: 'interrupteurs', regle: etiquette('Variateur Salon'), quoi: 'bouton', cibles: ['light.salon'], n: 1, motif: 'on_press_release → light.turn_on', detail: '', simule: false, ts: Date.now() / 1000 - 540 },
    ligneJournal({ module: 'volets', regle: 'planning', quoi: 'fermer', cibles: ['cover.volet_chambre'], n: 1, motif: [['coucher du soleil {d} min', { d: '+30' }]], detail: '', simule: true, ts: simuleeChambre() / 1000 }),
    ...voletsDemo(states).journal, ...fenetresDemo().journal, ...presenceDemo().journal,
    ...nuitDemo().journal, ...veillesDemo(states).journal,
    // Le planning de chauffe écrit au même journal (§ 5.5) : ses lignes, une fois la maison montée.
    ...journalChauffageDemo(),
    // Le minuteur des prises : sa pose et son extinction (chantier Prises, § 6.3).
    ...PRISES_JOURNAL,
    // Les cycles du lave-vaisselle, comme le serveur les écrit (le contrat du plan 1).
    ...journalCyclesDemo(),
    // Le minuteur de l'ampoule de la chambre, posé dans sa journée (chantier Lumières, § 9).
    ...journalLumieresDemo(),
    // Le mode enfant (chantier Mode enfant, § 10) : ce que la maison a ramené, éteint, accordé — les mots du serveur.
    ...ENFANT_JOURNAL,
  ];
  lignes.sort((a, b) => b.ts - a.ts);
  return {
    journal: lignes,
    gels: { ...GELS_DEMO },
    // Ce que la protection solaire tient, et ce qui attend une baie : ce que dit l'état des volets.
    tenues: Object.fromEntries(Object.entries(volets).filter(([, v]) => v.protection).map(([id]) => [id, { module: 'volets', regle: 'soleil' }])),
    attentes: Object.fromEntries(Object.entries(volets).filter(([, v]) => v.attente)
      .map(([id, v]) => [id, { sens: v.attente.sens, motif: v.attente.motif, expire: Date.parse(v.attente.expire) / 1000 }])),
    calme: false,
  };
}

function veillesDemo(states) {
  const classe = (c) => Object.keys(states)
    .filter(id => (id.startsWith('sensor.') || id.startsWith('binary_sensor.'))
      && ((states[id].attributes || {}).device_class === c)).sort();
  return {
    config: VEI_CFG,
    capteurs_co2: classe('carbon_dioxide'),
    capteurs_batterie: classe('battery'),
    notification: true,
    signales: [],
    // Le gabarit de veilles.py ; le capteur porte le nom de son état, traduit comme lui.
    journal: [ligneJournal({ module: 'veilles', regle: 'co2', quoi: 'prevenir', cibles: [], n: 1, motif: [['{v} ppm', { v: 1310 }]], detail: [['{nom} : {v} ppm, il faut aerer', { nom: lieu('Chambre') + ' CO2', v: 1310 }]], simule: false, ts: Date.now() / 1000 - 9000 })],
  };
}

function veillesPatch(patch) {
  Object.keys(patch || {}).forEach(k => {
    if (VEI_CFG[k]) Object.assign(VEI_CFG[k], patch[k]);
  });
  return VEI_CFG;
}

/* Le planning des robots (ADR 0043). Lundi vaut 0, comme côté serveur. La
 * tondeuse de la démo a son capteur de pluie : c'est lui que l'onglet montre. */
/* Le code administrateur de la demo : verifie « par le serveur », comme en vrai. */
// `passe` (chantier Mode enfant, E2 B) : jusqu'à quand un code juste vaut laissez-passer — cinq minutes, pour les réglages du parent.
const PIN_DEMO = { code: '0000', rates: 0, passe: 0 };

/* Paresseux, comme `SCN_CFG()` (audit du 03/10) : la zone de la tondeuse porte
 * le nom de son interrupteur, et la langue de la maison n'est connue qu'à
 * `installerDemo`. Bâti à l'import, le planning annonçait « Pelouse avant »
 * à côté de la puce « Front lawn ». Les zones de l'aspirateur, elles, sont les
 * clés que le ROBOT publie (`rooms`) : françaises sur ses puces, elles le
 * restent ici. */
let ROB_CFG_ = null;
const ROB_CFG = () => (ROB_CFG_ || (ROB_CFG_ = {
  plannings: [
    // Un passage par ZONES de Home Assistant (tranche robots 2, R5) : la zone garde son identifiant, jamais un segment.
    { id: 'p-semaine', robot: 'vacuum.aspirateur', heure: '09:30', jours: [0, 1, 2, 3, 4], actif: true,
      zones: [{ id: 'zone:salon', nom: lieu('Salon'), segments: [], zone: 'salon' }, { id: 'zone:cuisine', nom: lieu('Cuisine'), segments: [], zone: 'cuisine' }] },
    // Un passage d'AVANT, par segments : il part comme avant tant que le robot sait les viser.
    { id: 'p-samedi', robot: 'vacuum.aspirateur', heure: '18:00', jours: [5], actif: true, zones: [{ id: 'seg:3', nom: lieu('Bureau'), segments: [3] }] },
    // 23:00 le dimanche, ALLUMÉ (chantier IoT, § 10) : pris dans « Ne pas déranger » (22:00–07:00), il le dit et ne partira pas.
    { id: 'p-nuit', robot: 'vacuum.aspirateur', heure: '23:00', jours: [6], actif: true, zones: [] },
    { id: 'p-tonte', robot: 'lawn_mower.tondeuse', heure: '10:00', jours: [1, 4], actif: true,
      zones: [{ id: 'switch.tondeuse_zone_pelouse_avant', nom: etiquette('Pelouse avant'), segments: [] }] },
  ],
  robots: { 'vacuum.aspirateur': { calme: { actif: true, debut: '22:00', fin: '07:00' }, pluie: { actif: false } } },
}));

/* Une COPIE à chaque réponse, comme un vrai serveur : l'écran ne doit pas
 * tenir l'objet que la commande suivante modifiera. */
const copieRobots = () => JSON.parse(JSON.stringify(ROB_CFG()));

/* Les minuteurs de la démo : en mémoire, comme la table du vrai composant —
 * une heure de fin en secondes, et le temps S'AJOUTE à ce qui reste. */
const MIN_DEMO = {};
/** Un appareil qui passe à `off` n'a plus de minuteur, comme chez le vrai composant (`minuteurs.py`, `_sur_etat`) : « off »
 *  seulement — une lampe qui décroche (`unavailable`) n'a pas été éteinte, son minuteur tient. Éteinte à la main puis
 *  rallumée, une lampe ou une prise ne retrouve donc pas son « S'éteint à ». */
export function minuteurSiEteint(id, etat) {
  if (String(etat).toLowerCase() === 'off') delete MIN_DEMO[id];
}
function minuteursDemo() {
  const maintenant = Date.now() / 1000;
  const en_cours = {};
  Object.keys(MIN_DEMO).forEach(id => { if (MIN_DEMO[id].fin > maintenant) en_cours[id] = { ...MIN_DEMO[id] }; else delete MIN_DEMO[id]; });
  return { minuteurs: en_cours, maintenant };
}
function minuteursPoser(id, minutes) {
  const maintenant = Date.now() / 1000;
  const actuel = MIN_DEMO[id] && MIN_DEMO[id].fin > maintenant ? MIN_DEMO[id] : null;
  const n = Math.max(1, Math.min(24 * 60, Number(minutes) || 30));
  MIN_DEMO[id] = { fin: Math.min((actuel ? actuel.fin : maintenant) + n * 60, maintenant + 24 * 3600), duree: (actuel ? actuel.duree : 0) + n };
  return minuteursDemo();
}

/* ── Le carnet des robots (chantier IoT, I3 A ; § 10 de la conception) ────────
 *
 * Ce que tient `robots.py` : les passages de sa maquette — relatifs à l'heure de
 * la démo, en secondes comme le serveur — et la session en cours : la tondeuse en
 * pleine tonte sur « Pelouse arrière » depuis 1 h 40 ; avec `?demo&robots=pause`,
 * l'aspirateur en pause sur Salon et Cuisine, 23 m² faits. Il suit les robots
 * comme le vrai (`suivreRobots`) : un robot qui se met au travail ouvre une
 * session — les pièces d'un départ lancé par Loggia, sinon aucune —, la base,
 * l'arrêt ou une erreur la ferment. Paresseux, comme `ROB_CFG()` : les noms
 * suivent la langue de la maison, connue à `installerDemo`. */
let horlogeRobots = () => Date.now();
let VARIANTE_ROBOTS = null;
let CARNET_ROB_ = null;
const ROBOTS_DEMO = /^(vacuum|lawn_mower)\./;
/* La phase d'un robot, celle de ses cartes (`phaseRobot`, robots.js), pour les états que la démo pose. Recopiée, pas importée :
 * un import de robots.js depuis la démo — chargée à la demande, comme le démarrage — tirait du démarrage un morceau qu'ils
 * partageaient (mesuré le 18/10 : `boot-*.js` −51 216 octets, mais un morceau de 52 576 chargé avec lui ; la borne ne mesurait
 * plus ce que le démarrage charge). tests/demo_robots.test.mjs la compare à `phaseRobot`. */
const PHASES_ROBOT_DEMO = { cleaning: 'travail', mowing: 'travail', paused: 'pause', returning: 'retour', docked: 'base', idle: 'repos', error: 'erreur' };
export const phaseRobotDemo = (etat) => PHASES_ROBOT_DEMO[etat] || 'absent';
// Les aires de la tondeuse, par leur interrupteur : le nom que la fiche leur donne (le sien, sans « Tondeuse Zone »).
const AIRES_DEMO = { 'switch.tondeuse_zone_pelouse_avant': 'Pelouse avant', 'switch.tondeuse_zone_pelouse_arriere': 'Pelouse arrière', 'switch.tondeuse_zone_cote_garage': 'Côté garage' };
const aireDemo = (id) => ({ id, nom: etiquette(AIRES_DEMO[id] || id) });
function carnetRobots() {
  if (CARNET_ROB_) return CARNET_ROB_;
  const t = horlogeRobots();
  const le = (jours, h, m) => { const d = new Date(t); d.setDate(d.getDate() - jours); d.setHours(h, m, 0, 0); return d.getTime() / 1000; };
  // Les zones de Home Assistant, par leur identifiant de zone (tranche robots 2) : les puces de « Où » retrouvent ce qui se nettoie.
  const salonCuisine = [{ id: 'zone:salon', nom: lieu('Salon') }, { id: 'zone:cuisine', nom: lieu('Cuisine') }];
  const avant = [aireDemo('switch.tondeuse_zone_pelouse_avant')];
  const passage = (robot, debut, min, issue, x) => ({ robot, debut, fin: debut + min * 60, travail_s: min * 60, issue, zones: [], tout: false, source: 'loggia', surface: null, motif: null, ...x });
  CARNET_ROB_ = {
    passages: [
      passage('vacuum.aspirateur', le(1, 8, 30), 51, 'termine', { zones: salonCuisine, surface: 42 }),
      passage('vacuum.aspirateur', le(3, 8, 30), 22, 'interrompu', { zones: salonCuisine, surface: 19, motif: etiquette('Bloqué sous le canapé') }),
      passage('vacuum.aspirateur', le(5, 14, 2), 94, 'termine', { tout: true, surface: 68 }),
      passage('lawn_mower.tondeuse', le(2, 10, 0), 72, 'termine', { zones: avant, surface: 210 }),
      passage('lawn_mower.tondeuse', le(4, 10, 0), 40, 'interrompu', { zones: avant, surface: 96, motif: etiquette('Pluie détectée') }),
    ],
    en_cours: {
      'lawn_mower.tondeuse': { debut: t / 1000 - 100 * 60, zones: [aireDemo('switch.tondeuse_zone_pelouse_arriere')], tout: false, source: 'loggia', surface: 140 },
      ...(VARIANTE_ROBOTS === 'pause' ? { 'vacuum.aspirateur': { debut: t / 1000 - 25 * 60, zones: salonCuisine, tout: false, source: 'loggia', surface: 23 } } : {}),
    },
  };
  return CARNET_ROB_;
}

/* Les variantes des robots (`?demo&robots=…`) : `pause` (§ 10 : l'aspirateur s'est arrêté au milieu de Salon et Cuisine), et celles
 * de la tranche robots 2 (§ 9 de sa conception) — `sans-association` (le bit, rien d'associé, et un robot qui ne publie pas ses
 * pièces, comme un Roborock : le chemin exact à un administrateur), `sans-association-rooms` (le bit, rien d'associé, les pièces
 * publiées par `spot_area`), `exception` (un Ecovacs sans le bit qui publie `rooms`, sans aucun script de départ : la commande de ses
 * scripts, avec le compteur de passages de l'appareil), `rooms-vide` (le même, un jour sans carte), `scripts` (ses interrupteurs et
 * son script gardent la main devant une association de Home Assistant), `carte-changee` (la réparation de Home Assistant ouverte),
 * `etages` (deux cartes) ; et, depuis la passe bis du 20/10 (sa décision « Mon script garde la main »), SON cas : `scripts-sans-pieces`
 * (son Ecovacs sans le bit qui publie `rooms`, ses interrupteurs, ses cinq scripts par rôle SANS celui des pièces — aucune puce, la
 * ligne qui dit où le désigner) et `scripts-avec-pieces` (le même, le script des pièces désigné — les puces sont ses interrupteurs). */
const VARIANTES_ROBOTS = ['pause', 'sans-association', 'sans-association-rooms', 'exception', 'rooms-vide', 'scripts', 'carte-changee', 'etages', 'scripts-sans-pieces', 'scripts-avec-pieces'];
const VARIANTES_SCRIPTS = ['scripts', 'scripts-sans-pieces', 'scripts-avec-pieces'];
function varianteRobots(states) {
  const id = 'vacuum.aspirateur';
  if (!states[id]) return;
  const v = VARIANTE_ROBOTS;
  if (v === 'pause') states[id] = { ...states[id], state: 'paused' };
  // Un robot qui ne publie pas ses pièces (Roborock n'a pas d'attribut `rooms`) : rien à offrir tant que l'association n'est pas faite.
  if (v === 'sans-association') states[id] = { ...states[id], attributes: { ...states[id].attributes, rooms: {} } };
  if (v === 'exception' || v === 'rooms-vide' || v === 'scripts-sans-pieces' || v === 'scripts-avec-pieces') {
    // Sans le bit CLEAN_AREA : Home Assistant n'offre ni l'association ni `clean_area`, et refuse `spot_area` (R1).
    states[id] = { ...states[id], attributes: { ...states[id].attributes, supported_features: 8828, ...(v === 'rooms-vide' ? { rooms: {} } : {}) } };
    if (v === 'exception') states['number.aspirateur_compteur_de_nettoyage'] = s(2, { friendly_name: 'Aspirateur Compteur de nettoyage', min: 1, max: 4, step: 1 });
  }
  if (v === 'etages') states['select.aspirateur_carte_active'] = s(etiquette('Rez-de-chaussée'), { friendly_name: 'Aspirateur Carte active', options: [etiquette('Rez-de-chaussée'), etiquette('Étage')] });
  if (VARIANTES_SCRIPTS.indexOf(v) >= 0) {
    states['script.nettoyer_pieces_demo'] = s('off', { friendly_name: etiquette('Nettoyer les pièces choisies') });
    states['input_boolean.nettoyer_salon_demo'] = s('off', { friendly_name: etiquette('Nettoyer le salon') });
    states['input_boolean.nettoyer_cuisine_demo'] = s('off', { friendly_name: etiquette('Nettoyer la cuisine') });
  }
  if (v === 'scripts-sans-pieces' || v === 'scripts-avec-pieces') {
    // Ses cinq scripts par rôle, et un script de la maison qui n'est pas au robot (les suggestions de la roue les rangent à part).
    states['script.aspirateur_nettoyer_tout'] = s('off', { friendly_name: etiquette('Nettoyer tout le logement') });
    states['script.aspirateur_pause'] = s('off', { friendly_name: etiquette('Pause de l’aspirateur') });
    states['script.aspirateur_reprendre'] = s('off', { friendly_name: etiquette('Reprendre l’aspirateur') });
    states['script.aspirateur_retour_base'] = s('off', { friendly_name: etiquette('Retour à la base') });
    states['script.aspirateur_localiser'] = s('off', { friendly_name: etiquette('Localiser l’aspirateur') });
    states['script.arroser_le_jardin_demo'] = s('off', { friendly_name: etiquette('Arroser le jardin') });
  }
}

/* Les scripts de la maison que le faux serveur reconnaît (`vacuumScripts`) : ceux de la description de la maison telle qu'elle est
 * dans le magasin de la démo quand on la lui donne (`entites`, lu par `installerDemo` — un rôle désigné dans la roue compte sur-le-champ),
 * sinon ceux de la variante. */
function scriptsDemo(entites = null) {
  const e = entites && typeof entites === 'object' ? entites : configDemo().loggia_entities;
  return e && e.vacuumScripts && typeof e.vacuumScripts === 'object' ? e.vacuumScripts : {};
}
const ROLES_SCRIPTS_DEMO = ['nettoyer_tout', 'pieces_selectionnees', 'pause', 'reprendre', 'retour_base', 'localiser'];

/* `loggia/robots/scripts` (passe bis 2 du 20/10, relecture de contrôle) : la roue de la popup envoie le RÔLE seul, et le faux serveur
 * le fond dans la description de la maison telle qu'elle est dans le magasin de la démo — `fusion_vacuum_scripts` du vrai : rien d'autre
 * que `vacuumScripts[role]` ne bouge, un rôle vide (`script` null) est retiré et le dernier emporte `vacuumScripts`, une description
 * illisible refuse (`invalid_format`). Pure : rend la description d'après. */
export function designerScriptDemo(entites, role, script) {
  const refus = (message) => Object.assign(new Error(message), { code: 'invalid_format' });
  if (ROLES_SCRIPTS_DEMO.indexOf(role) < 0) throw refus('role de script invalide');
  if (script != null && !(typeof script === 'string' && /^script\.[a-z0-9_]+$/.test(script))) throw refus('script invalide');
  const e = entites == null ? {} : entites;
  if (typeof e !== 'object' || Array.isArray(e)) throw refus('description de la maison illisible');
  const scripts = { ...(e.vacuumScripts && typeof e.vacuumScripts === 'object' && !Array.isArray(e.vacuumScripts) ? e.vacuumScripts : {}) };
  if (script == null) delete scripts[role]; else scripts[role] = script;
  const suite = { ...e };
  if (Object.keys(scripts).length) suite.vacuumScripts = scripts; else delete suite.vacuumScripts;
  return suite;
}

/* Les zones de Home Assistant de la maison de la démo, associées à l'aspirateur : zone, nom, étage, numéro de pièce du robot. */
const ZONES_ROBOT_DEMO = [['cuisine', 'Cuisine', 'rdc', 2], ['entree', 'Entrée', 'rdc', 5], ['salon', 'Salon', 'rdc', 1], ['bureau', 'Bureau', 'etage', 3], ['chambre', 'Chambre', 'etage', 4]];

/* `pieces` de `loggia/robots/etat` (tranche robots 2, § 5.2 ; allégé à la passe bis du 20/10 de ce que l'écran ne lit pas) : ce que
 * le vrai serveur lit de Home Assistant, selon la variante — et ses scripts de départ tels que le magasin de la démo les dit
 * (`entites`), comme le vrai serveur lit la description de la maison. */
function piecesRobotDemo(states, entites = null) {
  const st = states['vacuum.aspirateur'];
  if (!st) return null;
  const a = st.attributes || {};
  const v = VARIANTE_ROBOTS;
  const capable = !!(Number(a.supported_features) & 16384);
  const association = capable && v !== 'sans-association' && v !== 'sans-association-rooms';
  const zones = [], autres_zones = [];
  if (association) ZONES_ROBOT_DEMO.forEach(([zone, nom, etage, seg]) => {
    if (v === 'etages' && etage === 'etage') { autres_zones.push(zone); return; }
    zones.push({ id: 'zone:' + zone, nom: lieu(nom), zone, segments: ['m1_' + seg] });
  });
  const rooms = a.rooms && typeof a.rooms === 'object' ? a.rooms : {};
  const segments = Object.keys(rooms).map(slug => ({ id: 'seg:' + rooms[slug], nom: slug.charAt(0).toUpperCase() + slug.slice(1).replace(/_/g, ' '), slug, segments: [Number(rooms[slug])] }))
    .sort((x, y) => x.segments[0] - y.segments[0]);
  // Un script de DÉPART désigné et présent (sa décision du 20/10) : la source `scripts`, et Loggia ne prend pas la main sur les pièces.
  const scripts = scriptsDemo(entites);
  const present = (id) => typeof id === 'string' && !!states[id];
  const script = present(scripts.pieces_selectionnees) ? 'pieces' : present(scripts.nettoyer_tout) ? 'depart' : null;
  const commande = script ? null : zones.length ? 'clean_area' : segments.length ? (capable ? 'spot_area' : 'clean_V2') : null;
  return {
    source: script ? 'scripts' : commande === 'clean_area' ? 'zones' : commande ? 'segments' : 'aucune',
    capable, association, carte_changee: v === 'carte-changee', script_pieces: script === 'pieces', zones,
    autres_cartes: autres_zones.length ? [{ carte: etiquette('Étage'), n: autres_zones.length }] : [], autres_zones,
    segments,
    // Les rôles désignés (passe bis 2 du 20/10) : la roue lit la vérité du serveur — ici, la description du magasin de la démo.
    scripts: Object.fromEntries(Object.entries(scripts).filter(([r, s]) => ROLES_SCRIPTS_DEMO.indexOf(r) >= 0 && typeof s === 'string')),
  };
}

/* Le carnet suit les robots, comme les écouteurs de `robots.py` : au travail sans session, il en ouvre une — partie sans Loggia,
 * ses pièces ne se savent pas ; sur la base, arrêté ou en erreur, il la ferme — moins d'une minute, c'est un faux départ, qui ne se
 * garde pas. Un robot muet garde la sienne ouverte. */
function suivreRobots(states) {
  const c = carnetRobots();
  const t = horlogeRobots() / 1000;
  Object.keys(states).filter(id => ROBOTS_DEMO.test(id)).forEach(id => {
    const phase = phaseRobotDemo(states[id].state);
    const s = c.en_cours[id];
    if (phase === 'travail' && !s) c.en_cours[id] = { debut: t, zones: [], tout: false, source: 'appareil', surface: null };
    else if (s && (phase === 'base' || phase === 'repos' || phase === 'erreur')) {
      if (t - s.debut >= 60) {
        c.passages.push({ robot: id, debut: s.debut, fin: t, travail_s: t - s.debut, issue: phase === 'base' ? 'termine' : phase === 'erreur' ? 'erreur' : 'interrompu',
          zones: s.zones, tout: s.tout, source: s.source, surface: s.surface, motif: null });
      }
      delete c.en_cours[id];
    }
  });
}

/* `loggia/robots/etat` : la configuration, et le carnet tel que le serveur le rend — le passage le plus récent d'abord, une COPIE.
 * `entites` : la description de la maison du magasin de la démo (ses scripts désignés dans la roue), quand l'appelant la donne. */
function robotsDemo(states, entites = null) {
  suivreRobots(states);
  const c = carnetRobots();
  const t = horlogeRobots() / 1000;
  const zones = (l) => l.map(z => ({ ...z }));
  const en_cours = {};
  Object.keys(c.en_cours).forEach(id => {
    const s = c.en_cours[id];
    en_cours[id] = { debut: s.debut, phase: phaseRobotDemo(states[id] && states[id].state), duree_min: Math.max(0, Math.round((t - s.debut) / 60)),
      zones: zones(s.zones), tout: s.tout, source: s.source, surface: s.surface, libelle: s.libelle || null };
  });
  return {
    config: copieRobots(), meteo: Object.keys(states).filter(id => id.startsWith('weather.')).sort()[0] || null, journal: [],
    passages: c.passages.slice().sort((a, b) => b.fin - a.fin).map(p => ({ robot: p.robot, debut: p.debut, fin: p.fin, duree_min: Math.round(p.travail_s / 60), issue: p.issue,
      zones: zones(p.zones), tout: p.tout, source: p.source, surface: p.surface, motif: p.motif, libelle: p.libelle || null })),
    // Plus de `maintenant` (passe bis du 18/10, point 10), comme le serveur : l'écran ne le lisait pas.
    en_cours, erreurs: {},
    // Les pièces de chaque aspirateur selon Home Assistant (tranche robots 2, R3) : la variante décide, et ses scripts désignés.
    pieces: states['vacuum.aspirateur'] ? { 'vacuum.aspirateur': piecesRobotDemo(states, entites) } : {},
  };
}

/* `loggia/robots/lancer` (I3 A), et ses refus — ceux du vrai composant, leurs codes avec : un robot muet, déjà en route, des
 * pièces sans segment (l'aspirateur ne saurait pas les viser), une zone qui n'est pas la sienne. Le robot part ; une tondeuse
 * allume ses aires choisies et éteint les autres ; le carnet ouvre le passage avec ses pièces. `entites` : la description de la
 * maison du magasin de la démo (passe bis du 20/10) — ses scripts par rôle, un rôle désigné dans la roue compte sur-le-champ. */
function lancerRobotDemo(states, msg, toucher, entites = null) {
  const rid = msg && msg.robot;
  const st = rid && ROBOTS_DEMO.test(rid) ? states[rid] : null;
  const refus = (code, message) => Promise.reject({ code, message });
  if (!st) return refus('invalid_format', 'robot invalide');
  // Les scripts maison (`vacuumScripts`, passe bis du 18/10, point A) : le serveur ne lance que les siens — celui du RÔLE demandé,
  // désigné pour l'aspirateur et présent ; la maison par défaut n'en a pas.
  const scripts = rid === 'vacuum.aspirateur' ? scriptsDemo(entites) : {};
  const script = msg.script != null;
  if (script && !(scripts[msg.role] === msg.script && states[msg.script])) {
    return refus('script_inconnu', 'script inconnu de ce robot : ' + rid);
  }
  const domaine = rid.split('.')[0];
  const phase = phaseRobotDemo(st.state);
  let zones = Array.isArray(msg.zones) ? msg.zones.filter(z => z && z.id) : [];
  let tout = !zones.length;
  suivreRobots(states); // le passage qui finissait se range d'abord
  if (script && (msg.role === 'pause' || msg.role === 'reprendre' || msg.role === 'retour_base' || msg.role === 'localiser')) {
    // Un GESTE par script (`script.turn_on` chez le vrai) : la démo joue ce que le script ferait ; localiser ne change rien.
    const cible = { pause: 'paused', reprendre: 'cleaning', retour_base: 'returning' }[msg.role];
    if (cible) toucher(rid, cible);
    return Promise.resolve(robotsDemo(states, entites));
  }
  if (phase === 'absent') return refus('robot_injoignable', 'robot injoignable : ' + rid);
  if (phase === 'travail' || phase === 'pause' || phase === 'retour') return refus('deja_en_route', 'deja en route : ' + rid);
  if (script) {
    // Un script de DÉPART part : le passage dit son nom — les pièces choisies par leurs interrupteurs, ou tout le logement.
    const nom = (states[msg.script].attributes || {}).friendly_name || msg.script;
    toucher(rid, 'cleaning');
    carnetRobots().en_cours[rid] = { debut: horlogeRobots() / 1000, zones: zones.map(z => ({ id: String(z.id), nom: String(z.nom || z.id) })),
      tout: msg.role === 'nettoyer_tout', source: 'loggia', surface: null, libelle: nom };
    return Promise.resolve(robotsDemo(states, entites));
  }
  // Un passage ne mêle pas les zones de Home Assistant et les segments (`lire_zones` du vrai) : `invalid_format`, comme lui.
  if (zones.length && zones.some(z => z.zone) && !zones.every(z => z.zone)) return refus('invalid_format', 'un passage vise des zones de Home Assistant ou des segments, pas les deux');
  // Sa décision du 20/10 : un script de départ désigné et présent garde la main sur les pièces — ni zones, ni segments d'ici.
  const scriptDepart = (typeof scripts.pieces_selectionnees === 'string' && states[scripts.pieces_selectionnees]) || (typeof scripts.nettoyer_tout === 'string' && states[scripts.nettoyer_tout]);
  if (zones.length && domaine === 'vacuum' && scriptDepart) return refus('scripts_gardent_la_main', 'vos scripts gardent la main pour les pieces : ' + rid);
  if (domaine === 'lawn_mower') {
    const aires = Object.keys(states).filter(id => AIRES_DEMO[id]);
    if (zones.some(z => aires.indexOf(z.id) < 0)) return refus('zone_inconnue', 'zone inconnue : ' + rid);
    const visees = zones.map(z => z.id);
    if (visees.length) { toucher(visees, 'on'); toucher(aires.filter(a => visees.indexOf(a) < 0), 'off'); }
    // Sans aire choisie, elle tond ses aires DÉJÀ allumées, sans rien basculer, que le carnet nomme — comme le serveur (passe bis du
    // 18/10, point 2) ; toutes ses aires visées : « tout le jardin ». Aucune allumée : elle ne part pas (passe bis 2, point D).
    if (!zones.length) zones = aires.filter(a => states[a].state === 'on').map(aireDemo);
    if (aires.length && !zones.length) return refus('aucune_aire', 'aucune zone allumee : ' + rid);
    tout = !aires.length || aires.every(a => zones.some(z => z.id === a));
    toucher(rid, 'mowing');
  } else if (zones.length && zones.every(z => z.zone)) {
    /* Des ZONES de Home Assistant (tranche robots 2, R4) : ce que le vrai serveur vérifie AVANT d'appeler `vacuum.clean_area` — le
     * bit, l'association, une zone sans pièce, une zone d'une autre carte. */
    const pieces = piecesRobotDemo(states, entites);
    if (!pieces.capable) return refus('pieces_inconnues', 'pieces inconnues : ' + rid);
    if (!pieces.association) return refus('association_absente', 'association absente : ' + rid);
    const connues = new Set(pieces.zones.map(z => z.zone));
    const hors = zones.find(z => !connues.has(z.zone));
    if (hors) return refus(pieces.autres_zones.indexOf(hors.zone) >= 0 ? 'autre_carte' : 'zone_sans_piece', 'zone sans piece : ' + hors.zone);
    toucher(rid, 'cleaning');
  } else if (zones.length) {
    // Chez Ecovacs, la liste que le robot publie fait foi (Q2) : un segment qu'il ne publie plus — ou plus rien publié — ne part pas ;
    // la liste périmée se dit AVANT des pièces inconnues (passe bis du 20/10, point 3), comme chez le vrai.
    const publies = new Set(Object.values((st.attributes || {}).rooms || {}).flat().map(Number));
    if (zones.some(z => !Array.isArray(z.segments) || z.segments.some(seg => !publies.has(Number(seg))))) return refus('pieces_perimees', 'liste des pieces perimee : ' + rid);
    if (zones.some(z => !z.segments.length)) return refus('pieces_inconnues', 'pieces inconnues : ' + rid);
    toucher(rid, 'cleaning');
  } else {
    toucher(rid, 'cleaning');
  }
  carnetRobots().en_cours[rid] = { debut: horlogeRobots() / 1000, zones: zones.map(z => ({ id: String(z.id), nom: String(z.nom || z.id) })), tout, source: 'loggia', surface: null };
  return Promise.resolve(robotsDemo(states, entites));
}

/* Les services d'un robot : des services explicites, jamais `toggle`. `send_command` est le départ par pièces des intégrations
 * connues (`spot_area`, `app_segment_clean`) ; `locate` ne change rien — il bipe, la carte le dit. Un appareil mort reste mort.
 * `plusTard` : le retour à la base prend quatre secondes (un test les fait passer d'un coup). */
function serviceRobotDemo(states, domaine, service, data, toucher, plusTard = (f, ms) => setTimeout(f, ms)) {
  [].concat((data && data.entity_id) || []).forEach(x => {
    const st = states[x];
    if (!st || st.state === 'unavailable') return;
    // `clean_V2` : la commande de ses scripts, que l'écran envoie en direct à un Ecovacs sans le bit (tranche robots 2, Q2 A) ;
    // `clean_area` : le contrat commun de Home Assistant ≥ 2026.3 (R4).
    const piece = service === 'send_command' && /spot_area|segment_clean|clean_V2/.test(String(data.command));
    const cible = piece ? 'cleaning' : { start_mowing: 'mowing', start: 'cleaning', clean_area: 'cleaning', pause: 'paused', dock: 'returning', return_to_base: 'returning', stop: 'idle' }[service];
    if (cible) {
      toucher(x, cible);
      // Un robot qui rentre met du temps : sans ce délai la démonstration sauterait l'étape que la fiche sert justement à montrer.
      if (cible === 'returning') plusTard(() => { if (states[x] && states[x].state === 'returning') toucher(x, 'docked'); }, 4000);
    } else if (service === 'set_fan_speed') toucher(x, null, { fan_speed: data.fan_speed });
  });
}

/**
 * La maison des robots, son horloge réglée, pour tests/demo_robots.test.mjs : les états (et la variante `pause`), l'index,
 * `loggia/robots/etat`, le départ et les services — le carnet et le planning neufs à chaque appel ; `avancer(ms)` fait passer le
 * temps ; le retour à la base n'y attend pas ses quatre secondes.
 */
export function maisonRobotsDemo({ quand = null, variante = null } = {}) {
  let t = quand == null ? Date.now() : Number(quand);
  horlogeRobots = () => t;
  VARIANTE_ROBOTS = VARIANTES_ROBOTS.indexOf(variante) >= 0 ? variante : null;
  CARNET_ROB_ = null;
  ROB_CFG_ = null;
  const states = etatsInitiaux();
  varianteRobots(states);
  const toucher = (id, etat, attrs) => {
    if (Array.isArray(id)) { id.forEach(x => toucher(x, etat, attrs)); return; }
    const cur = states[id]; if (!cur) return;
    const quandIso = new Date(t).toISOString();
    states[id] = { ...cur, state: etat != null ? String(etat) : cur.state, attributes: { ...cur.attributes, ...(attrs || {}) }, last_updated: quandIso, last_changed: quandIso };
  };
  return {
    states,
    avancer: (ms) => { t += Number(ms) || 0; },
    index: () => indexDemo(states),
    // `entites` : la description de la maison telle qu'un test la pose (un rôle désigné dans la roue), sinon celle de la variante.
    etat: (entites = null) => robotsDemo(states, entites),
    lancer: (msg, entites = null) => lancerRobotDemo(states, msg, toucher, entites),
    // La roue (passe bis 2 du 20/10) : le rôle seul, fondu dans la description — celle qu'on donne, sinon celle de la variante.
    designer: (role, script, entites = null) => designerScriptDemo(entites || configDemo().loggia_entities, role, script),
    service: (domaine, service, data) => serviceRobotDemo(states, domaine, service, data, toucher, (f) => f()),
    // La configuration de la maison, selon la variante (ses scripts et interrupteurs dans `scripts`).
    config: () => configDemo(),
  };
}

function robotsPatch(patch) {
  const p = patch || {};
  if (Array.isArray(p.plannings)) ROB_CFG().plannings = p.plannings;
  Object.keys(p.robots || {}).forEach(id => {
    const actuel = ROB_CFG().robots[id] || { calme: { actif: false, debut: '22:00', fin: '07:00' }, pluie: { actif: false } };
    ROB_CFG().robots[id] = { calme: { ...actuel.calme, ...(p.robots[id].calme || {}) }, pluie: { ...actuel.pluie, ...(p.robots[id].pluie || {}) } };
  });
  return copieRobots();
}

/* ── Le distributeur de croquettes (ADR 0155, 05/10) ─────────────────────────
 *
 * La fiche devient une feuille à onglets que remplit le SERVEUR
 * (`loggia/distributeurs/etat`) : sans réponse ici, la démo ne montrerait que
 * « Planning indisponible pour l'instant ». Ce faux serveur rend la forme du
 * contrat (fixture partagée, `contrat.etat_exemple`), calculée sur les états
 * de la maison factice : couper une automatisation dans la fiche change la
 * source, passer l'appareil en mode programmé change son programme.
 *
 * VARIANTES, par l'URL (`?demo&distributeur=…`), lue par `installerDemo` :
 * - aucune : un Aqara sous Zigbee2MQTT en mode manuel, commandé par deux
 *   automatisations — l'installation de l'utilisateur. « Poids d'une portion »
 *   de Paramètres désigne son number en grammes : c'est le POIDS (D1), et sa
 *   taille de ration est une sœur en « portion » (1, de 1 à 10), comme
 *   Zigbee2MQTT la publie — le pas à pas de « Servir maintenant » se voit depuis
 *   le lien public, et la carte dit le vrai total (passe bis 2, 19/10) ;
 * - `loggia` : aucune automatisation de repas, le planning de Loggia (deux
 *   repas, modifiables en mémoire) ;
 * - `petlibro` : un Petlibro au programme lisible ET une automatisation
 *   active — l'avertissement « deux sources », l'onglet Entretien rempli ;
 * - `rien` : le réservoir seul, aucune commande — « Loggia ne sait pas
 *   commander ce distributeur » ;
 * - `horsligne` : l'Aqara tombé (un Zigbee2MQTT hors ligne fait tomber toutes
 *   ses entités) — le liseré, et plus de « Distribuer » ;
 * - `bas` (étape 2 du chantier IoT, 19/10) : la maison par défaut, le bac sous
 *   15 % (240 g sur 2 000) — la phrase de la carte et la réserve en ambre ;
 * - `probleme` : la maison par défaut, et l'Aqara qui signale une erreur — la
 *   carte le dit, la popup a sa rangée « État du distributeur » ; l'erreur a
 *   les deux formes (passe bis, 19/10) : avec `device_class`, et sans, comme
 *   Zigbee2MQTT la publie (« Erreur moteur ») ;
 * - `reservoir` (passe bis) : la maison par défaut, l'aide du bac muette — la
 *   carte dit « Réservoir indisponible », la vis répond, « Distribuer » reste ;
 * - `programme` (passe bis) : l'Aqara en mode programmé, sans automatisation
 *   qui le commande — un programme présent mais illisible : « Programme de
 *   l'appareil » sur la carte et dans la tuile ;
 * - `z2m` (passe bis, D1) : un Aqara tel que Zigbee2MQTT le publie — la taille
 *   de ration en « portion » (2), le poids d'une portion en g (6), le select
 *   aux options « » et START, l'erreur sans classe —, et « Poids d'une
 *   portion » de Paramètres désigne l'entité de POIDS : « Distribuer 12 g ».
 * Chaque variante est une maison cohérente, pas un état bricolé : la fiche y
 * montre ce qu'elle montrerait chez quelqu'un. L'horloge est `horlogeDist`, que
 * les tests règlent (`maisonDistributeurDemo(v, { quand })`). */
const VARIANTES_DIST = ['loggia', 'petlibro', 'rien', 'horsligne', 'bas', 'probleme', 'reservoir', 'programme', 'z2m'];
let VARIANTE_DIST = 'aqara';
let horlogeDist = () => Date.now();
// `bas`, `probleme` et `reservoir` sont la maison par défaut, à un détail près : mêmes repas, mêmes automatisations.
const familleDist = () => (VARIANTE_DIST === 'bas' || VARIANTE_DIST === 'probleme' || VARIANTE_DIST === 'reservoir' ? 'aqara' : VARIANTE_DIST);
// L'Aqara de la cuisine (`dist_cuisine`), sous toutes ses variantes ; `z2m` est un autre appareil, le Petlibro aussi.
const estAqara = () => familleDist() === 'aqara' || VARIANTE_DIST === 'loggia' || VARIANTE_DIST === 'horsligne' || VARIANTE_DIST === 'programme';

/* Les appareils et leurs entités : [plateforme, { entity_id: [clé, catégorie] }],
 * le patron des ROBOTS d'`indexDemo`. Les références de modèle se lisent
 * pareil partout : ce ne sont pas des mots.
 *
 * Le compteur du jour porte le suffixe que Zigbee2MQTT publie pour un Aqara
 * (`weight_per_day`) : sous l'ancien nom (`sensor.croquettes_du_jour`), la
 * table partagée (`MOTIF_COMPTEUR_Z2M`, fixture T0) ne le reconnaissait pas,
 * et la fiche par défaut n'aurait eu ni « Aujourd'hui : … g » ni hausses dans
 * son Historique (contradicteur, 05/10). */
const DISTRIBUTEURS_DEMO = {
  dist_cuisine: ['mqtt', {
    'select.distributeur_feed': [null, null], 'number.distributeur_portion': [null, 'config'], 'number.distributeur_serving_size': [null, 'config'],
    'sensor.distributeur_weight_per_day': [null, null], 'select.distributeur_mode': [null, 'config'],
    'sensor.distributeur_feeding_source': [null, 'diagnostic'], 'binary_sensor.distributeur_error': [null, 'diagnostic'],
    'binary_sensor.distributeur_motor_error': [null, 'diagnostic'], 'switch.distributeur_child_lock': [null, 'config'],
  }],
  /* La mangeoire (`z2m`, passe bis de l'étape 2) : un Aqara tel que Zigbee2MQTT le publie — la taille de ration ET le poids d'une
   * portion, le compteur en portions à côté de celui en grammes, l'erreur sans classe. Noms inventés. */
  dist_mangeoire: ['mqtt', {
    'select.mangeoire_feed': [null, null], 'number.mangeoire_serving_size': [null, 'config'], 'number.mangeoire_portion_weight': [null, 'config'],
    'sensor.mangeoire_weight_per_day': [null, null], 'sensor.mangeoire_portions_per_day': [null, null], 'select.mangeoire_mode': [null, 'config'],
    'sensor.mangeoire_feeding_source': [null, 'diagnostic'], 'binary_sensor.mangeoire_error': [null, 'diagnostic'],
    'switch.mangeoire_child_lock': [null, 'config'],
  }],
  dist_petlibro: ['petlibro', {
    'button.granary_manual_feed': ['manual_feed', null], 'button.granary_enable_feeding_plan': ['enable_feeding_plan', null],
    'button.granary_desiccant_reset': ['desiccant_reset', 'config'], 'number.granary_manual_feed_quantity': ['manual_feed_quantity', null],
    'number.granary_desiccant_frequency': ['desiccant_frequency', 'config'], 'binary_sensor.granary_feeding_schedule': ['feeding_schedule', null],
    'binary_sensor.granary_food_low': ['food_low', null], 'binary_sensor.granary_food_dispenser_state': ['food_dispenser_state', null],
    'binary_sensor.granary_online': ['online', 'diagnostic'], 'sensor.granary_remaining_desiccant': ['remaining_desiccant', null],
    'sensor.granary_last_feed_time': ['last_feed_time', null], 'sensor.granary_next_feed_time': ['next_feed_time', null],
    'sensor.granary_today_feeding_quantity_weight': ['today_feeding_quantity_weight', null],
  }],
};
const APPAREIL_DIST = {
  dist_cuisine: { fabricant: 'Aqara', modele: 'ZNCWWSQ01LM' },
  dist_mangeoire: { fabricant: 'Aqara', modele: 'ZNCWWSQ01LM' },
  dist_petlibro: { fabricant: 'PETLIBRO', modele: 'PLAF103' },
};
const appareilDist = () => (VARIANTE_DIST === 'rien' ? null : VARIANTE_DIST === 'petlibro' ? 'dist_petlibro' : VARIANTE_DIST === 'z2m' ? 'dist_mangeoire' : 'dist_cuisine');

/* Les automatisations de la maison qui touchent au distributeur, telles que
 * `automatisations.py` les résumerait. `commande` dit si une ACTION commande
 * l'appareil : l'alerte du bac ne fait que LIRE le réservoir, elle reste dans
 * la maison et n'entre jamais dans la réponse. Ni `raw_config` ni lien vers
 * Home Assistant : la démo n'en a pas (`modifiable` faux, pas d'`id_config`). */
const AUTOS_DIST = {
  'automation.croquettes_matin_et_soir': { commande: true, heures: ['07:30', '19:00'], jours: null },
  'automation.croquettes_du_midi': { commande: true, heures: ['12:30'], jours: [0, 1, 2, 3, 4] },
  'automation.alerte_bac_presque_vide': { commande: false, heures: [], jours: null },
};

/* Ce qui est parti, variante par variante : [heure, portions, source]. La
 * source est celle que l'appareil publie (`feeding_source` d'un Aqara :
 * schedule, manual, remote) ; une automatisation qui commande passe par le
 * réseau, donc « remote ». Le Petlibro distribue DEUX fois par repas — son
 * programme et l'automatisation : c'est ce que l'avertissement dit. */
const PASSAGES_DIST = {
  aqara: [['07:30', 1, 'remote'], ['19:00', 1, 'remote']],
  horsligne: [['07:30', 1, 'remote'], ['19:00', 1, 'remote']],
  loggia: [['08:00', 1, 'remote'], ['18:30', 1, 'remote']],
  petlibro: [['07:00', 2, 'schedule'], ['07:30', 1, 'remote'], ['19:00', 1, 'remote'], ['19:30', 2, 'schedule']],
  // Le programme de l'appareil, illisible pour Loggia : un seul repas, le soir — à 18:20, rien n'est encore parti aujourd'hui.
  programme: [['19:00', 1, 'schedule']],
  // La mangeoire sert 2 portions par appui (sa taille de ration), de 6 g chacune.
  z2m: [['07:30', 2, 'remote'], ['19:00', 2, 'remote']],
  rien: [],
};
// Les grammes d'une portion : la portion de l'Aqara (45 g), un pas de Petlibro, le poids d'une portion de la mangeoire (6 g).
const G_PORTION_DIST = { aqara: 45, horsligne: 45, loggia: 45, programme: 45, petlibro: 12, z2m: 6, rien: 0 };
const JOUR_MS = 86400000;
// Le Zigbee2MQTT de la variante `horsligne` est tombé il y a trois heures — à l'ouverture de la maison, puis il n'en bouge plus.
let TOMBE_DIST_ = null;
const tombeDist = () => (TOMBE_DIST_ == null ? (TOMBE_DIST_ = horlogeDist() - 3 * 3600000) : TOMBE_DIST_);
// Ce que la démo a distribué depuis son ouverture (« Distribuer », planning).
const DIST_LIVE = [];

/** `HH:MM` il y a `n` jours (0 = aujourd'hui), en millisecondes, heure locale. */
const aHeureDist = (hhmm, n = 0) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  const d = new Date(horlogeDist()); d.setDate(d.getDate() - n); d.setHours(h, m, 0, 0);
  return d.getTime();
};
const minuitDist = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const isoDist = (t) => new Date(t).toISOString();

/** Les repas partis entre `t0` et `t1`, du plus ancien au plus récent : `{ t, portions, g, source }`. */
function passagesDistributeur(t0, t1) {
  const v = VARIANTE_DIST, g = G_PORTION_DIST[familleDist()] || 0, out = [];
  const fin = v === 'horsligne' ? Math.min(t1, tombeDist()) : t1;
  const pousser = (t, portions, source) => { if (t >= t0 && t <= fin) out.push({ t, portions, g: portions * g, source }); };
  for (let n = Math.ceil((horlogeDist() - t0) / JOUR_MS) + 1; n >= 0; n--) {
    (PASSAGES_DIST[familleDist()] || []).forEach(([h, portions, source]) => {
      // Le repas de 18:30 d'avant-hier tombait pendant un redémarrage : RIEN,
      // noté « manqué » au journal (décision 4 de l'ADR 0155).
      if (v === 'loggia' && n === 2 && h === '18:30') return;
      pousser(aHeureDist(h, n), portions, source);
    });
    // Une ration donnée au bouton de l'appareil : « Manuel » dans l'historique.
    if ((familleDist() === 'aqara' || v === 'horsligne' || v === 'z2m') && n === 2) pousser(aHeureDist('16:10', 2), 1, 'manual');
  }
  DIST_LIVE.forEach(e => { if (e.t >= t0 && e.t <= t1) out.push(e); });
  return out.sort((a, b) => a.t - b.t);
}

/** Le dernier déclenchement d'une automatisation à heures fixes, en ISO. */
const dernierDeclenchement = (heures) => {
  const t = Math.max(...heures.map(h => (aHeureDist(h, 0) <= horlogeDist() ? aHeureDist(h, 0) : aHeureDist(h, 1))));
  return isoDist(t);
};

/* Les états du distributeur, selon la variante. Bâtis à l'installation : la
 * langue est connue (`s()` traduit), le compteur du jour est la somme des
 * repas déjà partis aujourd'hui, et la source du dernier repas la sienne. */
function etatsDistributeur() {
  const v = VARIANTE_DIST, out = {};
  const maintenant = horlogeDist();
  const jour = passagesDistributeur(minuitDist(maintenant), maintenant);
  const gJour = jour.reduce((a, e) => a + e.g, 0);
  const tous = passagesDistributeur(maintenant - 3 * JOUR_MS, maintenant);
  const dernier = tous.length ? tous[tous.length - 1] : null;
  if (estAqara()) {
    // Un Zigbee2MQTT hors ligne fait tomber TOUTES les entités de l'appareil ;
    // Home Assistant garde leurs attributs de capacité (les options du select).
    const e = (etat) => (v === 'horsligne' ? 'unavailable' : etat);
    Object.assign(out, {
      'select.distributeur_feed': s(e('STOP'), { friendly_name: 'Distribuer', options: ['STOP', 'START'] }),
      'number.distributeur_portion': s(e(45), { friendly_name: 'Portion du distributeur', min: 5, max: 100, step: 5, unit_of_measurement: 'g' }),
      // La taille de ration, comme Zigbee2MQTT la publie (passe bis 2) : 1 portion par appui — le pas à pas de « Servir maintenant ».
      'number.distributeur_serving_size': s(e(1), { friendly_name: 'Taille de ration', min: 1, max: 10, step: 1, unit_of_measurement: 'portion' }),
      'sensor.distributeur_weight_per_day': s(e(gJour), { friendly_name: 'Croquettes distribuées aujourd’hui', unit_of_measurement: 'g', state_class: 'total_increasing' }),
      // Mode manuel : les créneaux de l'appareil ne partent pas, ce sont ses automatisations qui distribuent ; `programme` : le mode
      // programmé, dont Loggia ne lit pas la liste — présent, illisible.
      'select.distributeur_mode': s(e(v === 'programme' ? 'schedule' : 'manual'), { friendly_name: 'Mode de distribution', options: ['schedule', 'manual'] }),
      'sensor.distributeur_feeding_source': s(e(dernier ? dernier.source : 'remote'), { friendly_name: 'Source du dernier repas' }),
      // `probleme` : l'Aqara signale une erreur — « Problème signalé » sur la carte, la rangée « État du distributeur » dans la popup —,
      // sous ses deux formes : avec `device_class`, et sans, comme Zigbee2MQTT la publie (passe bis, point B).
      'binary_sensor.distributeur_error': s(e(v === 'probleme' ? 'on' : 'off'), { friendly_name: 'Erreur du distributeur', device_class: 'problem' }),
      'binary_sensor.distributeur_motor_error': s(e(v === 'probleme' ? 'on' : 'off'), { friendly_name: 'Erreur moteur' }),
      'switch.distributeur_child_lock': s(e('off'), { friendly_name: 'Verrouillage enfant' }),
    });
  }
  // `z2m` : la mangeoire telle que Zigbee2MQTT la publie (passe bis, D1) — 2 portions de 6 g par appui, 24 g et 4 portions par jour.
  if (v === 'z2m') {
    Object.assign(out, {
      'select.mangeoire_feed': s('unknown', { friendly_name: 'Distribuer', options: ['', 'START'] }),
      'number.mangeoire_serving_size': s(2, { friendly_name: 'Taille de ration', min: 1, max: 10, step: 1, unit_of_measurement: 'portion' }),
      'number.mangeoire_portion_weight': s(6, { friendly_name: 'Poids d’une portion', min: 1, max: 20, step: 1, unit_of_measurement: 'g' }),
      'sensor.mangeoire_weight_per_day': s(gJour, { friendly_name: 'Croquettes distribuées aujourd’hui', unit_of_measurement: 'g', state_class: 'total_increasing' }),
      'sensor.mangeoire_portions_per_day': s(jour.reduce((a, x) => a + x.portions, 0), { friendly_name: 'Portions distribuées aujourd’hui', state_class: 'total_increasing' }),
      'select.mangeoire_mode': s('manual', { friendly_name: 'Mode de distribution', options: ['schedule', 'manual'] }),
      'sensor.mangeoire_feeding_source': s(dernier ? dernier.source : 'remote', { friendly_name: 'Source du dernier repas' }),
      'binary_sensor.mangeoire_error': s('off', { friendly_name: 'Erreur du distributeur' }),
      'switch.mangeoire_child_lock': s('off', { friendly_name: 'Verrouillage enfant' }),
    });
  }
  // `bas` : le bac sous 15 % — 240 g sur 2 000, le même helper que la maison par défaut.
  if (v === 'bas') out['input_number.croquettes_reservoir'] = s(240, { friendly_name: 'Réservoir de croquettes', min: 0, max: 2000, step: 10, unit_of_measurement: 'g' });
  // `reservoir` : l'aide du bac seule muette — la vis répond, « Distribuer » reste (passe bis, point G).
  if (v === 'reservoir') out['input_number.croquettes_reservoir'] = s('unavailable', { friendly_name: 'Réservoir de croquettes', min: 0, max: 2000, step: 10, unit_of_measurement: 'g' });
  if (v === 'petlibro') {
    const prochain = ['07:00', '19:30'].map(h => aHeureDist(h, 0)).find(t => t > maintenant) || aHeureDist('07:00', -1);
    // L'état du jour de chaque créneau : servi s'il est passé, en attente sinon.
    const etatJour = (h) => (aHeureDist(h, 0) <= maintenant ? 'dispensed' : 'pending');
    Object.assign(out, {
      'button.granary_manual_feed': s('unknown', { friendly_name: 'Distribution manuelle' }),
      'button.granary_enable_feeding_plan': s('unknown', { friendly_name: 'Activer le programme' }),
      'button.granary_desiccant_reset': s('unknown', { friendly_name: 'Réinitialiser le déshydratant' }),
      'number.granary_manual_feed_quantity': s(1, { friendly_name: 'Quantité de la distribution manuelle', min: 1, max: 24, step: 1 }),
      'number.granary_desiccant_frequency': s(30, { friendly_name: 'Fréquence du déshydratant', min: 1, max: 60, step: 1, unit_of_measurement: 'd' }),
      'binary_sensor.granary_feeding_schedule': s('on', { friendly_name: 'Programme des repas', schedule: [
        { id: 101, time: '07:00', amount_raw: 2, enabled: true, recurring: true, repeat_days: [1, 2, 3, 4, 5, 6, 7], state: etatJour('07:00') },
        { id: 102, time: '12:00', amount_raw: 1, enabled: false, recurring: true, repeat_days: [1, 2, 3, 4, 5], state: 'pending' },
        { id: 103, time: '19:30', amount_raw: 2, enabled: true, recurring: true, repeat_days: [1, 2, 3, 4, 5, 6, 7], state: etatJour('19:30') },
      ] }),
      // Le bac presque vide : une anomalie à montrer, sur l'Accueil et dans Entretien.
      'binary_sensor.granary_food_low': s('on', { friendly_name: 'Croquettes presque épuisées', device_class: 'problem' }),
      'binary_sensor.granary_food_dispenser_state': s('off', { friendly_name: 'État de la distribution', device_class: 'problem' }),
      'binary_sensor.granary_online': s('on', { friendly_name: 'En ligne', device_class: 'connectivity' }),
      'sensor.granary_remaining_desiccant': s(12, { friendly_name: 'Déshydratant', device_class: 'duration', unit_of_measurement: 'd' }),
      'sensor.granary_last_feed_time': s(dernier ? isoDist(dernier.t) : 'unknown', { friendly_name: 'Dernier repas', device_class: 'timestamp' }),
      'sensor.granary_next_feed_time': s(isoDist(prochain), { friendly_name: 'Prochain repas', device_class: 'timestamp' }),
      'sensor.granary_today_feeding_quantity_weight': s(gJour, { friendly_name: 'Quantité distribuée aujourd’hui', unit_of_measurement: 'g', state_class: 'total_increasing' }),
    });
  }
  /* Les automatisations, avec leur `id` de configuration et leur dernier
   * déclenchement, comme Home Assistant les publie. Le planning de Loggia
   * (variante `loggia`) n'existe que faute d'automatisation de repas ; sans
   * commande (variante `rien`), une automatisation n'aurait rien à commander. */
  if (v !== 'loggia' && v !== 'rien' && v !== 'programme') {
    out['automation.croquettes_matin_et_soir'] = s('on', { friendly_name: 'Croquettes matin et soir', id: '1728000000001', last_triggered: dernierDeclenchement(['07:30', '19:00']) });
  }
  if (familleDist() === 'aqara' || v === 'horsligne' || v === 'z2m') {
    out['automation.croquettes_du_midi'] = s('off', { friendly_name: 'Croquettes du midi', id: '1728000000002', last_triggered: null });
  }
  out['automation.alerte_bac_presque_vide'] = s('on', { friendly_name: 'Alerte bac presque vide', id: '1728000000003', last_triggered: isoDist(maintenant - (2 * 1440 + 300) * 60000) });
  /* Les dates, comme Home Assistant les tient (contradicteur, 05/10). `s()`
   * date tout de l'ouverture de la page : la fiche, qui lit le dernier repas
   * sur la dernière hausse du compteur (`dernierRepas`), aurait annoncé un
   * repas « à l'instant » à chaque ouverture. Le compteur change au dernier
   * repas du jour (à minuit s'il n'y en a pas eu), la source quand elle
   * CHANGE, et un appareil tombé l'est depuis sa chute. */
  const dater = (id, t) => { if (out[id] && t != null) out[id] = { ...out[id], last_changed: isoDist(t), last_updated: isoDist(t) }; };
  const finJour = jour.length ? jour[jour.length - 1].t : minuitDist(maintenant);
  let depuis = null;
  for (let i = tous.length - 1; i >= 0 && tous[i].source === (dernier && dernier.source); i--) depuis = tous[i].t;
  if (v === 'horsligne') Object.keys(DISTRIBUTEURS_DEMO.dist_cuisine[1]).forEach(id => dater(id, tombeDist()));
  else {
    // L'erreur de `probleme` est levée depuis vingt-cinq minutes.
    if (v === 'probleme') ['binary_sensor.distributeur_error', 'binary_sensor.distributeur_motor_error'].forEach(id => dater(id, maintenant - 25 * 60000));
    ['sensor.distributeur_weight_per_day', 'sensor.granary_today_feeding_quantity_weight', 'sensor.mangeoire_weight_per_day', 'sensor.mangeoire_portions_per_day'].forEach(id => dater(id, finJour));
    dater('sensor.distributeur_feeding_source', depuis);
    dater('sensor.mangeoire_feeding_source', depuis);
    dater('sensor.granary_last_feed_time', dernier ? dernier.t : null);
  }
  return out;
}

/* `loggia_feeder`, la configuration de la maison. L'ANCIENNE liste de repas
 * garde un repas relié à une automatisation et un repas qui ne l'est pas :
 * l'encart de migration de Paramètres a de quoi compter (ADR 0155). Le libellé
 * fait partie d'un repas (`{ id, time, label, g, auto }`). */
function feederDemo() {
  const v = VARIANTE_DIST;
  const matin = { id: 'matin', time: '07:30', label: etiquette('Repas du matin'), g: 45, auto: 'input_boolean.repas_matin' };
  const soir = { id: 'soir', time: '19:00', label: etiquette('Repas du soir'), g: 45, auto: 'automation.croquettes_matin_et_soir' };
  const haids = { reservoir: 'input_number.croquettes_reservoir', portionWeight: 'number.distributeur_portion', distribuees: 'sensor.distributeur_weight_per_day' };
  // Rien à commander : le réservoir seul.
  if (v === 'rien') return { haids: { reservoir: 'input_number.croquettes_reservoir' }, meals: [] };
  // Un Petlibro n'a pas de réservoir en grammes : on le désigne par son appareil.
  if (v === 'petlibro') return { appareil: 'dist_petlibro', haid: 'button.granary_manual_feed', haids: {}, meals: [] };
  // La mangeoire (`z2m`) : « Poids d'une portion » désigne l'entité de POIDS, comme son libellé y invite (passe bis, D1).
  if (v === 'z2m') return { haids: { reservoir: 'input_number.croquettes_reservoir', portionWeight: 'number.mangeoire_portion_weight', distribuees: 'sensor.mangeoire_weight_per_day' }, haid: 'select.mangeoire_feed', meals: [] };
  // Le programme de l'appareil seul (`programme`) : ni automatisation, ni ancienne liste.
  if (v === 'programme') return { haids, haid: 'select.distributeur_feed', meals: [] };
  // Sans automatisation de repas, il ne reste de l'ancienne liste que ce qui ne distribuait rien.
  if (v === 'loggia') return { haids, haid: 'select.distributeur_feed', meals: [matin] };
  return { haids, haid: 'select.distributeur_feed', meals: [matin, soir] };
}

/* Le planning de Loggia, en mémoire : `{ appareil, repas: [{ id, heure,
 * jours, portions, actif }] }`, lundi = 0 — le format de `robots.py`.
 * Paresseux : il dépend de la variante, connue à `installerDemo`. */
let DIS_CFG_ = null;
const DIS_CFG = () => (DIS_CFG_ || (DIS_CFG_ = VARIANTE_DIST === 'loggia'
  ? { appareil: 'dist_cuisine', repas: [
    { id: 'r1', heure: '08:00', jours: [0, 1, 2, 3, 4, 5, 6], portions: 1, actif: true },
    { id: 'r2', heure: '18:30', jours: [0, 1, 2, 3, 4, 5, 6], portions: 1, actif: true },
  ] }
  : { appareil: null, repas: [] }));
const DIS_MAX_REPAS = 12;
const copieDistributeurs = () => JSON.parse(JSON.stringify(DIS_CFG()));

/** Le programme de l'appareil, lu comme `distributeur_appareil.py` le lirait. */
function programmeDemo(states) {
  const rien = { source: null, connu: false, presente: false, active: false, lisible: false, mode: null, note: null, repas: [] };
  if (VARIANTE_DIST === 'petlibro') {
    const st = states['binary_sensor.granary_feeding_schedule'];
    const liste = (st && Array.isArray(st.attributes.schedule)) ? st.attributes.schedule : [];
    const repas = liste.map(r => ({ heure: r.time, jours: (r.repeat_days || []).map(j => j - 1), portions: r.amount_raw, actif: !!r.enabled, etat_jour: r.state || null }))
      .sort((a, b) => (a.heure < b.heure ? -1 : a.heure > b.heure ? 1 : a.jours[0] - b.jours[0]));
    return { source: 'petlibro', connu: true, presente: repas.length > 0, active: !!st && st.state === 'on' && repas.some(r => r.actif),
      lisible: true, mode: null, note: null, repas };
  }
  if (!estAqara() && VARIANTE_DIST !== 'z2m') return rien;
  // Aqara sous Zigbee2MQTT : le MODE dit tout, la liste de créneaux n'est pas publiée ici.
  const mode = ((states[VARIANTE_DIST === 'z2m' ? 'select.mangeoire_mode' : 'select.distributeur_mode'] || {}).state || '').toLowerCase();
  if (mode === 'manual') return { ...rien, source: 'aqara', connu: true, mode: 'manuel', note: 'mode_manuel' };
  if (mode === 'schedule') return { ...rien, source: 'aqara', connu: true, presente: true, mode: 'programme', note: 'tenu_par_appareil' };
  // Mode illisible (hors ligne) : on ne sait pas, on ne dit ni « manuel » ni « tenu par l'appareil ».
  return { ...rien, source: 'aqara' };
}

/** Un élément d'automatisation, la forme du contrat (jamais de `raw_config`). */
function resumeAutoDemo(states, id, indice) {
  const st = states[id], a = AUTOS_DIST[id] || { heures: [], jours: null };
  const at = st.attributes || {};
  return {
    entity_id: id, nom: at.friendly_name || id, etat: st.state, dernier: at.last_triggered || null,
    declencheurs: a.heures.length ? a.heures.map(heure => ({ type: 'heure', heure })) : [{ type: 'autre' }],
    heures: a.heures.slice(), jours: a.jours ? a.jours.slice() : null, conditionnel: false, portions: null,
    pilotable: true, modifiable: false, indice,
  };
}

/* Le journal du module, tel que `regles.noter` / `regles.agir` l'écrivent :
 * le motif par ses PARTIES (« repas {heure} »), les détails par leurs clés. */
function journalDistributeurDemo() {
  const v = VARIANTE_DIST;
  const ligne = (n, heure, quoi, detail, decale = 0) => ligneJournal({
    module: 'distributeurs', regle: 'repas', quoi, cibles: quoi === 'distribuer' ? [v === 'z2m' ? 'select.mangeoire_feed' : 'select.distributeur_feed'] : [], n: quoi === 'distribuer' ? 1 : 0,
    motif: [['repas {heure}', { heure }]], detail, simule: false, ts: (aHeureDist(heure, n) + decale) / 1000 });
  let lignes = [];
  if (v === 'loggia') {
    for (let n = 0; n <= 3; n++) {
      ['08:00', '18:30'].forEach(h => {
        if (aHeureDist(h, n) > horlogeDist()) return;
        // Le redémarrage d'avant-hier : noté au démarrage du module, rien n'est parti.
        lignes.push(n === 2 && h === '18:30' ? ligne(n, h, 'retenu', 'manque au redemarrage', 12 * 60000) : ligne(n, h, 'distribuer', ''));
      });
    }
  } else if (familleDist() === 'aqara' || v === 'horsligne' || v === 'z2m') {
    // L'histoire de l'installation : le planning de Loggia distribuait, puis
    // les automatisations sont arrivées — et le serveur a retenu son repas.
    lignes = [ligne(5, '07:30', 'distribuer', ''), ligne(5, '19:00', 'distribuer', ''), ligne(4, '07:30', 'retenu', 'autre source')];
  }
  return lignes.sort((a, b) => b.ts - a.ts).slice(0, 20);
}

/**
 * La réponse de `loggia/distributeurs/etat`, la forme du contrat (ADR 0155).
 * `feeder` est la configuration du moment (le magasin mémoire) : « Oublier
 * l'ancienne liste » et « Associer une automatisation » s'y voient aussitôt.
 * `detail` ne change rien ici : seule la Tuya officielle s'y lit.
 * Interne : les tests la lisent par `maisonDistributeurDemo` (05/10).
 */
function distributeursDemo(states, feeder) {
  const f = feeder || {};
  const appareil = appareilDist();
  const programme = programmeDemo(states);
  const commande = appareil == null ? null
    : { domaine: VARIANTE_DIST === 'petlibro' ? 'button' : 'select', quantite: false, min: null, max: null, pas: null };
  // Reconnues par ce qu'elles FONT ; puis les indices, montrés même non reconnus.
  const automatisations = Object.keys(AUTOS_DIST).filter(id => AUTOS_DIST[id].commande && states[id]).map(id => resumeAutoDemo(states, id, null));
  const meals = Array.isArray(f.meals) ? f.meals.filter(m => m && typeof m === 'object') : [];
  const indices = [
    ...meals.map(m => [m.auto, 'ancienne_liste']),
    ...(Array.isArray(f.associees) ? f.associees : []).map(id => [id, 'associee']),
  ];
  indices.forEach(([id, indice]) => {
    if (typeof id !== 'string' || id.indexOf('automation.') !== 0 || !states[id]) return;
    if (!automatisations.some(a => a.entity_id === id)) automatisations.push(resumeAutoDemo(states, id, indice));
  });
  const repas = DIS_CFG().repas;
  const sources = {
    programme: { presente: programme.presente, active: programme.active },
    automatisations: { presente: automatisations.length > 0, active: automatisations.some(a => a.etat === 'on') },
    loggia: { presente: repas.length > 0, active: repas.some(r => r.actif) },
  };
  const relies = meals.filter(m => typeof m.auto === 'string' && m.auto.indexOf('automation.') === 0);
  return {
    source: sources.programme.active ? 'appareil' : sources.automatisations.active ? 'automatisations' : sources.loggia.active ? 'loggia' : null,
    sources,
    appareil: appareil ? { device_id: appareil, nom: etiquette('Distributeur de croquettes'), fabricant: APPAREIL_DIST[appareil].fabricant, modele: APPAREIL_DIST[appareil].modele } : null,
    programme,
    automatisations,
    planning: copieDistributeurs(),
    // « Ajouter un repas » : ni programme ni automatisation PRÉSENTS, et une commande.
    peutPlanifier: !programme.presente && !sources.automatisations.presente && commande != null,
    commande,
    ancienne_liste: { n: meals.length, relies: relies.length,
      non_relies: meals.filter(m => relies.indexOf(m) < 0).map(m => ({ heure: m.time || null, label: m.label || null })) },
    notes: [],
    journal: journalDistributeurDemo(),
  };
}

/* `loggia/distributeurs/config` : `repas` REMPLACE la liste. Ce qui est
 * illisible est REFUSÉ, comme côté serveur, avec le code que l'écran traduit. */
const refusDemo = (code, message) => Object.assign(new Error(message), { code });
function distributeursPatch(patch) {
  const p = patch || {};
  if (Array.isArray(p.repas)) {
    if (p.repas.length > DIS_MAX_REPAS) throw refusDemo('trop_de_repas', 'trop de repas : ' + DIS_MAX_REPAS);
    const repas = p.repas.map((r, i) => {
      const heure = String((r && r.heure) || '');
      const hm = heure.match(/^(\d{2}):(\d{2})$/);
      const portions = Number(r && r.portions != null ? r.portions : 1);
      /* Des jours illisibles sont REFUSÉS, pas filtrés en silence : c'est ce
       * que fait `robots.py`, dont le planning reprend le format (contradicteur,
       * 05/10) — sinon la démo acceptait ce que le serveur refuse. */
      const joursLisibles = Array.isArray(r && r.jours) && r.jours.every(j => Number.isInteger(j) && j >= 0 && j <= 6);
      if (!hm || Number(hm[1]) > 23 || Number(hm[2]) > 59 || !Number.isInteger(portions) || portions < 1 || portions > 20 || !joursLisibles) {
        throw refusDemo('invalid_format', 'repas illisible');
      }
      const jours = [...new Set(r.jours)].sort((a, b) => a - b);
      return { id: String(r.id || 'r' + Date.now().toString(36) + i), heure, jours, portions, actif: r.actif !== false };
    });
    DIS_CFG().repas = repas;
    DIS_CFG().appareil = appareilDist();
  }
  return copieDistributeurs();
}

/* La maison d'une variante, bâtie comme `installerDemo` la bâtit — sans
 * document ni magasin. Exporté pour `tests/distributeur_finition.test.mjs`,
 * qui rejoue la carte sur la variante `horsligne` (05/10). */
export function maisonDistributeurDemo(variante, { quand = null } = {}) {
  VARIANTE_DIST = VARIANTES_DIST.indexOf(variante) >= 0 ? variante : 'aqara';
  const t = quand == null ? Date.now() : Number(quand);
  horlogeDist = quand == null ? () => Date.now() : () => t;
  TOMBE_DIST_ = null;
  DIS_CFG_ = null;
  DIST_LIVE.length = 0;
  const states = etatsInitiaux();
  const toucher = (id, etat) => {
    const cur = states[id]; if (!cur) return;
    const iso = isoDist(horlogeDist());
    states[id] = { ...cur, state: etat != null ? String(etat) : cur.state, last_updated: iso, last_changed: iso };
  };
  return {
    states, feeder: feederDemo(), index: indexDemo(states),
    etat: (feeder) => distributeursDemo(states, feeder === undefined ? feederDemo() : feeder),
    historique: (chemin) => historiqueDemo(chemin, states),
    patch: distributeursPatch,
    // « Distribuer » : `plusTard(f, ms)` tient la minuterie de la page — un test la déroule quand il veut.
    distribuer: (portions, plusTard) => servirDistributeurDemo(states, portions, toucher, plusTard),
  };
}

/* Une ration partie de l'écran (« Distribuer », le planning) : l'appareil met un instant à la servir (étape 2 du chantier IoT,
 * § 10) — la fiche dit d'abord « Demande envoyée à 18:20 », puis le compteur du jour monte et elle dit « Servi à 18:20 · 45 g ».
 * L'historique la garde (`DIST_LIVE`), et l'appareil dit d'où elle vient. `plusTard(f, ms)` : la minuterie de la page. */
const DELAI_SERVI_DIST = 2500;
function servirDistributeurDemo(states, portions, toucher, plusTard = (f, ms) => setTimeout(f, ms)) {
  const petlibro = VARIANTE_DIST === 'petlibro', z2m = VARIANTE_DIST === 'z2m';
  // Un appui sert la taille de ration de l'appareil : la mangeoire 2 portions de 6 g (ce que ses deux compteurs comptent), l'Aqara de
  // la cuisine 1 portion de 45 g — réglée par le pas à pas, la ration servie suit (passe bis 2).
  const taille = z2m ? 'number.mangeoire_serving_size' : 'number.distributeur_serving_size';
  const parAppui = petlibro ? 1 : (Number((states[taille] || {}).state) || (z2m ? 2 : 1));
  const g1 = petlibro ? G_PORTION_DIST.petlibro : z2m ? (Number((states['number.mangeoire_portion_weight'] || {}).state) || G_PORTION_DIST.z2m)
    : (Number((states['number.distributeur_portion'] || {}).state) || G_PORTION_DIST.aqara);
  plusTard(() => {
    const e = { t: horlogeDist(), portions: portions * parAppui, g: portions * parAppui * g1, source: 'remote' };
    DIST_LIVE.push(e);
    const compteur = petlibro ? 'sensor.granary_today_feeding_quantity_weight' : z2m ? 'sensor.mangeoire_weight_per_day' : 'sensor.distributeur_weight_per_day';
    if (states[compteur]) toucher(compteur, (Number(states[compteur].state) || 0) + e.g);
    if (z2m && states['sensor.mangeoire_portions_per_day']) toucher('sensor.mangeoire_portions_per_day', (Number(states['sensor.mangeoire_portions_per_day'].state) || 0) + e.portions);
    if (petlibro) toucher('sensor.granary_last_feed_time', isoDist(e.t));
    else toucher(z2m ? 'sensor.mangeoire_feeding_source' : 'sensor.distributeur_feeding_source', 'remote');
  }, DELAI_SERVI_DIST);
}

/* L'historique du distributeur (onglet Historique), au format de l'API REST :
 * une liste par entité, l'`entity_id` sur le premier point. Le compteur du
 * jour monte d'une portion à chaque repas et retombe à zéro à minuit ; la
 * source du dernier repas ne s'écrit que quand elle CHANGE (Home Assistant
 * n'enregistre pas un état identique) ; un horodatage de dernier repas change
 * à chaque repas ; une automatisation porte son `last_triggered` quand on
 * demande les attributs. Dix jours au plus : la purge par défaut de HA. */
const SERIES_DIST = new Map([
  ['sensor.distributeur_weight_per_day', 'compteur'], ['sensor.granary_today_feeding_quantity_weight', 'compteur'],
  ['sensor.mangeoire_weight_per_day', 'compteur'], ['sensor.mangeoire_portions_per_day', 'portions'], ['sensor.mangeoire_feeding_source', 'source'],
  ['sensor.distributeur_feeding_source', 'source'], ['sensor.granary_last_feed_time', 'dernier'],
  ['automation.croquettes_matin_et_soir', 'auto'], ['automation.croquettes_du_midi', 'auto'],
  ['input_number.croquettes_reservoir', 'reservoir'],
]);
// Le bac a été rempli il y a six jours, à 10 h ; il était presque vide.
const REMPLI_DIST = () => aHeureDist('10:00', 6);
function historiqueDistributeurDemo(ids, chemin, states) {
  const d = chemin.match(/history\/period\/([^?]+)/);
  const f = chemin.match(/end_time=([^&]+)/);
  const t1 = Math.min(horlogeDist(), f ? Date.parse(decodeURIComponent(f[1])) || horlogeDist() : horlogeDist());
  const t0 = Math.max(d ? Date.parse(decodeURIComponent(d[1])) || 0 : 0, horlogeDist() - 10 * JOUR_MS);
  const attributs = chemin.indexOf('no_attributes') < 0;
  const avant = passagesDistributeur(minuitDist(t0) - 3 * JOUR_MS, t0 - 1);
  const dedans = passagesDistributeur(t0, t1);
  const tombe = VARIANTE_DIST === 'horsligne' && tombeDist() >= t0 && tombeDist() <= t1 ? tombeDist() : null;
  const listes = [];
  ids.forEach(id => {
    const genre = SERIES_DIST.get(id);
    if (!states[id]) return;
    // Une entité qui n'est pas du distributeur : la courbe générique, une par une.
    if (!genre) { const [l] = historiqueDemo('history/period/' + isoDist(t0) + '?filter_entity_id=' + encodeURIComponent(id), states); if (l && l.length) { l[0].entity_id = id; listes.push(l); } return; }
    const pts = [];
    const point = (state, t, extra) => pts.push({ state: String(state), last_changed: isoDist(t), ...(extra || {}) });
    if (genre === 'compteur' || genre === 'portions') {
      // Le compteur du jour en grammes, ou en portions (la mangeoire compte les deux).
      const qte = (e) => (genre === 'portions' ? e.portions : e.g);
      let v = avant.filter(e => e.t >= minuitDist(t0)).reduce((a, e) => a + qte(e), 0);
      point(v, t0);
      let jour = minuitDist(t0);
      dedans.forEach(e => {
        // La remise à zéro de minuit, avant le premier repas du jour.
        if (minuitDist(e.t) !== jour) { jour = minuitDist(e.t); if (v !== 0) { v = 0; point(0, jour); } }
        v += qte(e); point(v, e.t);
      });
      // Minuit d'aujourd'hui, avant le premier repas — sauf sur un appareil déjà tombé.
      if (!tombe && minuitDist(t1) !== jour && v !== 0 && minuitDist(t1) >= t0) point(0, minuitDist(t1));
    } else if (genre === 'source') {
      let src = avant.length ? avant[avant.length - 1].source : 'remote';
      point(src, t0);
      dedans.forEach(e => { if (e.source !== src) { src = e.source; point(src, e.t); } });
    } else if (genre === 'reservoir') {
      /* Le réservoir est un helper que les automatisations de la maison
       * font baisser à chaque repas : il finit sur sa valeur du moment, et
       * remonte d'un coup le jour où on l'a rempli. */
      const rempli = REMPLI_DIST(), dansFenetre = rempli >= t0 && rempli <= t1;
      const somme = (l) => l.reduce((a, e) => a + e.g, 0);
      const plein = (Number(states[id].state) || 0) + somme(dedans.filter(e => e.t >= rempli));
      let v = dansFenetre ? 150 + somme(dedans.filter(e => e.t < rempli)) : plein;
      const marches = dedans.map(e => [e.t, -e.g]);
      if (dansFenetre) marches.push([rempli, null]);
      marches.sort((a, b) => a[0] - b[0]);
      point(v, t0);
      marches.forEach(([t, d]) => { v = d == null ? plein : v + d; point(v, t); });
    } else if (genre === 'dernier') {
      point(avant.length ? isoDist(avant[avant.length - 1].t) : 'unknown', t0);
      dedans.forEach(e => point(isoDist(e.t), e.t));
    } else {
      // Une automatisation coupée ne s'est pas déclenchée dans la fenêtre.
      const a = AUTOS_DIST[id], st = states[id];
      const fois = [];
      if (st.state === 'on') for (let n = Math.ceil((horlogeDist() - t0) / JOUR_MS) + 2; n >= 0; n--) a.heures.forEach(h => { const t = aHeureDist(h, n); if (t <= t1) fois.push(t); });
      fois.sort((x, y) => x - y);
      const avantT0 = fois.filter(t => t0 > t).pop();
      const lt = (t) => (attributs ? { attributes: { last_triggered: t != null ? isoDist(t) : null } } : null);
      point(st.state, t0, lt(avantT0 != null ? avantT0 : null));
      if (attributs) fois.filter(t => t >= t0).forEach(t => point(st.state, t, lt(t)));
    }
    // L'appareil tombé ; ni une automatisation ni le helper du réservoir ne tombent avec lui.
    if (tombe && genre !== 'auto' && genre !== 'reservoir') point('unavailable', tombe);
    pts.sort((x, y) => Date.parse(x.last_changed) - Date.parse(y.last_changed));
    pts[0].entity_id = id;
    listes.push(pts);
  });
  return listes;
}

/* ── Le planning de chauffe (chantier Chauffage, plan 2, tâche 6) ─────────────
 *
 * Le faux moteur de `custom_components/loggia/chauffage.py` : ses quatre
 * commandes — `loggia/chauffage/etat`, `/main`, `/maison`, `/config` —, en
 * mémoire, avec la forme EXACTE de leurs réponses (`async_etat`, `_etat_un`,
 * `_journee`). Il décide avec le calcul de l'écran
 * (`src/chauffage.js`), le jumeau de `chauffage_calcul.py` : la démo décide
 * comme le serveur. Ce que le serveur sait des appareils
 * (`chauffage_familles.py`) et de la configuration (`chauffage_config.py`) est
 * porté ici, au plus court.
 *
 * La maison : deux modules fil pilote, la Chambre (la semaine type) et le
 * Bureau (une semaine à lui), et un poêle dans le salon dont le planning n'a
 * jamais été allumé. Les deux thermostats de la démo y figurent aussi, jamais
 * configurés : pour le serveur, un `climate` hors registre qui reçoit une
 * consigne est un chauffage. La clé d'un chauffage est son `entity_id` — la
 * démo n'a pas d'identifiant de registre, comme un `climate` en YAML.
 *
 * L'heure est celle du navigateur : la maison de la démo n'a pas d'autre
 * fuseau. Les instants s'écrivent en ISO, à cette heure-là, AVEC leur décalage.
 *
 * Il ne dort pas : sans minuteur, la démo RATTRAPE à chaque lecture de l'état
 * — le sondage de l'écran — ce que le serveur aurait fait à l'heure : un
 * changement du planning, la fin d'une reprise en main ou des vacances.
 * L'ordre décidé passe dans l'état de l'appareil (l'option du module, la
 * consigne du poêle), sauf en « Observer sans agir » : on voit la carte
 * bouger. Un changement d'état qui ne vient pas de lui est un geste fait
 * ailleurs — une reprise en main jusqu'au prochain changement, comme sur le
 * serveur. La fenêtre de la chambre est ouverte (`etatsInitiaux`) et la règle
 * des fenêtres la surveille : son radiateur est coupé, le fait passe par
 * l'interrupteur que la règle coche, ramené au `select` de son module.
 *
 * Il refuse comme le serveur ce qu'un geste ordinaire peut faire refuser —
 * semaine vide, heure en double, douze changements par jour, températures
 * dans le désordre, date de retour passée —, avec le même code et le même
 * message : la clé après les deux-points, que l'écran lit (`src/refus.js`).
 * Un compte ordinaire (`?compte=ordinaire`) n'écrit pas la configuration
 * (`unauthorized`, comme `require_admin`) et ne touche pas à l'Été
 * (`not_admin`) ; la reprise en main et la maison, si. */

/* Les ordres d'un module NodOn, tels que Zigbee2MQTT les publie. */
const OPTIONS_FIL_PILOTE = ['comfort', 'eco', 'frost_protection', 'off', 'comfort_-1', 'comfort_-2'];
/* Les deux modules : leur appareil, leurs trois entités, la puissance du
 * radiateur qu'ils commandent, et un décalage pour que les deux ne chauffent
 * pas aux mêmes minutes. */
const MODULES_CHA = [
  { appareil: 'radiateur_chambre', select: 'select.radiateur_chambre_fil_pilote', interrupteur: 'switch.radiateur_chambre',
    puissance: 'sensor.radiateur_chambre_puissance', watts: 1500, decalage: 3 },
  { appareil: 'radiateur_bureau', select: 'select.radiateur_bureau_fil_pilote', interrupteur: 'switch.radiateur_bureau',
    puissance: 'sensor.radiateur_bureau_puissance', watts: 1000, decalage: 7 },
];
const POELE_CHA = 'climate.poele';
// La climatisation réversible du bureau : un thermostat pour le serveur, rangée dans sa pièce par le registre.
const CLIM_CHA = 'climate.climatisation';

/** L'appareil d'une entité du chauffage, pour l'index ; null pour les autres. */
function appareilChauffageDemo(id) {
  if (id === POELE_CHA) return 'poele';
  const m = MODULES_CHA.find(x => x.select === id || x.interrupteur === id || x.puissance === id);
  return m ? m.appareil : null;
}
/** La famille que le composant reconnaît et pose dans l'index (`chauffage_familles.famille`). */
const familleChauffageDemo = (id) => (id === POELE_CHA || id === CLIM_CHA ? 'thermostat' : MODULES_CHA.some(x => x.select === id) ? 'fil_pilote' : null);
const estModuleChauffageDemo = (id) => MODULES_CHA.some(x => x.select === id);
/** Un service sur un chauffage ou sur l'interrupteur d'un module : le moteur doit le lire. */
const toucheChauffageDemo = (id) => [].concat(id || []).some(x => typeof x === 'string'
  && (x.indexOf('climate.') === 0 || MODULES_CHA.some(m => m.interrupteur === x)));

/* Ce que `chauffage_familles.py` sait des appareils : les graphies d'un ordre
 * fil pilote, le repli d'un mode qu'un chauffage ne comprend pas, les
 * consignes par défaut, les états muets. Et les mots du journal, ceux que
 * `chauffage.py` écrit (MOTS, MOTS_MAISON) : l'écran les traduit par leur clé. */
const GRAPHIES_CHA = {
  confort: ['comfort', 'confort', 'komfort'], confort_1: ['comfort_1', 'confort_1', 'komfort_1', 'comfort_minus_1'],
  confort_2: ['comfort_2', 'confort_2', 'komfort_2', 'comfort_minus_2'], eco: ['eco', 'economy'],
  hors_gel: ['frost_protection', 'frost', 'hors_gel', 'horsgel', 'antigel', 'anti_freeze', 'antifreeze'], arret: ['off', 'arret', 'stop'],
};
const REPLIS_CHA = { confort: [], confort_1: ['confort'], confort_2: ['confort_1', 'confort'], eco: ['hors_gel'], hors_gel: ['eco'], arret: ['hors_gel', 'eco'] };
const TEMPERATURES_CHA = { confort: 20, eco: 17, hors_gel: 7 };
const MUETS_CHA = ['unavailable', 'unknown', 'none', ''];
const MOTS_CHA = { confort: 'Confort', confort_1: 'Confort −1', confort_2: 'Confort −2', eco: 'Éco', hors_gel: 'Hors-gel', arret: 'Arrêt' };
const MOTS_MAISON_CHA = { planning: 'Planning', absence: 'Absence', vacances: 'Vacances', ete: 'Été' };
const MAX_CHANGEMENTS_CHA = 12;
const MAX_CHAUFFAGES_CHA = 32;
// La part de chaque heure où un radiateur chauffe, en dixièmes, selon son mode.
const PART_CHAUFFE_CHA = { confort: 6, confort_1: 5, confort_2: 4, eco: 2, hors_gel: 0, arret: 0 };

const muetCha = (etat) => MUETS_CHA.includes(String(etat == null ? '' : etat).toLowerCase());
const estObjetCha = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
// Une COPIE à chaque réponse, comme un vrai serveur ; et ce qui part par le fil est du JSON.
const copieCha = (x) => JSON.parse(JSON.stringify(x));
// Une clé venue de l'écran ne lit jamais le prototype d'un objet.
const possedeCha = (objet, cle) => Object.prototype.hasOwnProperty.call(objet, cle);

/** Le mode d'une option de `select`, quelle que soit sa graphie (`mode_option`). */
function modeOptionCha(option) {
  // Les noms collés de ZHA se découpent (« FrostProtection », « ComfortMinus1 »), comme `canonique`.
  const c = String(option == null ? '' : option).normalize('NFKD').replace(/[^\x00-\x7f]/g, '')
    .replace(/([a-z])(?=[A-Z])|([A-Za-z])(?=\d)/g, '$1$2_').trim().toLowerCase()
    .replace(/[\s_-]+/g, '_').replace(/^_+|_+$/g, '');
  return Object.keys(GRAPHIES_CHA).find(m => GRAPHIES_CHA[m].includes(c)) || null;
}
/** {mode: option}, avec l'option telle que le module l'écrit (`options_du_module`). */
function optionsDuModuleCha(options) {
  const sortie = {};
  (Array.isArray(options) ? options : []).forEach(o => {
    const m = modeOptionCha(o);
    if (m && !possedeCha(sortie, m)) sortie[m] = String(o);
  });
  return sortie;
}
/** Les modes qu'un chauffage comprend, dans l'ordre de MODES (`modes_permis`). */
function modesPermisCha(famille, attributs) {
  const a = attributs || {};
  if (famille === 'fil_pilote') {
    const connus = optionsDuModuleCha(a.options);
    return MODES.filter(m => possedeCha(connus, m));
  }
  if (famille === 'thermostat') {
    const arret = Array.isArray(a.hvac_modes) && a.hvac_modes.includes('off');
    return MODES.filter(m => m !== 'arret' || arret);
  }
  return [];
}
const modeApplicableCha = (mode, permis) => (permis.includes(mode) ? mode
  : ((possedeCha(REPLIS_CHA, mode) ? REPLIS_CHA[mode] : []).find(r => permis.includes(r)) || null));
/** La consigne d'un mode en °C ; Confort −1 et −2 jamais sous l'Éco (`temperature_du_mode`). */
function temperatureDuModeCha(mode, temperatures) {
  const t = { ...TEMPERATURES_CHA };
  if (estObjetCha(temperatures)) Object.keys(t).forEach(k => { if (typeof temperatures[k] === 'number') t[k] = temperatures[k]; });
  if (possedeCha(t, mode)) return t[mode];
  if (mode === 'confort_1') return Math.max(t.confort - 1, t.eco);
  if (mode === 'confort_2') return Math.max(t.confort - 2, t.eco);
  return null;
}
const pasCha = (a) => (typeof a.target_temp_step === 'number' && a.target_temp_step > 0 ? a.target_temp_step : 0.5);
/** La consigne telle qu'elle part : au pas de l'appareil, dans ses bornes (la démo est en °C). */
function consigneCha(celsius, attributs) {
  const a = attributs || {};
  const pas = pasCha(a);
  let v = Math.floor(celsius / pas + 0.5) * pas;
  if (typeof a.min_temp === 'number') v = Math.max(v, a.min_temp);
  if (typeof a.max_temp === 'number') v = Math.min(v, a.max_temp);
  return Math.round(v * 1e4) / 1e4;
}
const modeChauffeCha = (a) => ['heat', 'heat_cool', 'auto'].find(m => Array.isArray((a || {}).hvac_modes) && a.hvac_modes.includes(m)) || null;
/** Ce que l'appareil dit faire (`lire_appareil`) : sa signature change quand le MODE change. */
/* Une pompe à chaleur qui refroidit (chauffage_familles.refroidit) : le planning n'y touche pas. */
const FROID_CHA = ['cool', 'dry', 'fan_only'];
function refroiditCha(famille, etat) {
  return (famille === 'thermostat' || famille === 'vtherm') && FROID_CHA.includes(String(etat));
}
function lireAppareilCha(famille, etat, attributs) {
  const s = String(etat == null ? '' : etat);
  if (muetCha(s)) return { mode: null, temperature: null, signature: null };
  if (famille === 'fil_pilote') return { mode: modeOptionCha(s), temperature: null, signature: [s] };
  const t = typeof (attributs || {}).temperature === 'number' ? attributs.temperature : null;
  return { mode: s === 'off' ? 'arret' : null, temperature: s === 'off' || t === null ? null : Math.round(t * 10) / 10, signature: [s, t] };
}
/** L'appareil est-il DÉJÀ dans `cible` ? On ne commande que s'il diffère (`deja`). */
function dejaCha(famille, cible, etat, attributs, temperatures) {
  const s = String(etat == null ? '' : etat);
  const a = attributs || {};
  if (muetCha(s)) return false;
  if (famille === 'fil_pilote') return cible.mode != null && modeOptionCha(s) === cible.mode;
  if (cible.mode === 'arret') return s === 'off';
  if (s === 'off') return false;
  const chauffe = modeChauffeCha(a);
  if (chauffe && s !== chauffe) return false;
  const t = typeof cible.temperature === 'number' ? cible.temperature : temperatureDuModeCha(cible.mode, temperatures);
  if (t === null || typeof a.temperature !== 'number') return false;
  return Math.abs(a.temperature - consigneCha(t, a)) <= Math.max(pasCha(a), 0.1) / 2;
}

/* L'heure de la maison : [jour (0 = lundi), minute]. */
const muraleCha = (d) => [(d.getDay() + 6) % 7, d.getHours() * 60 + d.getMinutes()];
const deuxCha = (x) => String(x).padStart(2, '0');
const heureCha = (d) => deuxCha(d.getHours()) + ':' + deuxCha(d.getMinutes());
/** Un instant en ISO, à l'heure de la maison et AVEC son décalage : « 2026-10-12T13:30:00+02:00 ». */
function isoCha(d) {
  const decalage = -d.getTimezoneOffset();
  const abs = Math.abs(decalage);
  const signe = '+-'.charAt(decalage < 0 ? 1 : 0);
  return d.getFullYear() + '-' + deuxCha(d.getMonth() + 1) + '-' + deuxCha(d.getDate()) + 'T' + heureCha(d) + ':' + deuxCha(d.getSeconds())
    + signe + deuxCha(Math.floor(abs / 60)) + ':' + deuxCha(abs % 60);
}
/* Un instant ISO AVEC son décalage, ou null (`lire_instant`) : une heure sans
 * fuseau ne dit pas quand elle tombe. */
const INSTANT_CHA = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
function lireInstantCha(texte) {
  if (typeof texte !== 'string' || !INSTANT_CHA.test(texte.trim())) return null;
  const t = Date.parse(texte.trim().replace(' ', 'T'));
  return Number.isFinite(t) ? new Date(t) : null;
}
/** Le premier instant APRÈS `apres` où l'horloge de la maison marque (jour, minute) (`instant_de`). */
function instantCha(jour, minute, apres) {
  const [j, m] = muraleCha(apres);
  let ecart = (jour - j + 7) % 7;
  if (ecart === 0 && minute <= m) ecart = 7;
  const t = new Date(apres.getFullYear(), apres.getMonth(), apres.getDate() + ecart, Math.floor(minute / 60), minute % 60, 0, 0);
  return t > apres ? t : new Date(t.getFullYear(), t.getMonth(), t.getDate() + 7, Math.floor(minute / 60), minute % 60, 0, 0);
}

/* La semaine type du premier allumage (`SEMAINE_OUVREE`, `SEMAINE_REPOS`). Le
 * bureau a la sienne : occupé l'après-midi en semaine, hors gel la nuit et
 * tout le week-end — deux jours sans changement, qui reprennent la veille —,
 * et Confort −1 en fin de journée, pour que les six ordres du module aient de
 * quoi se montrer. */
const SEMAINE_OUVREE_CHA = [['06:30', 'confort'], ['08:30', 'eco'], ['18:00', 'confort'], ['22:30', 'eco']];
const SEMAINE_REPOS_CHA = [['08:00', 'confort'], ['22:30', 'eco']];
const SEMAINE_BUREAU_CHA = [['07:30', 'eco'], ['13:30', 'confort'], ['17:30', 'confort_1'], ['19:00', 'eco'], ['22:00', 'hors_gel']];
const semaineCha = (ouvree, repos) => Object.fromEntries(JOURS.map(j => [j, (j === 'sam' || j === 'dim' ? repos : ouvree).map(([h, mode]) => ({ h, mode }))]));
/* Une semaine dans les modes d'un chauffage (`adapter_aux_modes`,
 * `semaine_adaptee` — chauffage_config.py) : un mode qu'il ne comprend pas
 * devient le plus proche qu'il comprend SANS être plus chaud, à défaut le plus
 * froid qu'il comprend ; les heures ne bougent pas. Sans aucun mode compris,
 * telle quelle. L'écran en a le jumeau (`semaineAdaptee`, chauffageplanning.js),
 * que tests/demo_chauffage.test.mjs tient égal à celui-ci. Un jumeau porté
 * ici, au plus court, comme les autres : importer celui de la fiche ferait
 * partager à la démo, chargée à côté du boot, le module de la fiche et ce
 * qu'il tire — l'écran, i18n, l'état —, et la construction en sortait 33 Ko
 * du boot dans un morceau à part (mesuré le 12/10, tâche 10 bis B). */
function semaineAdapteeCha(semaine, permis) {
  const compris = FROID.filter(m => Array.isArray(permis) && permis.includes(m));
  const adapte = (mode) => {
    if (!compris.length || compris.includes(mode)) return mode;
    const rang = FROID.indexOf(mode);
    const plusFroids = rang < 0 ? [] : compris.filter(m => FROID.indexOf(m) < rang);
    return plusFroids.length ? plusFroids[plusFroids.length - 1] : compris[0];
  };
  return Object.fromEntries(JOURS.map(j => [j, (Array.isArray(semaine[j]) ? semaine[j] : []).map(c => ({ h: c.h, mode: adapte(c.mode) }))]));
}
/** Un chauffage qu'on vient de reconnaître (`chauffage_defaut`) : planning éteint, la semaine type dans SES
 * modes (`permis`, ceux que le moteur lui reconnaît : l'Éco d'un module qui n'en a pas devient son Hors-gel,
 * jamais plus chaud), les températures par défaut, la fenêtre qui coupe. Sans `permis`, la semaine type telle quelle. */
const chauffageDefautCha = (entite, famille, permis = null) => ({ entite, famille, planning: false,
  semaine: semaineAdapteeCha(semaineCha(SEMAINE_OUVREE_CHA, SEMAINE_REPOS_CHA), permis), temperatures: { ...TEMPERATURES_CHA }, fenetre: 'arret' });
/* Un radiateur que Home Assistant ne connaît plus — renommé ou retiré — et
 * dont la configuration reste : « En ce moment » le dit à un administrateur,
 * sa fiche s'ouvre sur son Planning, où « Supprimer son planning » le retire
 * (relecture des tâches 11 et 12 du plan 2). Aucune entité de la démo ne porte
 * ce nom. */
const GRENIER_CHA = 'select.radiateur_grenier_fil_pilote';
/* La configuration de départ : les deux modules au planning, la maison en
 * Planning, l'observation coupée. Le poêle n'y est pas : jamais configuré. Le
 * radiateur du grenier, introuvable, garde la sienne, planning éteint. */
function configDepartCha() {
  const chambre = { ...chauffageDefautCha(MODULES_CHA[0].select, 'fil_pilote'), planning: true };
  const bureau = { ...chauffageDefautCha(MODULES_CHA[1].select, 'fil_pilote'), planning: true, semaine: semaineCha(SEMAINE_BUREAU_CHA, []) };
  const grenier = chauffageDefautCha(GRENIER_CHA, 'fil_pilote');
  return { version: 1, chauffages: { [chambre.entite]: chambre, [bureau.entite]: bureau, [grenier.entite]: grenier },
    maison: { mode: 'planning', vacances_fin: null, absence: 'eco', vacances: 'hors_gel' }, simulation: { actif: false } };
}

/* La mémoire du moteur : sa configuration, les reprises en main, son journal,
 * et ce qu'il a vu de chaque appareil (`vus`, pour reconnaître un geste fait
 * ailleurs) ou déjà noté en observation (`notes`, une ligne par décision). Une
 * maison par onglet ; `demarrerChauffageDemo` la rebâtit. */
let CHA_ = null;
const chauffageCha = (cle) => (possedeCha(CHA_.cfg.chauffages, cle) ? CHA_.cfg.chauffages[cle] : null);
const repriseCha = (cle) => (possedeCha(CHA_.reprises, cle) ? CHA_.reprises[cle] : null);

/* Ce que Home Assistant n'ENREGISTRE pas d'un `climate`
 * (`_entity_component_unrecorded_attributes`) : ses listes, ses bornes, son
 * pas. L'historique de la démo ne les a pas plus que le vrai — la fiche les
 * reprend de l'état vivant (relecture de la tâche 10, prise à la tâche 10 bis
 * D). */
const NON_ENREGISTRES_CLIMAT_CHA = ['hvac_modes', 'fan_modes', 'swing_modes', 'swing_horizontal_modes', 'min_temp', 'max_temp', 'min_humidity', 'max_humidity',
  'target_temp_step', 'preset_modes'];
const enregistresCha = (a) => Object.fromEntries(Object.entries(a || {}).filter(([k]) => !NON_ENREGISTRES_CLIMAT_CHA.includes(k)));

/* L'historique d'un chauffage, sur la fenêtre demandée (`historiqueDemo`) :
 * ce que sa fiche dessine (tâches 10 et 10 bis D) — les modes qu'un module a
 * appliqués, et pour un thermostat sa pièce (`current_temperature`, la
 * sinusoïde des pièces de la démo, `temperatureDemo`), sa consigne et ce
 * qu'il fait (`hvac_action`, lu sur la pièce comme après un service,
 * `actionClimatDemo`). Un module suit son planning (la semaine du moteur,
 * sinon la semaine type) ; un thermostat, une journée réglée à la main :
 * trois degrés de moins la nuit, un matin plus chaud que la pièce — il
 * chauffe chaque jour, le poêle d'un salon déjà chaud aussi (relecture de la
 * partie D) —, coupé à 13 h, une soirée plus chaude — que sa fiche dit « à la
 * main ». Une entrée par quart d'heure, aux quarts de
 * l'horloge ; la dernière est l'état du moment, celui que montre la carte —
 * sans ce que Home Assistant n'enregistre pas. */
function historiqueChauffageDemo(id, t0, t1, states) {
  const st = states[id];
  if (!st || !(t1 > t0)) return [];
  const module = estModuleChauffageDemo(id);
  const options = optionsDuModuleCha(OPTIONS_FIL_PILOTE);
  const c = module && CHA_ ? chauffageCha(id) : null;
  const semaine = c ? c.semaine : semaineCha(SEMAINE_OUVREE_CHA, SEMAINE_REPOS_CHA);
  const a = st.attributes || {};
  const enregistres = enregistresCha(a);
  const consigne = typeof a.temperature === 'number' ? a.temperature : TEMPERATURES_CHA.confort;
  const piece = typeof a.current_temperature === 'number' ? a.current_temperature : null;
  const pts = [];
  for (const t of instantsDemo(Math.floor(t0 / PAS_TEMPERATURE_DEMO) * PAS_TEMPERATURE_DEMO, t1)) {
    const quand = new Date(Math.max(t, t0)).toISOString();
    const dernier = t === t1;   // maintenant : l'état du moment
    if (module) {
      const [jour, minute] = muraleCha(new Date(t));
      const enCours = changementEnCours(semaine, jour, minute);
      const option = dernier ? String(st.state) : enCours ? options[enCours[2]] : null;
      if (option && (!pts.length || pts[pts.length - 1].state !== option)) pts.push({ state: option, last_changed: quand });
    } else if (dernier) {
      pts.push({ state: String(st.state), attributes: enregistres, last_changed: quand, last_updated: quand });
    } else {
      const h = new Date(t).getHours();
      const etat = h === 13 ? 'off' : st.state === 'off' ? 'heat' : String(st.state);
      // Le matin (6 h – 9 h), ce qui chauffe vise deux degrés au-dessus de la pièce : il chauffe chaque jour.
      const matin = etat === 'heat' && h >= 6 && h < 9 && piece !== null;
      const temperature = matin ? piece + 2 : h < 6 ? consigne - 3 : h >= 18 && h < 20 ? consigne + 1.5 : consigne;
      const mesure = piece === null ? null : temperatureDemo(piece, t, t1);
      pts.push({ state: etat, attributes: { ...enregistres, temperature, current_temperature: mesure, hvac_action: actionClimatDemo(etat, { current_temperature: mesure, temperature }) },
        last_changed: quand, last_updated: quand });
    }
  }
  if (pts.length) pts[0].entity_id = id;
  return [pts];
}

/** Une ligne au journal du module, comme `regles.noter` l'écrit (`ligneJournal`). */
function noterCha(ctx, champs) {
  if (ctx.silencieux) return;
  CHA_.journal.unshift(ligneJournal({ ts: ctx.horloge().getTime() / 1000, module: 'chauffage', regle: '', quoi: '', cibles: [], n: 0,
    motif: '', detail: '', simule: false, ...champs }));
  CHA_.journal.length = Math.min(CHA_.journal.length, 100);
}
/** Les lignes du module pour le journal de la maison (`reglesDemo`), une fois la maison montée. */
const journalChauffageDemo = () => (CHA_ ? copieCha(CHA_.journal) : []);
/** « jusqu’à 21:00 », ou « jusqu’à relance » (`_motif_fin`). */
const motifFinCha = (fin) => (fin ? [['jusqu’à {heure}', { heure: heureCha(fin) }]] : 'jusqu’à relance');
// « %g » de Python : 21.5, 20, 19.25.
const nombreCha = (t) => String(Math.round(t * 1e4) / 1e4);

/* Les chauffages que la maison a (`candidats`) : ceux que l'index range avec
 * une famille, puis chaque `climate` hors registre qui reçoit une consigne. */
function candidatsCha(states) {
  const index = indexDemo(states);
  const connus = new Map();
  const auRegistre = new Set();
  index.entities.forEach(e => {
    if (!/^(climate|select)\./.test(e.id)) return;
    auRegistre.add(e.id);
    if (e.famille) connus.set(e.id, { entite: e.id, famille: e.famille, permis: modesPermisCha(e.famille, (states[e.id] || {}).attributes), appareil: e.device || null });
  });
  Object.keys(states).filter(id => id.indexOf('climate.') === 0 && !auRegistre.has(id)).sort().forEach(id => {
    const f = (states[id].attributes || {}).supported_features;
    if (typeof f === 'number' && !(f & 1)) return;
    // Une clim qui ne fait que du froid n'est pas un chauffage (chauffage_familles.famille, audit du 19/10).
    const modes = (states[id].attributes || {}).hvac_modes;
    if (Array.isArray(modes) && modes.length && !['heat', 'heat_cool', 'auto'].some(m => modes.includes(m))) return;
    connus.set(id, { entite: id, famille: 'thermostat', permis: modesPermisCha('thermostat', states[id].attributes), appareil: null });
  });
  return { connus, index };
}
/** Les interrupteurs d'un module : jamais commandés, lus pour dire « module coupé ». */
const interrupteursCha = (index, appareil) => (appareil
  ? index.entities.filter(e => e.device === appareil && e.id.indexOf('switch.') === 0 && !e.category).map(e => e.id).sort() : []);
/** Le `select` du module dont `haid` est l'interrupteur (`select_du_module`), sinon null. */
function selectDuModuleCha(haid, connus, index) {
  if (typeof haid !== 'string' || haid.indexOf('switch.') !== 0) return null;
  const e = index.entities.find(x => x.id === haid);
  const info = e && e.device ? [...connus.values()].find(i => i.famille === 'fil_pilote' && i.appareil === e.device) : null;
  return info ? info.entite : null;
}
/** Un ouvrant ouvert, comme pour couper (`ouvrants_ouverts`, fenetres.py) : `on`, `open`, `opening` ; un capteur muet ne l'est pas. */
const ouvertCha = (st) => !!st && ['on', 'open', 'opening'].includes(String(st.state).toLowerCase());
/* Les FAITS de la règle des fenêtres (`async_fenetre`) : {chauffage: pièces
 * dont un ouvrant est ouvert}, lus sur la configuration de la règle de la démo.
 * L'interrupteur d'un module y est ramené à son `select`, comme sur le serveur. */
function fenetresCha(states, connus, index) {
  const faits = new Map();
  const cfg = FEN_CFG();
  if (!cfg.actif) return faits;
  Object.keys(cfg.pieces || {}).forEach(nom => {
    const piece = cfg.pieces[nom];
    if (!estObjetCha(piece) || !piece.actif) return;
    const ouverte = (piece.ouvrants || []).some(id => ouvertCha(states[id]));
    if (!ouverte) return;
    (piece.chauffages || []).forEach(haid => {
      const vrai = selectDuModuleCha(haid, connus, index) || haid;
      const pieces = faits.get(vrai) || [];
      if (!pieces.includes(nom)) pieces.push(nom);
      faits.set(vrai, pieces);
    });
  });
  return faits;
}
/* Les chauffages que la règle des fenêtres de la démo SURVEILLE, et ce qu'elle
 * voit MAINTENANT (`veille`, fenetres.py) : {chauffage: un ouvrant de l'une de
 * ses pièces suivies est-il ouvert ?}, en un seul passage sur les pièces —
 * celles qui sont actives et ont des ouvrants, l'interrupteur d'un module
 * ramené à son `select`. Ailleurs, l'écran ne dit rien de la fenêtre
 * (relecture de la partie B). */
function surveillesCha(states, connus, index) {
  const suivis = new Map();
  const cfg = FEN_CFG();
  if (!cfg.actif) return suivis;
  Object.keys(cfg.pieces || {}).forEach(nom => {
    const piece = cfg.pieces[nom];
    if (!estObjetCha(piece) || !piece.actif || !(piece.ouvrants || []).length) return;
    const ouverte = (piece.ouvrants || []).some(id => ouvertCha(states[id]));
    (piece.chauffages || []).forEach(haid => {
      const vrai = selectDuModuleCha(haid, connus, index) || haid;
      suivis.set(vrai, suivis.get(vrai) === true || ouverte);
    });
  });
  return suivis;
}
const entiteCha = (cle, c, states) => (c && states[c.entite] ? c.entite : states[cle] ? cle : null);

/** `mode_voulu`, nourri de vrais instants : la reprise et sa fin ramenées à l'heure murale (`_voulu`). */
function vouluCha(cle, c, entite, quand, faits) {
  const [jour, minute] = muraleCha(quand);
  const r = repriseCha(cle);
  let reprise = null;
  if (r) {
    const fin = lireInstantCha(r.fin);
    reprise = { mode: r.mode, reste: fin ? (fin - quand) / 60000 : null, fin: fin ? muraleCha(fin) : null };
  }
  return modeVoulu(c.semaine, CHA_.cfg.maison, reprise, (faits.get(entite) || []).length > 0, jour, minute, c.fenetre);
}
/** Le prochain changement du planning ; sans changement, 24 h (`_fin_par_defaut`). */
function finParDefautCha(c, quand) {
  const [jour, minute] = muraleCha(quand);
  const suivant = prochainChangement(c.semaine, jour, minute);
  return suivant ? instantCha(suivant[0], suivant[1], quand) : new Date(quand.getTime() + 24 * 3600000);
}
/** Une reprise en main, telle qu'elle se garde (`nouvelle_reprise`). */
const nouvelleRepriseCha = (mode, temperature, fin, quand, par) => ({ mode: MODES.includes(mode) ? mode : null,
  temperature: typeof temperature === 'number' ? temperature : null, fin: fin ? isoCha(fin) : null, depuis: isoCha(quand),
  par: typeof par === 'string' ? par : null });
/** Pourquoi : « planning 06:30 », la maison, les pièces dont la fenêtre est ouverte (`_motif`). */
function motifCha(c, entite, voulu, quand, faits) {
  if (voulu.source === 'planning') {
    const [jour, minute] = muraleCha(quand);
    const enCours = changementEnCours(c.semaine, jour, minute);
    return enCours ? [['planning {heure}', { heure: ecrireHeure(enCours[1]) }]] : 'planning';
  }
  if (voulu.source === 'maison') return MOTS_MAISON_CHA[CHA_.cfg.maison.mode] || '';
  if (voulu.source === 'fenetre') return (faits.get(entite) || []).slice().sort().join(', ') || 'fenêtre ouverte';
  return '';
}

/* La question, pour chaque chauffage au planning allumé (`async_evaluer`) : la
 * fin des vacances, puis chacun ; et la puissance des modules, qui suit leur
 * mode. `raison` : « redemarrage » au montage de la maison, sans un mot au
 * journal (`ctx.silencieux`) — les appareils y sont déjà. */
function evaluerCha(ctx, raison) {
  const quand = ctx.horloge();
  finDesVacancesCha(ctx, quand);
  const { connus, index } = candidatsCha(ctx.states);
  const faits = fenetresCha(ctx.states, connus, index);
  Object.keys(CHA_.cfg.chauffages).forEach(cle => {
    const c = CHA_.cfg.chauffages[cle];
    if (c.planning) evaluerUnCha(ctx, cle, c, quand, faits, raison);
    else delete CHA_.vus[cle];
  });
  puissancesCha(ctx, quand);
}
function finDesVacancesCha(ctx, quand) {
  const maison = CHA_.cfg.maison;
  const fin = lireInstantCha(maison.vacances_fin);
  if (maison.mode !== 'vacances' || !fin || fin > quand) return;
  Object.assign(maison, { mode: 'planning', vacances_fin: null });
  noterCha(ctx, { regle: 'maison', quoi: MOTS_MAISON_CHA.planning, n: 0, motif: 'fin des vacances' });
}
/* Un chauffage (`_evaluer_un`) : la reprise échue tombe ; un appareil qui
 * n'est plus tel que le moteur l'a laissé a subi un geste — une reprise en
 * main ; puis la décision, et l'ordre s'il diffère de ce que fait l'appareil. */
function evaluerUnCha(ctx, cle, c, quand, faits, raison) {
  const entite = entiteCha(cle, c, ctx.states);
  if (!entite) return;
  const r0 = repriseCha(cle);
  if (r0 && r0.fin != null) {
    const fin = lireInstantCha(r0.fin);
    if (!fin || fin <= quand) {
      delete CHA_.reprises[cle];
      noterCha(ctx, { regle: 'main', quoi: 'reprendre le planning', cibles: [entite], n: 0, motif: 'fin de la reprise en main' });
    }
  }
  let st = ctx.states[entite];
  if (!st || muetCha(st.state)) { delete CHA_.vus[cle]; return; }   // injoignable : son retour n'est pas un geste
  if (refroiditCha(c.famille, st.state)) {
    // Elle refroidit : ni geste, ni ordre, comme sur le serveur (audit du 19/10). En repartir, si.
    CHA_.vus[cle] = JSON.stringify(lireAppareilCha(c.famille, st.state, st.attributes).signature);
    return;
  }
  const lu = lireAppareilCha(c.famille, st.state, st.attributes);
  const vu = JSON.stringify(lu.signature);
  if (CHA_.vus[cle] != null && CHA_.vus[cle] !== vu) {
    const fin = finParDefautCha(c, quand);
    CHA_.reprises[cle] = nouvelleRepriseCha(lu.mode, lu.temperature, fin, quand, (ctx.utilisateur || {}).id);
    noterCha(ctx, { regle: 'main', quoi: 'reprise en main', cibles: [entite], n: 0, motif: motifFinCha(fin), detail: 'geste fait ailleurs' });
  }
  CHA_.vus[cle] = vu;
  const voulu = vouluCha(cle, c, entite, quand, faits);
  const r = repriseCha(cle);
  let cible;
  if (voulu.source === 'main' && r) cible = { mode: r.mode, temperature: r.temperature };
  else {
    cible = { mode: modeApplicableCha(voulu.mode, modesPermisCha(c.famille, st.attributes)), temperature: null };
    // La fenêtre ne fait que baisser, une consigne posée à la main comprise.
    if (voulu.source === 'fenetre' && c.famille === 'thermostat' && r && r.mode == null && typeof r.temperature === 'number') {
      const froid = temperatureDuModeCha(voulu.mode, c.temperatures);
      if (froid !== null) cible.temperature = Math.min(froid, r.temperature);
    }
  }
  if (cible.mode == null && cible.temperature == null) return;
  if (dejaCha(c.famille, cible, st.state, st.attributes, c.temperatures)) { delete CHA_.notes[cle]; return; }
  const quoi = possedeCha(MOTS_CHA, cible.mode) ? MOTS_CHA[cible.mode] : [['{t} °C', { t: nombreCha(cible.temperature) }]];
  const motif = voulu.source === 'main' ? motifFinCha(lireInstantCha((r || {}).fin)) : motifCha(c, entite, voulu, quand, faits);
  const detail = raison === 'redemarrage' ? 'rattrapage au redémarrage' : '';
  if (CHA_.cfg.simulation.actif) {
    // « Observer sans agir » (ADR 0004) : le calcul et le journal, aucun ordre — une ligne par décision.
    const note = JSON.stringify(['simule', voulu.source, cible.mode, cible.temperature]);
    if (CHA_.notes[cle] !== note) {
      CHA_.notes[cle] = note;
      noterCha(ctx, { regle: voulu.source, quoi, cibles: [entite], n: 1, motif, detail, simule: true });
    }
    return;
  }
  appliquerCha(ctx, c.famille, entite, cible, st, c.temperatures);
  st = ctx.states[entite];
  CHA_.vus[cle] = JSON.stringify(lireAppareilCha(c.famille, st.state, st.attributes).signature);
  delete CHA_.notes[cle];
  noterCha(ctx, { regle: voulu.source, quoi, cibles: [entite], n: 1, motif, detail });
}
/* L'ordre, dans l'état de l'appareil (`commande`) : l'option du module, telle
 * qu'il l'écrit ; pour un thermostat, le mode qui chauffe et la consigne du
 * mode — ou l'arrêt. */
function appliquerCha(ctx, famille, entite, cible, st, temperatures) {
  const a = st.attributes || {};
  if (famille === 'fil_pilote') {
    const options = optionsDuModuleCha(a.options);
    if (possedeCha(options, cible.mode)) ctx.ecrire(entite, options[cible.mode]);
    return;
  }
  if (cible.mode === 'arret') { ctx.ecrire(entite, 'off', { hvac_action: 'off' }); return; }
  const t = typeof cible.temperature === 'number' ? cible.temperature : temperatureDuModeCha(cible.mode, temperatures);
  if (t === null) return;
  const consigne = consigneCha(t, a);
  const piece = typeof a.current_temperature === 'number' ? a.current_temperature : null;
  ctx.ecrire(entite, modeChauffeCha(a) || st.state, { temperature: consigne, hvac_action: piece !== null && piece >= consigne ? 'idle' : 'heating' });
}
/* La puissance d'un module suit son mode : il chauffe une partie de chaque
 * heure (`PART_CHAUFFE_CHA`, par tranches de six minutes), jamais en Arrêt ni
 * en Hors-gel, jamais module coupé. La carte y lit « Chauffe » (plus de 10 W). */
function puissancesCha(ctx, quand) {
  const tranche = Math.floor((quand.getHours() * 60 + quand.getMinutes()) / 6);
  MODULES_CHA.forEach(m => {
    const select = ctx.states[m.select];
    const capteur = ctx.states[m.puissance];
    if (!select || !capteur) return;
    const coupe = ctx.states[m.interrupteur] && ctx.states[m.interrupteur].state === 'off';
    const part = coupe ? 0 : (PART_CHAUFFE_CHA[modeOptionCha(select.state)] || 0);
    const watts = (tranche * 3 + m.decalage) % 10 < part ? m.watts : 0;
    if (Number(capteur.state) !== watts) ctx.ecrire(m.puissance, watts);
  });
}

/* ── Ce que l'écran lit : `loggia/chauffage/etat` (`async_etat`) ── */
function etatCha(ctx) {
  evaluerCha(ctx, 'heure');
  const quand = ctx.horloge();
  const { connus, index } = candidatsCha(ctx.states);
  const faits = fenetresCha(ctx.states, connus, index);
  const suivis = surveillesCha(ctx.states, connus, index);
  // Les chauffages configurés d'abord, puis ceux que la maison a.
  const cles = [...new Set([...Object.keys(CHA_.cfg.chauffages), ...connus.keys()])];
  return copieCha({
    chauffages: cles.map(cle => etatUnCha(ctx, cle, chauffageCha(cle), connus.get(cle) || null, quand, faits, index, suivis)),
    maison: CHA_.cfg.maison, simulation: !!CHA_.cfg.simulation.actif,
    // La règle des fenêtres de la démo en « Observer sans agir » : son drapeau, que l'interrupteur des Règles pose.
    fenetres_observe: !!FEN_CFG().simulation,
    maintenant: isoCha(quand), minute: muraleCha(quand),
    // Un planning tourne-t-il ? Sur toute la configuration, comme le serveur (avant ses droits).
    plannings_allumes: Object.values(CHA_.cfg.chauffages).some(c => !!c.planning),
    demarrage: true, journal: CHA_.journal.slice(0, 40),
  });
}
/** Le nom d'un appareil au registre (`_nom_appareil`), ou null : pas d'appareil, ou inconnu. */
function nomAppareilCha(index, appareil) {
  const d = appareil ? (index.devices || []).find(x => x.id === appareil) : null;
  return d && typeof d.name === 'string' && d.name ? d.name : null;
}
/* Un chauffage, pour l'écran (`_etat_un`) : sa famille, ses modes, ce qu'il
 * doit faire et pourquoi, jusqu'à quand, ce qui l'en empêche ; au planning
 * allumé, sa journée (la fiche y lit ce que « Reprendre le planning »
 * remettra) ; un fil pilote, les options de son module. Relecture de la partie B, comme le serveur : `mode`
 * reste le mode VOULU, `applique` celui que le moteur envoie
 * (`mode_applicable`), `fenetre_mode` celui qu'une ouverture appliquerait
 * (null pour « ne rien faire ») ; `fenetre_ouverte` vrai sur un fait
 * d'ouverture, faux là où la règle veille (`suivis`), null ailleurs ;
 * `ouvrant_ouvert` l'ouvrant MAINTENANT, là où elle veille (relecture du
 * 12/10). Sans état — introuvable —, ni mode appliqué ni mode d'ouverture :
 * ce ne serait qu'une supposition, et le moteur ne lui envoie rien. */
function etatUnCha(ctx, cle, c, info, quand, faits, index, suivis = null) {
  const entite = info ? info.entite : entiteCha(cle, c, ctx.states);
  const st = entite ? ctx.states[entite] : null;
  const sansEtat = !st;
  const attrs = (st && st.attributes) || {};
  const famille = (info && info.famille) || (c && c.famille) || null;
  const avertissements = [];
  if (!entite) avertissements.push('introuvable');
  else if (!st || muetCha(st.state)) avertissements.push('injoignable');
  if (info && info.famille === 'fil_pilote'
    && interrupteursCha(index, info.appareil).some(id => ctx.states[id] && String(ctx.states[id].state).toLowerCase() === 'off')) {
    avertissements.push('module_coupe');
  }
  if (st && refroiditCha(famille, st.state)) avertissements.push('refroidit');
  /* Un module fil pilote se nomme comme son APPAREIL, dans la langue de la démo
   * (sous Zigbee2MQTT, son `select` porte en plus le nom de l'exposition) ; un
   * thermostat garde son nom affiché. */
  const nomAppareil = famille === 'fil_pilote' && info ? nomAppareilCha(index, info.appareil) : null;
  const reglageFenetre = c ? c.fenetre : 'arret';
  // Les modes tels que le moteur les compte quand il commande : ceux de la famille configurée, sinon reconnue.
  const permis = c && c.famille ? modesPermisCha(c.famille, attrs) : famille ? modesPermisCha(famille, attrs) : [];
  const ouverte = !entite ? null : (faits.get(entite) || []).length > 0 ? true : suivis && suivis.has(entite) ? false : null;
  const sortie = {
    // Introuvable, son nom est l'entité que retient sa configuration, comme sur le serveur.
    cle, entite, nom: nomAppareil || attrs.friendly_name || entite || (c && c.entite) || null, famille, planning: !!(c && c.planning),
    modes: famille ? modesPermisCha(famille, attrs) : [], mode: null, applique: null, source: null, fin: null, puis: null, reprise: null,
    fenetre: reglageFenetre, fenetre_ouverte: ouverte,
    ouvrant_ouvert: entite && suivis && suivis.has(entite) ? suivis.get(entite) : null,
    fenetre_mode: sansEtat || reglageFenetre === 'rien' ? null : modeApplicableCha(reglageFenetre, permis),
    semaine: c ? c.semaine : null, temperatures: c ? c.temperatures : null, avertissements,
    options: famille === 'fil_pilote' && entite ? optionsDuModuleCha(attrs.options) : null, jour: null,
  };
  if (!c) return sortie;
  const voulu = vouluCha(cle, c, entite, quand, faits);
  const r = repriseCha(cle);
  let fin = null;
  if (voulu.source === 'main') fin = (r && r.fin) || null;
  else if (voulu.fin) fin = isoCha(instantCha(voulu.fin[0], voulu.fin[1], quand));
  Object.assign(sortie, { mode: voulu.mode, applique: sansEtat ? null : modeApplicableCha(voulu.mode, permis), source: voulu.source, fin, puis: voulu.puis,
    reprise: r ? { ...r } : null });
  if (c.planning) sortie.jour = journeeCha(c.semaine, muraleCha(quand)[0]);
  return sortie;
}
/* Les bandes d'aujourd'hui, contiguës de 0 à 1440 en minutes murales
 * (`_journee`) : bornes à minuit et à chaque changement du jour, le mode de la
 * maison appliqué, sans reprise ni fenêtre ; deux voisines du même mode n'en
 * font qu'une ; une semaine sans aucun changement : []. */
function journeeCha(semaine, jour) {
  if (!changementEnCours(semaine, 0, 0)) return [];
  const liste = Array.isArray(semaine[JOURS[jour]]) ? semaine[JOURS[jour]] : [];
  const bornes = new Set([0]);
  liste.forEach(ch => { const mi = estObjetCha(ch) ? lireHeure(ch.h) : null; if (mi !== null) bornes.add(mi); });
  const debuts = [...bornes].sort((x, y) => x - y);
  const bandes = [];
  debuts.forEach((de, i) => {
    const a = i + 1 < debuts.length ? debuts[i + 1] : 1440;
    const mode = modeVoulu(semaine, CHA_.cfg.maison, null, false, jour, de).mode;
    if (bandes.length && bandes[bandes.length - 1].mode === mode) bandes[bandes.length - 1].a = a;
    else bandes.push({ de, a, mode });
  });
  return bandes;
}

/* ── Les commandes : `main`, `maison`, `config` (websocket_api.py) ── */
const invalideCha = (texte) => refusDemo('invalid_format', texte);
function mainCha(msg, ctx) {
  // Le schéma de la commande, comme voluptuous : `mode` parmi les six, `fin` parmi cinq.
  if (typeof msg.chauffage !== 'string' || !msg.chauffage || msg.chauffage.length > 128) throw invalideCha("expected str for dictionary value @ data['chauffage']");
  if ('mode' in msg && !MODES.includes(msg.mode)) throw invalideCha("value must be one of " + JSON.stringify(MODES) + " for dictionary value @ data['mode']");
  const temperature = 'temperature' in msg ? Number(msg.temperature) : null;
  if ('temperature' in msg && (msg.temperature === null || msg.temperature === '' || !Number.isFinite(temperature))) {
    throw invalideCha("expected float for dictionary value @ data['temperature']");
  }
  const fin = 'fin' in msg ? msg.fin : 'prochain';
  if (!['prochain', 'relance', 60, 120, 240].includes(fin)) throw invalideCha("no valid value for dictionary value @ data['fin']");
  const reprendre = 'reprendre' in msg ? msg.reprendre : false;
  if (typeof reprendre !== 'boolean') throw invalideCha("expected bool for dictionary value @ data['reprendre']");
  if (reprendre) rendreAuPlanningCha(msg.chauffage, ctx);
  else reprendreLaMainCha(msg.chauffage, 'mode' in msg ? msg.mode : null, temperature, fin, ctx);
}
/* Une reprise en main demandée à Loggia (`async_reprendre_la_main`) : un mode,
 * ou une consigne en °C pour un thermostat, jusqu'au prochain changement — ou
 * 1 h, 2 h, 4 h, ou jusqu'à relance. */
function reprendreLaMainCha(cle, mode, temperature, fin, ctx) {
  const c = chauffageCha(cle);
  if (!c) throw refusDemo('chauffage_inconnu', 'chauffage inconnu : ' + cle);
  if (!c.planning) throw refusDemo('chauffage_sans_planning', 'planning eteint pour ce chauffage : ' + cle);
  const entite = entiteCha(cle, c, ctx.states);
  if (!entite) throw refusDemo('chauffage_inconnu', 'chauffage introuvable : ' + cle);
  if (mode == null && temperature == null) throw invalideCha('un mode ou une temperature');
  if (mode != null && !modesPermisCha(c.famille, ctx.states[entite].attributes).includes(mode)) {
    throw refusDemo('chauffage_mode_inconnu', 'mode ' + mode + ' inconnu de ce chauffage : mode');
  }
  if (temperature != null) {
    if (c.famille !== 'thermostat') throw invalideCha('temperature : pour un thermostat seulement');
    if (temperature < 5 || temperature > 30) throw refusDemo('chauffage_temperature_hors_bornes', 'temperature hors bornes (5 a 30 °C) : temperature');
  }
  const quand = ctx.horloge();
  const instant = fin === 'prochain' ? finParDefautCha(c, quand) : fin === 'relance' ? null : new Date(quand.getTime() + fin * 60000);
  CHA_.reprises[cle] = nouvelleRepriseCha(mode, temperature, instant, quand, (ctx.utilisateur || {}).id);
  noterCha(ctx, { regle: 'main', quoi: 'reprise en main', cibles: [entite], n: 0, motif: motifFinCha(instant), detail: (ctx.utilisateur || {}).name || '' });
  evaluerCha(ctx, 'main');
}
/** « Reprendre le planning » (`async_rendre_au_planning`) : la reprise tombe, le planning s'applique. */
function rendreAuPlanningCha(cle, ctx) {
  const c = chauffageCha(cle);
  if (!c) throw refusDemo('chauffage_inconnu', 'chauffage inconnu : ' + cle);
  const entite = entiteCha(cle, c, ctx.states);
  if (repriseCha(cle)) {
    delete CHA_.reprises[cle];
    noterCha(ctx, { regle: 'main', quoi: 'reprendre le planning', cibles: entite ? [entite] : [], n: 0 });
  }
  evaluerCha(ctx, 'main');
}
/* Un jour seul (« 2026-10-20 », le champ date de l'écran) : minuit de ce jour
 * à l'heure de la maison — celle du navigateur, la démo n'a pas d'autre
 * fuseau (`_minuit_de_la_maison`). null pour un jour qui n'existe pas. */
const DATE_SEULE_CHA = /^\d{4}-\d{2}-\d{2}$/;
function minuitCha(jour) {
  const [an, mois, j] = jour.split('-').map(Number);
  const d = new Date(an, mois - 1, j);
  return d.getFullYear() === an && d.getMonth() === mois - 1 && d.getDate() === j ? d : null;
}
/* Le mode de la maison (`async_maison`, `poser_maison`) : Planning, Absence,
 * Vacances pour tous ; l'Été, y entrer comme en sortir, aux administrateurs.
 * Seules les Vacances ont une fin, à venir : le jour du retour, seul — minuit
 * de la maison —, ou un instant avec son décalage. */
function maisonCha(msg, ctx) {
  if (!possedeCha(MOTS_MAISON_CHA, msg.mode)) throw invalideCha("value must be one of ['absence', 'ete', 'planning', 'vacances'] for dictionary value @ data['mode']");
  if ('fin' in msg && msg.fin !== null && typeof msg.fin !== 'string') throw invalideCha("expected str for dictionary value @ data['fin']");
  const maison = CHA_.cfg.maison;
  if (!(ctx.utilisateur && ctx.utilisateur.is_admin) && (msg.mode === 'ete' || maison.mode === 'ete')) {
    throw refusDemo('not_admin', 'reglages reserves aux administrateurs Home Assistant : maison.ete');
  }
  const quand = ctx.horloge();
  const fin = 'fin' in msg ? msg.fin : null;
  let instant = null;
  if (fin !== null) {
    instant = DATE_SEULE_CHA.test(fin.trim()) ? minuitCha(fin.trim()) : lireInstantCha(fin);
    if (msg.mode !== 'vacances' || !instant || instant <= quand) throw refusDemo('chauffage_date_illisible', 'date illisible ou passee : maison.vacances_fin');
  }
  Object.assign(maison, { mode: msg.mode, vacances_fin: instant ? isoCha(instant) : null });
  noterCha(ctx, { regle: 'maison', quoi: MOTS_MAISON_CHA[msg.mode], n: 0, detail: (ctx.utilisateur || {}).name || '' });
  evaluerCha(ctx, 'maison');
}
/* `loggia/chauffage/config` (`async_enregistrer`) : administrateurs seulement,
 * d'un seul tenant — un refus n'écrit rien. Du simulé au réel, ou l'inverse,
 * on repart de ce que la maison EST ; un planning coupé emporte sa reprise. */
function configCha(msg, ctx) {
  if (!estObjetCha(msg.patch)) throw invalideCha("expected dict for dictionary value @ data['patch']");
  if (!(ctx.utilisateur && ctx.utilisateur.is_admin)) throw refusDemo('unauthorized', 'Unauthorized');
  const simulait = !!CHA_.cfg.simulation.actif;
  const cfg = copieCha(CHA_.cfg);
  poserPatchCha(cfg, msg.patch, candidatsCha(ctx.states).connus);
  CHA_.cfg = cfg;
  if (!!cfg.simulation.actif !== simulait) Object.assign(CHA_, { reprises: {}, notes: {}, vus: {} });
  Object.keys(CHA_.reprises).forEach(cle => { const c = chauffageCha(cle); if (!c || !c.planning) delete CHA_.reprises[cle]; });
  evaluerCha(ctx, 'reglage');
  return copieCha(CHA_.cfg);
}
/** Le patch, posé sur `cfg` — ou un refus qui NOMME la clé (`poser_patch`). */
function poserPatchCha(cfg, patch, connus) {
  const inconnues = Object.keys(patch).filter(k => !['chauffages', 'maison', 'simulation'].includes(k)).sort();
  if (inconnues.length) throw invalideCha('cle inconnue : ' + inconnues.join(', '));
  const chauffages = 'chauffages' in patch ? patch.chauffages : {};
  if (!estObjetCha(chauffages)) throw invalideCha('chauffages : un objet par chauffage');
  Object.keys(chauffages).forEach(cle => {
    if (chauffages[cle] === null) { delete cfg.chauffages[cle]; return; }
    const connu = connus.get(cle) || null;
    let actuel = possedeCha(cfg.chauffages, cle) ? cfg.chauffages[cle] : null;
    if (!actuel && !connu) throw refusDemo('chauffage_inconnu', 'chauffage inconnu : ' + cle);
    if (!actuel) actuel = chauffageDefautCha(connu.entite, connu.famille, connu.permis);
    else if (connu) actuel = { ...actuel, entite: connu.entite, famille: connu.famille };
    cfg.chauffages[cle] = validerChauffageCha(chauffages[cle], actuel, connu ? connu.permis : null);
  });
  if (Object.keys(cfg.chauffages).length > MAX_CHAUFFAGES_CHA) throw refusDemo('chauffage_trop_de_chauffages', 'trop de chauffages, au plus : ' + MAX_CHAUFFAGES_CHA);
  const maison = 'maison' in patch ? patch.maison : {};
  if (!estObjetCha(maison)) throw invalideCha('maison : un objet');
  Object.keys(maison).forEach(cle => {
    if (cle !== 'absence' && cle !== 'vacances') throw invalideCha('maison.' + cle + ' : le mode de la maison passe par loggia/chauffage/maison');
    if (!MODES.includes(maison[cle])) throw refusDemo('chauffage_mode_inconnu', 'mode ' + maison[cle] + ' inconnu : maison.' + cle);
    cfg.maison[cle] = maison[cle];
  });
  if ('simulation' in patch) {
    if (!estObjetCha(patch.simulation) || typeof patch.simulation.actif !== 'boolean') throw invalideCha('simulation : {actif: vrai ou faux}');
    cfg.simulation = { actif: patch.simulation.actif };
  }
}
/** Un chauffage modifié : `planning`, `semaine`, `temperatures`, `fenetre` (`valider_chauffage`). */
function validerChauffageCha(brut, actuel, permis) {
  if (!estObjetCha(brut)) throw invalideCha('chauffage : un objet');
  const inconnues = Object.keys(brut).filter(k => !['planning', 'semaine', 'temperatures', 'fenetre'].includes(k)).sort();
  if (inconnues.length) throw invalideCha('champ inconnu : ' + inconnues.join(', '));
  const neuf = copieCha(actuel);
  if ('planning' in brut) {
    if (typeof brut.planning !== 'boolean') throw invalideCha('planning : vrai ou faux');
    neuf.planning = brut.planning;
  }
  if ('semaine' in brut) neuf.semaine = validerSemaineCha(brut.semaine, permis);
  if ('temperatures' in brut) neuf.temperatures = validerTemperaturesCha(brut.temperatures, neuf.temperatures);
  if ('fenetre' in brut) {
    if (!['arret', 'eco', 'rien'].includes(brut.fenetre)) throw invalideCha('fenetre : arret, eco ou rien');
    if (brut.fenetre === 'eco' && permis && !permis.includes('eco')) throw refusDemo('chauffage_mode_inconnu', 'mode eco inconnu de ce chauffage : fenetre');
    neuf.fenetre = brut.fenetre;
  }
  return neuf;
}
/* La semaine que l'écran envoie (`valider_semaine`) : chaque jour trié, au
 * premier défaut un refus qui nomme sa clé — « jeu[2].h », « jeu » —, et
 * jamais une semaine sans aucun changement. */
function validerSemaineCha(brut, permis) {
  if (!estObjetCha(brut)) throw invalideCha('semaine : un objet par jour');
  const inconnus = Object.keys(brut).filter(k => !JOURS.includes(k)).sort();
  if (inconnus.length) throw invalideCha('jour inconnu : ' + inconnus.join(', '));
  const semaine = {};
  JOURS.forEach(jour => {
    const liste = possedeCha(brut, jour) ? brut[jour] : [];
    if (!Array.isArray(liste)) throw invalideCha(jour + ' : une liste de changements');
    if (liste.length > MAX_CHANGEMENTS_CHA) throw refusDemo('chauffage_trop_de_changements', 'plus de ' + MAX_CHANGEMENTS_CHA + ' changements ce jour : ' + jour);
    const vus = new Map();
    liste.forEach((c, i) => {
      if (!estObjetCha(c)) throw invalideCha(jour + '[' + i + '] : un changement {h, mode}');
      const minute = lireHeure(c.h);
      if (minute === null) throw refusDemo('chauffage_heure_illisible', 'heure illisible : ' + jour + '[' + i + '].h');
      if (!MODES.includes(c.mode) || (permis && !permis.includes(c.mode))) {
        throw refusDemo('chauffage_mode_inconnu', 'mode ' + c.mode + ' inconnu de ce chauffage : ' + jour + '[' + i + '].mode');
      }
      if (vus.has(minute)) throw refusDemo('chauffage_heure_en_double', 'deux changements a la meme heure : ' + jour + '[' + i + '].h');
      vus.set(minute, c.mode);
    });
    semaine[jour] = [...vus.keys()].sort((x, y) => x - y).map(mi => ({ h: ecrireHeure(mi), mode: vus.get(mi) }));
  });
  if (!JOURS.some(j => semaine[j].length)) throw refusDemo('chauffage_semaine_vide', 'planning sans aucun changement : semaine');
  return semaine;
}
// `round` de Python arrondit au pair : 20,25 °C donne 20, pas 20,5.
const auDemiCha = (v) => {
  const x = v * 2, f = Math.floor(x), d = x - f;
  return (d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1)) / 2;
};
/* Les consignes d'un thermostat (`valider_temperatures`), en °C, de 5 à 30, au
 * demi-degré, dans l'ordre du froid au chaud : hors_gel < eco <= confort. Le
 * refus nomme celle qu'on vient de changer ; les deux, ou aucune : Éco. */
function validerTemperaturesCha(brut, actuelles) {
  if (!estObjetCha(brut)) throw invalideCha('temperatures : un objet {confort, eco, hors_gel}');
  const t = { ...actuelles };
  Object.keys(brut).forEach(cle => {
    if (!possedeCha(TEMPERATURES_CHA, cle)) throw invalideCha('temperature inconnue : ' + cle);
    const v = brut[cle];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 5 || v > 30) {
      throw refusDemo('chauffage_temperature_hors_bornes', 'temperature hors bornes (5 a 30 °C) : temperatures.' + cle);
    }
    t[cle] = auDemiCha(v);
  });
  const fautive = cleEnDesordreCha(t, Object.keys(brut));
  if (fautive) throw refusDemo('chauffage_temperatures_desordre', 'temperatures en desordre (hors_gel < eco <= confort) : temperatures.' + fautive);
  return t;
}
function cleEnDesordreCha(t, touchees) {
  let enCause = null;
  if (t.hors_gel >= t.eco) enCause = ['hors_gel', 'eco'];
  else if (t.eco > t.confort) enCause = ['eco', 'confort'];
  if (!enCause) return null;
  const changees = enCause.filter(k => touchees.includes(k));
  return changees.length === 1 ? changees[0] : 'eco';
}

/* ── Le bouchon : ce que `callWS` passe au moteur ── */
/* Les champs que chaque commande accepte, `id` compris : le schéma de Home
 * Assistant refuse tout autre champ (« extra keys not allowed »). */
const CHAMPS_CHA = {
  'loggia/chauffage/etat': ['type', 'id'],
  'loggia/chauffage/main': ['type', 'id', 'chauffage', 'mode', 'temperature', 'fin', 'reprendre'],
  'loggia/chauffage/maison': ['type', 'id', 'mode', 'fin'],
  'loggia/chauffage/config': ['type', 'id', 'patch'],
};
/**
 * La réponse du faux moteur à une commande du chauffage — une promesse, qui
 * rejette comme Home Assistant (`code`, `message`) —, ou null si `envoye`
 * n'en est pas une. `ctx` : `{ states, horloge, ecrire, utilisateur }`.
 */
function repondreChauffageDemo(envoye, ctx) {
  if (!estObjetCha(envoye) || !possedeCha(CHAMPS_CHA, envoye.type)) return null;
  try {
    const msg = copieCha(envoye);   // ce qui part par le fil : un champ `undefined` n'arrive pas
    if (!CHA_) demarrerChauffageDemo(ctx.states, ctx.horloge, ctx.ecrire);
    const etranger = Object.keys(msg).find(k => !CHAMPS_CHA[msg.type].includes(k));
    if (etranger) throw invalideCha("extra keys not allowed @ data['" + etranger + "']");
    if (msg.type === 'loggia/chauffage/config') {
      const config = configCha(msg, ctx);
      return Promise.resolve({ config, etat: etatCha(ctx) });
    }
    if (msg.type === 'loggia/chauffage/main') mainCha(msg, ctx);
    else if (msg.type === 'loggia/chauffage/maison') maisonCha(msg, ctx);
    return Promise.resolve(etatCha(ctx));
  } catch (e) {
    return Promise.reject(e);
  }
}
/* `select.select_option` sur un module : l'état prend l'option si le module la
 * propose — Home Assistant refuse toute autre graphie —, puis le moteur y lit
 * un éventuel geste fait ailleurs. */
function choisirOptionChauffageDemo(ctx, id, option) {
  const st = ctx.states[id];
  const options = (st && st.attributes && st.attributes.options) || [];
  if (!st || options.indexOf(option) < 0) {
    return Promise.reject(Object.assign(new Error('Option ' + option + ' is not valid for entity ' + id), { code: 'service_validation_error' }));
  }
  ctx.ecrire(id, option);
  evaluerChauffageDemo(ctx);
  return Promise.resolve();
}
const evaluerChauffageDemo = (ctx) => { if (CHA_) evaluerCha(ctx, 'geste'); };
/** Écrire dans les états sans passer par l'écran (la maison n'est pas encore montée, ou un test). */
const ecrireDansEtatsCha = (states) => (id, etat, attributs) => {
  const cur = states[id];
  if (!cur) return;
  states[id] = { ...cur, state: etat != null ? String(etat) : cur.state, attributes: { ...cur.attributes, ...(attributs || {}) },
    last_changed: maintenant(), last_updated: maintenant() };
};
/* La maison montée (`_async_demarrer`, puis le rattrapage) : la configuration
 * de départ, les appareils réglés sur ce qui est en vigueur — sans un mot au
 * journal, ils y sont déjà —, et le journal des dernières vingt-quatre heures. */
function demarrerChauffageDemo(states, horloge, ecrire = ecrireDansEtatsCha(states)) {
  CHA_ = { cfg: configDepartCha(), reprises: {}, journal: [], vus: {}, notes: {} };
  evaluerCha({ states, horloge, ecrire, utilisateur: null, silencieux: true }, 'redemarrage');
  CHA_.journal = journalDepartCha(states, horloge());
}
/* Ce que le moteur a écrit ces dernières vingt-quatre heures : chaque
 * changement EFFECTIF du planning des modules, et la fenêtre de la chambre,
 * ouverte depuis vingt-cinq minutes — depuis, c'est elle qui tient le
 * radiateur. Les mots sont ceux du serveur, rien n'est traduit ici. */
function journalDepartCha(states, quand) {
  const { connus, index } = candidatsCha(states);
  const faits = fenetresCha(states, connus, index);
  const veille = quand.getTime() - 24 * 3600000;
  const ligne = (t, regle, quoi, entite, motif) => ligneJournal({ ts: t / 1000, module: 'chauffage', regle, quoi, cibles: [entite], n: 1,
    motif, detail: '', simule: false });
  const lignes = [];
  Object.keys(CHA_.cfg.chauffages).forEach(cle => {
    const c = CHA_.cfg.chauffages[cle];
    if (!c.planning) return;
    const ouverte = new Date(quand.getTime() - 25 * 60000);
    const coupe = (faits.get(c.entite) || []).length > 0
      ? modeVoulu(c.semaine, CHA_.cfg.maison, null, true, ...muraleCha(ouverte), c.fenetre) : null;
    const limite = coupe && coupe.source === 'fenetre' ? ouverte.getTime() : quand.getTime();
    [-1, 0].forEach(decale => {
      const jourJ = new Date(quand.getFullYear(), quand.getMonth(), quand.getDate() + decale);
      const j = (jourJ.getDay() + 6) % 7;
      (c.semaine[JOURS[j]] || []).forEach(ch => {
        const mi = lireHeure(ch.h);
        const t = mi === null ? NaN : new Date(jourJ.getFullYear(), jourJ.getMonth(), jourJ.getDate(), Math.floor(mi / 60), mi % 60).getTime();
        if (!(t > veille && t <= limite)) return;
        // Un changement qui remet le mode déjà en cours n'est pas un ordre.
        const avant = changementEnCours(c.semaine, mi === 0 ? (j + 6) % 7 : j, mi === 0 ? 1439 : mi - 1);
        if (avant && avant[2] !== ch.mode) lignes.push(ligne(t, 'planning', MOTS_CHA[ch.mode], c.entite, [['planning {heure}', { heure: ecrireHeure(mi) }]]));
      });
    });
    if (limite !== quand.getTime()) lignes.push(ligne(limite, 'fenetre', MOTS_CHA[coupe.mode], c.entite, faits.get(c.entite).slice().sort().join(', ')));
  });
  return lignes.sort((x, y) => y.ts - x.ts);
}

/* La maison du chauffage, bâtie comme `installerDemo` la bâtit — sans document
 * ni magasin, l'heure figée si on le demande. Exporté pour
 * `tests/demo_chauffage.test.mjs` : `ws` passe par le même bouchon que
 * `callWS`, `option` par le même chemin que `select.select_option`. */
export function maisonChauffageDemo({ admin = true, quand = null } = {}) {
  let heure = quand ? new Date(quand) : new Date();
  const horloge = () => new Date(heure.getTime());
  const states = etatsInitiaux();
  const ecrire = ecrireDansEtatsCha(states);
  demarrerChauffageDemo(states, horloge, ecrire);
  const contexte = (estAdmin) => ({ states, horloge, ecrire, utilisateur: { id: 'demo', name: 'Démo', is_admin: estAdmin } });
  return {
    states,
    index: indexDemo(states),
    regler: (t) => { heure = new Date(t); },
    ws: (msg, { admin: estAdmin = admin } = {}) => repondreChauffageDemo({ ...msg, id: ++numeroMessageDemo }, contexte(estAdmin))
      || Promise.reject(new Error('démonstration : pas de composant serveur')),
    option: (id, option) => choisirOptionChauffageDemo(contexte(admin), id, option),
    regles: () => reglesDemo(states),
    /* La règle des fenêtres de la démo, par le même chemin que `loggia/fenetres/config`
     * (`fenetresPatch`) : ce que le moteur en lit (`fenetres_observe`, `ouvrant_ouvert`).
     * Une seule par onglet, comme `callWS` la tient : un test qui la change la remet. */
    fenetres: (patch) => fenetresPatch(patch),
  };
}

/* Un `climate` de la démo après un service (relecture de la partie B) — la
 * climatisation du bureau surtout, qui sait chauffer, refroidir, sécher et
 * ventiler :
 *  - en `heat_cool`, plus de consigne unique (`temperature` à null) mais une
 *    plage, 20 / 24 ; la consigne d'avant (`gardees`, par entité) revient à
 *    la sortie — à défaut, le milieu de la plage, au demi-degré ;
 *  - `hvac_action` se LIT sur la pièce, comme un vrai appareil : `heating`
 *    sous la consigne (ou la borne basse) de plus de 0,3° dans un mode qui
 *    chauffe, `cooling` au-dessus (ou de la borne haute) de plus de 0,3° dans
 *    un mode qui refroidit, `idle` sinon ; `drying`, `fan`, `off` pour leurs
 *    modes. Une climatisation en Auto à 23,5° pour 22° refroidit : plus de
 *    « Chauffe » orange.
 * Rend `{ etat, attributs }` pour `toucher` (`etat` null : il ne change pas),
 * ou null — un service qu'elle ne connaît pas, une entité absente. Exportée
 * pour tests/demo_chauffage.test.mjs. */
const PLAGE_DEMO = [20, 24];
const ECART_ACTION_DEMO = 0.3;
function actionClimatDemo(mode, a) {
  if (mode === 'off') return 'off';
  if (mode === 'dry') return 'drying';
  if (mode === 'fan_only') return 'fan';
  const piece = typeof a.current_temperature === 'number' ? a.current_temperature : null;
  if (piece === null) return 'idle';
  const plage = mode === 'heat_cool';
  const bas = plage ? a.target_temp_low : a.temperature;
  const haut = plage ? a.target_temp_high : a.temperature;
  if (['heat', 'heat_cool', 'auto'].includes(mode) && typeof bas === 'number' && piece < bas - ECART_ACTION_DEMO) return 'heating';
  if (['cool', 'heat_cool', 'auto'].includes(mode) && typeof haut === 'number' && piece > haut + ECART_ACTION_DEMO) return 'cooling';
  return 'idle';
}
export function climatApresServiceDemo(id, courant, service, data, gardees) {
  if (!courant) return null;
  const a = courant.attributes || {};
  const d = data || {};
  let etat = null;
  let attributs;
  if (service === 'set_hvac_mode') {
    etat = String(d.hvac_mode);
    attributs = {};
    if (etat === 'heat_cool' && courant.state !== 'heat_cool') {
      gardees.set(id, a.temperature);
      attributs = { temperature: null, target_temp_low: PLAGE_DEMO[0], target_temp_high: PLAGE_DEMO[1] };
    } else if (etat !== 'heat_cool' && courant.state === 'heat_cool') {
      const milieu = typeof a.target_temp_low === 'number' && typeof a.target_temp_high === 'number' ? Math.round(a.target_temp_low + a.target_temp_high) / 2 : null;
      attributs = { temperature: typeof gardees.get(id) === 'number' ? gardees.get(id) : milieu, target_temp_low: null, target_temp_high: null };
      gardees.delete(id);
    }
  } else if (service === 'set_temperature') {
    attributs = d.target_temp_low != null ? { target_temp_low: d.target_temp_low, target_temp_high: d.target_temp_high } : { temperature: d.temperature };
  } else if (service === 'set_preset_mode') {
    attributs = { preset_mode: d.preset_mode };
  } else return null;
  attributs.hvac_action = actionClimatDemo(etat != null ? etat : courant.state, { ...a, ...attributs });
  return { etat, attributs };
}

/* Deux agendas, pas un : le choix des agendas et la mention du calendrier
 * sous chaque evenement n apparaissent qu a partir de deux. */
/* L'arbre que la demonstration fait parcourir. Les radios viennent en
 * premier : c'est ce qu'une maison lance le plus souvent, et c'est ce que
 * `radio_browser` expose sur une vraie installation. */
function parcoursDemo(cid) {
  const dossier = (title, id) => ({ title, media_content_id: id, media_content_type: 'directory', media_class: 'directory', can_expand: true, can_play: false });
  const piste = (title, id, cls) => ({ title, media_content_id: id, media_content_type: 'music', media_class: cls || 'music', can_expand: false, can_play: true });
  if (!cid) {
    return { title: 'Sources', children: [
      dossier('Radios', 'demo://radios'),
      dossier('Musique locale', 'demo://musique'),
      dossier('Podcasts', 'demo://podcasts'),
    ] };
  }
  if (cid === 'demo://radios') {
    return { title: 'Radios', children: [
      piste('FIP', 'demo://radio/fip', 'channel'),
      piste('France Inter', 'demo://radio/inter', 'channel'),
      piste('Radio Classique', 'demo://radio/classique', 'channel'),
      piste('Nova', 'demo://radio/nova', 'channel'),
    ] };
  }
  if (cid === 'demo://musique') {
    return { title: 'Musique locale', children: [
      dossier('Debussy', 'demo://musique/debussy'),
      piste('Gymnopedie n1', 'demo://musique/gymnopedie', 'music'),
    ] };
  }
  if (cid === 'demo://musique/debussy') {
    return { title: 'Debussy', children: [
      piste('Clair de Lune', 'demo://musique/clair', 'music'),
      piste('Arabesque n1', 'demo://musique/arabesque', 'music'),
    ] };
  }
  // Un dossier qui existe mais ne contient rien : l'ecran vide se distingue
  // d'une erreur, et le navigateur doit le dire.
  return { title: 'Podcasts', children: [] };
}

/* Ce que la demo retient des gestes faits sur l'agenda.
 *
 * Sans cette memoire, supprimer un rendez-vous ne se voyait pas : la liste
 * se reconstruit a chaque lecture, l'evenement revenait aussitot, et la
 * demonstration montrait un geste sans effet — exactement le defaut que le
 * reste du dashboard s'emploie a eviter. */
const calSupprimes = new Set();
const calModifies = new Map();

/* Les taches cochees dans la demo : `todo.update_item` les y range, et
 * `todo.get_items` ne les rend plus — sans quoi cocher ne ferait rien a
 * l'ecran, ce qui est justement le geste a montrer. */
const todoFaits = new Set();
const todoAjoutes = [];

function todosDemo(id) {
  /* `due` est une heure LOCALE sans fuseau : `toISOString()` rendrait de
   * l'UTC, et une tache de 9 h s'afficherait a 7 h en France. */
  const p2 = (x) => String(x).padStart(2, '0');
  const local = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const h = (n, hh, mm) => { const d = new Date(Date.now() + n * 864e5); d.setHours(hh, mm || 0, 0, 0); return local(d) + 'T' + p2(hh) + ':' + p2(mm || 0) + ':00'; };
  const j = (n) => local(new Date(Date.now() + n * 864e5));
  const T = {
    'todo.maison': [
      /* Une tache dont l'heure est PASSEE : « En retard », en rouge. C'est
       * l'etat que la maquette montre, et il ne se verrait jamais avec des
       * heures toutes a venir. */
      { uid: 'd1', summary: etiquette('Fermer les volets du bureau'), status: 'needs_action', due: h(-1, 21) },
      { uid: 'd2', summary: etiquette('Arroser les plantes'), status: 'needs_action', due: h(0, 18) },
      { uid: 'd3', summary: etiquette('Sortir le linge'), status: 'needs_action', due: j(2) },
    ],
    'todo.courses': [
      { uid: 'd4', summary: etiquette('Croquettes du chat'), status: 'needs_action', due: h(1, 10) },
      { uid: 'd5', summary: etiquette('Ampoules'), status: 'needs_action', due: null },
    ],
    'todo.partagee': [
      { uid: 'd6', summary: etiquette('Prendre les médicaments'), status: 'needs_action', due: h(0, 20) },
    ],
  };
  const base = (T[id] || []).concat(todoAjoutes.filter(t => t.liste === id).map(t => t.item));
  return base.filter(t => !todoFaits.has(t.uid));
}

function calendrierDemo(id) {
  /* Une journee entiere se dit en date LOCALE : `toISOString()` rend de l'UTC,
   * et apres 22 h en France « demain » redevenait aujourd'hui — la collecte du
   * lendemain s'affichait « a sortir ce matin ». Les rendez-vous a l'heure,
   * eux, partent bien en ISO : c'est un INSTANT, pas un jour. */
  const p2 = (x) => String(x).padStart(2, '0');
  const j = (n) => { const d = new Date(Date.now() + n * 864e5); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
  const h = (n, hh) => { const d = new Date(Date.now() + n * 864e5); d.setHours(hh, 0, 0, 0); return d.toISOString(); };
  // Avec les MINUTES : un poste de nuit ne commence pas a l'heure pile.
  const hm = (n, hh, mm) => { const d = new Date(Date.now() + n * 864e5); d.setHours(hh, mm, 0, 0); return d.toISOString(); };
  const vivants = (l) => l
    .filter(e => !calSupprimes.has(e.uid))
    .map(e => (calModifies.has(e.uid) ? { ...e, ...calModifies.get(e.uid) } : e));
  /* Une collecte DEMAIN : c'est la veille au soir que le bandeau se montre,
   * et c'est donc le seul etat ou on le voit. */
  if (id === 'calendar.collectes') return vivants([
    { uid: 'demo-recy', summary: etiquette('Recyclables'), start: { date: j(1) }, end: { date: j(2) } },
    { uid: 'demo-verre', summary: etiquette('Verre'), start: { date: j(4) }, end: { date: j(5) } },
    { uid: 'demo-ordures', summary: etiquette('Ordures ménagères'), start: { date: j(5) }, end: { date: j(6) } },
  ]);
  /* Les rendez-vous passent par la table des noms (audit du 03/10), comme les
   * collectes juste au-dessus : l'agenda d'une démo polonaise annonçait
   * « Café avec Sam » et « Contrôle chaudière ». */
  if (id === 'calendar.travail') return vivants([
    { uid: 'demo-equipe', summary: etiquette('Point d’équipe'), start: { dateTime: h(1, 9) }, end: { dateTime: h(1, 10) } },
    { uid: 'demo-livrable', summary: etiquette('Livrable client'), start: { dateTime: h(3, 17) }, end: { dateTime: h(3, 18) } },
    /* UN POSTE DE NUIT (08/10), qui franchit minuit. La demonstration n'en
     * avait aucun : elle ne pouvait donc pas montrer qu'un tel rendez-vous se
     * reduisait a un rectangle de 30 px le soir et n'existait pas le
     * lendemain matin. Il doit courir de son debut jusqu'au bas de la
     * journee, et reprendre en haut de la suivante. */
    { uid: 'demo-nuit', summary: etiquette('Poste de nuit'), start: { dateTime: hm(0, 21, 30) }, end: { dateTime: hm(1, 5, 39) } },
  ]);
  /* L'AGENDA VIDE (08/10) : il doit l'etre vraiment, sinon la demonstration
   * ne montre pas le cas qu'elle est la pour montrer — un agenda sans aucun
   * rendez-vous, qui doit quand meme figurer dans « Mes agendas ». */
  if (id === 'calendar.anniversaires') return [];
  return vivants([
    { uid: 'demo-poubelles', summary: etiquette('Ramassage des poubelles'), start: { date: j(1) }, end: { date: j(2) } },
    { uid: 'demo-cafe', summary: etiquette('Café avec Sam'), start: { dateTime: h(2, 10) }, end: { dateTime: h(2, 11) } },
    { uid: 'demo-chaudiere', summary: etiquette('Contrôle chaudière'), start: { dateTime: h(4, 14) }, end: { dateTime: h(4, 15) } },
    // Un rendez-vous AUJOURD'HUI et une journee a deux : sans eux, deux etats
    // du calendrier ne se voyaient nulle part — le halo du jour courant et
    // l'anneau epaissi d'une journee chargee.
    { uid: 'demo-colis', summary: etiquette('Livraison colis'), start: { dateTime: h(0, 16) }, end: { dateTime: h(0, 17) } },
    { uid: 'demo-ramoneur', summary: etiquette('Visite du ramoneur'), start: { dateTime: h(2, 15) }, end: { dateTime: h(2, 16) } },
  ]);
}

/* Ce que dit l'assistant de la démonstration (relecture du 03/10).
 *
 * Ses phrases étaient écrites en dur, en français sans accents : une démo
 * anglaise ou polonaise montrait un historique français, et la suggestion
 * « Briefing », partie traduite (« Give me the briefing. »), recevait « Je
 * suis la demonstration… ». Même raison que `LIEUX` et `APPAREILS` : la
 * maison est inventée, ses mots sont les nôtres. Une table à part pourtant —
 * ce sont des phrases, pas des noms, et `etiquette()` n'a pas à les
 * connaître. Les pièces qu'elles citent portent les noms de `LIEUX`.
 *
 * `tests/demo_assistant.test.mjs` exige les sept langues, et que chaque
 * réponse garde dans chacune la teinte d'orbe de son sujet (`teinteDe`). */
const PAROLES_DEMO = {
  // L'historique : une question d'avant, et sa réponse.
  question: {
    fr: 'Il fait quel temps dehors ?',
    en: 'What’s the weather like outside?',
    de: 'Wie ist das Wetter draußen?',
    nl: 'Wat voor weer is het buiten?',
    it: 'Che tempo fa fuori?',
    es: '¿Qué tiempo hace fuera?',
    pl: 'Jaka jest pogoda na zewnątrz?',
  },
  meteo: {
    fr: 'Onze degrés et couvert. Il devrait pleuvoir vers vingt-trois heures.',
    en: 'Eleven degrees and overcast. Rain is expected around eleven tonight.',
    de: 'Elf Grad und bewölkt. Gegen dreiundzwanzig Uhr soll es regnen.',
    nl: 'Elf graden en bewolkt. Rond elf uur vanavond gaat het waarschijnlijk regenen.',
    it: 'Undici gradi e cielo coperto. Dovrebbe piovere verso le ventitré.',
    es: 'Once grados y nublado. Debería llover hacia las once de la noche.',
    pl: 'Jedenaście stopni i pochmurno. Około dwudziestej trzeciej powinno padać.',
  },
  // L'agent intégré de Home Assistant, par l'API commune (`conversation/process`).
  agent: {
    fr: 'Ici l’agent intégré de Home Assistant, dans la démo : une réponse d’un bloc, sans historique ni flux. Change d’entité dans l’en-tête pour comparer.',
    en: 'This is Home Assistant’s built-in agent, in the demo: one answer in a single block, with no history and no streaming. Switch entities in the header to compare.',
    de: 'Hier spricht der integrierte Agent von Home Assistant, in der Demo: eine Antwort am Stück, ohne Verlauf und ohne Stream. Wechsle oben die Entität, um zu vergleichen.',
    nl: 'Hier de ingebouwde agent van Home Assistant, in de demo: één antwoord in één keer, zonder geschiedenis of stream. Kies bovenaan een andere entiteit om te vergelijken.',
    it: 'Qui l’agente integrato di Home Assistant, nella demo: una risposta tutta d’un pezzo, senza cronologia né flusso. Cambia entità nell’intestazione per confrontare.',
    es: 'Aquí el agente integrado de Home Assistant, en la demo: una respuesta de un solo bloque, sin historial ni flujo. Cambia de entidad en la cabecera para comparar.',
    pl: 'Tu wbudowany agent Home Assistant, w wersji demonstracyjnej: odpowiedź w jednym kawałku, bez historii i bez strumieniowania. Zmień encję w nagłówku, aby porównać.',
  },
  // Les réponses de `demo/chat` : une par sujet de `SUJETS_DEMO`, et `autre`.
  fumee: {
    fr: 'Alerte : de la fumée est détectée dans la cuisine. Aère, et vérifie la plaque de cuisson.',
    en: 'Alert: smoke detected in the kitchen. Open a window, and check the hob.',
    de: 'Alarm: In der Küche wurde Rauch erkannt. Lüfte und prüfe das Kochfeld.',
    nl: 'Alarm: er is rook gedetecteerd in de keuken. Zet een raam open en controleer de kookplaat.',
    it: 'Allarme: è stato rilevato fumo in cucina. Arieggia e controlla il piano cottura.',
    es: 'Alerta: se ha detectado humo en la cocina. Ventila y revisa la placa de cocción.',
    pl: 'Alarm: w kuchni wykryto dym. Przewietrz i sprawdź płytę kuchenną.',
  },
  chauffage: {
    fr: 'Le chauffage tient dix-neuf degrés dans le salon, et la chambre remonte doucement.',
    en: 'The heating is holding nineteen degrees in the living room, and the bedroom is slowly warming up.',
    de: 'Die Heizung hält neunzehn Grad im Wohnzimmer, und das Schlafzimmer wird langsam wärmer.',
    nl: 'De verwarming houdt negentien graden in de woonkamer, en de slaapkamer warmt langzaam op.',
    it: 'Il riscaldamento mantiene diciannove gradi in soggiorno, e la camera si scalda piano piano.',
    es: 'La calefacción mantiene diecinueve grados en el salón, y el dormitorio se va templando poco a poco.',
    pl: 'Ogrzewanie utrzymuje dziewiętnaście stopni w salonie, a sypialnia powoli się nagrzewa.',
  },
  ferme: {
    fr: 'Tout est fermé : les volets sont baissés et les lumières du salon sont éteintes.',
    en: 'Everything is closed: the blinds are down and the living room lights are off.',
    de: 'Alles ist geschlossen: Die Rollläden sind unten und die Lichter im Wohnzimmer sind aus.',
    nl: 'Alles is dicht: de rolluiken zijn omlaag en de lampen in de woonkamer zijn uit.',
    it: 'È tutto chiuso: le tapparelle sono abbassate e le luci del soggiorno sono spente.',
    es: 'Todo está cerrado: las persianas están bajadas y las luces del salón están apagadas.',
    pl: 'Wszystko jest zamknięte: rolety są opuszczone, a światła w salonie zgaszone.',
  },
  autre: {
    fr: 'Je suis la démonstration : je ne sais rien de ta maison, mais je sais montrer le chemin. Pose la même question à ton assistant, et il répondra pour de vrai.',
    en: 'I’m the demo: I know nothing about your home, but I can show you the way. Ask your own assistant the same question, and it will answer for real.',
    de: 'Ich bin die Demo: Ich weiß nichts über dein Zuhause, aber ich kann dir den Weg zeigen. Stell deinem Assistenten dieselbe Frage, und er antwortet wirklich.',
    nl: 'Ik ben de demo: ik weet niets van jouw huis, maar ik kan je de weg wijzen. Stel dezelfde vraag aan je eigen assistent, en die antwoordt echt.',
    it: 'Sono la demo: non so nulla della tua casa, ma so mostrarti la strada. Fai la stessa domanda al tuo assistente, e risponderà davvero.',
    es: 'Soy la demostración: no sé nada de tu casa, pero sé enseñarte el camino. Haz la misma pregunta a tu asistente, y te responderá de verdad.',
    pl: 'Jestem demonstracją: nic nie wiem o twoim domu, ale umiem pokazać drogę. Zadaj to samo pytanie swojemu asystentowi, a odpowie naprawdę.',
  },
};

/** Une phrase de l'assistant de démonstration, dans la langue de la démo. */
const parole = (cle) => PAROLES_DEMO[cle][LANGUE_DEMO] || PAROLES_DEMO[cle].fr;

/* Trois sujets reconnus, pour que la démo montre aussi la teinte de l'orbe :
 * l'alerte en rouge, le chauffage en orangé, ce qui est fermé en vert. La
 * question arrive dans la langue de l'écran — « Tout est fermé ? » part en
 * « Ist wirklich alles geschlossen? » —, et seuls le français et l'anglais
 * étaient reconnus (relecture du 03/10) : d'où les mots des sept langues. Un
 * début de mot suffit, sauf là où un mot courant le contient : « Verbrauch »
 * n'est pas « Rauch », ni « humor » du « humo ». */
const SUJETS_DEMO = [
  [/fum|alarm|allarm|fuite|intrus|smoke|leak|\brauch|\blecks?\b|\brook|\blek\b|\bhumo\b|\bfugas?\b|\bdym|wyciek|włam|einbr|inbra/i, 'fumee'],
  [/chauff|radiat|radiador|thermosta|termosta|heat|heiz|verwarm|riscald|calefac|ogrzew|grzej|kaloryfer/i, 'chauffage'],
  [/ferm|verrou|closed|lock|geschlossen|verriegel|dicht|gesloten|op slot|chius|cerrad|cerrar|zamkni/i, 'ferme'],
];

/** La réponse écrite d'avance à `question` ; hors sujet, celle qui dit ce qu'est la démo. */
function reponseDemo(question) {
  const q = String(question || '');
  const sujet = SUJETS_DEMO.find(([motif]) => motif.test(q));
  return parole(sujet ? sujet[1] : 'autre');
}

/* Le numéro des messages envoyés au faux composant (voir `callWS`). */
let numeroMessageDemo = 0;

export function installerDemo(langue) {
  /* La langue de la maison factice. Elle est lue par l'appelant AVANT que le
   * magasin memoire ne remplace `localStorage` : le `?lang=` de l'URL n'y est
   * ecrit qu'ensuite, et serait donc invisible d'ici. Sans elle, la maison
   * garde ses noms francais. */
  if (langue && LIEUX.Salon[langue]) LANGUE_DEMO = langue;
  /* Deux réglages d'aperçu lus dans l'URL, comme `?lang=` (05/10) :
   * `distributeur=loggia|petlibro|rien|horsligne|bas|probleme|reservoir|programme|z2m`, la variante du distributeur
   * (ADR 0155), et `compte=ordinaire`, un compte Home Assistant sans droits
   * d'administration — ce qu'il ne peut pas faire doit disparaître de l'écran
   * (ADR 0144), et le faux serveur le refuse comme `require_admin`. Lus AVANT
   * la maison : ses états et sa configuration en dépendent. */
  let ordinaire = false;
  try {
    const q = new URLSearchParams(window.location.search);
    if (VARIANTES_DIST.indexOf(q.get('distributeur')) >= 0) VARIANTE_DIST = q.get('distributeur');
    // `robots=pause` (chantier IoT, § 10) : l'aspirateur en pause au milieu de Salon et Cuisine ; et les variantes de la tranche
    // robots 2 (`sans-association`, `sans-association-rooms`, `exception`, `rooms-vide`, `scripts`, `carte-changee`, `etages`,
    // et son cas de la passe bis du 20/10 : `scripts-sans-pieces`, `scripts-avec-pieces`).
    if (VARIANTES_ROBOTS.indexOf(q.get('robots')) >= 0) VARIANTE_ROBOTS = q.get('robots');
    ordinaire = q.get('compte') === 'ordinaire';
    /* `heure=HH:MM` (chantier Mode enfant, § 10) : l'horloge des médias figée à cette heure du jour — les trois situations du mode
     * enfant se regardent l'une après l'autre (`?demo&heure=18:20`, `?demo&heure=21:30`) sans attendre l'heure. */
    const heure = q.get('heure');
    if (heure && /^([01]\d|2[0-3]):[0-5]\d$/.test(heure)) { const [h, mn] = heure.split(':').map(Number); horlogeMedias = () => { const d = new Date(); d.setHours(h, mn, 0, 0); return d.getTime(); }; }
  } catch { /* rien : la maison par défaut */ }

  // ── 1. Magasin mémoire à la place du localStorage ─────────────────────────
  const mem = new Map();
  const cfg = configDemo();
  Object.keys(cfg).forEach(k => mem.set(k, JSON.stringify(cfg[k])));
  const faux = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(String(k), String(v)); },
    removeItem: (k) => { mem.delete(k); },
    clear: () => { mem.clear(); },
    key: (i) => Array.from(mem.keys())[i] || null,
    get length() { return mem.size; },
  };
  try { Object.defineProperty(window, 'localStorage', { value: faux, configurable: true }); } catch { /* repli : la demo ecrira le vrai stockage */ }
  // Une clé de la maison telle que l'écran l'a écrite (`cfgSet` : du JSON).
  const lireCfgDemo = (k) => { try { return JSON.parse(faux.getItem(k)); } catch { return null; } };

  // ── 2. La maison ──────────────────────────────────────────────────────────
  const states = etatsInitiaux();
  varianteRobots(states);
  /* Le planning de chauffe : le faux moteur règle les radiateurs sur ce qui est
   * en vigueur AVANT le premier rendu — la carte ne passe pas d'un mode à
   * l'autre sous les yeux à l'ouverture. */
  demarrerChauffageDemo(states, () => new Date());
  const toucher = (id, patch, attrs) => {
    // entity_id à la manière de HA : une chaîne ou un tableau d'ids.
    if (Array.isArray(id)) { id.forEach(x => toucher(x, patch, attrs)); return; }
    const cur = states[id]; if (!cur) return;
    states[id] = { state: patch != null ? String(patch) : cur.state, attributes: { ...cur.attributes, ...(attrs || {}) }, last_updated: maintenant(), last_changed: maintenant() };
    minuteurSiEteint(id, states[id].state);
    el.hass = { ...el.hass, states };
  };
  /* Le faux moteur des volets (chantier Volets, § 9) : 6 % par seconde — une
   * course complète en 17 s —, `opening` ou `closing` pendant qu'il tourne, une
   * position toutes les 500 ms ; Stop l'arrête là où il est. L'écran voit ainsi
   * une course PUBLIÉE ; la bascule de Netatmo se teste par le modèle (§ 5). */
  const moteurs = new Map();
  const moteurVolet = (x, service, data) => {
    const cur = states[x];
    if (!cur) return;
    // Un volet muet ne répond pas (audit du 19/10) : rien ne bouge, la carte reste « Indisponible ».
    if (cur.state === 'unavailable' || cur.state === 'unknown') return;
    const lue = Number((cur.attributes || {}).current_position);
    const depart = Number.isFinite(lue) ? lue : cur.state === 'closed' ? 0 : 100;
    clearInterval(moteurs.get(x));
    moteurs.delete(x);
    /* Sans position (`supported_features` 3 : le rideau, le garage, le
     * portail) : `opening` / `closing` le temps d'une course complète, puis
     * `open` / `closed` — jamais de `current_position`. Stop : `open`, comme
     * Home Assistant pour un ouvrant arrêté en chemin. */
    if (!Object.prototype.hasOwnProperty.call(cur.attributes || {}, 'current_position')) {
      if (service === 'stop_cover') { if (cur.state === 'opening' || cur.state === 'closing') toucher(x, 'open'); return; }
      const vers = service === 'open_cover' ? 'open' : service === 'close_cover' ? 'closed' : null;
      if (!vers || cur.state === vers) return;
      toucher(x, vers === 'open' ? 'opening' : 'closing');
      moteurs.set(x, setTimeout(() => { moteurs.delete(x); toucher(x, vers); }, 17000));
      return;
    }
    if (service === 'stop_cover') { toucher(x, depart > 0 ? 'open' : 'closed', { current_position: depart }); return; }
    const voulue = service === 'open_cover' ? 100 : service === 'close_cover' ? 0
      : service === 'set_cover_position' ? Math.max(0, Math.min(100, Math.round(Number((data || {}).position) || 0))) : null;
    if (voulue == null) return;
    /* « Façon Netatmo » (§ 0) : l'état BASCULE tout de suite, la position
     * d'avant ; la vraie position n'arrive qu'au bout de la course — et une
     * fermeture finit `open` à 1 %, la chambre du 09/10. Ni `opening` ni
     * `closing` : l'écran joue la course lui-même (voletcourse.js, source 4). */
    if (VOLETS_NETATMO_DEMO.has(x)) {
      if (voulue === depart || (voulue === 0 && depart <= 1)) return;   // déjà en butée : rien ne bascule
      toucher(x, voulue > 0 ? 'open' : 'closed', { current_position: depart });
      const arrivee = voulue === 0 ? 1 : voulue;
      moteurs.set(x, setTimeout(() => { moteurs.delete(x); toucher(x, 'open', { current_position: arrivee }); }, Math.abs(voulue - depart) / 6 * 1000));
      return;
    }
    // Déjà à la position voulue : en pleine course, le moteur s'arrête là, et l'état le dit — jamais `opening` à l'arrêt (relecture du 13/10, point 9).
    if (voulue === depart) { if (cur.state === 'opening' || cur.state === 'closing') toucher(x, depart > 0 ? 'open' : 'closed', { current_position: depart }); return; }
    const sens = voulue > depart ? 'opening' : 'closing';
    let pos = depart;
    toucher(x, sens, { current_position: pos });
    moteurs.set(x, setInterval(() => {
      pos = voulue > pos ? Math.min(voulue, pos + 3) : Math.max(voulue, pos - 3);
      if (pos !== voulue) { toucher(x, sens, { current_position: pos }); return; }
      clearInterval(moteurs.get(x));
      moteurs.delete(x);
      toucher(x, pos > 0 ? 'open' : 'closed', { current_position: pos });
    }, 500));
  };
  // La consigne d'un `climate` passé en `heat_cool`, rendue à sa sortie (`climatApresServiceDemo`).
  const consignesAvantPlage = new Map();
  /* Ce que le faux moteur du chauffage reçoit à chaque commande : la maison,
   * l'heure du navigateur, l'écriture qui redessine, et le compte du moment
   * (`?compte=ordinaire` n'est pas administrateur). */
  const contexteChauffage = () => ({ states, horloge: () => new Date(), ecrire: toucher, utilisateur: el.hass.user });
  /* `target` compte autant que `data`.
   *
   * Home Assistant accepte l'entite des deux facons : dans les donnees du
   * service, ou dans une cible a part — `callService(domaine, service, data,
   * target)`. Le moteur d'actions de Loggia emploie la seconde, parce que c'est
   * celle que Home Assistant recommande.
   *
   * La demo n'en prenait que trois arguments : la cible tombait, l'entite valait
   * `undefined`, et la commande ne touchait rien. Rien ne le signalait — la
   * carte peignait l'etat demande, puis revenait quatre secondes plus tard. Tout
   * le chemin verifie du dashboard etait donc inerte ici, la ou on l'essaye. */
  const callService = (domaine, service, data, target) => {
    const id = (data && data.entity_id) || (target && target.entity_id);
    // La sirene aussi (ADR 0034) : sa bascule et son test sonore passent par turn_on / turn_off.
    /* Cocher une tache, et en ajouter une : sans ca le geste de la carte
     * Rappels partirait dans le vide, et c'est justement lui qu'on montre.
     * Le compte de l'entite suit, car c'est lui qui declenche la relecture. */
    if (domaine === 'todo') {
      const liste = id;
      if (service === 'update_item' && data && data.status === 'completed') todoFaits.add(String(data.item));
      if (service === 'remove_item' && data) todoFaits.add(String(data.item));
      if (service === 'add_item' && data && data.item) {
        todoAjoutes.push({ liste, item: { uid: 'ajout-' + todoAjoutes.length, summary: String(data.item),
          status: 'needs_action', due: data.due_datetime || data.due_date || null } });
      }
      toucher(liste, String(todosDemo(liste).length), {});
      return Promise.resolve();
    }
    if (domaine === 'automation' && service === 'trigger') {
      toucher(id, null, { last_triggered: maintenant() });
    } else if (domaine === 'update') {
      // Une installation prend du temps : la section montre sa progression.
      const at = (states[id] && states[id].attributes) || {};
      if (service === 'install') {
        toucher(id, null, { in_progress: true });
        setTimeout(() => toucher(id, 'off', { in_progress: false, installed_version: at.latest_version }), 3500);
      } else if (service === 'skip') toucher(id, 'off', { skipped_version: at.latest_version });
    } else if (domaine === 'homeassistant' || domaine === 'light' || domaine === 'switch' || domaine === 'fan' || domaine === 'siren' || domaine === 'automation' || domaine === 'input_boolean') {
      // `input_boolean` (04/10) : le moteur d'actions prefere le service du
      // domaine a `homeassistant.turn_on/off`, et les repas du distributeur de
      // la demo en sont — leur interrupteur de la fiche revenait au bout de 6 s.
      // Une prise muette ne répond pas : la démo ne la rallume pas (chantier Prises, § 10).
      if ([].concat(id || []).some(x => states[x] && states[x].state === 'unavailable')) return Promise.resolve();
      /* Une lumière (chantier Lumières, § 9) : sa luminosité, son blanc, sa couleur, et son carnet
       * (`gesteLumiereDemo`) ; le reste bascule, comme avant. */
      const lampes = [].concat(id || []).filter(lampeDemo);
      const autres = [].concat(id || []).filter(x => !lampeDemo(x));
      if (lampes.filter(x => gesteLumiereDemo(states, x, service, data || {})).length) el.hass = { ...el.hass, states };
      if (service === 'turn_on') toucher(autres, 'on');
      else if (service === 'turn_off') toucher(autres, 'off');
      else if (service === 'toggle') toucher(autres, states[id] && states[id].state === 'on' ? 'off' : 'on');
      [].concat(id || []).forEach(x => gestePriseDemo(x));
    } else if (domaine === 'number' || domaine === 'input_number') {
      if (service === 'set_value') toucher(id, data.value);
    } else if (domaine === 'cover') {
      [].concat(id || []).forEach(x => moteurVolet(x, service, data));
    } else if (domaine === 'climate') {
      /* Une plage (`heat_cool`) part en deux bornes, la consigne revient à la
       * sortie ; ce que fait l'appareil se lit sur la pièce — la
       * climatisation du bureau (tâche 10 bis B) ne « chauffe » ni en mode
       * froid, ni en Auto au-dessus de sa consigne (`climatApresServiceDemo`). */
      [].concat(id || []).forEach((x) => {
        const apres = climatApresServiceDemo(x, states[x], service, data, consignesAvantPlage);
        if (apres) toucher(x, apres.etat, apres.attributs);
      });
    } else if (domaine === 'alarm_control_panel') {
      // Un vrai panneau laisse le temps de sortir : la démo passe par `arming`
      // avec le délai et le mode visé (les attributs d'Alarmo), puis arme.
      const cible = { alarm_disarm: 'disarmed', alarm_arm_home: 'armed_home', alarm_arm_night: 'armed_night', alarm_arm_vacation: 'armed_vacation' }[service] || 'armed_away';
      const cid = id || 'alarm_control_panel.maison';
      if (cible === 'disarmed') { toucher(cid, 'disarmed'); return Promise.resolve(); }
      const delay = 20;
      toucher(cid, 'arming', { delay, arm_mode: cible });
      setTimeout(() => { const s = states[cid]; if (s && s.state === 'arming' && s.attributes.arm_mode === cible) toucher(cid, cible); }, delay * 1000);
    } else if (domaine === 'lawn_mower' || domaine === 'vacuum') {
      serviceRobotDemo(states, domaine, service, { ...(data || {}), entity_id: id }, toucher);
    } else if (domaine === 'lock') {
      // Une serrure motorisee met deux bonnes secondes : sans ce passage par
      // `locking`, la demo montrerait un mouvement instantane qui n'existe pas.
      const lid = id || 'lock.porte_entree';
      const vise = service === 'lock' ? 'locked' : 'unlocked';
      toucher(lid, vise === 'locked' ? 'locking' : 'unlocking');
      setTimeout(() => toucher(lid, vise), 2000);
    } else if (domaine === 'media_player' || domaine === 'notify') {
      // Les lecteurs (chantier Médias, § 8) : chaque service de § 7.2 ; une annonce ne change aucun état.
      gesteMediaDemo(states, domaine, service, { ...(data || {}), entity_id: id }, Date.now()).forEach(([x, etat, attrs]) => toucher(x, etat, attrs));
      // Le mode enfant (chantier Mode enfant, E24) : la maison ramène — le volume au-dessus du plafond, l'écran bloqué rallumé.
      ramenerEnfantDemo(states, service, { ...(data || {}), entity_id: id }, toucher);
    } else if (domaine === 'select' && service === 'select_option' && estModuleChauffageDemo(id)) {
      /* Un module fil pilote (planning de chauffe) : l'état prend l'option si
       * le module la propose, et le moteur de la démo y lit un geste. */
      return choisirOptionChauffageDemo(contexteChauffage(), id, (data || {}).option);
    } else if (domaine === 'select' && service === 'select_option' && /^select\.(distributeur|mangeoire)_/.test(String(id))) {
      /* Le distributeur (ADR 0155), et la mangeoire de la variante `z2m` (passe bis de l'étape 2). START sur le select feed d'un
       * Aqara distribue sans que le select change d'état — Zigbee2MQTT le laisse vide ; le mode, lui, change, et le programme de
       * la fiche avec. Un appareil tombé ne répond pas. */
      const opt = (data || {}).option;
      if (!states[id] || states[id].state === 'unavailable') return Promise.resolve();
      if (id === 'select.distributeur_feed' || id === 'select.mangeoire_feed') { if (opt === 'START') distribuerDemo(1); }
      else if (opt != null) toucher(id, opt);
    } else if (domaine === 'button' && service === 'press' && /^button\.granary_/.test(String(id))) {
      // L'état d'un bouton est l'heure du dernier appui, comme dans Home Assistant.
      toucher(id, maintenant());
      if (id === 'button.granary_manual_feed') distribuerDemo(Number((states['number.granary_manual_feed_quantity'] || {}).state) || 1);
      if (id === 'button.granary_desiccant_reset') toucher('sensor.granary_remaining_desiccant', 30);
    }
    /* Un chauffage touché d'ailleurs — une consigne, l'interrupteur d'un
     * module — : le moteur du chauffage le lit, comme le serveur suit l'état
     * de ce qu'il pilote. */
    if (toucheChauffageDemo(id)) evaluerChauffageDemo(contexteChauffage());
    return Promise.resolve();
  };
  /* Une prise basculée (chantier Prises, § 10) : sa puissance suit — rien
   * coupée, celle de son appareil allumée —, et le logbook garde le geste, au
   * nom du compte de la démo. Le pont de Zigbee2MQTT referme l'appairage de
   * lui-même, comme le vrai, au bout de 254 s. */
  const gestePriseDemo = (x) => {
    if (x === PONT_DEMO && states[x] && states[x].state === 'on') {
      setTimeout(() => { if (states[x] && states[x].state === 'on') toucher(x, 'off'); }, 254000);
      return;
    }
    if (!PRISES_DEMO.includes(x) || !states[x]) return;
    const on = states[x].state === 'on';
    toucher(capteursPriseDemo(x).power, on ? String(Math.round(wattsPriseDemo(x, Date.now()) * 10) / 10 || 0.6) : '0');
    PRISES_GESTES.push({ when: Date.now() / 1000, entity_id: x, state: on ? 'on' : 'off', name: states[x].attributes.friendly_name, context_id: 'demo-' + Date.now(), context_user_id: 'demo' });
  };
  /* Le minuteur d'une prise ou d'une lumière (chantiers Prises, § 6.3 et 10 ; Lumières, § 9) : sa pose se
   * note au journal de Loggia ; à l'échéance, l'appareil s'éteint et le journal le dit. Une lumière, éteinte
   * par le serveur, n'a aucun compte au carnet : c'est la ligne du minuteur qui dit « Loggia ». */
  const armerMinuteurDemo = (x) => {
    const fin = MIN_DEMO[x] ? MIN_DEMO[x].fin : 0;
    setTimeout(() => {
      if (!MIN_DEMO[x] || MIN_DEMO[x].fin !== fin || !states[x] || states[x].state !== 'on') return;
      delete MIN_DEMO[x];
      if (lampeDemo(x)) { if (gesteLumiereDemo(states, x, 'turn_off', {}, { utilisateur: null })) el.hass = { ...el.hass, states }; }
      else toucher(x, 'off');
      gestePriseDemo(x);
      PRISES_JOURNAL.push(ligneJournal({ module: 'minuteurs', regle: 'minuteur', quoi: 'eteindre', cibles: [x], n: 1, motif: 'minuteur', detail: '', simule: false, ts: Date.now() / 1000 }));
    }, Math.max(0, fin * 1000 - Date.now()));
  };
  const minuteurDemo = (x, minutes) => {
    if (!PRISES_DEMO.includes(x) && !lampeDemo(x)) return;
    const n = Math.max(1, Math.min(24 * 60, Number(minutes) || 30));
    PRISES_JOURNAL.push(ligneJournal({ module: 'minuteurs', regle: 'minuteur', quoi: 'poser', cibles: [x], n: 1, motif: [['{n} min', { n }]], detail: '', simule: false, ts: Date.now() / 1000 }));
    armerMinuteurDemo(x);
  };
  // Le minuteur de l'ampoule de la chambre, posé dans sa journée (§ 9) : s'il tourne encore, il l'éteindra.
  const minuteurAmpoule = histoireLumieresAujourdhui().minuteur;
  if (minuteurAmpoule.fin * 1000 > Date.now() && states[minuteurAmpoule.id] && states[minuteurAmpoule.id].state === 'on') {
    MIN_DEMO[minuteurAmpoule.id] = { fin: minuteurAmpoule.fin, duree: MINUTEUR_LUMIERE_DEMO.minutes };
    armerMinuteurDemo(minuteurAmpoule.id);
  }
  /* Une ration partie de l'écran : l'appareil met un instant à la servir, puis le compteur du jour monte
   * (`servirDistributeurDemo`). */
  const distribuerDemo = (portions) => servirDistributeurDemo(states, portions, toucher);

  const el = document.createElement('home-assistant');
  el.hass = {
    states,
    connected: true,
    language: 'fr',
    /* La course du soleil se calcule sur la POSITION declaree par Home
     * Assistant, et `SunArc` refuse de dessiner un arc faux sans elle : la
     * demonstration montrait donc une maison sans arc ni pastilles — « il
     * manque les valeurs sur la maison » (02/10).
     *
     * Paris, parce qu'il faut bien un point et que celui-la n'appartient a
     * personne. La maison de demonstration est inventee ; sa position aussi. */
    // La version d'un Home Assistant récent (tranche robots 2, R4) : `spot_area` attend une liste depuis 2026.3.
    config: { latitude: 48.8566, longitude: 2.3522, time_zone: 'Europe/Paris', version: '2026.10.1' },
    user: { id: 'demo', name: 'Démo', is_admin: !ordinaire },
    /* Le websocket n'existe pas ici — sauf pour les PRÉVISIONS météo, que la
     * vue Météo demande par service. Sans elles, sa bannière n'aurait ni
     * heures ni semaine, et la démonstration montrerait une vue à moitié
     * vide qui ne ressemble à rien de réel. */
    callWS: (envoye) => {
      /* Comme la vraie bibliothèque (home-assistant-js-websocket), le numéro
       * du message ÉCRASE tout champ `id`. Une commande qui y rangeait autre
       * chose — le lancement d'un scénario — marchait ici et échouait chez
       * tout le monde (audit du 03/10). */
      const msg = (envoye && typeof envoye === 'object') ? { ...envoye, id: ++numeroMessageDemo } : envoye;
      if (msg && msg.type === 'call_service' && msg.domain === 'weather' && msg.service === 'get_forecasts') {
        const type = (msg.service_data && msg.service_data.type) || 'hourly';
        return Promise.resolve({ response: { 'weather.maison': { forecast: previsionsDemo(type) } } });
      }
      /* Meme raison que les previsions : sans reponse ici, la section
       * Interrupteurs ne montrerait qu'un message d'erreur, alors qu'elle est
       * justement ce qu'il y a a voir. Un variateur Hue et un bouton IKEA,
       * l'un regle et l'autre pas. */
      /* Le navigateur de medias : sans reponse ici, il n'aurait qu'un message
       * d'erreur a montrer, alors que c'est l'arbre qu'il faut voir. Deux
       * niveaux suffisent a rendre la navigation credible. */
      /* `todo.get_items` : le contenu d'une liste ne se pousse pas, il se
       * demande. Sans reponse ici, la carte Rappels resterait vide. */
      if (msg && msg.type === 'call_service' && msg.domain === 'todo' && msg.service === 'get_items') {
        const cible = (msg.target && msg.target.entity_id) || '';
        return Promise.resolve({ response: { [cible]: { items: todosDemo(cible) } } });
      }
      if (msg && msg.type === 'media_player/browse_media') {
        return Promise.resolve(parcoursDemo(msg.media_content_id));
      }
      if (msg && msg.type === 'loggia/scenarios/etat') return Promise.resolve(scenariosDemo(states));
      if (msg && msg.type === 'loggia/scenarios/config') return Promise.resolve({ config: scenariosPatch(msg.patch), etat: scenariosDemo(states) });
      // Ranger (audit du 03/10) : la commande ouverte a tout compte ne touche qu'a l'ordre.
      if (msg && msg.type === 'loggia/scenarios/ordre') return Promise.resolve({ ordre: scenariosPatch({ ordre: msg.ordre }).ordre, etat: scenariosDemo(states) });
      if (msg && msg.type === 'loggia/scenarios/lancer') return Promise.resolve(scenariosLancer(msg.scenario, states));
      if (msg && msg.type === 'loggia/interrupteurs/etat') return Promise.resolve(interDemo());
      if (msg && msg.type === 'loggia/interrupteurs/ecouter') {
        const duree = Math.max(0, Math.min(900, Number(msg.duree) || 0));
        INTER_ECOUTE.fin = duree ? Date.now() + duree * 1000 : 0;
        return Promise.resolve({ ecoute: interEcoute() });
      }
      if (msg && msg.type === 'loggia/interrupteurs/affecter') {
        return Promise.resolve({ affectations: interAffecter(msg) });
      }
      if (msg && msg.type === 'loggia/volets/etat') return Promise.resolve(voletsDemo(states));
      if (msg && msg.type === 'loggia/volets/config') {
        // Un compte ordinaire est refusé comme `require_admin` (chantier Volets, V10).
        if (ordinaire) return Promise.reject({ code: 'unauthorized', message: 'Unauthorized' });
        return Promise.resolve({ config: voletsPatch(msg.patch) });
      }
      if (msg && msg.type === 'loggia/volets/manoeuvres') return manoeuvresVoletsDemo(msg, states);
      /* Les prises (chantier Prises, § 6.1 et 10) : l'état, ouvert à tout compte ; la configuration,
       * refusée au compte ordinaire comme `require_admin` ; le logbook d'une prise, contextes compris. */
      if (msg && msg.type === 'loggia/prises/etat') return Promise.resolve(prisesDemo());
      if (msg && msg.type === 'loggia/prises/config') {
        if (ordinaire) return Promise.reject({ code: 'unauthorized', message: 'Unauthorized' });
        return Promise.resolve({ config: prisesPatch(msg.patch), etat: prisesDemo() });
      }
      if (msg && msg.type === 'logbook/get_events') return Promise.resolve(logbookPrisesDemo(msg, states));
      // Le carnet des lumières (chantier Lumières, § 6.2) : ouvert à tout compte, d'après leur histoire et les gestes de la session.
      if (msg && msg.type === 'loggia/lumieres/etat') return Promise.resolve(lumieresDemo(states));
      if (msg && msg.type === 'loggia/lumieres/journal') return journalLumiereDemo(msg, states);
      // Les services notify : ceux que la section Alertes propose comme cible.
      if (msg && msg.type === 'get_services') return Promise.resolve({ notify: { mobile_app_telephone_de_camille: {}, notify: {}, persistent_notification: {} } });
      if (msg && msg.type === 'loggia/fenetres/etat') return Promise.resolve(fenetresDemo());
      if (msg && msg.type === 'loggia/fenetres/config') {
        return Promise.resolve({ config: fenetresPatch(msg.patch) });
      }
      /* Sans zones, aucune regle par piece n'est proposable : c'est la zone
       * qui dit quel radiateur est dans la meme piece que quelle fenetre. */
      if (msg && msg.type === 'loggia/presence/etat') return Promise.resolve(presenceDemo());
      if (msg && msg.type === 'loggia/presence/config') {
        return Promise.resolve({ config: presencePatch(msg.patch) });
      }
      if (msg && msg.type === 'loggia/nuit/etat') return Promise.resolve(nuitDemo());
      if (msg && msg.type === 'loggia/nuit/config') {
        return Promise.resolve({ config: nuitPatch(msg.patch) });
      }
      /* Le mode enfant (chantier Mode enfant, § 10) : ses six commandes, avec les droits du vrai composant ; un réglage réécrit la
       * configuration commune dans le magasin, comme `loggia/config/suivre` le ferait chez lui. */
      const enfant = repondreEnfantDemo(msg, states, { ordinaire, ecrireCfg: (c) => faux.setItem('loggia_enfant', JSON.stringify(c)), toucher });
      if (enfant) return enfant;
      // Le code de la maison : vérifié ici, les essais comptés ; un code juste vaut laissez-passer cinq minutes (E2 B).
      const pin = repondrePinDemo(msg);
      if (pin) return pin;
      /* Les minuteurs d'extinction, comme le vrai composant (`minuteurs.py`) :
       * une heure de fin par appareil, et l'heure du serveur pour le décompte. */
      if (msg && msg.type === 'loggia/minuteurs/etat') return Promise.resolve(minuteursDemo());
      if (msg && msg.type === 'loggia/minuteurs/poser') {
        const r = minuteursPoser(msg.entity_id, msg.minutes);
        minuteurDemo(msg.entity_id, msg.minutes);
        return Promise.resolve(r);
      }
      if (msg && msg.type === 'loggia/minuteurs/annuler') { delete MIN_DEMO[msg.entity_id]; return Promise.resolve(minuteursDemo()); }
      /* Le test d'une sirene, comme le vrai composant (`sirene.py`) : le
       * serveur l'allume et l'eteint trois secondes plus tard, ecran ouvert
       * ou non. La sirene de la demo ne gere pas la duree : c'est le cas tenu. */
      if (msg && msg.type === 'loggia/sirene/tester') {
        const sid = msg.entity_id;
        if (!states[sid]) return Promise.reject({ code: 'invalid_format', message: 'entite inconnue' });
        toucher(sid, 'on');
        setTimeout(() => toucher(sid, 'off'), 3000);
        const maintenant = Date.now() / 1000;
        return Promise.resolve({ entity_id: sid, duree: 3, fin: maintenant + 3, maintenant });
      }
      if (msg && msg.type === 'loggia/robots/etat') return Promise.resolve(robotsDemo(states, lireCfgDemo('loggia_entities')));
      if (msg && msg.type === 'loggia/robots/config') return Promise.resolve({ config: robotsPatch(msg.patch) });
      /* Un départ (chantier IoT, I3 A) : le robot part, le carnet ouvre le passage avec ses pièces ; les refus du vrai composant,
       * leurs codes avec. L'état rendu est celui de `loggia/robots/etat`. */
      if (msg && msg.type === 'loggia/robots/lancer') return lancerRobotDemo(states, msg, toucher, lireCfgDemo('loggia_entities'));
      /* La roue de la popup (passe bis 2 du 20/10) : le rôle seul, fondu dans la description du magasin de la démo — administrateurs,
       * comme chez le vrai (`require_admin`) ; l'état rendu porte les rôles désignés, et la fiche le pose. */
      if (msg && msg.type === 'loggia/robots/scripts') {
        if (ordinaire) return Promise.reject({ code: 'unauthorized', message: 'Unauthorized' });
        let suite;
        try { suite = designerScriptDemo(lireCfgDemo('loggia_entities'), msg.role, msg.script); } catch (e) { return Promise.reject({ code: e.code || 'invalid_format', message: e.message }); }
        faux.setItem('loggia_entities', JSON.stringify(suite));
        return Promise.resolve(robotsDemo(states, suite));
      }
      /* Le distributeur (ADR 0155) : l'état, ouvert à tout compte, et le
       * planning de Loggia, réservé aux administrateurs (`require_admin`). La
       * configuration est relue au magasin mémoire à chaque appel. */
      if (msg && msg.type === 'loggia/distributeurs/etat') return Promise.resolve(distributeursDemo(states, lireCfgDemo('loggia_feeder')));
      if (msg && msg.type === 'loggia/distributeurs/config') {
        if (ordinaire) return Promise.reject({ code: 'unauthorized', message: 'Unauthorized' });
        try { return Promise.resolve({ config: distributeursPatch(msg.patch), etat: distributeursDemo(states, lireCfgDemo('loggia_feeder')) }); }
        catch (e) { return Promise.reject(e); }
      }
      /* Le planning de chauffe (chantier Chauffage, plan 2) : ses quatre
       * commandes au faux moteur — la forme exacte du serveur, ses refus, et
       * `?compte=ordinaire` refusé comme `require_admin`. */
      const chauffage = repondreChauffageDemo(msg, contexteChauffage());
      if (chauffage) return chauffage;
      if (msg && msg.type === 'loggia/veilles/etat') return Promise.resolve(veillesDemo(states));
      if (msg && msg.type === 'loggia/regles/etat') return Promise.resolve(reglesDemo(states));
      if (msg && msg.type === 'loggia/regles/degeler') {
        const etait = msg.entity_id in GELS_DEMO;
        delete GELS_DEMO[msg.entity_id];
        return Promise.resolve({ entity_id: msg.entity_id, etait_gele: etait, gels: { ...GELS_DEMO } });
      }
      if (msg && msg.type === 'loggia/veilles/config') {
        return Promise.resolve({ config: veillesPatch(msg.patch) });
      }
      /* Modifier et supprimer un rendez-vous : les seules commandes du
       * dashboard qui ne passent pas par un service. Sans elles ici, le geste
       * echouerait sur « pas de composant serveur » et la demo montrerait un
       * bouton qui ne fait rien. */
      if (msg && msg.type === 'calendar/event/delete') {
        calSupprimes.add(msg.uid);
        return Promise.resolve({});
      }
      if (msg && msg.type === 'calendar/event/update') {
        const ev = msg.event || {};
        const patch = { summary: ev.summary };
        if (ev.start_date) { patch.start = { date: ev.start_date }; patch.end = { date: ev.end_date }; }
        else if (ev.start_date_time) {
          // La demo garde l'heure locale telle qu'envoyee : `T` a la place de
          // l'espace suffit a en refaire une date que le dashboard sait lire.
          patch.start = { dateTime: String(ev.start_date_time).replace(' ', 'T') };
          patch.end = { dateTime: String(ev.end_date_time).replace(' ', 'T') };
        }
        calModifies.set(msg.uid, patch);
        return Promise.resolve({});
      }
      /* L'assistant de demonstration. Il ne pense rien : il rend un historique
       * court, puis recopie mot a mot une reponse ecrite d'avance. Ce qui se
       * montre ici n'est pas son intelligence, c'est le chemin — l'orbe qui
       * change d'etat, la bulle qui se remplit, l'arret qui arrete. */
      if (msg && msg.type === 'demo/info') return Promise.resolve({ addon: { version: 'demo' }, identity: null, phases: [], profile: null });
      if (msg && msg.type === 'demo/history') {
        return Promise.resolve({ conversation_id: 'demo-1', messages: [
          { role: 'user', text: parole('question'), ts: Date.now() - 7 * 60000 },
          { role: 'assistant', text: parole('meteo'), ts: Date.now() - 7 * 60000 + 4000 },
        ] });
      }
      if (msg && msg.type === 'demo/cancel') return Promise.resolve({});
      /* L'API commune de Home Assistant, celle des entites de conversation
       * qui n'ont pas de protocole a elles : une reponse d'un bloc, sans
       * historique ni flux. */
      if (msg && msg.type === 'conversation/process') {
        return new Promise((ok) => setTimeout(() => ok({
          conversation_id: msg.conversation_id || 'demo-assist',
          response: { response_type: 'action_done', language: LANGUE_DEMO, data: {}, speech: { plain: {
            speech: parole('agent'),
          } } },
        }), 600));
      }
      if (msg && msg.type === 'loggia/discovery') return Promise.resolve({ index: indexDemo(states) });
      /* La vue Systeme (ADR 0037) : sans ces reponses elle ne montrerait que
       * ses tuiles, alors que les versions, les modules et le journal sont
       * justement ce qu'il y a a voir. */
      if (msg && msg.type === 'supervisor/api') return superviseurDemo(msg);
      if (msg && msg.type === 'system_log/list') return Promise.resolve(erreursDemo());
      if (msg && msg.type === 'cloud/status') return Promise.resolve({ logged_in: true, cloud: 'connected' });
      /* L'historique au-dela de vingt-quatre heures (06/10) : la vue Energie
       * lit les statistiques longue duree, et la demo en fabrique une annee
       * plausible -- meme journee, meme valeur, sinon le calendrier scintille. */
      if (msg && msg.type === 'recorder/statistics_during_period') return Promise.resolve(statistiquesDemo(msg));
      return Promise.reject(new Error('démonstration : pas de composant serveur'));
    },
    /* `connection.subscribeMessage` : le seul endroit ou la demo doit imiter
     * un FLUX et non une reponse. L'assistant repond mot a mot ; rendre la
     * phrase d'un bloc montrerait autre chose que ce qui se passe vraiment. */
    connection: {
      subscribeMessage: (rappel, msg) => {
        if (msg && msg.type === 'logbook/event_stream') {
          /* Le journal de la demo : ce que les detecteurs de la camera de
           * l'entree ont vu — un mouvement il y a trois minutes, quelqu'un il
           * y a quarante et une. De quoi faire parler la tuile (ADR 0031). */
          const ids = Array.isArray(msg.entity_ids) ? msg.entity_ids : null;
          const ilYA = (min) => (Date.now() - min * 60000) / 1000;
          // Le nom de l'événement, traduit comme celui de l'état (audit du 03/10) :
          // la carte d'activité le lit en premier, et il restait français.
          const vus = [
            { when: ilYA(3), entity_id: 'binary_sensor.camera_entree_mouvement', state: 'on', name: etiquette('Caméra entrée Mouvement') },
            { when: ilYA(2.5), entity_id: 'binary_sensor.camera_entree_mouvement', state: 'off', name: etiquette('Caméra entrée Mouvement') },
            { when: ilYA(41), entity_id: 'binary_sensor.camera_entree_personne', state: 'on', name: etiquette('Caméra entrée Personne') },
            { when: ilYA(40), entity_id: 'binary_sensor.camera_entree_personne', state: 'off', name: etiquette('Caméra entrée Personne') },
            // Les détecteurs de présence de sa maquette « Cartes capteurs » (chantier Capteurs, étapes 2 et 3, § 12) : ce que la carte Présence lit.
            ...journalCapteursDemo(Date.now()),
          ].filter(e => !ids || ids.indexOf(e.entity_id) >= 0);
          let mort = false;
          setTimeout(() => { if (!mort && vus.length) rappel({ events: vus }); }, 120);
          return Promise.resolve(() => { mort = true; });
        }
        /* Les previsions de la carte meteo du rail (ADR 0038) : un abonnement,
         * comme sur une vraie installation — une livraison, puis le silence. */
        if (msg && msg.type === 'weather/subscribe_forecast') {
          let mort = false;
          setTimeout(() => { if (!mort) rappel({ type: msg.forecast_type, forecast: previsionsDemo(msg.forecast_type) }); }, 120);
          return Promise.resolve(() => { mort = true; });
        }
        /* Ce que l'enregistreur dit de sa base (vue Systeme) : le flux rend ce
         * qu'il sait, puis se termine. */
        if (msg && msg.type === 'system_health/info') {
          let mort = false;
          setTimeout(() => {
            if (mort) return;
            rappel({ type: 'initial', data: { recorder: { info: { estimated_db_size: '1433.60 MiB', database_engine: 'mysql', database_version: '11.4.2-MariaDB' } } } });
            rappel({ type: 'finish' });
          }, 150);
          return Promise.resolve(() => { mort = true; });
        }
        /* Le suivi de la configuration (ADR 0067) : un seul ecran en demo,
         * et rien n'y change d'ailleurs — l'abonnement tient, muet. */
        if (msg && msg.type === 'loggia/config/suivre') return Promise.resolve(() => {});
        if (!msg || msg.type !== 'demo/chat') return Promise.reject(new Error('démonstration : pas de composant serveur'));
        /* Trois sujets reconnus (`SUJETS_DEMO`), dans les sept langues ; le
         * reste reçoit la phrase qui dit ce qu'est la démo. Toutes dans la
         * langue de la démo (`PAROLES_DEMO`, relecture du 03/10). */
        const phrase = reponseDemo(msg.text);
        const mots = phrase.split(' ');
        let i = 0, mort = false;
        rappel({ event: 'accepted', message_id: 'demo-' + Date.now(), conversation_id: 'demo-1' });
        const suite = () => {
          if (mort) return;
          if (i >= mots.length) { rappel({ event: 'done' }); return; }
          rappel({ event: 'delta', text: (i ? ' ' : '') + mots[i++] });
          setTimeout(suite, 55);
        };
        setTimeout(suite, 700);
        return Promise.resolve(() => { mort = true; });
      },
    },
    callService,
    callApi: (methode, chemin) => {
      if (methode === 'GET' && String(chemin).indexOf('calendars/') === 0) {
        const cid = String(chemin).slice(10).split('?')[0];
        return Promise.resolve(calendrierDemo(cid));
      }
      if (methode === 'GET' && String(chemin).indexOf('history/period/') === 0) return Promise.resolve(historiqueDemo(String(chemin), states));
      if (methode === 'GET' && String(chemin).indexOf('logbook/') === 0) return Promise.resolve(logbookDemo());
      return Promise.resolve({});
    },
    auth: { data: { access_token: null } },
  };
  document.documentElement.appendChild(el);

  // Un calendrier dans les états, pour que la carte Agenda se montre.
  /* Deux agendas, et un seul qui accepte qu'on y ecrive : `supported_features`
   * a 7 vaut creer + supprimer + modifier ; a 0, rien. Sans cet ecart, la demo
   * ne montrerait pas ce qui compte — les boutons n'apparaissent que la ou le
   * geste aboutira, et « Travail » reste en lecture seule comme l'est un
   * abonnement iCal. */
  states['calendar.maison'] = s('off', { friendly_name: 'Calendrier maison', supported_features: 7 });
  states['calendar.travail'] = s('off', { friendly_name: 'Travail', supported_features: 0 });
  /* Un calendrier de COLLECTE : beaucoup de communes publient un .ics, et la
   * carte Collecte sait le lire quand aucun capteur n'est designe. */
  states['calendar.collectes'] = s('off', { friendly_name: etiquette('Collectes'), supported_features: 0 });
  /* UN AGENDA VIDE (08/10). « Pourquoi dans le calendrier j'en ai qu'un seul
   * alors que sur HAOS j'en ai 4 ? » — il en avait quatre, dont trois sans
   * aucun rendez-vous sur la semaine affichee, et la liste « Mes agendas » se
   * construisait a partir des EVENEMENTS trouves : les trois etaient
   * invisibles, donc impossibles a cocher. La demonstration n'avait aucun
   * agenda vide, elle ne pouvait donc pas montrer le defaut. Celui-ci n'a
   * jamais d'evenement : il doit paraitre dans la liste, avec un zero. */
  states['calendar.anniversaires'] = s('off', { friendly_name: etiquette('Anniversaires'), supported_features: 0 });

  /* Deux LISTES DE TACHES (`todo.*`) : les rappels de l'Accueil. Les categories
   * sont les listes elles-memes — chez chacun les siennes. « Partagee » est en
   * LECTURE SEULE (`supported_features` a 0) : ni « + », ni case a cocher. A 15,
   * tout est permis (creer 1 + supprimer 2 + modifier 4 + dater 8... voir
   * TodoListEntityFeature). */
  states['todo.maison'] = s('3', { friendly_name: etiquette('Maison'), supported_features: 1 | 2 | 4 | 16 | 32 });
  states['todo.courses'] = s('2', { friendly_name: etiquette('Courses'), supported_features: 1 | 2 | 4 | 16 | 32 });
  states['todo.partagee'] = s('1', { friendly_name: etiquette('Liste partagée'), supported_features: 0 });

  /* Deux entites de conversation, pour que le choix de l'assistant se montre :
   * celle de la demo, qui parle son propre protocole, et l'agent integre de
   * Home Assistant, qui passe par l'API commune. */
  states['conversation.demo'] = s('unknown', { friendly_name: 'Démo' });
  states['conversation.home_assistant'] = s('unknown', { friendly_name: 'Home Assistant' });

  // ── 3. Le badge ───────────────────────────────────────────────────────────
  /* Au-dessus de la barre du bas quand elle est là (`--o-navh`, sa hauteur
   * mesurée), plus la marge du bouton de l'assistant qui en dépasse au
   * milieu : posé à 10 px du bas, le badge le couvrait sur téléphone. Sans
   * barre, `--o-navh` vaut 0 et le badge reste à 10 px du bas. */
  /* Ses couleurs viennent du thème (20/09/2026) : le bleu clair écrit en dur
   * donnait 1,4:1 en mode clair, et son fond translucide prenait la teinte de
   * ce qui passait dessous. Le fond est désormais opaque — l'accent à 16 % sur
   * le fond de page — et le texte est celui du thème ; les deux premières
   * déclarations restent pour les navigateurs sans `color-mix`. */
  /* Dans la langue de la démonstration (03/10), comme ses pièces et ses
   * appareils : le badge restait en français au milieu d'une maison anglaise
   * ou polonaise. Les pages légales, elles, n'existent qu'en français
   * (`hreflang` le dit au lien). */
  const BADGE = {
    fr: ['Démonstration — données factices', 'Mentions légales'],
    en: ['Demo — sample data', 'Legal notice'],
    de: ['Demo — Beispieldaten', 'Impressum'],
    nl: ['Demo — fictieve gegevens', 'Juridische informatie'],
    it: ['Demo — dati fittizi', 'Note legali'],
    es: ['Demostración — datos ficticios', 'Aviso legal'],
    pl: ['Demonstracja — fikcyjne dane', 'Nota prawna'],
  };
  const [texteBadge, texteLien] = BADGE[LANGUE_DEMO] || BADGE.fr;
  const badge = document.createElement('div');
  badge.textContent = texteBadge;
  badge.style.cssText = 'position:fixed;left:50%;bottom:calc(10px + var(--o-navh, 0px) + min(var(--o-navh, 0px), 18px));transform:translateX(-50%);z-index:99999;padding:6px 14px;border-radius:999px;background:#13233d;background:color-mix(in srgb, var(--o-accent, #4f8cff) 16%, var(--o-bg, #0b101b));border:1px solid rgba(77,163,255,.4);color:#eaf0fb;color:var(--o-text, #eaf0fb);font:700 11.5px/1.4 system-ui,sans-serif;white-space:nowrap;pointer-events:none;';
  /* Il s'efface pendant qu'une fenêtre est ouverte (audit du 03/10) : peint
   * au-dessus de tout, il couvrait le bas de chaque feuille, et son lien
   * « Mentions légales » prenait les clics destinés aux boutons du pied. */
  badge.setAttribute('data-demo-badge', '');
  const effacement = document.createElement('style');
  effacement.textContent = 'html:has([role="dialog"]) [data-demo-badge]{display:none!important}';
  document.head.appendChild(effacement);
  /* Sur le site en ligne seulement, le badge mène aux pages légales
   * (`site/legal/`, ADR 0062) : la loi veut que l'éditeur et l'hébergeur d'un
   * site se trouvent depuis ce site. Sur une installation, `?demo` n'a pas ces
   * pages — le lien ne mènerait nulle part. Le badge laisse passer les clics ;
   * le lien, lui, les reprend. Trop large pour un petit téléphone, l'ensemble
   * passe sur deux lignes, chaque moitié restant entière. */
  if (import.meta.env.MODE === 'demo') {
    const texte = document.createElement('span');
    texte.textContent = badge.textContent;
    texte.style.whiteSpace = 'nowrap';
    const lien = document.createElement('a');
    lien.href = './legal/mentions-legales.html';
    lien.textContent = texteLien;
    lien.hreflang = 'fr';
    // Le rembourrage rendu par la marge : une cible de 28 px sans grossir le badge.
    lien.style.cssText = 'pointer-events:auto;color:inherit;text-decoration:underline;text-underline-offset:2px;white-space:nowrap;padding:6px 4px;margin:-6px -4px;';
    badge.textContent = '';
    badge.append(texte, lien);
    // Pas de point entre les deux : à la ligne, il resterait seul en tête.
    badge.style.display = 'flex';
    badge.style.flexWrap = 'wrap';
    badge.style.justifyContent = 'center';
    badge.style.columnGap = '12px';
    // `left:50%` ne laisse que la moitié de l'écran à un bloc fixe : sans
    // largeur dite, il passait sur deux lignes même quand une seule tenait.
    badge.style.width = 'max-content';
    badge.style.maxWidth = 'calc(100vw - 20px)';
    badge.style.boxSizing = 'border-box';
    /* Dans le CORPS de la page, et nommé comme pied de page : accroché à
     * `<html>`, le lien restait hors de l'arbre que lisent les lecteurs d'écran
     * et les agents (mesuré : introuvable). */
    badge.setAttribute('role', 'contentinfo');
    document.body.appendChild(badge);
  } else {
    document.documentElement.appendChild(badge);
  }
}
