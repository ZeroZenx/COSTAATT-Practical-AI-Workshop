import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
let playwright;
try {playwright=require('playwright');}catch{playwright=require('/Users/darrenheadley/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const {chromium}=playwright;
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
const page=await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',d=>d.accept());
const results=[];
const base='http://127.0.0.1:4173/';
const check=async (name,fn)=>{await fn();results.push(name);console.log('PASS',name);};
const go=async hash=>{await page.goto(base+hash);await page.locator('#main').waitFor();};
const value=async key=>page.locator(`[data-field="${key}"]`).inputValue();
const fill=async (key,v)=>page.locator(`[data-field="${key}"]`).fill(v);
await mkdir('test-results',{recursive:true});
try{
await check('Landing page, logo asset, direct entry and registration validation',async()=>{
 await go('');assert.equal(await page.title(),'Practical AI for Professionals · Workshop');assert(await page.locator('.costaatt-logo').evaluate(el=>el.complete&&el.naturalWidth===474));assert.equal(await page.locator('.qr-frame img').count(),1);assert(await page.locator('.qr-frame img').evaluate(el=>el.complete&&el.naturalWidth>0));assert.equal(await page.locator('.join-url').getAttribute('href'),'https://costaattworkshop.site/#join');assert.equal(await page.locator('.brand-mark').count(),0);assert.equal(await page.locator('.site-footer').count(),1);assert.match(await page.locator('.site-footer').textContent(),/© 2026 COSTAATT/);assert.match(await page.locator('.site-footer').textContent(),/Technology Services Department/);
 await page.screenshot({path:'test-results/home-desktop.png',fullPage:true});
 await page.getByRole('link',{name:'Start workshop',exact:true}).click();
 await page.locator('#join-form button[type="submit"]').click();assert.equal(await page.locator('#join-form input:invalid').count(),2);
 await fill('profile.name','Darren');await fill('profile.role','Manager');await fill('profile.org','Fictional Harbour Services');await fill('profile.task','Weekly meeting summaries');
 await page.locator('#join-form button[type="submit"]').click();await page.getByRole('heading',{name:'Welcome, Darren.'}).waitFor();assert.equal(await page.locator('.session-card').count(),8);
});
await check('Opening challenge notes, copy, reveal and reload persistence',async()=>{
 await go('#s1');await fill('opening.prompt','Summarise the facts. Flag unknowns. Do not invent approvals.');
 await page.locator('[data-copy="opening"]').click();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/82 requests/);
 await page.locator('[data-reveal="opening"] summary').click();assert(await page.locator('[data-reveal="opening"]').evaluate(e=>e.open));
 await page.reload();await page.waitForTimeout(50);assert.match(await value('opening.prompt'),/Flag unknowns/);assert(await page.locator('[data-reveal="opening"]').evaluate(e=>e.open));
 await page.locator('[data-action="complete"]').click();assert.equal(await page.locator('[data-action="complete"]').innerText(),'Mark as unfinished');
});
await check('Countdown start, elapsed time, pause, navigation, reset, expiry and restart',async()=>{
 const t=page.locator('[data-timer="opening"]');await t.locator('[data-action="timer-toggle"]').click();await page.waitForTimeout(1150);assert.notEqual(await t.locator('.timer-value').textContent(),'05:00');
 await t.locator('[data-action="timer-toggle"]').click();const paused=await t.locator('.timer-value').textContent();await page.waitForTimeout(1100);assert.equal(await t.locator('.timer-value').textContent(),paused);
 await go('#journey');await go('#s1');assert.equal(await page.locator('[data-timer="opening"] .timer-value').textContent(),paused);
 await page.locator('[data-action="timer-reset"]').click();assert.equal(await page.locator('.timer-value').textContent(),'05:00');
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('practical-ai-workshop-v1'));s.timers.opening={endAt:Date.now()+100};localStorage.setItem('practical-ai-workshop-v1',JSON.stringify(s));});await page.reload();await page.waitForTimeout(500);
 assert.equal(await page.locator('.timer-value').textContent(),'00:00');assert.match(await page.locator('.timer-status').textContent(),/Time is up/);
 await page.locator('[data-action="timer-toggle"]').click();assert.equal(await page.locator('.timer-value').textContent(),'05:00');assert.equal(await page.locator('[data-action="timer-toggle"]').textContent(),'Pause');
 await page.locator('[data-action="timer-reset"]').click();
});
await check('Prompt exercises, all reveal panels and structured prompt copy',async()=>{
 await go('#s2');await fill('prompt.a','Draft an email for team members after a service review.');
 for(const [k,v]of Object.entries({context:'A fictional service team',task:'Draft a team email',requirements:'Use only supplied facts',output:'Subject and three actions'}))await fill('prompt.'+k,v);
 for(const d of await page.locator('details.reveal').all()){await d.locator('summary').click();assert(await d.evaluate(e=>e.open));}
 await page.locator('[data-field="fix.0.Context"]').check();await page.locator('[data-copy="prompt"]').click();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/TASK\nDraft a team email/);
 await page.reload();assert.equal(await value('prompt.task'),'Draft a team email');assert(await page.locator('[data-field="fix.0.Context"]').isChecked());
});
await check('All five productivity challenges, estimates, negative savings and completion',async()=>{
 for(const id of ['email','report','meeting','presentation','planning']){
  await go('#s3/'+id);await fill('challenge.'+id+'.result','Reviewed draft with unknowns marked.');await fill('challenge.'+id+'.usual','30');await fill('challenge.'+id+'.actual','12');
  assert.match(await page.locator('[data-time-result]').textContent(),/18 min saved/);await page.locator('[data-reveal] summary').click();await page.locator('[data-copy]').click();assert((await page.evaluate(()=>navigator.clipboard.readText())).length>100);
  await page.locator('[data-action="challenge-done"]').click();assert.match(await page.locator('[data-action="challenge-done"]').textContent(),/complete/);
 }
 await fill('challenge.planning.actual','40');assert.match(await page.locator('[data-time-result]').textContent(),/10 min longer/);
 await fill('challenge.planning.usual','0');assert(!/Infinity|NaN/.test(await page.locator('[data-time-result]').textContent()));
 await fill('challenge.planning.actual','-3');assert.match(await page.locator('[data-time-result]').textContent(),/between/);
});
await check('Four mini-labs, sources, dataset, copy, reveals and CSV download',async()=>{
 for(const id of ['document','research','data','decision']){await go('#s4/'+id);await fill('lab.'+id,'Evidence reviewed; assumptions and missing details recorded.');await page.locator('[data-reveal] summary').click();await page.locator('[data-copy]').click();assert((await page.evaluate(()=>navigator.clipboard.readText())).length>100);}
 await go('#s4/research');await fill('research.source1','https://www.nist.gov/itl/ai-risk-management-framework');await fill('research.evidence1','Checked source scope and date.');
 await go('#s4/data');assert.equal(await page.locator('tbody tr').count(),4);const d=page.waitForEvent('download');await page.locator('[data-action="download-lab"]').click();const download=await d;assert.equal(download.suggestedFilename(),'workshop-service-data.csv');await download.saveAs('test-results/service-data.csv');assert.match(await readFile('test-results/service-data.csv','utf8'),/180/);
});
await check('Assistant presets, all seven inputs, live instructions, copy and save',async()=>{
 await go('#s5');assert.equal(await value('assistant.role'),'Manager');await page.locator('#assistant-example').selectOption('1');assert.match(await value('assistant.role'),/administrative professional/);
 await fill('assistant.never','Never promise approvals.');await fill('assistant.private','Never receive private HR documents.');await fill('assistant.test','The assistant asked for missing dates.');await page.locator('[data-action="generate-assistant"]').click();await page.locator('[data-copy="assistant"]').click();const text=await page.evaluate(()=>navigator.clipboard.readText());assert.match(text,/Never promise approvals/);assert.match(text,/Never receive private HR/);
 const d=page.waitForEvent('download');await page.locator('[data-action="download-assistant"]').click();assert.equal((await d).suggestedFilename(),'my-ai-assistant.txt');await page.screenshot({path:'test-results/assistant-desktop.png',fullPage:true});
});
await check('All eight trust scenarios, feedback, score and answer lock',async()=>{
 await go('#s6');const choices=[2,1,1,2,1,1,0,2];for(let i=0;i<choices.length;i++){await page.locator(`[data-action="game-answer"][data-choice="${choices[i]}"]`).click();assert.equal(await page.locator('.game-feedback').count(),1);assert.equal(await page.locator('.game-option:disabled').count(),3);if(i<7)await page.getByRole('button',{name:'Next scenario'}).click();}
 assert.match(await page.locator('.completion-banner').textContent(),/8 of 8/);await page.reload();assert.match(await page.locator('.completion-banner').textContent(),/8 of 8/);await page.screenshot({path:'test-results/trust-desktop.png',fullPage:true});
});
await check('Final case pack, six deliverables, 20-minute timer, rubric and reveal',async()=>{
 await go('#s7');assert.equal(await page.locator('.case-files details').count(),5);assert.equal(await page.locator('[data-timer="final"] .timer-value').textContent(),'20:00');
 for(let i=0;i<6;i++)await fill('final.'+i,'Reviewed deliverable '+(i+1));await page.locator('[data-copy="final"]').click();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/duplicate records/);await page.locator('[data-reveal="final"] summary').click();assert.match(await page.locator('.reveal-body').textContent(),/Evidence conflicts/);
});
await check('Action plan live output, print content, text export and PDF rendering',async()=>{
 await go('#s8');for(const k of ['opportunity1','opportunity2','opportunity3','workflow','tool','responsibility','private','success'])await fill('plan.'+k,'Specific plan for '+k);
 await page.locator('[data-action="generate-plan"]').click();await page.evaluate(()=>{window.print=()=>{window.__printed=true;};});await page.locator('[data-action="print-plan"]').click();assert(await page.evaluate(()=>window.__printed));assert.match(await page.locator('#print-area').textContent(),/Specific plan for success/);
 await page.pdf({path:'test-results/action-plan.pdf',format:'A4',printBackground:true});
 const d=page.waitForEvent('download');await page.locator('[data-action="download-plan"]').click();const dl=await d;await dl.saveAs('test-results/action-plan.txt');assert.match(await readFile('test-results/action-plan.txt','utf8'),/17 February 2027/);
});
await check('All session completion controls and persisted dashboard progress',async()=>{
 for(let i=2;i<=8;i++){await go('#s'+i);await page.locator('[data-action="complete"]').click();}
 await go('#journey');assert.equal(await page.locator('.session-card.completed').count(),8);await page.reload();assert.equal(await page.locator('.session-card.completed').count(),8);assert.equal(await page.locator('progress').getAttribute('value'),'8');await page.screenshot({path:'test-results/journey-desktop.png',fullPage:true});
});
await check('All 12 resource templates, checklist print and workbook download',async()=>{
 await go('#resources');assert.equal(await page.locator('.template-card').count(),12);for(const d of await page.locator('.template-card').all()){await d.locator('summary').click();await d.locator('[data-copy]').click();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/CONTEXT/);}
 await page.locator('[data-field="checklist.0"]').check();await page.evaluate(()=>{window.print=()=>{window.__printed=true;};});await page.locator('[data-action="print-checklist"]').click();assert.match(await page.locator('#print-area').textContent(),/Have I verified important facts/);await page.pdf({path:'test-results/checklist.pdf',format:'A4',printBackground:true});
 const d=page.waitForEvent('download');await page.locator('[data-action="export-work"]').first().click();const dl=await d;await dl.saveAs('test-results/workbook.txt');assert.match(await readFile('test-results/workbook.txt','utf8'),/Reviewed deliverable 6/);
});
await check('Facilitator agenda, all launches, per-activity display and isolated navigation',async()=>{
 assert.equal(await page.locator('a[href="#facilitator"]').count(),0);await go('#facilitator');assert.equal(await page.locator('.agenda-item').count(),8);
 for(let i=0;i<8;i++){await page.locator(`[data-action="launch"][data-index="${i}"]`).click();assert(await page.locator(`[data-action="launch"][data-index="${i}"]`).evaluate(el=>el.classList.contains('active')));}
 await page.locator('[data-action="launch"][data-index="2"]').click();assert.equal(await page.locator('#projection-activity option').count(),5);await page.locator('#projection-activity').selectOption('2');await page.screenshot({path:'test-results/facilitator-desktop.png',fullPage:true});
});
await check('Projection logo, live cross-tab controls, reveal and timer synchronisation',async()=>{
 const projector=await context.newPage();await projector.goto(base+'#present');await projector.getByRole('heading',{name:'The meeting challenge'}).waitFor();assert(await projector.locator('.costaatt-logo').evaluate(el=>el.naturalWidth>0));
 await page.locator('[data-action="project-mode"][data-key="reveal"]').click();await projector.getByRole('heading',{name:'A useful approach.'}).waitFor();assert.match(await projector.locator('.projection-text').textContent(),/one-counter/);
 await page.locator('[data-action="project-mode"][data-key="timer"]').click();await projector.locator('.timer').waitFor();await page.locator('[data-action="timer-toggle"]').click();await projector.waitForTimeout(1600);assert.notEqual(await projector.locator('.timer-value').textContent(),'12:00');
 await page.locator('[data-action="timer-toggle"]').click();await page.locator('[data-action="project-mode"][data-key="discussion"]').click();await projector.getByRole('heading',{name:'What did you notice?'}).waitFor();await projector.screenshot({path:'test-results/projection-desktop.png',fullPage:true});await projector.close();
});
await check('Content editor saves, export works, invalid import fails and restore works',async()=>{
 await page.locator('[data-action="launch"][data-index="0"]').click();await page.locator('.editor-details>summary').click();await page.locator('[data-edit="sessions.0.raw"]').fill('Edited fictional opening request.');await page.locator('#content-form button[type="submit"]').click();
 await go('#s1');assert.match(await page.locator('.raw-card').textContent(),/Edited fictional opening/);await page.reload();assert.match(await page.locator('.raw-card').textContent(),/Edited fictional opening/);
 await go('#facilitator');await page.locator('.editor-details>summary').click();const d=page.waitForEvent('download');await page.locator('[data-action="export-content"]').click();const dl=await d;await dl.saveAs('test-results/content-pack.json');assert.match(await readFile('test-results/content-pack.json','utf8'),/Edited fictional/);
 await page.locator('#import-content').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"test":true}')});await page.waitForTimeout(50);assert.match(await page.locator('#editor-status').textContent(),/Import failed/);
 await page.locator('[data-action="reset-content"]').click();await go('#s1');assert.match(await page.locator('.raw-card').textContent(),/82 requests/);
});
await check('No horizontal overflow at phone, tablet or desktop widths on every view',async()=>{
 const routes=['','#journey','#s1','#s2','#s3/report','#s4/data','#s5','#s6','#s7','#s8','#resources','#facilitator','#present'];
 for(const width of [375,768,1440]){await page.setViewportSize({width,height:900});for(const route of routes){await go(route);const sizes=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));assert(sizes.scroll<=sizes.client+1,`${route} overflow at ${width}: ${JSON.stringify(sizes)}`);}if(width===375){await go('');await page.screenshot({path:'test-results/home-mobile.png',fullPage:true});await go('#s2');await page.screenshot({path:'test-results/prompt-mobile.png',fullPage:true});}}
});
await check('Keyboard navigation, labelled controls and fallback navigation',async()=>{
 await page.setViewportSize({width:1440,height:1000});await go('#join');await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.activeElement.tagName!=='BODY'));
 for(const route of ['#join','#s2','#s3/email','#s4/research','#s5','#s8','#facilitator']){await go(route);assert.equal(await page.locator('input:not([type="file"]),textarea,select').evaluateAll(els=>els.filter(el=>!el.labels?.length&&!el.getAttribute('aria-label')).length),0,route+' unlabelled form control');}
 await go('#missing');await page.getByRole('heading',{name:'This workshop page is missing.'}).waitFor();await page.getByRole('link',{name:'Return to your day'}).click();await page.getByRole('heading',{name:'Welcome, Darren.'}).waitFor();
});
await check('Fresh participant direct entry, stored HTML escaping and unavailable storage',async()=>{
 const fresh=await browser.newContext();const p=await fresh.newPage();await p.goto(base+'#s7');await p.waitForURL('**/#join');await p.goto(base+'?join=1');assert.equal(await p.locator('#join-form').count(),1);
 await p.locator('[data-field="profile.name"]').fill('<img src=x onerror=alert(1)>');await p.locator('[data-field="profile.role"]').fill('Tester');await p.locator('[data-field="profile.task"]').fill('Check content');await p.locator('#join-form button').click();assert.equal(await p.locator('.page-title img').count(),0);assert.match(await p.locator('.page-title').textContent(),/<img/);await fresh.close();
 const blocked=await browser.newContext();await blocked.addInitScript(()=>{Storage.prototype.setItem=function(){throw new Error('blocked');};});const p2=await blocked.newPage();await p2.goto(base+'#join');await p2.locator('[data-field="profile.name"]').fill('Test');assert.match(await p2.locator('#toast').textContent(),/storage is unavailable/);await blocked.close();
});
assert.deepEqual(errors,[]);results.push('No uncaught browser errors');
await writeFile('test-results/results.json',JSON.stringify({passed:results.length,tests:results,date:new Date().toISOString(),errors},null,2));
console.log(`\n${results.length} workflow checks passed.`);
}catch(e){await page.screenshot({path:'test-results/failure.png',fullPage:true});console.error(e);process.exitCode=1;}finally{await browser.close();}
