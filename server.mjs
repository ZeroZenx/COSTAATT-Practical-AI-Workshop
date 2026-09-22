import http from 'node:http';
import {readFile,readFile as readJsonFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
const dataDir = path.resolve('.local-data');
const dataFile = path.join(dataDir,'participants.json');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.webp':'image/webp'};
let writeQueue = Promise.resolve();

async function loadParticipants(){
 try{return JSON.parse(await readJsonFile(dataFile,'utf8'));}catch{return {};}
}
function validIso(value){const date=new Date(value);return Number.isFinite(date.getTime())?date.toISOString():new Date().toISOString();}
function cleanPayload(payload){
 const id=String(payload?.id||'').trim().slice(0,120);
 const name=String(payload?.name||'').trim().slice(0,120);
 const role=String(payload?.role||'').trim().slice(0,160);
 const org=String(payload?.org||'').trim().slice(0,160);
 const completed=[...new Set(Array.isArray(payload?.completed)?payload.completed.filter(Number.isInteger).filter(x=>x>=0&&x<8):[])].sort((a,b)=>a-b);
 const challenges=Math.max(0,Math.min(99,Number.parseInt(payload?.challenges,10)||0));
 const gameAnswers=Math.max(0,Math.min(99,Number.parseInt(payload?.gameAnswers,10)||0));
 if(!id||!name||!role||payload?.consent!==true)throw new Error('Participant consent and required profile fields are required.');
 return {id,name,role,org,completed,challenges,gameAnswers,lastSeen:validIso(payload?.lastSeen),joinedAt:validIso(payload?.joinedAt||payload?.lastSeen)};
}
async function saveParticipants(data){
 await mkdir(dataDir,{recursive:true});
 writeQueue=writeQueue.then(()=>writeFile(dataFile,JSON.stringify(data,null,2)+'\n'));
 return writeQueue;
}
function sendJson(res,status,payload){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(payload));}
async function bodyJson(req){
 let body='';for await(const chunk of req){body+=chunk;if(body.length>1000000)throw new Error('Request too large.');}
 return JSON.parse(body||'{}');
}
async function api(req,res,pathname){
 if(req.method==='GET'&&pathname==='/api/participants'){
  const data=await loadParticipants();
  const participants=Object.values(data).sort((a,b)=>String(b.lastSeen).localeCompare(String(a.lastSeen))).map(row=>({id:row.id,name:row.name,role:row.role,org:row.org,completedCount:Array.isArray(row.completed)?row.completed.length:0,challengeCount:row.challenges||0,gameAnswerCount:row.gameAnswers||0,lastSeen:row.lastSeen,joinedAt:row.joinedAt}));
  sendJson(res,200,{participants});return true;
 }
 if(req.method==='POST'&&pathname==='/api/participants'){
  try{const incoming=cleanPayload(await bodyJson(req));const data=await loadParticipants();const previous=data[incoming.id];data[incoming.id]={...incoming,joinedAt:previous?.joinedAt||incoming.joinedAt};await saveParticipants(data);sendJson(res,200,{participant:{id:incoming.id}});}
  catch(error){sendJson(res,400,{error:error instanceof Error?error.message:'Invalid participant data'});}
  return true;
 }
 if(req.method==='OPTIONS'&&pathname.startsWith('/api/')){res.writeHead(204,{'Access-Control-Allow-Methods':'GET,POST','Access-Control-Allow-Headers':'content-type,accept'}).end();return true;}
 return false;
}

http.createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname.startsWith('/api/')){if(await api(req,res,pathname))return;sendJson(res,404,{error:'API route not found'});return;}
  const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const body=await readFile(target);
  res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'}).end(body);
 }catch(error){if(!res.headersSent)res.writeHead(404).end('Page not found');}
}).listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+Number(process.env.PORT||4173)));
