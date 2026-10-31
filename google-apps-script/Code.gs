// Private exam planner: Google Sheet -> TRMNL webhook. Project timezone: Europe/Zurich.
const TAB='Pruefungen';
const ORDER=['Mathematik','Deutsch','Englisch','Französisch','NMG','Geschichte','Geografie','Biologie','Physik','Chemie','Informatik','Musik','Sport','Andere'];
function setup(){
 const ss=SpreadsheetApp.getActiveSpreadsheet();
 PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID',ss.getId());
 let s=ss.getSheetByName(TAB)||ss.insertSheet(TAB);
 s.getRange('A1:E1').setValues([['Datum','Fach','Thema','Notiz','Status']]);
 s.setFrozenRows(1);s.getRange('A:A').setNumberFormat('dd.MM.yyyy');
 s.getRange('A1:E1').setBackground('#172d40').setFontColor('#ffffff').setFontWeight('bold');
 s.getRange('E2:E500').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Offen','Erledigt']).build());
 s.getRange('B2:B500').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(ORDER).setAllowInvalid(true).build());
 const t=ScriptApp.getProjectTriggers().map(x=>x.getHandlerFunction());
 if(!t.includes('syncToTrmnl'))ScriptApp.newTrigger('syncToTrmnl').timeBased().everyHours(6).create();
 if(!t.includes('onSheetEdit'))ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(ss).onEdit().create();
}
function onOpen(){SpreadsheetApp.getUi().createMenu('Prüfungsplan').addItem('Webhook verbinden','setWebhook').addItem('Jetzt synchronisieren','syncToTrmnl').addItem('Verbindung testen','testConnection').addItem('Druckvorlage erstellen','createPrintSheet').addSeparator()
 .addItem('QR-Formular: Zugangscode festlegen','setFormAccessCode')
 .addItem('QR-Formular: URL verbinden','setFormUrl').addToUi();}
