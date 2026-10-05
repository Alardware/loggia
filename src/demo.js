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
  'Collectes': { en: 'Waste collection', de: 'Abfuhr', nl: 'Inzameling', it: 'Raccolta', es: 'Recogida', pl: 'Odbiór odpadów' },
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
  'Enceinte': { en: 'Speaker', de: 'Lautsprecher', nl: 'Speaker', it: 'Diffusore', es: 'Altavoz', pl: 'Głośnik' },
  'Enceinte salon': { en: 'Living room speaker', de: 'Lautsprecher Wohnzimmer', nl: 'Speaker woonkamer', it: 'Diffusore soggiorno', es: 'Altavoz salón', pl: 'Głośnik salon' },
  'En ligne': { en: 'Online', de: 'Online', nl: 'Online', it: 'Online', es: 'En línea', pl: 'Online' },
  'Erreur du distributeur': { en: 'Feeder error', de: 'Fehler des Futterautomaten', nl: 'Fout voerautomaat', it: 'Errore del distributore', es: 'Error del comedero', pl: 'Błąd podajnika' },
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
  'Livraison colis': { en: 'Parcel delivery', de: 'Paketzustellung', nl: 'Pakketbezorging', it: 'Consegna pacco', es: 'Entrega de paquete', pl: 'Dostawa paczki' },
  'Lumière couloir la nuit': { en: 'Hallway light at night', de: 'Flurlicht bei Nacht', nl: 'Ganglicht ’s nachts', it: 'Luce corridoio di notte', es: 'Luz del pasillo de noche', pl: 'Światło korytarza w nocy' },
  'Maison': { en: 'Home', de: 'Zu Hause', nl: 'Huis', it: 'Casa', es: 'Casa', pl: 'Dom' },
  'Mode de distribution': { en: 'Feeding mode', de: 'Fütterungsmodus', nl: 'Voermodus', it: 'Modalità di erogazione', es: 'Modo de dispensación', pl: 'Tryb karmienia' },
  'Mouvement entrée': { en: 'Entrance motion', de: 'Bewegung Eingang', nl: 'Beweging entree', it: 'Movimento ingresso', es: 'Movimiento entrada', pl: 'Ruch wejście' },
  'Météo': { en: 'Weather', de: 'Wetter', nl: 'Weer', it: 'Meteo', es: 'Tiempo', pl: 'Pogoda' },
  'Nuit': { en: 'Night', de: 'Nacht', nl: 'Nacht', it: 'Notte', es: 'Noche', pl: 'Noc' },
  'Part fossile du réseau': { en: 'Fossil share of the grid', de: 'Fossiler Anteil im Netz', nl: 'Fossiel aandeel van het net', it: 'Quota fossile della rete', es: 'Parte fósil de la red', pl: 'Udział paliw kopalnych w sieci' },
  'Pelouse avant': { en: 'Front lawn', de: 'Rasen vorne', nl: 'Voorgazon', it: 'Prato davanti', es: 'Césped delantero', pl: 'Trawnik z przodu' },
  'Pile porte entrée': { en: 'Entrance door battery', de: 'Batterie Eingangstür', nl: 'Batterij voordeur', it: 'Batteria porta ingresso', es: 'Batería puerta entrada', pl: 'Bateria drzwi wejściowych' },
  'Plafonnier': { en: 'Ceiling light', de: 'Deckenleuchte', nl: 'Plafondlamp', it: 'Plafoniera', es: 'Plafón', pl: 'Lampa sufitowa' },
  'Point d’équipe': { en: 'Team meeting', de: 'Teambesprechung', nl: 'Teamoverleg', it: 'Riunione di team', es: 'Reunión de equipo', pl: 'Spotkanie zespołu' },
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
  'Volet chambre': { en: 'Bedroom blind', de: 'Rollladen Schlafzimmer', nl: 'Rolluik slaapkamer', it: 'Tapparella camera', es: 'Persiana dormitorio', pl: 'Roleta sypialnia' },
  'Volet cuisine': { en: 'Kitchen blind', de: 'Rollladen Küche', nl: 'Rolluik keuken', it: 'Tapparella cucina', es: 'Persiana cocina', pl: 'Roleta kuchnia' },
  'Volet salon': { en: 'Living room blind', de: 'Rollladen Wohnzimmer', nl: 'Rolluik woonkamer', it: 'Tapparella soggiorno', es: 'Persiana salón', pl: 'Roleta salon' },
  'Volets : fermeture au coucher du soleil': { en: 'Blinds: close at sunset', de: 'Rollläden: schließen bei Sonnenuntergang', nl: 'Rolluiken: sluiten bij zonsondergang', it: 'Tapparelle: chiusura al tramonto', es: 'Persianas: cerrar al atardecer', pl: 'Rolety: zamknięcie o zachodzie' },
  'Volets : ouverture du matin': { en: 'Blinds: open in the morning', de: 'Rollläden: Öffnen am Morgen', nl: 'Rolluiken: openen ’s ochtends', it: 'Tapparelle: apertura al mattino', es: 'Persianas: apertura por la mañana', pl: 'Rolety: otwarcie rano' },
  'Éclairage terrasse au crépuscule': { en: 'Terrace lighting at dusk', de: 'Terrassenbeleuchtung bei Dämmerung', nl: 'Terrasverlichting bij schemering', it: 'Illuminazione terrazza al crepuscolo', es: 'Iluminación de la terraza al anochecer', pl: 'Oświetlenie tarasu o zmierzchu' },
};

/** Le nom d'un appareil, sinon d'un lieu, dans la langue de la demonstration. */
const etiquette = (fr) => (APPAREILS[fr] && APPAREILS[fr][LANGUE_DEMO]) || lieu(fr);

const PIECES = [
  ['salon', 'Salon', 21.4, 47, 612],
  ['cuisine', 'Cuisine', 22.8, 51, null],
  ['chambre', 'Chambre', 19.6, 49, 1480],  // « Élevé » (orange) : la carte « A surveiller » a de quoi montrer
  ['bureau', 'Bureau', 20.9, 45, 538],
  ['entree', 'Entrée', 20.1, 46, null],
  ['salle_de_bain', 'Salle de bain', 23.2, 58, null],
];

