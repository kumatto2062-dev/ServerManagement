import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js';
import {getAuth,signInWithEmailAndPassword,onAuthStateChanged,signOut,setPersistence,browserSessionPersistence} from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js';
import {config} from './config.js';
const $=id=>document.getElementById(id), auth=getAuth(initializeApp(config.firebase));
await setPersistence(auth,browserSessionPersistence);
let users={},revision=0,completed='',dirty=false,plan=null,busy=false,activeMonth='';
function msg(t,error=false){$('message').textContent=t;$('message').className=error?'alert':'';}
function invalidate(){plan=null;$('transfer').disabled=true;}
async function api(path,body){if(!auth.currentUser)throw Error('ログインしてください'); const token=await auth.currentUser.getIdToken();const r=await fetch(config.apiBase+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(data.error||'APIエラー');return data;}
async function run(fn){if(busy)return;busy=true;document.querySelectorAll('button,input,select').forEach(b=>b.disabled=true);try{await fn();}catch(e){msg(e.message,true);}finally{busy=false;document.querySelectorAll('button,input,select').forEach(b=>b.disabled=false);$('transfer').disabled=!plan;}}
function prev(m){const[y,n]=m.split('-').map(Number);return n===1?`${y-1}-12`:`${y}-${String(n-1).padStart(2,'0')}`;}
function streak(u,m){let n=0;while(u.badges?.[m]?.star===0){n++;m=prev(m);}return n;}
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function select(options,value,onchange){const s=el('select');for(const[v,t]of options){const o=el('option',t);o.value=v;s.append(o);}s.value=String(value);s.onchange=()=>{onchange(s.value);dirty=true;invalidate();render();};return s;}
function render(){
  const month=$('month').value;if(!month)return;const all=Object.values(users).filter(Boolean),filter=$('filter').value,query=$('search').value.toLowerCase();$('rows').replaceChildren();
  $('total').textContent=all.length;$('present').textContent=all.filter(u=>u.inServer).length;$('kicks').textContent=all.filter(u=>streak(u,month)>=2&&u.inServer).length;$('missing').textContent=all.filter(u=>u.badges?.[month]?.star===undefined).length;
  $('periodNote').textContent=`最新完了月：${completed} ／ 対象月：${month}${month!==completed?'（履歴の閲覧・保存のみ。Discord転送は最新完了月を選択）':''}${dirty?' ／ 未保存の変更あり':''}`;
  for(const u of all){const star=u.badges?.[month]?.star,n=streak(u,month);if(filter==='kick'&&!(n>=2&&u.inServer)||filter==='absent'&&u.inServer||/^\d$/.test(filter)&&String(star)!==filter)continue;if(query&&!`${u.iriamName} ${u.discordName} ${u.discordId}`.toLowerCase().includes(query))continue;
    const tr=el('tr'), cells=Array.from({length:10},()=>el('td'));tr.append(...cells);
    const name=el('input');name.value=u.iriamName||'';name.maxLength=100;name.setAttribute('aria-label','IRIAM名');name.oninput=()=>{u.iriamName=name.value;dirty=true;invalidate();};cells[0].append(name);
    cells[1].append(el('span',u.discordName||'不明'),el('small',u.discordId));if(u.invite?.status==='needs-review')cells[1].append(el('small','招待リンク要確認','alert'));
    cells[2].append(el('span',u.inServer?'在籍':'未参加 / 退出',u.inServer?'tag':''));
    cells[3].textContent=(u.currentRoles||[]).filter(Boolean).map(r=>r.name).join(' / ')||'なし';
    cells[4].append(select([['','未入力'],...Array.from({length:6},(_,i)=>[String(i),`⭐${i}`])],star??'',v=>{u.badges=u.badges||{};if(v==='')delete u.badges[month];else u.badges[month]={star:Number(v)};}));
    cells[5].textContent=u.badges?.[prev(month)]?.star===undefined?'未入力':`⭐${u.badges[prev(month)].star}`;cells[6].textContent=`${n}か月`;cells[7].append(el('span',n>=2&&u.inServer?'退去対象':'—',n>=2?'alert':''));
    cells[8].append(select(['未対応','対応中','完了','対象外'].map(v=>[v,v]),u.rewardStatus||'未対応',v=>u.rewardStatus=v));
    const single=el('button','確認');single.onclick=()=>run(()=>preview(u.discordId));cells[9].append(single);$('rows').append(tr);
  }
}
async function load(){const d=await api('/api/data');users=d.users;revision=d.revision;completed=d.latestCompletedMonth;if(!$('month').value)$('month').value=completed;activeMonth=$('month').value;dirty=false;invalidate();render();await invites();}
async function preview(discordId=null){if(dirty)throw Error('Firebaseへ保存してから確認してください');showPlan(await api('/api/preview',{month:$('month').value,...(discordId?{discordId}:{})}));}
function showPlan(p){plan=p;$('planRows').replaceChildren();for(const r of plan.rows){$('planRows').append(el('p',`${readableName(r.discordId,r.discordName)}：${{role:'ロール変更',kick:'キック',none:'変更なし',skip:'対象外',blocked:'実行不可'}[r.action]} ／ ${r.star===null?'未入力':`⭐${r.star}`} ／ ${r.reason}`,['kick','blocked'].includes(r.action)?'alert':''));}$('kickAck').checked=false;$('kickAckLabel').hidden=!plan.rows.some(r=>r.action==='kick');$('confirmation').showModal();msg('変更内容を確認してください。確認プランは10分間有効です。');}
$('login').onsubmit=e=>{e.preventDefault();run(async()=>{await signInWithEmailAndPassword(auth,$('email').value,$('password').value);$('password').value='';});};
$('logout').onclick=()=>run(()=>signOut(auth));
onAuthStateChanged(auth,u=>{ $('loginCard').hidden=!!u;$('workspace').hidden=!u;$('logout').hidden=!u;if(u)load().then(()=>msg('読み込みました')).catch(e=>msg(e.message,true));else{users={};invalidate();msg('管理者アカウントでログインしてください');}});
$('month').onchange=()=>{if(dirty&&!confirm('未保存の変更を破棄して対象月を変更しますか？')){$('month').value=activeMonth;return;}run(load);};
$('filter').onchange=render;$('search').oninput=render;
$('reload').onclick=()=>{if(!dirty||confirm('未保存の変更を破棄しますか？'))run(load);};
$('save').onclick=()=>run(async()=>{const month=$('month').value;const rows=Object.values(users).filter(Boolean).map(u=>({discordId:u.discordId,iriamName:u.iriamName||'',rewardStatus:u.rewardStatus||'未対応',star:u.badges?.[month]?.star??null}));await api('/api/badges',{month,revision,rows});await load();msg('Firebaseへ保存しました');});
$('collect').onclick=()=>{if(dirty){msg('先に保存してください',true);return;}run(async()=>{const d=await api('/api/members',{});$('diffs').textContent=readableDiffs(d.diffs);await load();msg('Discord参加状態を取得しました');});};
$('preview').onclick=()=>run(()=>preview());$('resync').onclick=()=>run(()=>preview());
$('transfer').onclick=()=>{if(plan)$('confirmation').showModal();};
$('cancelPlan').onclick=()=>$('confirmation').close();
$('execute').onclick=()=>run(async()=>{
  if(!plan)throw Error('変更確認をやり直してください');
  const kickAck=$('kickAck').checked;
  if(plan.rows.some(r=>r.action==='kick')&&!kickAck)throw Error('キック対象者の確認チェックが必要です');
  const current=plan;invalidate();$('confirmation').close();let result;
  try {
    do {
      msg(`Discordへ転送中：${result?.next??current.next??0} / ${current.rows.length}人。画面を閉じずにお待ちください。`);
      result=await api('/api/sync',{planId:current.id,kickAck});
      $('diffs').textContent=readableResults(result.results);
    } while(!result.done);
  } catch(e) {
    msg(`${e.message} ／ 途中までの結果は保存されています。「履歴を更新」で状況を確認してください。`,true);
    return;
  }
  await load();$('diffs').textContent=readableResults(result.results);
  const errors=result.results.filter(r=>['failed','needs-reconciliation'].includes(r.status));
  msg(errors.length?'処理を停止しました。要確認の結果があります。参加状態を取得し、履歴を確認してください。':'Discordへの転送が完了しました',!!errors.length);
});
async function invites(){
  const data=await api('/api/invites');$('invites').replaceChildren();
  for(let star=1;star<=5;star++){
    const record=data[star]||{},row=el('div',undefined,'invite-row'),label=el('label',`⭐${star}用`),input=el('input');
    input.type='url';input.id=`invite-${star}`;input.placeholder='https://discord.gg/…';input.value=record.url||'';label.append(input);row.append(label);
    const copy=el('button','コピー');copy.onclick=()=>run(async()=>{if(!input.value)throw Error('URLを入力してください');await navigator.clipboard.writeText(input.value);msg(`⭐${star}の招待URLをコピーしました`);});row.append(copy);$('invites').append(row);
  }
}
$('setupInvites').onclick=()=>run(async()=>{await api('/api/invites',{links:Array.from({length:5},(_,i)=>$(`invite-${i+1}`).value)});msg('招待リンクを登録しました。Discord側の付与ロール設定を確認してください。');});
$('history').onclick=()=>run(async()=>{
  const d=await api('/api/history');$('historyRows').replaceChildren();
  for(const p of d.pendingPlans||[]){
    const row=el('div',undefined,'card');row.append(el('p',`${p.month}の転送：${p.next} / ${p.total}人処理済み`));
    if(p.status==='needs-reconciliation')row.append(el('p','結果の確認が必要です。参加状態を取得し、変更確認をやり直してください。','alert'));
    else if(p.expiresAt>Date.now()){
      const b=el('button','中断した転送の内容を確認');b.onclick=()=>run(async()=>{if(dirty)throw Error('未保存の変更を保存してください');showPlan(await api('/api/plan',{planId:p.id}));});row.append(b);
    }else row.append(el('p','確認期限が切れています。新しい変更確認を作成してください。'));
    $('historyRows').append(row);
  }
  for(const h of d.entries)$('historyRows').append(el('pre',readableHistory(h)));
});
function items(v){return Array.isArray(v)?v.filter(Boolean):Object.values(v||{}).filter(Boolean);}
function readableName(id,fallback){const u=users[id];return `${u?.iriamName||u?.discordName||fallback||'名前不明'}（ID：${id||'不明'}）`;}
function readableRoles(v){
  const names=new Map();for(const u of items(users))for(const r of items(u.currentRoles))names.set(r.id,r.name);
  return items(v).map(r=>typeof r==='object'?r.name||r.id:names.get(r)||`ロールID：${r}`).join('、')||'なし';
}
function readableDiffs(diffs){return items(diffs).map(d=>{
  const lines=[readableName(d.discordId)];
  if(!d.before&&!d.after)lines.push('Discord参加者を管理名簿に新規登録しました。');
  else{
    const b=d.before||{},a=d.after||{};
    if(b.inServer!==a.inServer)lines.push(`参加状態：${b.inServer?'在籍':'未参加・退出'} → ${a.inServer?'在籍':'未参加・退出'}`);
    const old=items(b.roleIds),now=items(a.roleIds),added=now.filter(id=>!old.includes(id)),removed=old.filter(id=>!now.includes(id));
    if(added.length)lines.push(`追加されたロール：${readableRoles(added)}`);
    if(removed.length)lines.push(`外れたロール：${readableRoles(removed)}`);
    if(lines.length===1)lines.push('参加情報を更新しました。');
  }return lines.join('\n');
}).join('\n\n')||'参加状態・ロールに差分はありません。';}
function readableResults(results){return items(results).map(r=>{
  const lines=[readableName(r.discordId,r.discordName)];
  const texts={success:r.action==='kick'?'成功：2か月以上連続⭐0のためキックしました。':`成功：星ロールを⭐${r.star}へ変更しました。`,none:'変更なし：既に指定の星ロールです。',skip:`対象外：${r.reason||'変更対象ではありません'}`,blocked:`実行不可：${r.reason||'権限を確認してください'}`,failed:'失敗：Discordへの変更を完了できませんでした。','needs-reconciliation':'要確認：Discordの変更結果が未確定です。参加状態を取得し、確認してください。'};
  lines.push(texts[r.status]||'処理状況を確認してください。');if(r.error)lines.push(`エラー詳細：${r.error}`);return lines.join('\n');
}).join('\n\n')||'Discordへの変更対象はいませんでした。';}
function readableHistory(h){
  const titles={collect:'Discord参加状態の取得',save:'Firebaseへの保存',sync:'Discordへの転送結果',role:'星ロールの変更',kick:'キック',join:'サーバーへの参加',leave:'サーバーからの退出','join-error':'参加時処理の失敗','invite-setup':'星別招待リンクの登録'};
  const lines=[new Date(h.at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}),titles[h.type]||'操作記録'];
  if(h.discordId)lines.push(readableName(h.discordId));
  switch(h.type){
    case 'collect':lines.push(readableDiffs(h.diffs));break;
    case 'save':lines.push(`${h.month}の名前・星数・返礼品対応状況を保存しました（${h.count}人）。Discordのロールは変更されません。`);break;
    case 'sync':lines.push(`対象月：${h.month}`,readableResults(h.results));break;
    case 'role':lines.push(`${h.month}の星数に基づき、星ロールを⭐${h.star}へ変更しました。`);break;
    case 'kick':lines.push('2か月以上連続⭐0のためキックしました。BANではありません。');break;
    case 'join':lines.push('サーバーに参加しました。',h.invite?.status==='matched'?`使用招待：⭐${h.invite.initialStar}用`:'招待リンクを特定できませんでした。');break;
    case 'leave':lines.push('サーバーから退出しました。自主退出かキックかはこの通知のみでは判別できません。');break;
    case 'join-error':lines.push('参加時の処理に失敗しました。',h.error||'');break;
    case 'invite-setup':lines.push('⭐1〜⭐5の招待リンクを登録しました。');break;
    default:lines.push('過去版の記録です。');
  }return lines.join('\n');
}