function setWebhook(){
 const ui=SpreadsheetApp.getUi(),a=ui.prompt('TRMNL Webhook URL','Geheime URL einfügen:',ui.ButtonSet.OK_CANCEL);
 if(a.getSelectedButton()!==ui.Button.OK)return;
 const url=a.getResponseText().trim();
 if(!/^https:\/\/[^/]*trmnl\.com\/api\/custom_plugins\//.test(url))throw Error('Ungültige Webhook URL');
 PropertiesService.getScriptProperties().setProperty('WEBHOOK_URL',url);syncToTrmnl();
}
function onSheetEdit(e){
 if(!e||e.range.getSheet().getName()!==TAB||e.range.getRow()<2)return;
 const p=PropertiesService.getScriptProperties();
 if(Date.now()-Number(p.getProperty('LAST_SYNC')||0)<300000)return;
 syncToTrmnl();p.setProperty('LAST_SYNC',String(Date.now()));
}
function syncToTrmnl(){
 const url=PropertiesService.getScriptProperties().getProperty('WEBHOOK_URL');
 if(!url)throw Error('Webhook zuerst verbinden');
 const s=getPlannerSpreadsheet().getSheetByName(TAB);
 const tz='Europe/Zurich',today=Utilities.formatDate(new Date(),tz,'yyyy-MM-dd'),items=[];
 if(s&&s.getLastRow()>1)s.getRange(2,1,s.getLastRow()-1,5).getValues().forEach((r,i)=>{
  if(!r[0]||!r[1]||!r[2]||String(r[4]).trim().toLowerCase()==='erledigt')return;
  let d=r[0];
  if(!(d instanceof Date)){const m=String(d).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);d=m?new Date(+m[3],+m[2]-1,+m[1],12):null;}
  if(!d||isNaN(d.getTime()))throw Error('Ungültiges Datum in Zeile '+(i+2));
  const key=Utilities.formatDate(d,tz,'yyyy-MM-dd');if(key<today)return;
  const days=Math.round((Date.parse(key+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);
  items.push({date:key,date_label:Utilities.formatDate(d,tz,'dd.MM.'),subject:String(r[1]).trim(),topic:String(r[2]).trim().slice(0,90),note:String(r[3]||'').trim().slice(0,75),days,urgent:days<=3});
 });
 items.sort((a,b)=>a.date.localeCompare(b.date));
 // Chronologische Liste, unabhängig vom Fach. Bei gleichem Datum alphabetisch sortieren.
 items.sort((a,b)=>a.date.localeCompare(b.date)||a.subject.localeCompare(b.subject)||a.topic.localeCompare(b.topic));
 const chosen=items.slice(0,30);
 const formUrl=PropertiesService.getScriptProperties().getProperty('FORM_URL')||'';
 const data={merge_variables:{exams:chosen,total:items.length,updated:Utilities.formatDate(new Date(),tz,'dd.MM. HH:mm'),form_url:formUrl}};
 while(JSON.stringify(data).length>1800&&chosen.length>1)chosen.pop();
 if(JSON.stringify(data).length>1800)throw Error('Payload zu gross');
 const response=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',payload:JSON.stringify(data),muteHttpExceptions:true});
 if(response.getResponseCode()<200||response.getResponseCode()>=300)throw Error('TRMNL HTTP '+response.getResponseCode()+': '+response.getContentText().slice(0,200));
}

/**
 * Non-destructive connectivity check: GET the private webhook to inspect
 * the most recently stored data; no examination content is sent.
 */
function testConnection() {
 const ui=SpreadsheetApp.getUi();
 const url=PropertiesService.getScriptProperties().getProperty('WEBHOOK_URL');
 if(!url){ui.alert('Keine Webhook-URL gespeichert. Menü: Prüfungsplan → Webhook verbinden.');return;}
 try {
   const res=UrlFetchApp.fetch(url,{method:'get',muteHttpExceptions:true,followRedirects:false});
   const status=res.getResponseCode();
   if(status>=200 && status<300){
     const body=res.getContentText();
     let count='nicht bestimmbar';
     try{
       const parsed=JSON.parse(body);
       const vars=parsed.merge_variables||parsed;
       if(Array.isArray(vars.subjects))count=String(vars.subjects.length)+' Fachgruppen';
     }catch(e){}
     ui.alert('TRMNL erreichbar (HTTP '+status+'). Gespeicherte Daten: '+count+'.\n\nWenn noch keine Prüfungen erscheinen, jetzt „Jetzt synchronisieren“ ausführen.');
   }else{
     ui.alert('TRMNL-Verbindung fehlgeschlagen. HTTP '+status+'.\n'+res.getContentText().slice(0,250));
   }
 }catch(err){ui.alert('Verbindung fehlgeschlagen: '+err.message);}
}

/** Druckblatt mit bereits geplanten Prüfungen und freien Feldern.
 * Nur das separate Druckblatt wird ersetzt; die Originaldaten bleiben unverändert.
 */
function createPrintSheet(){
 const ss=SpreadsheetApp.getActiveSpreadsheet();
 const source=ss.getSheetByName(TAB);
 if(!source)throw Error('Blatt Pruefungen fehlt – setup() ausführen.');
 const name='Druckvorlage';
 let sh=ss.getSheetByName(name)||ss.insertSheet(name);
 sh.clear();sh.clearFormats();
 sh.getRange('A1:E1').merge().setValue('PRÜFUNGSPLAN – EINTRAGEN & ABHAKEN');
 sh.getRange('A2:E2').merge().setValue('Weitere Prüfungen handschriftlich eintragen. Danach in das Blatt „Pruefungen“ übertragen.');
 sh.getRange('A4:E4').setValues([['Datum','Schulfach','Prüfung / Thema','Notizen / Lernstoff','Erledigt']]);
 const now=Utilities.formatDate(new Date(),'Europe/Zurich','yyyy-MM-dd'),rows=[];
 if(source.getLastRow()>1)source.getRange(2,1,source.getLastRow()-1,5).getValues().forEach(r=>{
   if(!(r[0] instanceof Date)||Utilities.formatDate(r[0],'Europe/Zurich','yyyy-MM-dd')<now||String(r[4]).trim().toLowerCase()==='erledigt')return;
   rows.push([r[0],r[1],r[2],r[3],'']);
 });
 rows.sort((a,b)=>a[0]-b[0]);
 const filled=rows.slice(0,12);
 const blankCount=Math.max(12,20-filled.length);
 const table=filled.concat(Array.from({length:blankCount},()=>['','','','','']));
 sh.getRange(5,1,table.length,5).setValues(table).setNumberFormat('@');
 if(filled.length)sh.getRange(5,1,filled.length,1).setNumberFormat('dd.MM.yyyy');
 sh.getRange(5,1,table.length,5).setBorder(true,true,true,true,true,true,'#c4c4c4',SpreadsheetApp.BorderStyle.SOLID);
 sh.setColumnWidths(1,1,95);sh.setColumnWidths(2,1,135);sh.setColumnWidths(3,1,220);sh.setColumnWidths(4,1,230);sh.setColumnWidths(5,1,70);
 sh.setRowHeights(5,table.length,34);
 sh.getRange('A1:E1').setFontSize(17).setFontWeight('bold').setBackground('#eeeeee');
 sh.getRange('A2:E2').setFontSize(9);
 sh.getRange('A4:E4').setFontWeight('bold').setBackground('#dddddd');
 sh.setFrozenRows(4);
 sh.activate();
 SpreadsheetApp.getUi().alert('Druckvorlage erstellt: Datei → Drucken → Aktuelles Tabellenblatt, Querformat, an Seitenbreite anpassen. Das Blatt „Pruefungen“ wurde nicht verändert.');
}


/** QR intake form. The QR code contains only the public web app URL, never credentials. */
function getPlannerSpreadsheet() {
 const id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
 return id?SpreadsheetApp.openById(id):SpreadsheetApp.getActiveSpreadsheet();
}
function formHash_(salt,code) {
 return Utilities.base64Encode(Utilities.computeDigest(
   Utilities.DigestAlgorithm.SHA_256,salt+':'+String(code),Utilities.Charset.UTF_8));
}
function setFormAccessCode() {
 const ui=SpreadsheetApp.getUi();
 const answer=ui.prompt('QR-Formular – Zugangscode',
   'Lege einen privaten Code mit mindestens 8 Zeichen fest. Nur wer diesen Code kennt, kann Prüfungen eintragen. Den Code NICHT auf GitHub speichern.',
   ui.ButtonSet.OK_CANCEL);
 if(answer.getSelectedButton()!==ui.Button.OK)return;
 const code=answer.getResponseText();
 if(code.length<8||code.length>128)throw Error('Zugangscode: 8 bis 128 Zeichen erforderlich.');
 const salt=Utilities.getUuid();
 const props=PropertiesService.getScriptProperties();
 props.setProperty('FORM_SALT',salt);
 props.setProperty('FORM_CODE_HASH',formHash_(salt,code));
 CacheService.getScriptCache().remove('FORM_FAILED_COUNT');
 ui.alert('Zugangscode gespeichert. Der Code wird nicht im QR-Code oder Repository hinterlegt.');
}
function setFormUrl() {
 const ui=SpreadsheetApp.getUi();
 const answer=ui.prompt('URL der Google Apps Script Web-App',
   'Nach Bereitstellen → Neue Bereitstellung → Web-App die URL auf /exec hier einfügen.',
   ui.ButtonSet.OK_CANCEL);
 if(answer.getSelectedButton()!==ui.Button.OK)return;
 const url=answer.getResponseText().trim();
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url))
   throw Error('Bitte die originale Google Apps Script Web-App-URL verwenden (endet auf /exec).');
 PropertiesService.getScriptProperties().setProperty('FORM_URL',url);
 syncToTrmnl();
 ui.alert('QR-Formular verbunden und an TRMNL übertragen. Die Vorschau/Anzeige aktualisieren.');
}
function doGet() {
 return HtmlService.createHtmlOutputFromFile('MobileForm')
   .setTitle('Prüfung eintragen')
   .addMetaTag('viewport','width=device-width, initial-scale=1');
}
/** Called only through google.script.run in MobileForm.html. */
function submitExamFromForm(input) {
 const props=PropertiesService.getScriptProperties();
 const salt=props.getProperty('FORM_SALT'), expected=props.getProperty('FORM_CODE_HASH');
 if(!salt||!expected)throw Error('Formular noch nicht eingerichtet. Zugangscode zuerst im Google Sheet festlegen.');
 const lock=LockService.getScriptLock();
 lock.waitLock(15000);
 try {
   const cache=CacheService.getScriptCache();
   const attempts=Number(cache.get('FORM_FAILED_COUNT')||'0');
   if(attempts>=10)throw Error('Zu viele falsche Versuche. Bitte in 15 Minuten erneut versuchen.');
   const supplied=String((input||{}).accessCode||'');
   const candidate=formHash_(salt,supplied);
   if(candidate!==expected) {
     cache.put('FORM_FAILED_COUNT',String(attempts+1),900);
     throw Error('Zugangscode falsch.');
   }
   cache.remove('FORM_FAILED_COUNT');
   const rawDate=String(input.date||'');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(rawDate))throw Error('Bitte ein gültiges Datum wählen.');
   const parts=rawDate.split('-').map(Number);
   const date=new Date(parts[0],parts[1]-1,parts[2],12);
   if(date.getFullYear()!==parts[0]||date.getMonth()!==parts[1]-1||date.getDate()!==parts[2])
     throw Error('Ungültiges Datum.');
   const today=Utilities.formatDate(new Date(),'Europe/Zurich','yyyy-MM-dd');
   if(rawDate<today)throw Error('Das Datum liegt in der Vergangenheit.');
   const subject=String(input.subject||'').trim();
   if(!ORDER.includes(subject))throw Error('Bitte ein Schulfach auswählen.');
   const topic=String(input.topic||'').trim();
   const note=String(input.note||'').trim();
   if(!topic||topic.length>90||note.length>75)throw Error('Thema erforderlich (max. 90 Zeichen); Notiz max. 75 Zeichen.');
   const sheet=getPlannerSpreadsheet().getSheetByName(TAB);
   if(!sheet)throw Error('Blatt Pruefungen fehlt: setup() ausführen.');
   sheet.appendRow([date,subject,topic,note,'Offen']);
   SpreadsheetApp.flush();
   try {
     syncToTrmnl();
     return {saved:true,synced:true,message:'Prüfung gespeichert und an TRMNL übertragen.'};
   } catch(err) {
     console.error('Prüfung gespeichert, TRMNL-Sync fehlgeschlagen: '+err.message);
     return {saved:true,synced:false,message:'Prüfung in Google Sheets gespeichert. TRMNL-Synchronisierung fehlgeschlagen; später im Sheet erneut synchronisieren.'};
   }
 } finally {
   lock.releaseLock();
 }
}
