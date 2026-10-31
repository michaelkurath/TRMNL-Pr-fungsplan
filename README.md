# Prüfungsplan – privates TRMNL-Plugin

Chronologische Anzeige der nächsten Schulprüfungen mit Datum, Fach, Thema und Countdown. Google Sheets ist die Datenquelle; das TRMNL-Plugin wird über einen privaten Webhook aktualisiert.

**Neu: Ein QR-Code auf dem TRMNL führt direkt zu einem mobilen Eingabeformular.** Die neuen Prüfungen werden im bestehenden Sheet gespeichert und anschliessend an TRMNL übertragen.

## Bestehendes Google Sheet auf QR-Eingabe umstellen

1. In der bestehenden Tabelle **Erweiterungen → Apps Script** öffnen.
2. Den bisherigen Inhalt von `Code.gs` vollständig durch [google-apps-script/Code.gs](google-apps-script/Code.gs) ersetzen.
3. Mit **+ → HTML** eine neue Datei **MobileForm** erstellen. Den kompletten Inhalt von [google-apps-script/MobileForm.html](google-apps-script/MobileForm.html) dort einfügen.
4. Alles speichern und in Apps Script `setup()` einmal ausführen. Es aktualisiert nur Kopfzeile, Validierung und Trigger und speichert die Spreadsheet-ID; bestehende Prüfungstermine bleiben erhalten. Projekt-Zeitzone: **Europe/Zurich**.
5. Google Sheet neu laden. Unter **Prüfungsplan → QR-Formular: Zugangscode festlegen** einen **privaten Code mit mindestens acht Zeichen** bestimmen. Dieser Code erscheint **nicht** im QR-Code und darf **nicht** in GitHub stehen.
6. In Apps Script **Bereitstellen → Neue Bereitstellung → Typ: Web-App** wählen:
   - **Ausführen als:** Ich (der Tabellenbesitzer).
   - **Zugriff:** Jeder (öffentlich erreichbare Formularseite). Schreibzugriffe erfordern trotzdem den privaten Zugangscode. Optional die Auswahl **Jeder mit Google-Konto**, falls alle Benutzer ein Google-Konto haben und eine Anmeldung akzeptieren.
   - Bereitstellung und Google-Berechtigungen bestätigen. Die angezeigte **Web-App-URL** mit `/exec` am Ende kopieren. Nicht die Test-URL mit `/dev` verwenden.
7. Im Google Sheet **Prüfungsplan → QR-Formular: URL verbinden** wählen und diese URL einfügen. Das Script synchronisiert sie automatisch an TRMNL.
8. Das TRMNL-Plugin via **GitHub Sync** aktualisieren und die Anzeige / Vorschau neu laden. Der QR-Code erscheint rechts neben den chronologisch sortierten Prüfungen.
9. QR-Code mit dem Smartphone scannen, Datum, Fach, Thema, optionale Notiz und Zugangscode eingeben. **Prüfung speichern** wählen. Das Ergebnis erscheint nach dem nächsten Display-Refresh.

Die bereits konfigurierte **TRMNL-Webhook-URL** muss nicht erneut eingegeben werden. Wenn der QR-Code fehlt, `FORM_URL` über **QR-Formular: URL verbinden** setzen und anschliessend **Jetzt synchronisieren** wählen.

**Bei späteren Änderungen an Apps Script** eine neue Web-App-Version über **Bereitstellungen verwalten → Bearbeiten → Neue Version** bereitstellen. Das Überschreiben des Codes alleine aktualisiert eine bereits veröffentlichte Version nicht.

## Datenblätter

- **Pruefungen:** Datum | Fach | Thema | Notiz | Status. Status: `Offen` oder `Erledigt`.
- **Druckvorlage:** Menü **Prüfungsplan → Druckvorlage erstellen**. Bereits bekannte Prüfungen und mindestens zwölf leere Zeilen zum handschriftlichen Ergänzen. Druck im Querformat, aktuelles Tabellenblatt.

## Datensicherheit

- Google Sheet muss **nicht öffentlich freigegeben** werden.
- Die Google Apps Script **Formular-Webseite ist bei Zugriff „Jeder“ öffentlich aufrufbar**, aber ohne separaten Zugangscode nicht beschreibbar.
- Webhook-URL und gehashter Zugangscode bleiben in den Apps-Script-Properties. Keine Anmeldedaten im Repository, QR-Code oder Payload.
- Die Browser-Eingaben und der Zugangscode werden über HTTPS an Google Apps Script übergeben; der Zugangscode wird nicht in die Tabelle geschrieben. Fehlversuche werden begrenzt.
- Die Prüfungstermine werden beim Synchronisieren an TRMNL übertragen und liegen dort ebenfalls vor.
- QR-Code verwendet den nativen TRMNL-`qr_code`-Liquid-Filter, **keinen externen QR-Dienst**.

## Funktionslogik

- Nur heutige und zukünftige, nicht erledigte Termine werden übertragen.
- Chronologisch nach Datum; bei gleichem Datum Fach/Thema alphabetisch.
- Countdown heute / morgen / in N Tagen.
- Änderungen im Sheet (gedrosselt) und zeitgesteuerte Synchronisierung alle sechs Stunden.
- Einträge aus dem Smartphone-Formular lösen die Synchronisierung direkt aus. Falls sie fehlschlägt, bleibt die Prüfung im Sheet gespeichert und kann später über **Jetzt synchronisieren** übertragen werden.
- TRMNL-Layouts in `src/full.liquid`, `src/half_horizontal.liquid`, `src/half_vertical.liquid` und `src/quadrant.liquid`.

## Teststatus

Die JavaScript-Syntax und die Struktur der Layout-Dateien wurden geprüft. **Die echte Google Apps Script-Bereitstellung, die Formularübertragung und die QR-Lesbarkeit auf dem ePaper-Gerät sind noch nicht live getestet.** Dazu sind die persönliche Google-Bereitstellung und eine TRMNL-Geräteaktualisierung erforderlich.
