import http from 'node:http';
import {readFile,readFile as readJsonFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
const dataDir = path.resolve(process.env.WORKSHOP_DATA_DIR||'.local-data');
const dataFile = path.join(dataDir,'participants.json');
const projectionFile = path.join(dataDir,'projection-rooms.json');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.webp':'image/webp'};
let writeQueue = Promise.resolve();

async function loadParticipants(){
 try{return JSON.parse(await readJsonFile(dataFile,'utf8'));}catch{return {};}
}
async function loadProjectionRooms(){
 try{return JSON.parse(await readJsonFile(projectionFile,'utf8'));}catch{return {};}
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
async function saveProjectionRooms(data){
 await mkdir(dataDir,{recursive:true});
 writeQueue=writeQueue.then(()=>writeFile(projectionFile,JSON.stringify(data,null,2)+'\n'));
 return writeQueue;
}
function sendJson(res,status,payload){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(payload));}
function sendNoContent(res){res.writeHead(204,{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end();}
function cleanControlCode(value){return String(value||'').replace(/[^a-z0-9]/gi,'').toUpperCase();}
function controlCodeMatches(expected,supplied){let mismatch=expected.length^supplied.length;for(let i=0;i<Math.max(expected.length,supplied.length);i++)mismatch|=(expected.charCodeAt(i)||0)^(supplied.charCodeAt(i)||0);return mismatch===0;}
function remoteControlDenied(req){const expected=cleanControlCode(process.env.REMOTE_CONTROL_CODE);if(!/^[A-Z2-9]{12}$/.test(expected))return {status:503,message:'Facilitator access is not configured.'};const supplied=cleanControlCode(req.headers['x-workshop-control-code']);if(!controlCodeMatches(expected,supplied))return {status:401,message:'Facilitator code required or incorrect.'};return null;}
function cleanProjection(payload){const p=payload?.projection||{},session=Number(p.session),activity=Number(p.activity),mode=String(p.mode||'');if(!Number.isInteger(session)||session<0||session>7||!Number.isInteger(activity)||activity<0||activity>9||!['challenge','timer','discussion','reveal'].includes(mode))throw new Error('Invalid projection state.');let timer=null;if(payload?.timer&&typeof payload.timer==='object'){const rawEnd=Number(payload.timer.endAt),endAt=Number.isFinite(rawEnd)&&rawEnd>0?rawEnd:null,remaining=Math.max(0,Math.min(7200,Number.parseInt(payload.timer.remaining,10)||0));if(endAt&&endAt>Date.now()+7200000)throw new Error('Timer exceeds the session limit.');timer={endAt,remaining};}return {projection:{session,activity,mode},timer};}
async function bodyJson(req){
 let body='';for await(const chunk of req){body+=chunk;if(body.length>1000000)throw new Error('Request too large.');}
 return JSON.parse(body||'{}');
}
async function api(req,res,pathname){
 if(req.method==='GET'&&pathname==='/api/participants'){
  const denied=remoteControlDenied(req);if(denied){sendJson(res,denied.status,{error:denied.message});return true;}
  const data=await loadParticipants();
  const participants=Object.values(data).sort((a,b)=>String(b.lastSeen).localeCompare(String(a.lastSeen))).map(row=>({name:row.name,role:row.role,org:row.org,completedCount:Array.isArray(row.completed)?row.completed.length:0,challengeCount:row.challenges||0,gameAnswerCount:row.gameAnswers||0}));
  sendJson(res,200,{participants});return true;
 }
 if(req.method==='DELETE'&&pathname==='/api/participants'){
  const denied=remoteControlDenied(req);if(denied){sendJson(res,denied.status,{error:denied.message});return true;}
  await saveParticipants({});sendNoContent(res);return true;
 }
 const participantDelete=pathname.match(/^\/api\/participants\/([a-zA-Z0-9-]{1,120})$/);
 if(req.method==='DELETE'&&participantDelete){const data=await loadParticipants();delete data[decodeURIComponent(participantDelete[1])];await saveParticipants(data);sendNoContent(res);return true;}
 if(req.method==='POST'&&pathname==='/api/participants'){
  try{const incoming=cleanPayload(await bodyJson(req));const data=await loadParticipants();const previous=data[incoming.id];data[incoming.id]={...incoming,joinedAt:previous?.joinedAt||incoming.joinedAt};await saveParticipants(data);sendJson(res,200,{participant:{id:incoming.id}});}
  catch(error){sendJson(res,400,{error:error instanceof Error?error.message:'Invalid participant data'});}
  return true;
 }
 if(req.method==='POST'&&pathname==='/api/projection/rooms'){
  const denied=remoteControlDenied(req);if(denied){sendJson(res,denied.status,{error:denied.message});return true;}
  try{const projection=cleanProjection(await bodyJson(req)),rooms=await loadProjectionRooms(),now=new Date().toISOString(),expiresAt=new Date(Date.now()+12*60*60*1000).toISOString(),roomId=crypto.randomUUID();for(const [id,room] of Object.entries(rooms))if(Date.parse(room.expiresAt)<=Date.now())delete rooms[id];rooms[roomId]={state:projection,createdAt:now,updatedAt:now,expiresAt};await saveProjectionRooms(rooms);sendJson(res,201,{roomId,expiresAt});}catch(error){sendJson(res,400,{error:error instanceof Error?error.message:'Invalid projection state'});}return true;
 }
 const roomMatch=pathname.match(/^\/api\/projection\/rooms\/([0-9a-f-]{36})$/i);
 if(roomMatch){const roomId=roomMatch[1],rooms=await loadProjectionRooms(),room=rooms[roomId];if(req.method==='GET'){if(!room||Date.parse(room.expiresAt)<=Date.now()){sendJson(res,404,{error:'Projection room not found.'});return true;}sendJson(res,200,{state:room.state,updatedAt:room.updatedAt,expiresAt:room.expiresAt});return true;}if(req.method==='PUT'||req.method==='DELETE'){const denied=remoteControlDenied(req);if(denied){sendJson(res,denied.status,{error:denied.message});return true;}if(!room||Date.parse(room.expiresAt)<=Date.now()){sendJson(res,404,{error:'Projection room not found.'});return true;}if(req.method==='DELETE'){delete rooms[roomId];await saveProjectionRooms(rooms);sendNoContent(res);return true;}try{room.state=cleanProjection(await bodyJson(req));room.updatedAt=new Date().toISOString();await saveProjectionRooms(rooms);sendJson(res,200,{ok:true});}catch(error){sendJson(res,400,{error:error instanceof Error?error.message:'Invalid projection state'});}return true;}}
 if(req.method==='OPTIONS'&&pathname.startsWith('/api/')){res.writeHead(204,{'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE','Access-Control-Allow-Headers':'content-type,accept,x-workshop-control-code'}).end();return true;}
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
