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
function onOpen(){SpreadsheetApp.getUi().createMenu('Prüfungsplan').addItem('Webhook verbinden','setWebhook').addItem('Jetzt synchronisieren','syncToTrmnl').addItem('Verbindung testen','testConnection').addItem('Druckvorlage aktualisieren','createPrintSheet').addSeparator()
 .addItem('Google Formular einrichten','setupGoogleForm').addToUi();}
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
       if(Array.isArray(vars.exams))count=String(vars.exams.length)+' Prüfungen';
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
 if(!source)throw Error('Pruefungen fehlt – setup() ausführen.');
 const name='Druckvorlage';
 let sh=ss.getSheetByName(name)||ss.insertSheet(name);
 // Intentionally only the generated print view is cleared, never Pruefungen.
 sh.getRange('A1:E60').breakApart();
 sh.getRange('A1:E60').clearContent().clearFormat();
 sh.getRange('A1:E1').merge().setValue('PRÜFUNGSPLAN');
 sh.getRange('A2:E2').merge().setValue('Chronologisch · Weitere Termine unten handschriftlich eintragen');
 sh.getRange('A4:E4').setValues([['Datum','Fach','Prüfung / Thema','Notizen / Lernstoff','✓']]);
 // 18 dynamic entries + 10 handwritten rows. Source stays editable independently.
 const filterFormula='=IFERROR(ARRAY_CONSTRAIN(SORT(FILTER({Pruefungen!A2:A,Pruefungen!B2:B,Pruefungen!C2:C,Pruefungen!D2:D},Pruefungen!A2:A>=TODAY(),LOWER(Pruefungen!E2:E)<>"erledigt",Pruefungen!A2:A<>"",Pruefungen!B2:B<>"",Pruefungen!C2:C<>""),1,TRUE),18,4),"")';
 sh.getRange('A5').setFormula(filterFormula);
 sh.getRange('A5:A22').setNumberFormat('dd.MM.yyyy');
 sh.getRange('A5:E33').setBorder(true,true,true,true,true,true,'#bdbdbd',SpreadsheetApp.BorderStyle.SOLID);
 sh.getRange('A23:E23').setBackground('#eeeeee');
 sh.getRange('A23:E23').setValues([['NEUE TERMINE (handschriftlich)','','','','']]);
 sh.getRange('A23:E23').mergeAcross();
 sh.setColumnWidth(1,95);sh.setColumnWidth(2,130);sh.setColumnWidth(3,230);
 sh.setColumnWidth(4,255);sh.setColumnWidth(5,40);
 sh.setRowHeights(5,29,26);
 sh.getRange('A1:E1').setFontSize(18).setFontWeight('bold').setBackground('#f1f1f1');
 sh.getRange('A2:E2').setFontSize(10);
 sh.getRange('A4:E4').setFontWeight('bold').setBackground('#dddddd');
 sh.setFrozenRows(4);
 sh.activate();
 SpreadsheetApp.getUi().alert('Druckvorlage aktualisiert. Drucke A1:E33 als ausgewählte Zellen im Querformat, auf Seitenbreite angepasst. Die Liste aktualisiert sich automatisch aus Pruefungen.');
}

/**
 * Creates a standard Google Form once, reuses the existing form on later calls.
 * A regular respondent URL is sent to TRMNL as form_url for the existing QR.
 */
