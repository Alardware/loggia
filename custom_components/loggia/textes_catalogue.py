"""Genere par `node scripts/textes_serveur.mjs` depuis src/langues/ — ne pas editer a la main."""
import json

TEXTES: dict[str, dict[str, str]] = json.loads(r"""
{
  "en": {
    "Loggia — sûreté": "Loggia — safety",
    "Fumée détectée : {nom}": "Smoke detected: {nom}",
    "Gaz détecté : {nom}": "Gas detected: {nom}",
    "Monoxyde de carbone détecté : {nom}": "Carbon monoxide detected: {nom}",
    "Fuite d’eau détectée : {nom}": "Water leak detected: {nom}",
    "Alerte de sûreté : {nom}": "Safety alert: {nom}",
    "Alarme déclenchée : {nom}": "Alarm triggered: {nom}",
    "Ouverture pendant que l’alarme est armée : {nom}": "Opened while the alarm is armed: {nom}",
    "{nom} : {v} ppm, il faut aerer": "{nom}: {v} ppm, time to air the room",
    "{nom} : pile a {v} %": "{nom}: battery at {v} %",
    "{nom} : {reste} restant, a remplacer": "{nom}: {reste} left, replace it",
    "Heures creuses : c’est le moment de lancer les machines": "Off-peak hours: time to run the machines"
  },
  "de": {
    "Loggia — sûreté": "Loggia — Sicherheit",
    "Fumée détectée : {nom}": "Rauch erkannt: {nom}",
    "Gaz détecté : {nom}": "Gas erkannt: {nom}",
    "Monoxyde de carbone détecté : {nom}": "Kohlenmonoxid erkannt: {nom}",
    "Fuite d’eau détectée : {nom}": "Wasserleck erkannt: {nom}",
    "Alerte de sûreté : {nom}": "Sicherheitswarnung: {nom}",
    "Alarme déclenchée : {nom}": "Alarm ausgelöst: {nom}",
    "Ouverture pendant que l’alarme est armée : {nom}": "Öffnung bei scharfem Alarm: {nom}",
    "{nom} : {v} ppm, il faut aerer": "{nom}: {v} ppm, bitte lüften",
    "{nom} : pile a {v} %": "{nom}: Batterie bei {v} %",
    "{nom} : {reste} restant, a remplacer": "{nom}: noch {reste}, bitte ersetzen",
    "Heures creuses : c’est le moment de lancer les machines": "Niedertarif: jetzt die Maschinen anwerfen"
  },
  "nl": {
    "Loggia — sûreté": "Loggia — veiligheid",
    "Fumée détectée : {nom}": "Rook gedetecteerd: {nom}",
    "Gaz détecté : {nom}": "Gas gedetecteerd: {nom}",
    "Monoxyde de carbone détecté : {nom}": "Koolmonoxide gedetecteerd: {nom}",
    "Fuite d’eau détectée : {nom}": "Waterlek gedetecteerd: {nom}",
    "Alerte de sûreté : {nom}": "Veiligheidswaarschuwing: {nom}",
    "Alarme déclenchée : {nom}": "Alarm afgegaan: {nom}",
    "Ouverture pendant que l’alarme est armée : {nom}": "Geopend terwijl het alarm is ingeschakeld: {nom}",
    "{nom} : {v} ppm, il faut aerer": "{nom}: {v} ppm, tijd om te luchten",
    "{nom} : pile a {v} %": "{nom}: batterij op {v} %",
    "{nom} : {reste} restant, a remplacer": "{nom}: {reste} over, vervangen",
    "Heures creuses : c’est le moment de lancer les machines": "Daluren: tijd om de machines te starten"
  },
  "it": {
    "Loggia — sûreté": "Loggia — sicurezza",
    "Fumée détectée : {nom}": "Fumo rilevato: {nom}",
    "Gaz détecté : {nom}": "Gas rilevato: {nom}",
    "Monoxyde de carbone détecté : {nom}": "Monossido di carbonio rilevato: {nom}",
    "Fuite d’eau détectée : {nom}": "Perdita d’acqua rilevata: {nom}",
    "Alerte de sûreté : {nom}": "Allerta di sicurezza: {nom}",
    "Alarme déclenchée : {nom}": "Allarme scattato: {nom}",
    "Ouverture pendant que l’alarme est armée : {nom}": "Apertura con l’allarme inserito: {nom}",
    "{nom} : {v} ppm, il faut aerer": "{nom}: {v} ppm, bisogna arieggiare",
    "{nom} : pile a {v} %": "{nom}: batteria al {v}%",
    "{nom} : {reste} restant, a remplacer": "{nom}: {reste} rimasto, da sostituire",
    "Heures creuses : c’est le moment de lancer les machines": "Fascia economica: è il momento di avviare gli elettrodomestici"
  },
  "es": {
    "Loggia — sûreté": "Loggia — seguridad",
    "Fumée détectée : {nom}": "Humo detectado: {nom}",
    "Gaz détecté : {nom}": "Gas detectado: {nom}",
    "Monoxyde de carbone détecté : {nom}": "Monóxido de carbono detectado: {nom}",
    "Fuite d’eau détectée : {nom}": "Fuga de agua detectada: {nom}",
    "Alerte de sûreté : {nom}": "Alerta de seguridad: {nom}",
    "Alarme déclenchée : {nom}": "Alarma disparada: {nom}",
    "Ouverture pendant que l’alarme est armée : {nom}": "Apertura con la alarma armada: {nom}",
    "{nom} : {v} ppm, il faut aerer": "{nom}: {v} ppm, hay que ventilar",
    "{nom} : pile a {v} %": "{nom}: pila al {v} %",
    "{nom} : {reste} restant, a remplacer": "{nom}: queda {reste}, hay que sustituirlo",
    "Heures creuses : c’est le moment de lancer les machines": "Horas valle: es el momento de poner las máquinas"
  },
  "pl": {
    "Loggia — sûreté": "Loggia — bezpieczeństwo",
    "Fumée détectée : {nom}": "Wykryto dym: {nom}",
    "Gaz détecté : {nom}": "Wykryto gaz: {nom}",
    "Monoxyde de carbone détecté : {nom}": "Wykryto czad: {nom}",
    "Fuite d’eau détectée : {nom}": "Wykryto wyciek wody: {nom}",
    "Alerte de sûreté : {nom}": "Alert bezpieczeństwa: {nom}",
    "Alarme déclenchée : {nom}": "Alarm wyzwolony: {nom}",
    "Ouverture pendant que l’alarme est armée : {nom}": "Otwarcie przy uzbrojonym alarmie: {nom}",
    "{nom} : {v} ppm, il faut aerer": "{nom}: {v} ppm, trzeba przewietrzyć",
    "{nom} : pile a {v} %": "{nom}: bateria {v} %",
    "{nom} : {reste} restant, a remplacer": "{nom}: zostało {reste}, do wymiany",
    "Heures creuses : c’est le moment de lancer les machines": "Taryfa nocna: pora włączyć pralkę lub zmywarkę"
  }
}
""")
