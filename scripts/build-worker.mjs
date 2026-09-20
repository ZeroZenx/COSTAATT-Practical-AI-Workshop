import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve('.');
const files=[
  ['/', 'dist/index.html', 'text/html; charset=utf-8'],
  ['/app.js', 'dist/app.js', 'text/javascript; charset=utf-8'],
  ['/content.js', 'dist/content.js', 'text/javascript; charset=utf-8'],
  ['/styles.css', 'dist/styles.css', 'text/css; charset=utf-8'],
  ['/assets/costaatt-logo.webp', 'dist/assets/costaatt-logo.webp', 'image/webp'],
  ['/assets/costaatt-workshop-qr.svg', 'dist/assets/costaatt-workshop-qr.svg', 'image/svg+xml'],
];
const assets={};
for(const [url,file,type] of files)assets[url]={type,data:(await readFile(path.join(root,file))).toString('base64')};
const sql=String.raw;
const source=[
  "const ASSETS = "+JSON.stringify(assets)+";",
  "const JSON_HEADERS = {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};",
  "function json(status,payload){return new Response(JSON.stringify(payload),{status,headers:JSON_HEADERS});}",
  "function validIso(value){const date=new Date(value);return Number.isFinite(date.getTime())?date.toISOString():new Date().toISOString();}",
  "function cleanPayload(payload){const id=String(payload?.id||'').trim().slice(0,120);const name=String(payload?.name||'').trim().slice(0,120);const role=String(payload?.role||'').trim().slice(0,160);const org=String(payload?.org||'').trim().slice(0,160);const completed=[...new Set(Array.isArray(payload?.completed)?payload.completed.filter(Number.isInteger).filter(x=>x>=0&&x<8):[])].sort((a,b)=>a-b);const challenges=Math.max(0,Math.min(99,Number.parseInt(payload?.challenges,10)||0));const gameAnswers=Math.max(0,Math.min(99,Number.parseInt(payload?.gameAnswers,10)||0));if(!id||!name||!role||payload?.consent!==true)throw new Error('Participant consent and required profile fields are required.');return {id,name,role,org,completed,challenges,gameAnswers,lastSeen:validIso(payload?.lastSeen),joinedAt:validIso(payload?.joinedAt||payload?.lastSeen)};}",
  "async function api(request,env,url){if(!env.DB)return json(503,{error:'Shared reporting is not configured.'});if(request.method==='GET'&&url.pathname==='/api/participants'){const result=await env.DB.prepare('SELECT participant_id AS id,name,role,organization AS org,completed_json,challenge_count AS challengeCount,game_answer_count AS gameAnswerCount,last_seen AS lastSeen,joined_at AS joinedAt FROM participants ORDER BY last_seen DESC').all();const participants=(result.results||[]).map(row=>{let completed=[];try{completed=JSON.parse(row.completed_json||'[]');}catch{}return {id:row.id,name:row.name,role:row.role,org:row.org,completedCount:Array.isArray(completed)?completed.length:0,challengeCount:row.challengeCount||0,gameAnswerCount:row.gameAnswerCount||0,lastSeen:row.lastSeen,joinedAt:row.joinedAt};});return json(200,{participants});}if(request.method==='POST'&&url.pathname==='/api/participants'){try{const incoming=cleanPayload(await request.json());const previous=await env.DB.prepare('SELECT joined_at FROM participants WHERE participant_id = ?').bind(incoming.id).first();await env.DB.prepare('INSERT INTO participants (participant_id,name,role,organization,consent,completed_json,challenge_count,game_answer_count,joined_at,last_seen) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(participant_id) DO UPDATE SET name=excluded.name,role=excluded.role,organization=excluded.organization,consent=excluded.consent,completed_json=excluded.completed_json,challenge_count=excluded.challenge_count,game_answer_count=excluded.game_answer_count,last_seen=excluded.last_seen').bind(incoming.id,incoming.name,incoming.role,incoming.org,1,JSON.stringify(incoming.completed),incoming.challenges,incoming.gameAnswers,previous?.joined_at||incoming.joinedAt,incoming.lastSeen).run();return json(200,{participant:{id:incoming.id}});}catch(error){return json(400,{error:error instanceof Error?error.message:'Invalid participant data'});}}return json(404,{error:'API route not found'});}",
  "function assetResponse(url){const asset=ASSETS[url.pathname]||ASSETS['/'];if(!asset||url.pathname!=='/'&&!ASSETS[url.pathname])return new Response('Not found',{status:404,headers:{'content-type':'text/plain; charset=utf-8'}});const bytes=Uint8Array.from(atob(asset.data),char=>char.charCodeAt(0));return new Response(bytes,{headers:{'content-type':asset.type,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});}",
  "export default {async fetch(request,env,ctx){void ctx;const url=new URL(request.url);if(url.pathname.startsWith('/api/')){try{return await api(request,env,url);}catch(error){return json(500,{error:error instanceof Error?error.message:'Unexpected reporting error'});}}return assetResponse(url);}};",
].join('\n');
await mkdir(path.join(root,'worker'),{recursive:true});
await mkdir(path.join(root,'dist/server'),{recursive:true});
await writeFile(path.join(root,'worker/index.js'),source+'\n');
await writeFile(path.join(root,'dist/server/index.js'),source+'\n');
console.log('Generated Worker from '+files.length+' assets');