function setupGoogleForm() {
 const ss=SpreadsheetApp.getActiveSpreadsheet();
 const props=PropertiesService.getScriptProperties();
 props.setProperty('SPREADSHEET_ID',ss.getId());
 let form;
 const existing=props.getProperty('GOOGLE_FORM_ID');
 if(existing){
   form=FormApp.openById(existing);
 } else {
   form=FormApp.create('Prüfungsplan – Prüfung eintragen');
   form.setDescription('Neue Prüfung erfassen – erscheint auf dem TRMNL und dem Ausdruck.');
   form.setCollectEmail(false);
   form.setShowLinkToRespondAgain(true);
   form.setConfirmationMessage('Prüfung erfasst. Du kannst eine weitere Prüfung eintragen.');
   form.addDateItem().setTitle('Datum').setIncludesYear(true).setRequired(true);
   const subjects=availableSubjects_(ss.getSheetByName(TAB));
   form.addListItem().setTitle('Fach').setChoiceValues(subjects).setRequired(true);
   form.addTextItem().setTitle('Thema').setRequired(true);
   form.addParagraphTextItem().setTitle('Notiz').setRequired(false);
   form.setDestination(FormApp.DestinationType.SPREADSHEET,ss.getId());
   props.setProperty('GOOGLE_FORM_ID',form.getId());
 }
 // Form triggers are required: onEdit does not fire on form submission.
 const current=ScriptApp.getProjectTriggers();
 if(!current.some(t=>t.getHandlerFunction()==='onExamFormSubmit')){
   ScriptApp.newTrigger('onExamFormSubmit').forForm(form).onFormSubmit().create();
 }
 const formUrl=form.getPublishedUrl();
 props.setProperty('FORM_URL',formUrl);
 // Deactivate credentials from the retired custom web app, if present.
 props.deleteProperty('FORM_CODE_HASH');
 props.deleteProperty('FORM_SALT');
 try { syncToTrmnl(); }
 catch(err){console.error('Form created, but TRMNL sync needs retry: '+err.message);}
 SpreadsheetApp.getUi().alert('Google Formular eingerichtet:\n'+formUrl+'\n\nEin Testeintrag ist empfohlen. Den Link kannst du mit dem Handy öffnen. TRMNL erhält den QR-Code nach der Synchronisierung.');
 return formUrl;
}

function availableSubjects_(sheet){
 const subjects=ORDER.slice();
 // Preserve subjects already used in the existing spreadsheet (e.g. RZG, RKE, Kochen).
 if(sheet&&sheet.getLastRow()>1){
   sheet.getRange(2,2,sheet.getLastRow()-1,1).getValues().forEach(row=>{
     const subject=String(row[0]||'').trim();
     if(subject&&!subjects.includes(subject))subjects.push(subject);
   });
 }
 return subjects;
}

function getPlannerSpreadsheet(){
 const id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
 return id?SpreadsheetApp.openById(id):SpreadsheetApp.getActiveSpreadsheet();
}

function parseExamDate_(input){
 if(input instanceof Date&&!isNaN(input.getTime()))return input;
 const str=String(input||'').trim();
 let m=str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
 if(m)return validExamDate_(+m[1],+m[2],+m[3]);
 m=str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
 if(m)return validExamDate_(+m[3],+m[2],+m[1]);
 m=str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
 if(m)return validExamDate_(+m[3],+m[1],+m[2]); // Form date in US notation
 throw Error('Ungültiges Prüfungsdatum: '+str);
}
function validExamDate_(year,month,day){
 const date=new Date(year,month-1,day,12);
 if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day)
   throw Error('Ungültiges Prüfungsdatum.');
 return date;
}

/** Runs from the installable Google Forms trigger, not from an edit trigger. */
function onExamFormSubmit(event){
 if(!event||!event.response)throw Error('Form-trigger event fehlt.');
 const props=PropertiesService.getScriptProperties();
 const responseId=event.response.getId();
 const doneKey=responseId?'FORM_IMPORTED_'+responseId:'';
 const lock=LockService.getScriptLock();
 lock.waitLock(30000);
 try {
   if(doneKey&&props.getProperty(doneKey))return; // avoid duplicate imports
   const answers={};
   event.response.getItemResponses().forEach(a=>{answers[a.getItem().getTitle()]=a.getResponse();});
   const date=parseExamDate_(answers.Datum);
   const subject=String(answers.Fach||'').trim();
   const topic=String(answers.Thema||'').trim();
   const note=String(answers.Notiz||'').trim();
   if(!subject||!topic)throw Error('Fach oder Thema fehlt.');
   const sheet=getPlannerSpreadsheet().getSheetByName(TAB);
   if(!sheet)throw Error('Blatt Pruefungen fehlt.');
   sheet.appendRow([date,subject,topic.slice(0,90),note.slice(0,75),'Offen']);
   SpreadsheetApp.flush();
   if(doneKey)props.setProperty(doneKey,'1');
 } finally {
   lock.releaseLock();
 }
 try {syncToTrmnl();}
 catch(err){console.error('Prüfung gespeichert; TRMNL-Synchronisierung fehlgeschlagen: '+err.message);}
}
