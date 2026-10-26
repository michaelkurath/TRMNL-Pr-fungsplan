// Private exam planner: Google Sheet -> TRMNL webhook. Project timezone: Europe/Zurich.
const TAB='Pruefungen';
const ORDER=['Mathematik','Deutsch','Englisch','Französisch','NMG','Geschichte','Geografie','Biologie','Physik','Chemie','Informatik','Musik','Sport','Andere'];
function setup(){
 const ss=SpreadsheetApp.getActiveSpreadsheet();let s=ss.getSheetByName(TAB)||ss.insertSheet(TAB);
 s.getRange('A1:E1').setValues([['Datum','Fach','Thema','Notiz','Status']]);
 s.setFrozenRows(1);s.getRange('A:A').setNumberFormat('dd.MM.yyyy');
 s.getRange('A1:E1').setBackground('#172d40').setFontColor('#ffffff').setFontWeight('bold');
 s.getRange('E2:E500').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Offen','Erledigt']).build());
 s.getRange('B2:B500').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(ORDER).setAllowInvalid(true).build());
 const t=ScriptApp.getProjectTriggers().map(x=>x.getHandlerFunction());
 if(!t.includes('syncToTrmnl'))ScriptApp.newTrigger('syncToTrmnl').timeBased().everyHours(6).create();
 if(!t.includes('onSheetEdit'))ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(ss).onEdit().create();
}
function onOpen(){SpreadsheetApp.getUi().createMenu('Prüfungsplan').addItem('Webhook verbinden','setWebhook').addItem('Jetzt synchronisieren','syncToTrmnl').addItem('Verbindung testen','testConnection').addItem('Druckvorlage erstellen','createPrintSheet').addToUi();}
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
 const s=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB);
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
 const data={merge_variables:{exams:chosen,total:items.length,updated:Utilities.formatDate(new Date(),tz,'dd.MM. HH:mm')}};
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
