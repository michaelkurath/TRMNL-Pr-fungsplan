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
function onOpen(){SpreadsheetApp.getUi().createMenu('Prüfungsplan').addItem('Webhook verbinden','setWebhook').addItem('Jetzt synchronisieren','syncToTrmnl').addToUi();}
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
 const subjects=[...new Set(items.map(x=>x.subject))].map(name=>({name,exams:items.filter(x=>x.subject===name).slice(0,6)}));
 const rank=n=>ORDER.includes(n)?ORDER.indexOf(n):100;
 subjects.sort((a,b)=>rank(a.name)-rank(b.name)||a.name.localeCompare(b.name));
 const chosen=subjects.slice(0,10);
 const data={merge_variables:{subjects:chosen,total:items.length,updated:Utilities.formatDate(new Date(),tz,'dd.MM. HH:mm')}};
 while(JSON.stringify(data).length>1800&&chosen.some(g=>g.exams.length>1))chosen.filter(g=>g.exams.length>1).sort((a,b)=>b.exams.length-a.exams.length)[0].exams.pop();
 if(JSON.stringify(data).length>1800)throw Error('Payload zu gross');
 const response=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',payload:JSON.stringify(data),muteHttpExceptions:true});
 if(response.getResponseCode()<200||response.getResponseCode()>=300)throw Error('TRMNL HTTP '+response.getResponseCode()+': '+response.getContentText().slice(0,200));
}
