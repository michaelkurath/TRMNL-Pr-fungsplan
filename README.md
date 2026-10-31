# Prüfungsplan – privates TRMNL-Plugin

Schulprüfungen **chronologisch** auf dem TRMNL, Erfassung am Smartphone über **Google Forms**, Datensammlung in einem **privaten Google Sheet**, druckfertige A4-Liste. Das TRMNL-Plugin wird über einen bestehenden privaten Webhook aktualisiert.

## So funktioniert es

TRMNL-QR-Code → Google Form (Datum, Fach, Thema, optionale Notiz) → Tabellenblatt `Formularantworten 1` (Rohdaten) → Apps-Script-Form-Trigger → `Pruefungen` (Hauptliste) → TRMNL-Webhook. Die Druckvorlage nimmt die Termine direkt aus der Hauptliste und ist automatisch aktuell.

**Bestehende Tabellenwerte und die Webhook-Verbindung bleiben erhalten.** Die Umstellung erstellt ein neues Google-Formular; die frühere eigene Web-App wird nicht mehr benutzt.

## Einmalige Umstellung (bestehendes Sheet)

1. Bestehendes Google Sheet öffnen, dann **Erweiterungen → Apps Script**.
2. Den Inhalt der bestehenden `Code.gs` durch [google-apps-script/Code.gs](google-apps-script/Code.gs) ersetzen und speichern. Projekt-Zeitzone: **Europe/Zurich**.
3. Die Funktion `setup()` einmal ausführen und Berechtigungen bestätigen. Die bestehenden Prüfungen werden nicht gelöscht.
4. Die Funktion `setupGoogleForm()` einmal ausführen und die erforderlichen Google-Forms-Berechtigungen genehmigen. Das Script erstellt automatisch das Google-Formular mit den Fragen **Datum**, **Fach**, **Thema** und **Notiz**, verknüpft seine Antworten mit dem bestehenden Spreadsheet und installiert einen Formular-Submit-Trigger.
5. Alternativ nach `setup()` Google Sheets neu laden und im Menü **Prüfungsplan → Google Formular einrichten** wählen. Das Formular wird beim nächsten Aufruf wiederverwendet; es entsteht kein neues Duplikat.
6. Der Antwort-Link wird automatisch an TRMNL als `form_url` übertragen. Unter TRMNL die GitHub-Synchronisierung und Anzeige aktualisieren; der QR-Code auf allen vier Layouts führt nun zum Google-Formular.
7. Mit dem Smartphone einen **Testtermin in der Zukunft** eintragen. Im Blatt **Pruefungen** muss eine Zeile mit Status `Offen` erscheinen. Die neue Formularantwort erscheint ebenfalls in einem separaten Antwort-Tab.
8. Anschliessend unter **Prüfungsplan → Jetzt synchronisieren** manuell testen, wenn das Display noch alte Daten zeigt.

**Wichtig:** Nur wenn `setupGoogleForm()` erfolgreich gelaufen ist, funktioniert das Formular. Der QR-Link wird erst dann auf die Google-Forms-Adresse umgestellt. Die alte `MobileForm.html` wurde aus dem Repository entfernt.

## QR-Code auch ohne Google-Formular

Solange noch kein Google-Formular eingerichtet wurde, wird **ein QR-Code zum bestehenden privaten Google Sheet** übertragen und auf TRMNL mit **„TABELLE ÖFFNEN“** beschriftet. Das ermöglicht vorübergehend die direkte Eingabe ins Hauptblatt (nur mit bestehendem Google-Zugriffsrecht). Sobald `setupGoogleForm()` ausgeführt wurde, wechselt derselbe QR-Code zu **„NEUE PRÜFUNG“** und öffnet das Google-Formular.

**Bei Umstieg vom früheren Script:** Den aktuellen Inhalt von `Code.gs` ins gebundene Apps Script kopieren, speichern, im Google Sheet **Prüfungsplan → Jetzt synchronisieren** ausführen und danach die TRMNL-GitHub-Synchronisierung/Force-Refresh auslösen. Nur das GitHub-Liquid-Layout zu aktualisieren reicht nicht; die neue QR-URL kommt aus dem Apps Script via Webhook.

## A4-Druckvorlage

