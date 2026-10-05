import test from 'node:test';import assert from 'node:assert/strict';
import {Database,Discord,authenticate} from '../worker/platform.js';
import worker from '../worker/index.js';
const respond=(v,status=200,headers={})=>new Response(JSON.stringify(v),{status,headers});
test('Firebase条件付き保存は412で競合を検出する',async()=>{const original=globalThis.fetch;globalThis.fetch=async()=>respond({},412);try{const db=new Database({FIREBASE_DATABASE_URL:'https://demo.firebaseio.com',DISCORD_GUILD_ID:'g'},'token');await assert.rejects(db.commit({},'old'),e=>e.status===409);}finally{globalThis.fetch=original;}});
test('Discord一覧の1000件ページングを確認',async()=>{const original=globalThis.fetch,urls=[];globalThis.fetch=async url=>{urls.push(url);return respond(urls.length===1?Array.from({length:1000},(_,i)=>({user:{id:String(1000+i)}})):[{user:{id:'2000'}}]);};try{const d=new Discord({DISCORD_TOKEN:'t',DISCORD_GUILD_ID:'g'}),members=await d.members({normalize:m=>({discordId:m.user.id})});assert.equal(Object.keys(members).length,1001);assert.match(urls[1],/after=1999/);}finally{globalThis.fetch=original;}});
test('許可されないOrigin・未ログイン・変更GETを拒否',async()=>{
 const env={ALLOWED_ORIGINS:'https://user.github.io'};assert.equal((await worker.fetch(new Request('https://api.example/api/data',{headers:{Origin:'https://evil.example'}}),env)).status,403);
 assert.equal((await worker.fetch(new Request('https://api.example/api/data'),env)).status,401);
 assert.equal((await worker.fetch(new Request('https://api.example/api/members'),env)).status,405);
 const preflight=await worker.fetch(new Request('https://api.example/api/data',{method:'OPTIONS',headers:{Origin:'https://user.github.io'}}),env);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://user.github.io');
});
test('Firebaseで確認したUIDが管理者以外なら拒否、失効トークンも拒否',async()=>{
 const original=globalThis.fetch;const token='x.'+Buffer.from(JSON.stringify({auth_time:200})).toString('base64url')+'.x',req=new Request('https://api.example',{headers:{Authorization:'Bearer '+token}});
 globalThis.fetch=async()=>respond({users:[{localId:'admin',validSince:'100'}]});try{assert.equal(await authenticate(req,{ADMIN_UIDS:'admin',FIREBASE_WEB_API_KEY:'key'}),'admin');await assert.rejects(authenticate(req,{ADMIN_UIDS:'other',FIREBASE_WEB_API_KEY:'key'}),e=>e.status===403);globalThis.fetch=async()=>respond({users:[{localId:'admin',validSince:'300'}]});await assert.rejects(authenticate(req,{ADMIN_UIDS:'admin',FIREBASE_WEB_API_KEY:'key'}),e=>e.status===401);}finally{globalThis.fetch=original;}
});