function etatsInitiaux() {
  const states = {
    'sun.sun': (() => {
      const lever = new Date(); lever.setHours(7, 12, 0, 0);
      const coucher = new Date(); coucher.setHours(20, 28, 0, 0);
      if (coucher < new Date()) coucher.setDate(coucher.getDate() + 1);
      if (lever < new Date()) lever.setDate(lever.getDate() + 1);
      return s('above_horizon', { friendly_name: 'Soleil', elevation: 34, next_rising: lever.toISOString(), next_setting: coucher.toISOString() });
    })(),
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
    // Les kWh du jour : sans eux, pas de bilan ni de cadran d'autosuffisance.
    'sensor.conso_jour': s(6.16, { friendly_name: 'Consommation du jour', unit_of_measurement: 'kWh', device_class: 'energy' }),
    'sensor.production_jour': s(4.32, { friendly_name: 'Production du jour', unit_of_measurement: 'kWh', device_class: 'energy' }),
    'sensor.injection_jour': s(0.96, { friendly_name: 'Injection du jour', unit_of_measurement: 'kWh', device_class: 'energy' }),
    'sensor.conso_jour_hc': s(3.90, { friendly_name: 'Consommation heures creuses', unit_of_measurement: 'kWh', device_class: 'energy' }),
    'sensor.conso_jour_hp': s(2.26, { friendly_name: 'Consommation heures pleines', unit_of_measurement: 'kWh', device_class: 'energy' }),
    'sensor.part_fossile_reseau': s(38, { friendly_name: 'Part fossile du réseau', unit_of_measurement: '%' }),
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
    /* Un Echo : il ne sait PAS parcourir sa bibliothèque (`alexa_media` n'expose
     * aucun arbre), et c'est tout l'intérêt — la fiche montre alors la phrase,
     * le seul chemin pour lui demander une playlist. */
    'media_player.echo_cuisine': s('idle', { friendly_name: 'Echo de la cuisine', supported_features: 5644 }),
    'media_player.tv_salon': s('playing', { friendly_name: 'TV du salon', supported_features: 450487,
      source_list: ['Netflix', 'Disney+', 'YouTube', 'Prime Video', 'Free TV', 'Plex', 'Musique', 'Photos', 'Arcade', 'App Store', 'Crunchyroll'],
      app_name: 'Netflix', app_id: 'com.netflix.Netflix',
      media_title: 'Stranger Things', media_artist: 'S4 - E1', media_duration: 4672, media_position: 1591,
      media_position_updated_at: new Date().toISOString(), volume_level: .4 }),
    'media_player.salon': s('playing', { friendly_name: 'Enceinte salon', media_title: 'Clair de Lune', media_artist: 'Debussy', volume_level: .35, supported_features: 20925, entity_picture: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2096%2096%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%234c1d95%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%230ea5e9%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20fill%3D%22url(%23g)%22%2F%3E%3Ccircle%20cx%3D%2248%22%20cy%3D%2248%22%20r%3D%2226%22%20fill%3D%22%23111827%22%2F%3E%3Ccircle%20cx%3D%2248%22%20cy%3D%2248%22%20r%3D%225%22%20fill%3D%22%23f4f4f5%22%2F%3E%3C%2Fsvg%3E' }),
    // Un vrai robot annonce ce qu'il sait faire : sans supported_features ni
    // liste de vitesses, la fiche n'avait ni boutons ni selecteur a montrer.
    'vacuum.aspirateur': s('docked', { friendly_name: 'Aspirateur', battery_level: 92,
      supported_features: 8828, fan_speed: 'max_plus',
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
    'sensor.tondeuse_usage_des_lames': s(43, { friendly_name: "Tondeuse Durée d'utilisation des lames", device_class: 'duration', unit_of_measurement: 'h' }),
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
    'binary_sensor.baie_vitree': s('off', { friendly_name: 'Baie vitrée', device_class: 'door' }),
    'binary_sensor.mouvement_entree': s('off', { friendly_name: 'Mouvement entrée', device_class: 'motion' }),
    'sensor.pile_porte_entree': s(9, { friendly_name: 'Pile porte entrée', device_class: 'battery', unit_of_measurement: '%' }),
    'person.demo': s('home', { friendly_name: 'Démo' }),
    'person.sam': s('not_home', { friendly_name: 'Sam' }),
    'binary_sensor.fenetre_chambre': s('on', { friendly_name: 'Fenêtre chambre', device_class: 'window' }),  // ouverte : la carte Chambre le dit
    'binary_sensor.fenetre_salon': s('off', { friendly_name: 'Fenêtre salon', device_class: 'window' }),
    'switch.radiateur_chambre': s('on', { friendly_name: 'Radiateur chambre' }),
    'switch.radiateur_salon': s('on', { friendly_name: 'Radiateur salon' }),
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
    'cover.volet_salon': s('open', { friendly_name: 'Volet salon', current_position: 100, supported_features: 15, device_class: 'shutter' }),
    'cover.volet_cuisine': s('open', { friendly_name: 'Volet cuisine', current_position: 60, supported_features: 15, device_class: 'shutter' }),
    'cover.volet_chambre': s('closed', { friendly_name: 'Volet chambre', current_position: 0, supported_features: 15, device_class: 'shutter' }),
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
     * de voir que Loggia ne propose une teinte que la ou elle existe. */
    states['light.' + cle] = s(cle === 'salon' || cle === 'cuisine' ? 'on' : 'off', cle === 'salon'
      ? { friendly_name: etiquette('Plafonnier') + ' ' + lieu(nom), brightness: 180, rgb_color: [255, 176, 92], color_temp_kelvin: 2900,
          min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6535, supported_color_modes: ['color_temp', 'rgb'] }
      : { friendly_name: etiquette('Plafonnier') + ' ' + lieu(nom), brightness: 180, supported_color_modes: ['brightness'] });
  });
  return Object.assign(states, etatsDistributeur());
}

/* La configuration de la maison, servie par le magasin mémoire : le dashboard
 * la lit comme s'il lisait le localStorage. */
function configDemo() {
  return {
    /* La demo se donne un assistant, pour que le bouton du bas existe et que
     * la popup ait quelque chose a raconter. Le nom vaut ce qu'il dit : c'est
     * un reglage, chacun met le sien. */
    loggia_assistant: 'demo',
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
    loggia_rooms: PIECES.map(([cle, nom, , , co2]) => ({
      room: lieu(nom),
      haid: { temp: 'sensor.' + cle + '_temperature', humidity: 'sensor.' + cle + '_humidite', co2: co2 != null ? 'sensor.' + cle + '_co2' : null },
    })),
    // `loggia_energyHaids` est la cle que lisent `enHaids()` ET la disponibilite
    // des vues : sans elle, la vue Energie restait masquee en demonstration.
    // `loggia_cameras` est la cle que lit l'agregat — `loggia_entities.cameras`
    // sert ailleurs. Sans `haid`, la tuile prend son rendu de repli : degrade,
    // halo et badge « Direct », au lieu d'attendre un flux qui n'existe pas ici.
    loggia_cameras: CAMERAS(),
    loggia_energyHaids: { solarOutput: 'sensor.production_solaire', consoNow: 'sensor.reseau', surplusNow: 'sensor.surplus', consoJour: 'sensor.conso_jour', prodJour: 'sensor.production_jour', injectionJour: 'sensor.injection_jour', consoJourHc: 'sensor.conso_jour_hc', consoJourHp: 'sensor.conso_jour_hp',
      evNow: 'sensor.borne_recharge', batNow: 'sensor.batterie_maison', batSoc: 'sensor.batterie_niveau' },
    loggia_entities: {
      weather: ['weather.maison', 'sun.sun'],
      alarm: 'alarm_control_panel.maison',
      cameras: CAMERAS(),
      people: [{ name: 'Camille', haid: 'person.camille' }, { name: 'Alex', haid: 'person.alex' },
        { name: 'Léa', haid: 'person.lea' }],
      energy: { solarOutput: 'sensor.production_solaire', consoNow: 'sensor.reseau', surplusNow: 'sensor.surplus', consoJour: 'sensor.conso_jour', prodJour: 'sensor.production_jour', injectionJour: 'sensor.injection_jour', consoJourHc: 'sensor.conso_jour_hc', consoJourHp: 'sensor.conso_jour_hp',
        evNow: 'sensor.borne_recharge', batNow: 'sensor.batterie_maison', batSoc: 'sensor.batterie_niveau' },
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
  { id: 'nuit', icone: 'moon', teinte: 'chambre', actions: [SCN_A('lumieres', 'eteindre', 'maison', { sauf_veilleuses: true }), SCN_A('volets', 'fermer'), SCN_A('medias', 'eteindre'), SCN_A('alarme', 'nuit'), SCN_A('serrures', 'verrouiller')] },
  { id: 'cinema', icone: 'film', teinte: 'vert', actions: [SCN_A('medias', 'pause'), SCN_A('lumieres', 'allumer', 'piece', { valeur: 10 }), SCN_A('volets', 'fermer', 'piece'), SCN_A('medias', 'allumer_tv', 'piece')] },
  { id: 'musique', icone: 'music', teinte: 'tendre', actions: [SCN_A('medias', 'lecture', 'piece'), SCN_A('lumieres', 'allumer', 'piece', { valeur: 50 })] },
  { id: 'invites', icone: 'users', teinte: 'ambre', actions: [SCN_A('lumieres', 'allumer', 'vie', { valeur: 100 }), SCN_A('chauffage', 'confort')] },
  { id: 'tout_eteindre', icone: 'power', teinte: 'gris', actions: [SCN_A('lumieres', 'eteindre'), SCN_A('medias', 'eteindre')] },
];
const SCN_PIECE = {
  'light.salon': 'Salon', 'cover.salon': 'Salon', 'cover.volet_salon': 'Salon', 'media_player.salon': 'Salon', 'media_player.tv_salon': 'Salon', 'media_player.enceinte_salon': 'Salon', 'media_player.echo_cuisine': 'Cuisine', 'climate.salon': 'Salon',
  'light.cuisine': 'Cuisine', 'cover.cuisine': 'Cuisine', 'cover.volet_cuisine': 'Cuisine',
  'light.chambre': 'Chambre', 'cover.chambre': 'Chambre', 'cover.volet_chambre': 'Chambre', 'climate.chambre': 'Chambre',
  'light.bureau': 'Bureau', 'light.entree': 'Entrée', 'lock.porte_entree': 'Entrée', 'light.sdb': 'Salle de bain',
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
    if (a.famille === 'lumieres') return a.geste === 'eteindre' ? st === 'on' : true;
    if (a.famille === 'volets') return a.geste === 'fermer' ? st !== 'closed' : st !== 'open';
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
        if (etat) states[hid] = { ...st, state: etat, last_changed: new Date().toISOString() };
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

function historiqueDemo(chemin, states) {
  const m = String(chemin).match(/filter_entity_id=([^&]+)/);
  const plusieurs = m ? decodeURIComponent(m[1]).split(',') : [];
  if (plusieurs.some(x => /^(vacuum|lawn_mower)\./.test(x))) return historiqueRobotDemo(plusieurs, states);
  if (plusieurs.some(x => SERIES_DIST.has(x))) return historiqueDistributeurDemo(plusieurs, String(chemin), states);
  const id = m ? decodeURIComponent(m[1]) : null;
  const cur = id && states[id] ? parseFloat(states[id].state) : NaN;
  if (!id || isNaN(cur)) return [];
  const d = String(chemin).match(/history\/period\/([^?]+)/);
  const t0 = d ? Date.parse(decodeURIComponent(d[1])) : Date.now() - 86400000;
  const t1 = Date.now();
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

/* Regles de volets : le planning arme, la protection solaire reglee sur deux
 * facades, le vent au repos. De quoi voir la page telle qu'elle sera une fois
 * remplie, plutot qu'un formulaire vide. */
const VOL_CFG = {
  planning: { actif: true, mode: 'auto', ouverture: { decalage: 15 }, fermeture: { decalage: -20 }, jours: [0, 1, 2, 3, 4, 5, 6], volets: { 'cover.chambre': { ouverture: 90, fermeture: null } } },
  velux: { actif: false },
  soleil: {
    actif: true, position: 30, elevation_min: 15, temp_min: 25,
    temp_entite: 'sensor.exterieur_temperature',
    volets: { 'cover.salon': { orientation: 225, ouverture: 90 } },
  },
  vent: { actif: false, entite: '', seuil: 50 },
  baies: { actif: true, volets: { 'cover.volet_salon': 'binary_sensor.fenetre_salon' } },
};

function voletsDemo(states) {
  const sun = states['sun.sun'];
  const at = (sun && sun.attributes) || {};
  return {
    config: VOL_CFG,
    soleil: { azimut: at.azimuth != null ? at.azimuth : 214, elevation: at.elevation != null ? at.elevation : 34 },
    abaisses: VOL_CFG.soleil.actif ? ['cover.salon'] : [],
    a_l_abri: false,
    // Les prochains rendez-vous du planning : demain matin, ce soir.
    prochains: { ouverture: { 15: new Date(new Date().setHours(31, 48, 0, 0)).toISOString() }, fermeture: { '-20': new Date(new Date().setHours(20, 24, 0, 0)).toISOString() } },
    journal: [
      // Les gabarits que volets.py écrit, parties comprises (relecture du 03/10).
      ligneJournal({ module: 'volets', regle: 'soleil', quoi: 'proteger', cibles: ['cover.salon'], n: 1, motif: [['soleil a {a}°', { a: 225 }]], detail: '', simule: false, ts: Date.now() / 1000 - 900 }),
      ligneJournal({ module: 'volets', regle: 'planning', quoi: 'ouvrir', cibles: ['cover.salon', 'cover.cuisine', 'cover.chambre'], n: 3, motif: [['lever du soleil {d} min', { d: '+15' }]], detail: '', simule: false, ts: Date.now() / 1000 - 27000 }),
    ],
  };
}

function voletsPatch(patch) {
  Object.keys(patch || {}).forEach(section => {
    if (VOL_CFG[section]) Object.assign(VOL_CFG[section], patch[section]);
  });
  return VOL_CFG;
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

/* Les registres, tels que le composant les enverrait : des zones, et les
 * entites qui y sont rangees. Le dashboard croise ensuite avec les etats. */
function indexDemo(states) {
  const ZONES = [
    ['salon', lieu('Salon')], ['cuisine', lieu('Cuisine')], ['chambre', lieu('Chambre')],
    ['bureau', lieu('Bureau')], ['entree', lieu('Entrée')], ['sdb', lieu('Salle de bain')],
  ];
  const ZONE_DE = {
    salon: ['light.salon', 'media_player.salon', 'sensor.salon_temperature', 'sensor.salon_humidite', 'sensor.salon_co2', 'sensor.salon_bruit', 'cover.salon', 'cover.volet_salon',
            'binary_sensor.fenetre_salon', 'switch.radiateur_salon', 'media_player.enceinte_salon', 'media_player.tv_salon', 'remote.tv_salon', 'binary_sensor.detecteur_co_salon'],
    cuisine: ['light.cuisine', 'sensor.cuisine_temperature', 'sensor.cuisine_humidite', 'cover.cuisine', 'cover.volet_cuisine', 'binary_sensor.detecteur_fumee', 'binary_sensor.fuite_evier', 'valve.arrivee_eau', 'media_player.echo_cuisine'],
    chambre: ['light.chambre', 'sensor.chambre_temperature', 'sensor.chambre_humidite', 'sensor.chambre_co2', 'cover.chambre', 'cover.volet_chambre',
              'binary_sensor.fenetre_chambre', 'switch.radiateur_chambre'],
    bureau: ['light.bureau', 'sensor.bureau_temperature', 'sensor.bureau_humidite', 'sensor.bureau_co2'],
    entree: ['light.entree', 'sensor.entree_temperature', 'binary_sensor.porte_entree', 'binary_sensor.detecteur_fumee_entree', 'binary_sensor.mouvement_entree', 'lock.porte_entree', 'siren.interieure',
             'camera.entree', 'switch.camera_entree_detection_mouvement', 'switch.camera_entree_suivi', 'switch.camera_entree_pleurs',
             'switch.camera_entree_prive', 'switch.camera_entree_voyant', 'binary_sensor.camera_entree_mouvement', 'binary_sensor.camera_entree_personne'],
    sdb: ['light.sdb', 'sensor.sdb_temperature'],
  };
  // La camera de l'entree et ses reglages forment UN appareil : c'est par lui
  // que la fiche retrouve les interrupteurs d'une camera.
  const APPAREIL_DE = (id) => (id === 'media_player.echo_cuisine' ? 'echo_cuisine'
    : /^(media_player|remote)\.tv_salon$/.test(id) ? 'tv_salon'
    : /^(camera\.entree$|switch\.camera_entree_|binary_sensor\.camera_entree_)/.test(id) ? 'cam_entree' : null);
  const entities = [];
  Object.keys(ZONE_DE).forEach(zone => {
    ZONE_DE[zone].forEach(id => {
      if (!states[id]) return;
      const at = states[id].attributes || {};
      entities.push({ id, name: at.friendly_name || id, device: APPAREIL_DE(id), area: zone,
        platform: 'demo', category: null, device_class: at.device_class || null,
        unit: at.unit_of_measurement || null, hidden: false });
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
    areas: ZONES.map(([id, name]) => ({ id, name, floor: null, icon: null })),
    /* Le nom d'un APPAREIL passe par la même table que ceux de ses entités
     * (audit du 03/10) : `cameraModes` et `decrireSoeurs` le retirent en tête
     * du nom de chaque entité. Resté « Tondeuse » devant « Mower Zone Front
     * lawn », il ne se retirait plus : la puce de zone portait le nom entier,
     * et la fiche titrait en français. Le modèle aussi, qu'elle affiche. */
    devices: [{ id: 'tv_salon', name: etiquette('TV du salon'), area: 'salon', manufacturer: 'Démo', model: etiquette('Boîtier TV'), firmware: null, via: null, entry_type: null, integration: 'apple_tv' },
      { id: 'echo_cuisine', name: etiquette('Echo de la cuisine'), area: 'cuisine', manufacturer: 'Démo', model: etiquette('Enceinte'), firmware: null, via: null, entry_type: null, integration: 'alexa_media' },
      { id: 'cam_entree', name: etiquette('Caméra entrée'), area: 'entree', manufacturer: 'Démo', model: etiquette('Caméra'), firmware: null, via: null, entry_type: null, integration: 'demo' },
      { id: 'sysmon', name: 'System Monitor', area: null, manufacturer: 'Démo', model: 'System Monitor', firmware: null, via: null, entry_type: 'service', integration: 'systemmonitor' },
      { id: 'robot_aspirateur', name: etiquette('Aspirateur'), area: null, manufacturer: 'Démo', model: 'Orbit V3', firmware: null, via: null, entry_type: null, integration: 'ecovacs' },
      { id: 'robot_tondeuse', name: etiquette('Tondeuse'), area: null, manufacturer: 'Démo', model: 'Meadow M2', firmware: null, via: null, entry_type: null, integration: 'mammotion' },
      ...distribs.map(id => ({ id, name: etiquette('Distributeur de croquettes'), area: 'cuisine', manufacturer: APPAREIL_DIST[id].fabricant,
        model: APPAREIL_DIST[id].modele, firmware: null, via: null, entry_type: null, integration: DISTRIBUTEURS_DEMO[id][0] }))],
    entities,
    floors: [],
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
  veilleuse: { actif: true, lampes: ['light.chambre'], duree: 30, fondu: 5, depuis: '19:00' },
  coucher: { actif: true, heure: '23:30', sauf: ['light.chambre'], jours: [0, 1, 2, 3, 4, 5, 6] },
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
      ligneJournal({ module: 'nuit', regle: 'veilleuse', quoi: 'eteindre', cibles: ['light.chambre'], n: 1, motif: [['{n} min', { n: 30 }]], detail: '', simule: false, ts: Date.now() / 1000 - 50000 }),
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
};

/* Le journal de la maison : les lignes de chaque module, melees dans l'ordre
 * du temps, plus ce que le socle retient en ce moment. La demo montre une
 * main posee sur une lampe (le gel), un volet tenu par la protection
 * solaire, et une ligne simulee — de quoi voir chaque filtre agir. */
const GELS_DEMO = { 'light.salon': 1260 };
/* Exporté pour `tests/demo_noms.test.mjs`, qui lit ce journal tel que l'écran
 * le reçoit (relecture du 03/10). */
export function reglesDemo(states) {
  const lignes = [
    // La règle d'un interrupteur porte son NOM : traduit comme sa fiche (audit du 03/10).
    { module: 'interrupteurs', regle: etiquette('Variateur Salon'), quoi: 'bouton', cibles: ['light.salon'], n: 1, motif: 'on_press_release → light.turn_on', detail: '', simule: false, ts: Date.now() / 1000 - 540 },
    ligneJournal({ module: 'volets', regle: 'planning', quoi: 'fermer', cibles: ['cover.chambre'], n: 1, motif: [['coucher du soleil {d} min', { d: '-20' }]], detail: '', simule: true, ts: Date.now() / 1000 - 3600 }),
    ...voletsDemo(states).journal, ...fenetresDemo().journal, ...presenceDemo().journal,
    ...nuitDemo().journal, ...veillesDemo(states).journal,
  ];
  lignes.sort((a, b) => b.ts - a.ts);
  return {
    journal: lignes,
    gels: { ...GELS_DEMO },
    tenues: VOL_CFG.soleil.actif ? { 'cover.volet_salon': { module: 'volets', regle: 'soleil' } } : {},
    attentes: { 'cover.volet_chambre': { sens: 'fermer', motif: 'baie ouverte', expire: Date.now() / 1000 + 36000 } },
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
const PIN_DEMO = { code: '0000', rates: 0 };

/* Paresseux, comme `SCN_CFG()` (audit du 03/10) : la zone de la tondeuse porte
 * le nom de son interrupteur, et la langue de la maison n'est connue qu'à
 * `installerDemo`. Bâti à l'import, le planning annonçait « Pelouse avant »
 * à côté de la puce « Front lawn ». Les zones de l'aspirateur, elles, sont les
 * clés que le ROBOT publie (`rooms`) : françaises sur ses puces, elles le
 * restent ici. */
let ROB_CFG_ = null;
const ROB_CFG = () => (ROB_CFG_ || (ROB_CFG_ = {
  plannings: [
    { id: 'p-semaine', robot: 'vacuum.aspirateur', heure: '09:30', jours: [0, 1, 2, 3, 4], actif: true,
      zones: [{ id: 'salon', nom: lieu('Salon'), segments: [1] }, { id: 'cuisine', nom: lieu('Cuisine'), segments: [2] }] },
    { id: 'p-samedi', robot: 'vacuum.aspirateur', heure: '18:00', jours: [5], actif: true, zones: [] },
    { id: 'p-nuit', robot: 'vacuum.aspirateur', heure: '23:00', jours: [6], actif: false, zones: [] },
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

function robotsDemo(states) {
  return { config: copieRobots(), meteo: Object.keys(states).filter(id => id.startsWith('weather.')).sort()[0] || null, journal: [] };
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
 *   automatisations — l'installation de l'utilisateur ;
 * - `loggia` : aucune automatisation de repas, le planning de Loggia (deux
 *   repas, modifiables en mémoire) ;
 * - `petlibro` : un Petlibro au programme lisible ET une automatisation
 *   active — l'avertissement « deux sources », l'onglet Entretien rempli ;
 * - `rien` : le réservoir seul, aucune commande — « Loggia ne sait pas
 *   commander ce distributeur » ;
 * - `horsligne` : l'Aqara tombé (un Zigbee2MQTT hors ligne fait tomber toutes
 *   ses entités) — le liseré, et plus de « Distribuer ».
 * Chaque variante est une maison cohérente, pas un état bricolé : la fiche y
 * montre ce qu'elle montrerait chez quelqu'un. */
const VARIANTES_DIST = ['loggia', 'petlibro', 'rien', 'horsligne'];
let VARIANTE_DIST = 'aqara';
const estAqara = () => VARIANTE_DIST === 'aqara' || VARIANTE_DIST === 'loggia' || VARIANTE_DIST === 'horsligne';

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
    'select.distributeur_feed': [null, null], 'number.distributeur_portion': [null, 'config'],
    'sensor.distributeur_weight_per_day': [null, null], 'select.distributeur_mode': [null, 'config'],
    'sensor.distributeur_feeding_source': [null, 'diagnostic'], 'binary_sensor.distributeur_error': [null, 'diagnostic'],
    'switch.distributeur_child_lock': [null, 'config'],
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
  dist_petlibro: { fabricant: 'PETLIBRO', modele: 'PLAF103' },
};
const appareilDist = () => (VARIANTE_DIST === 'rien' ? null : VARIANTE_DIST === 'petlibro' ? 'dist_petlibro' : 'dist_cuisine');

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
  rien: [],
};
// Les grammes d'une portion : la portion de l'Aqara (45 g), un pas de Petlibro.
const G_PORTION_DIST = { aqara: 45, horsligne: 45, loggia: 45, petlibro: 12, rien: 0 };
const JOUR_MS = 86400000;
// Le Zigbee2MQTT de la variante `horsligne` est tombé il y a trois heures.
const TOMBE_DIST = Date.now() - 3 * 3600000;
// Ce que la démo a distribué depuis son ouverture (« Distribuer », planning).
const DIST_LIVE = [];

/** `HH:MM` il y a `n` jours (0 = aujourd'hui), en millisecondes, heure locale. */
const aHeureDist = (hhmm, n = 0) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, m, 0, 0);
  return d.getTime();
};
const minuitDist = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const isoDist = (t) => new Date(t).toISOString();

/** Les repas partis entre `t0` et `t1`, du plus ancien au plus récent : `{ t, portions, g, source }`. */
function passagesDistributeur(t0, t1) {
  const v = VARIANTE_DIST, g = G_PORTION_DIST[v] || 0, out = [];
  const fin = v === 'horsligne' ? Math.min(t1, TOMBE_DIST) : t1;
  const pousser = (t, portions, source) => { if (t >= t0 && t <= fin) out.push({ t, portions, g: portions * g, source }); };
  for (let n = Math.ceil((Date.now() - t0) / JOUR_MS) + 1; n >= 0; n--) {
    (PASSAGES_DIST[v] || []).forEach(([h, portions, source]) => {
      // Le repas de 18:30 d'avant-hier tombait pendant un redémarrage : RIEN,
      // noté « manqué » au journal (décision 4 de l'ADR 0155).
      if (v === 'loggia' && n === 2 && h === '18:30') return;
      pousser(aHeureDist(h, n), portions, source);
    });
    // Une ration donnée au bouton de l'appareil : « Manuel » dans l'historique.
    if ((v === 'aqara' || v === 'horsligne') && n === 2) pousser(aHeureDist('16:10', 2), 1, 'manual');
  }
  DIST_LIVE.forEach(e => { if (e.t >= t0 && e.t <= t1) out.push(e); });
  return out.sort((a, b) => a.t - b.t);
}

/** Le dernier déclenchement d'une automatisation à heures fixes, en ISO. */
const dernierDeclenchement = (heures) => {
  const t = Math.max(...heures.map(h => (aHeureDist(h, 0) <= Date.now() ? aHeureDist(h, 0) : aHeureDist(h, 1))));
  return isoDist(t);
};

/* Les états du distributeur, selon la variante. Bâtis à l'installation : la
 * langue est connue (`s()` traduit), le compteur du jour est la somme des
 * repas déjà partis aujourd'hui, et la source du dernier repas la sienne. */
function etatsDistributeur() {
  const v = VARIANTE_DIST, out = {};
  const maintenant = Date.now();
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
      'sensor.distributeur_weight_per_day': s(e(gJour), { friendly_name: 'Croquettes distribuées aujourd’hui', unit_of_measurement: 'g', state_class: 'total_increasing' }),
      // Mode manuel : les créneaux de l'appareil ne partent pas, ce sont ses automatisations qui distribuent.
      'select.distributeur_mode': s(e('manual'), { friendly_name: 'Mode de distribution', options: ['schedule', 'manual'] }),
      'sensor.distributeur_feeding_source': s(e(dernier ? dernier.source : 'remote'), { friendly_name: 'Source du dernier repas' }),
      'binary_sensor.distributeur_error': s(e('off'), { friendly_name: 'Erreur du distributeur', device_class: 'problem' }),
      'switch.distributeur_child_lock': s(e('off'), { friendly_name: 'Verrouillage enfant' }),
    });
  }
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
  if (v !== 'loggia' && v !== 'rien') {
    out['automation.croquettes_matin_et_soir'] = s('on', { friendly_name: 'Croquettes matin et soir', id: '1728000000001', last_triggered: dernierDeclenchement(['07:30', '19:00']) });
  }
  if (v === 'aqara' || v === 'horsligne') {
    out['automation.croquettes_du_midi'] = s('off', { friendly_name: 'Croquettes du midi', id: '1728000000002', last_triggered: null });
  }
  out['automation.alerte_bac_presque_vide'] = s('on', { friendly_name: 'Alerte bac presque vide', id: '1728000000003', last_triggered: ilYaMin(2 * 1440 + 300) });
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
  if (v === 'horsligne') Object.keys(DISTRIBUTEURS_DEMO.dist_cuisine[1]).forEach(id => dater(id, TOMBE_DIST));
  else {
    ['sensor.distributeur_weight_per_day', 'sensor.granary_today_feeding_quantity_weight'].forEach(id => dater(id, finJour));
    dater('sensor.distributeur_feeding_source', depuis);
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
  if (!estAqara()) return rien;
  // Aqara sous Zigbee2MQTT : le MODE dit tout, la liste de créneaux n'est pas publiée ici.
  const mode = ((states['select.distributeur_mode'] || {}).state || '').toLowerCase();
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
    module: 'distributeurs', regle: 'repas', quoi, cibles: quoi === 'distribuer' ? ['select.distributeur_feed'] : [], n: quoi === 'distribuer' ? 1 : 0,
    motif: [['repas {heure}', { heure }]], detail, simule: false, ts: (aHeureDist(heure, n) + decale) / 1000 });
  let lignes = [];
  if (v === 'loggia') {
    for (let n = 0; n <= 3; n++) {
      ['08:00', '18:30'].forEach(h => {
        if (aHeureDist(h, n) > Date.now()) return;
        // Le redémarrage d'avant-hier : noté au démarrage du module, rien n'est parti.
        lignes.push(n === 2 && h === '18:30' ? ligne(n, h, 'retenu', 'manque au redemarrage', 12 * 60000) : ligne(n, h, 'distribuer', ''));
      });
    }
  } else if (v === 'aqara' || v === 'horsligne') {
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
export function maisonDistributeurDemo(variante) {
  VARIANTE_DIST = VARIANTES_DIST.indexOf(variante) >= 0 ? variante : 'aqara';
  DIS_CFG_ = null;
  const states = etatsInitiaux();
  return {
    states, feeder: feederDemo(), index: indexDemo(states),
    etat: (feeder) => distributeursDemo(states, feeder === undefined ? feederDemo() : feeder),
    historique: (chemin) => historiqueDemo(chemin, states),
    patch: distributeursPatch,
  };
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
  ['sensor.distributeur_feeding_source', 'source'], ['sensor.granary_last_feed_time', 'dernier'],
  ['automation.croquettes_matin_et_soir', 'auto'], ['automation.croquettes_du_midi', 'auto'],
  ['input_number.croquettes_reservoir', 'reservoir'],
]);
// Le bac a été rempli il y a six jours, à 10 h ; il était presque vide.
const REMPLI_DIST = () => aHeureDist('10:00', 6);
function historiqueDistributeurDemo(ids, chemin, states) {
  const d = chemin.match(/history\/period\/([^?]+)/);
  const f = chemin.match(/end_time=([^&]+)/);
  const t1 = Math.min(Date.now(), f ? Date.parse(decodeURIComponent(f[1])) || Date.now() : Date.now());
  const t0 = Math.max(d ? Date.parse(decodeURIComponent(d[1])) || 0 : 0, Date.now() - 10 * JOUR_MS);
  const attributs = chemin.indexOf('no_attributes') < 0;
  const avant = passagesDistributeur(minuitDist(t0) - 3 * JOUR_MS, t0 - 1);
  const dedans = passagesDistributeur(t0, t1);
  const tombe = VARIANTE_DIST === 'horsligne' && TOMBE_DIST >= t0 && TOMBE_DIST <= t1 ? TOMBE_DIST : null;
  const listes = [];
  ids.forEach(id => {
    const genre = SERIES_DIST.get(id);
    if (!states[id]) return;
    // Une entité qui n'est pas du distributeur : la courbe générique, une par une.
    if (!genre) { const [l] = historiqueDemo('history/period/' + isoDist(t0) + '?filter_entity_id=' + encodeURIComponent(id), states); if (l && l.length) { l[0].entity_id = id; listes.push(l); } return; }
    const pts = [];
    const point = (state, t, extra) => pts.push({ state: String(state), last_changed: isoDist(t), ...(extra || {}) });
    if (genre === 'compteur') {
      let v = avant.filter(e => e.t >= minuitDist(t0)).reduce((a, e) => a + e.g, 0);
      point(v, t0);
      let jour = minuitDist(t0);
      dedans.forEach(e => {
        // La remise à zéro de minuit, avant le premier repas du jour.
        if (minuitDist(e.t) !== jour) { jour = minuitDist(e.t); if (v !== 0) { v = 0; point(0, jour); } }
        v += e.g; point(v, e.t);
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
      if (st.state === 'on') for (let n = Math.ceil((Date.now() - t0) / JOUR_MS) + 2; n >= 0; n--) a.heures.forEach(h => { const t = aHeureDist(h, n); if (t <= t1) fois.push(t); });
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
  ]);
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
   * `distributeur=loggia|petlibro|rien|horsligne`, la variante du distributeur
   * (ADR 0155), et `compte=ordinaire`, un compte Home Assistant sans droits
   * d'administration — ce qu'il ne peut pas faire doit disparaître de l'écran
   * (ADR 0144), et le faux serveur le refuse comme `require_admin`. Lus AVANT
   * la maison : ses états et sa configuration en dépendent. */
  let ordinaire = false;
  try {
    const q = new URLSearchParams(window.location.search);
    if (VARIANTES_DIST.indexOf(q.get('distributeur')) >= 0) VARIANTE_DIST = q.get('distributeur');
    ordinaire = q.get('compte') === 'ordinaire';
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
  const toucher = (id, patch, attrs) => {
    // entity_id à la manière de HA : une chaîne ou un tableau d'ids.
    if (Array.isArray(id)) { id.forEach(x => toucher(x, patch, attrs)); return; }
    const cur = states[id]; if (!cur) return;
    states[id] = { state: patch != null ? String(patch) : cur.state, attributes: { ...cur.attributes, ...(attrs || {}) }, last_updated: maintenant(), last_changed: maintenant() };
    el.hass = { ...el.hass, states };
  };
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
      if (service === 'turn_on') toucher(id, 'on');
      else if (service === 'turn_off') toucher(id, 'off');
      else if (service === 'toggle') toucher(id, states[id] && states[id].state === 'on' ? 'off' : 'on');
    } else if (domaine === 'number' || domaine === 'input_number') {
      if (service === 'set_value') toucher(id, data.value);
    } else if (domaine === 'cover') {
      if (service === 'open_cover') toucher(id, 'open', { current_position: 100 });
      else if (service === 'close_cover') toucher(id, 'closed', { current_position: 0 });
      else if (service === 'set_cover_position') toucher(id, (data.position || 0) > 0 ? 'open' : 'closed', { current_position: data.position || 0 });
    } else if (domaine === 'climate') {
      if (service === 'set_temperature') toucher(id, null, { temperature: data.temperature });
      else if (service === 'set_hvac_mode') toucher(id, data.hvac_mode, { hvac_action: data.hvac_mode === 'off' ? 'off' : 'heating' });
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
      const cible = { start_mowing: 'mowing', start: 'cleaning', pause: 'paused',
        dock: 'returning', return_to_base: 'returning', stop: 'idle' }[service];
      if (cible) {
        toucher(id, cible);
        // Un robot qui rentre met du temps : sans ce delai la demonstration
        // sauterait l etape que la fiche sert justement a montrer.
        if (cible === 'returning') setTimeout(() => toucher(id, 'docked'), 4000);
      } else if (service === 'set_fan_speed') toucher(id, null, { fan_speed: data.fan_speed });
    } else if (domaine === 'lock') {
      // Une serrure motorisee met deux bonnes secondes : sans ce passage par
      // `locking`, la demo montrerait un mouvement instantane qui n'existe pas.
      const lid = id || 'lock.porte_entree';
      const vise = service === 'lock' ? 'locked' : 'unlocked';
      toucher(lid, vise === 'locked' ? 'locking' : 'unlocking');
      setTimeout(() => toucher(lid, vise), 2000);
    } else if (domaine === 'media_player' && service === 'media_play_pause') {
      toucher(id, states[id] && states[id].state === 'playing' ? 'paused' : 'playing');
    } else if (domaine === 'select' && service === 'select_option' && /^select\.distributeur_/.test(String(id))) {
      /* Le distributeur (ADR 0155). START sur le select feed d'un Aqara
       * distribue sans que le select change d'état — Zigbee2MQTT le laisse
       * vide ; le mode, lui, change, et le programme de la fiche avec. Un
       * appareil tombé ne répond pas. */
      const opt = (data || {}).option;
      if (!states[id] || states[id].state === 'unavailable') return Promise.resolve();
      if (id === 'select.distributeur_feed') { if (opt === 'START') distribuerDemo(1); }
      else if (opt != null) toucher(id, opt);
    } else if (domaine === 'button' && service === 'press' && /^button\.granary_/.test(String(id))) {
      // L'état d'un bouton est l'heure du dernier appui, comme dans Home Assistant.
      toucher(id, maintenant());
      if (id === 'button.granary_manual_feed') distribuerDemo(Number((states['number.granary_manual_feed_quantity'] || {}).state) || 1);
      if (id === 'button.granary_desiccant_reset') toucher('sensor.granary_remaining_desiccant', 30);
    }
    return Promise.resolve();
  };
  /* Une ration partie de l'écran : le compteur du jour monte, l'historique la
   * garde (`DIST_LIVE`), et l'appareil dit d'où elle vient. */
  const distribuerDemo = (portions) => {
    const petlibro = VARIANTE_DIST === 'petlibro';
    const g1 = petlibro ? G_PORTION_DIST.petlibro : (Number((states['number.distributeur_portion'] || {}).state) || G_PORTION_DIST.aqara);
    const e = { t: Date.now(), portions, g: portions * g1, source: 'remote' };
    DIST_LIVE.push(e);
    const compteur = petlibro ? 'sensor.granary_today_feeding_quantity_weight' : 'sensor.distributeur_weight_per_day';
    if (states[compteur]) toucher(compteur, (Number(states[compteur].state) || 0) + e.g);
    if (petlibro) toucher('sensor.granary_last_feed_time', isoDist(e.t));
    else toucher('sensor.distributeur_feeding_source', 'remote');
  };

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
    config: { latitude: 48.8566, longitude: 2.3522, time_zone: 'Europe/Paris' },
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
        return Promise.resolve({ config: voletsPatch(msg.patch) });
      }
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
      if (msg && msg.type === 'loggia/pin/verifier') {
        if (String(msg.pin) === PIN_DEMO.code) { PIN_DEMO.rates = 0; return Promise.resolve({ ok: true }); }
        PIN_DEMO.rates += 1;
        return Promise.resolve({ ok: false, bloque: PIN_DEMO.rates >= 5 ? 60 : 0 });
      }
      if (msg && msg.type === 'loggia/pin/definir') { PIN_DEMO.code = String(msg.pin); return Promise.resolve({ defini: true }); }
      /* Les minuteurs d'extinction, comme le vrai composant (`minuteurs.py`) :
       * une heure de fin par appareil, et l'heure du serveur pour le décompte. */
      if (msg && msg.type === 'loggia/minuteurs/etat') return Promise.resolve(minuteursDemo());
      if (msg && msg.type === 'loggia/minuteurs/poser') return Promise.resolve(minuteursPoser(msg.entity_id, msg.minutes));
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
      if (msg && msg.type === 'loggia/robots/etat') return Promise.resolve(robotsDemo(states));
      if (msg && msg.type === 'loggia/robots/config') return Promise.resolve({ config: robotsPatch(msg.patch) });
      /* Le distributeur (ADR 0155) : l'état, ouvert à tout compte, et le
       * planning de Loggia, réservé aux administrateurs (`require_admin`). La
       * configuration est relue au magasin mémoire à chaque appel. */
      if (msg && msg.type === 'loggia/distributeurs/etat') return Promise.resolve(distributeursDemo(states, lireCfgDemo('loggia_feeder')));
      if (msg && msg.type === 'loggia/distributeurs/config') {
        if (ordinaire) return Promise.reject({ code: 'unauthorized', message: 'Unauthorized' });
        try { return Promise.resolve({ config: distributeursPatch(msg.patch), etat: distributeursDemo(states, lireCfgDemo('loggia_feeder')) }); }
        catch (e) { return Promise.reject(e); }
      }
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
