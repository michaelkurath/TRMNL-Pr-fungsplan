# Prüfungsplan – privates TRMNL-Plugin

Schulprüfungen nach Fach auf dem ePaper-Display. Datenquelle: privates Google Sheet.

## Einrichtung
1. Ein Google Sheet erstellen und über **Erweiterungen → Apps Script** den Code aus [google-apps-script/Code.gs](google-apps-script/Code.gs) einfügen.
2. Die Apps-Script-Zeitzone auf **Europe/Zurich** einstellen. Einmal `setup()` ausführen und Berechtigungen gewähren. Das Blatt **Pruefungen** wird mit **Datum | Fach | Thema | Notiz | Status** erstellt. Datum als echtes Tabellen-Datum eingeben; Status **Offen** oder **Erledigt**.
3. TRMNL: **Private Plugin → Webhook** anlegen. Falls GitHub Sync aktiv ist, Markup-Dateien unter [src/](src/) bearbeiten/synchronisieren: `full.liquid`, `half_horizontal.liquid`, `half_vertical.liquid`, `quadrant.liquid`.
4. Die geheime TRMNL-Webhook-URL aus dem Plugin kopieren. In Google Sheets neu laden, dann Menü **Prüfungsplan → Webhook verbinden** verwenden.
5. Über **Jetzt synchronisieren** einen Test senden; TRMNL-Playlist und Gerätevorschau prüfen.

## Datenfluss und Datenschutz
Privates Google Sheet → gebundenes Apps Script → privater TRMNL-Webhook → TRMNL-Display. **Keine öffentliche Sheet-Freigabe nötig**. Prüfungsdaten werden an TRMNL übertragen und dort gespeichert. Webhook-URL wie Passwort behandeln; niemals URL, Schülername oder tatsächliche Termine ins öffentliche Repository committen.

## Logik
- Vergangene und als **Erledigt** markierte Prüfungen ausblenden.
- Fachgruppen; aufsteigendes Datum innerhalb eines Fachs.
- Countdown: heute/morgen/in N Tagen.
- Automatische Übermittlung bei Änderungen (mindestens fünf Minuten Abstand) und alle sechs Stunden.
- Maximale Datenmenge: zehn Fächer, pro Fach sechs Prüfungen; kleinere Layouts zeigen weniger.
- Keine realen Prüfungstermine im Code. Der Editor und Geräte-Render wurden **noch nicht live getestet**.

## Entwicklung
Die bestehenden TRMNL-GitHub-Sync-Dateien bleiben erhalten. Optional lokal mit `trmnlp serve` testen.
