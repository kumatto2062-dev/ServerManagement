import test from 'node:test';
import assert from 'node:assert/strict';
import {Manager,collectData,saveData} from '../worker/manager.js';
import {latestCompletedMonth,previousMonth} from '../worker/domain.js';
const id='123456789012345678', actor='admin', stars=['s0','s1','s2','s3','s4','s5'],month=latestCompletedMonth();
const clone=v=>structuredClone(v);
class MemoryDB{
  constructor(data){this.data=clone(data);this.v=0;}
  async get(path){return clone(path.split('/').reduce((a,k)=>a?.[k],this.data)??null);}
  async readVersion(){return {data:clone(this.data),etag:String(this.v)};}
  async commit(d,etag){assert.equal(etag,String(this.v));this.data=clone(d);this.v++;}
  async locked(fn){return fn();}
}
function setup(star=2,badges){
  const db=new MemoryDB({revision:0,users:{[id]:{discordId:id,iriamName:'くまっと',badges:badges||{[month]:{star}},rewardStatus:'未対応'}}});
  const member={discordId:id,discordName:'熊',roleIds:['other','s1'],roles:[{id:'other',name:'一般'},{id:'s1',name:'⭐1'}],manageable:true,kickable:true,owner:false,bot:false};
  const d={base:'/guilds/g',calls:[],actual:clone(member),async context(){return {starIds:stars};},async members(){return this.actual?{[id]:clone(this.actual)}:{};},async member(){return clone(this.actual);},async call(path,method){this.calls.push({path,method});if(this.fail)throw Error('network interrupted');if(path.endsWith('/members/'+id)){this.actual=null;return;}const r=path.split('/').at(-1);if(method==='DELETE')this.actual.roleIds=this.actual.roleIds.filter(v=>v!==r);else if(!this.actual.roleIds.includes(r))this.actual.roleIds.push(r);this.actual.roleIds.sort();this.actual.roles=this.actual.roleIds.map(id=>({id,name:id}));}};
  return {db,d,m:new Manager(db,d,{},actor)};
}
test('参加取得は名前・過去月履歴を維持し新規・退出を記録する',()=>{
 const data={users:{[id]:{iriamName:'保持',badges:{'2026-01':{star:5}},inServer:true,currentRoleIds:['s1']}}};
 const actual={'223456789012345678':{discordName:'新規',roleIds:['s5'],roles:[{id:'s5',name:'⭐5'}]}};
 const diffs=collectData(data,actual,stars,actor);assert.equal(diffs.length,2);assert.equal(data.users[id].iriamName,'保持');assert.equal(data.users[id].badges['2026-01'].star,5);assert.equal(data.users[id].inServer,false);assert.ok(data.users['223456789012345678'].lastCheckedAt);assert.equal(data.users['223456789012345678'].badges,undefined);
});
test('保存は未入力を削除し過去月を維持、古いrevision・重複・不正星を拒否',()=>{
 const {db}=setup();db.data.users[id].badges['2026-01']={star:5};
 const body={month,revision:0,rows:[{discordId:id,iriamName:'新しい名前',rewardStatus:'完了',star:null}]};saveData(db.data,body,actor);assert.equal(db.data.users[id].badges[month],undefined);assert.equal(db.data.users[id].badges['2026-01'].star,5);assert.throws(()=>saveData(db.data,body,actor));
 assert.throws(()=>saveData(db.data,{...body,revision:1,rows:[{...body.rows[0],star:6}]},actor));
 assert.throws(()=>saveData(db.data,{...body,revision:1,rows:[body.rows[0],body.rows[0]]},actor));
});
test('確認のみではDiscord変更なし、転送後に非星ロール維持・再送は変更なし',async()=>{
 const {m,d,db}=setup();const plan=await m.execute('/api/preview',{month});assert.equal(d.calls.length,0);
 const result=await m.execute('/api/sync',{planId:plan.id});assert.equal(result.done,true);assert.equal(result.results[0].status,'success');assert.deepEqual(d.actual.roleIds,['other','s2']);assert.equal(db.data.users[id].iriamName,'くまっと');const n=d.calls.length;await m.execute('/api/sync',{planId:plan.id});assert.equal(d.calls.length,n);
});
test('2連続⭐0は確認チェックなしでキックできない',async()=>{
 const {m,d}=setup(0,{[month]:{star:0},[previousMonth(month)]:{star:0}}),p=await m.execute('/api/preview',{month});assert.equal(p.rows[0].action,'kick');await assert.rejects(m.execute('/api/sync',{planId:p.id}),/確認チェック/);assert.equal(d.calls.length,0);const result=await m.execute('/api/sync',{planId:p.id,kickAck:true});assert.equal(result.results[0].status,'success');assert.equal(d.actual,null);
});
test('確認後のデータ変更・Discordロール変更・別管理者を拒否',async()=>{
 for(const change of ['revision','roles','actor']){const {m,db,d}=setup(),p=await m.execute('/api/preview',{month});if(change==='revision')db.data.revision++;if(change==='roles')d.actual.roleIds=['other','s3'];if(change==='actor')m.actor='other';await assert.rejects(m.execute('/api/sync',{planId:p.id}));assert.equal(d.calls.length,0);}
});
test('通信エラー後の未確定操作は再実行しない',async()=>{
 const {m,d}=setup(),p=await m.execute('/api/preview',{month});d.fail=true;const r=await m.execute('/api/sync',{planId:p.id});assert.equal(r.status,'needs-reconciliation');const n=d.calls.length;await assert.rejects(m.execute('/api/sync',{planId:p.id}));assert.equal(d.calls.length,n);
});
test('実行途中で応答を失ったプランを安全側で止める',async()=>{
 const {m,db,d}=setup(),p=await m.execute('/api/preview',{month});db.data.plans[p.id].rows[0].running=true;await assert.rejects(m.execute('/api/sync',{planId:p.id}),/前回の通信/);assert.equal(d.calls.length,0);
});
test('招待リンクのnull配列互換と重複拒否、登録はDiscord変更しない',async()=>{
 const {m,db,d}=setup();db.data.invites=[null,{star:1,url:'https://discord.gg/a'}];assert.equal((await m.execute('/api/invites'))[1].star,1);
 await assert.rejects(m.execute('/api/invites',{links:Array(5).fill('https://discord.gg/a')}));
 const r=await m.execute('/api/invites',{links:['a','b','c','d','e'].map(c=>'https://discord.gg/'+c)});assert.equal(r[5].star,5);assert.equal(d.calls.length,0);
});
test('複数人転送は一度に一人進め、中断後に同じプランで続行できる',async()=>{
 const {m,db,d}=setup(),second='223456789012345678';db.data.users[second]={discordId:second,badges:{}};
 const p=await m.execute('/api/preview',{month});let r=await m.execute('/api/sync',{planId:p.id});assert.equal(r.done,false);assert.equal(r.next,1);r=await m.execute('/api/sync',{planId:p.id});assert.equal(r.done,true);assert.equal(r.results.length,2);assert.equal(d.calls.length,2);
});
