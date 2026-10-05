import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';
test('管理画面の読み込み・名前保存・日本語表示・転送・招待登録',async()=>{
 const dom=new JSDOM(await readFile(new URL('../public/index.html',import.meta.url),'utf8'),{runScripts:'outside-only',url:'https://example.github.io/manager/'}),w=dom.window;
 const id='123456789012345678';let name='くまっと',revision=0,links=[null,{star:1,url:'https://discord.gg/one'}],calls=[];
 w.confirm=()=>true;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.fetch=async(url,o)=>{const path=new URL(url).pathname,b=o.body?JSON.parse(o.body):undefined;calls.push(path);let d={};
 if(path==='/api/data')d={users:{[id]:{discordId:id,iriamName:name,discordName:'熊',inServer:true,currentRoles:[{id:'s1',name:'⭐1'}],badges:{'2026-09':{star:2}},rewardStatus:'未対応'}},revision,latestCompletedMonth:'2026-09'};
 if(path==='/api/invites'){if(b)links=Object.fromEntries(b.links.map((url,i)=>[i+1,{star:i+1,url}]));d=links;}
 if(path==='/api/badges'){name=b.rows[0].iriamName;d={revision:++revision};}
 if(path==='/api/members')d={diffs:[{discordId:id,before:{inServer:false,roleIds:[]},after:{inServer:true,roleIds:['s1']}}]};
 if(path==='/api/preview')d={id:'12345678-1234-1234-1234-123456789012',month:'2026-09',rows:[{discordId:id,discordName:'熊',action:'role',star:2,reason:'星ロール変更'}],next:0};
 if(path==='/api/sync')d={done:true,results:[{discordId:id,action:'role',star:2,status:'success'}]};
 if(path==='/api/history')d={pendingPlans:[],entries:[{type:'save',at:Date.now(),month:'2026-09',count:1}]};
 return {ok:true,json:async()=>d};};
 const stub=`const config={apiBase:'https://api.example',firebase:{}};function initializeApp(){return {}};const user={getIdToken:async()=> 'fake'};function getAuth(){return {currentUser:user}};async function setPersistence(){};const browserSessionPersistence={};function onAuthStateChanged(a,fn){setTimeout(()=>fn(user),0)};async function signOut(){};async function signInWithEmailAndPassword(){}`;
 const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');await w.eval('(async()=>{'+stub+source.replace(/^import .*;\n/gm,'')+'})()');
 const $=id=>w.document.getElementById(id),wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('UI timeout: '+$('message').textContent);};
 await wait(()=>$('message').textContent==='読み込みました');assert.equal($('invite-1').value,'https://discord.gg/one');
 const input=w.document.querySelector('#rows input');input.value='新しい名前';input.dispatchEvent(new w.Event('input'));$('save').click();await wait(()=>$('message').textContent==='Firebaseへ保存しました');assert.equal(name,'新しい名前');
 $('collect').click();await wait(()=>$('message').textContent==='Discord参加状態を取得しました');assert.match($('diffs').textContent,/未参加・退出 → 在籍/);
 $('preview').click();await wait(()=>$('confirmation').open);assert.equal(calls.includes('/api/sync'),false);await wait(()=>!$('execute').disabled);
 $('execute').click();await wait(()=>$('message').textContent==='Discordへの転送が完了しました');assert.match($('diffs').textContent,/成功：星ロールを⭐2/);
 $('history').click();await wait(()=>$('historyRows').textContent.includes('Firebaseへの保存'));assert.match($('historyRows').textContent,/2026-09の名前・星数/);
 await wait(()=>!$('setupInvites').disabled);for(let i=1;i<=5;i++)$('invite-'+i).value='https://discord.gg/test'+i;$('setupInvites').click();await wait(()=>$('message').textContent.startsWith('招待リンクを登録しました'));assert.equal(links[5].url,'https://discord.gg/test5');dom.window.close();
});