Das bestehende Tabellenblatt **Druckvorlage** enthält jetzt eine Live-Formel: Es zeigt die nächsten **18** offenen Prüfungstermine (Datum, Fach, Thema, Notiz) in chronologischer Reihenfolge und darunter **10 leere Zeilen** für handschriftliche Ergänzungen.

**Google Sheets → Druckvorlage → Datei → Drucken → Ausgewählte Zellen A1:E33 → Querformat → An Seitenbreite anpassen.** Optional das Blatt über **Prüfungsplan → Druckvorlage aktualisieren** neu gestalten. Druckvorlage ist nur zum Drucken – Einträge immer über das Formular oder im Blatt `Pruefungen` machen.

## TRMNL-Listenansicht

Alle vier Bildschirmformate verwenden eine **einspaltige, chronologische Liste** (keine Kacheln / Fachgruppen). Jede Zeile zeigt links das Datum, daneben Schulfach in gross und fett, darunter das Prüfungsthema sowie einen Countdown. Der QR-Code für neue Prüfungen bleibt rechts sichtbar, sobald die Formular-URL eingerichtet ist. Die standardmässige TRMNL-Title-Bar steht ausserhalb des Inhaltslayouts. Aus Platzgründen werden in Full bis 7, Half Horizontal 3, Half Vertical 5 und Quadrant 2 Prüfungen dargestellt.

## Funktionen

- Datum, Fach und Thema auf TRMNL; Countdown und QR-Code
- Sortiert nach Datum, bei Gleichstand nach Schulfach
- Vergangene und `Erledigt`-Termine ausgeblendet
- Bei Form-Absendung automatisch ins Hauptblatt übernommen und an TRMNL gesendet
- Bestehende editierbare Hauptliste `Pruefungen` bleibt erhalten
- Bestehende Webhook-Konfiguration muss **nicht** erneut eingegeben werden
- Manuelle Synchronisierung im Sheet und periodische Synchronisierung alle sechs Stunden

## Datenschutz und Berechtigungen

Das Google Sheet ist privat. Der QR-Code enthält **nur den Formular-Link**, niemals die TRMNL-Webhook-URL. Google Forms speichert Antworten auch in einem separaten Antwort-Tab. Wer den Formular-Link besitzt und Antwortrechte hat, kann neue Prüfungen eintragen; wähle bei Bedarf im Formular die **Freigabe/Responder-Berechtigungen** passend für eure Familie. Das Formular ist ohne solche Beschränkung **kein authentifiziert privates Eingabesystem**. Der Schutz durch den früheren eigenen Zugangscode entfällt.

Wenn die frühere eigene Apps-Script-Web-App noch als Bereitstellung aktiv ist, diese in Apps Script unter **Bereitstellungen verwalten** deaktivieren/archivieren. Der aktualisierte Script-Code löscht beim Einrichten des neuen Formulars die alten Zugangscode-Hashes aus den Projekteigenschaften.

## Technische Hinweise

- Google Form erzeugt automatisch einen eigenen Tab für Rohantworten. Der Formular-Trigger übernimmt Antworten in `Pruefungen`, denn ein normaler `onEdit`-Trigger reagiert nicht auf Form-Absendungen.
- Der Trigger `onExamFormSubmit` ist gegen doppelte Verarbeitung desselben Antwort-IDs geschützt.
- Bei fehlgeschlagenem TRMNL-Push bleibt die Prüfung im Sheet und lässt sich später manuell synchronisieren.
- `setupGoogleForm()` übernimmt bestehende Fachbezeichnungen aus der Hauptliste (z. B. **RZG**, **RKE**, **Kochen**) in die Auswahl.
- Eigene Fächer kannst du später direkt in der Google-Forms-Editoransicht ergänzen.
- Kein externes QR-Code-Drittanbieter-API: QR wird mit dem TRMNL-Liquid-Filter `qr_code` erzeugt.

## Teststatus

Die A4-Live-Formel wurde im bestehenden Google Sheet eingetragen und durch Auslesen der berechneten Zellen geprüft. Das Google-Forms-Erstellungsscript und der Form-Trigger müssen nach dem Einfügen in Google Apps Script unter dem persönlichen Google-Konto **einmal real ausgeführt und mit einem Testeintrag geprüft werden**. QR-Erkennung und Darstellung auf TRMNL-Geräten sind noch nicht live bestätigt.
