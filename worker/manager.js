import {buildPlan,latestCompletedMonth,validMonth,starValue,zeroStreak} from './domain.js';
import {AppError,ids,list} from './platform.js';
export function audit(data,type,detail){data.history||={};data.history[Date.now()+'-'+crypto.randomUUID()]={type,at:Date.now(),...detail};}
export function collectData(data,actual,roleIds,actor){
  data.users||={};const diffs=[],at=Date.now();
  for(const id of new Set([...Object.keys(data.users),...Object.keys(actual)])){
    const old=data.users[id],m=actual[id];if(m?.bot)continue;
    if(!old){data.users[id]={discordId:id,iriamName:'',rewardStatus:'未対応',zeroStarStreak:0,kickStatus:'none',source:'discord-import'};diffs.push({discordId:id,type:'未登録→新規登録'});}
    else if(old.inServer!==!!m||JSON.stringify([...(old.currentRoleIds||[])].sort())!==JSON.stringify(m?.roleIds||[]))diffs.push({discordId:id,before:{inServer:!!old.inServer,roleIds:old.currentRoleIds||[]},after:{inServer:!!m,roleIds:m?.roleIds||[]}});
    const u=data.users[id];Object.assign(u,{inServer:!!m,currentRoles:m?.roles||[],currentRoleIds:m?.roleIds||[],currentStar:currentStar(m?.roleIds||[],roleIds),lastCheckedAt:at});
    if(m)Object.assign(u,{discordName:m.discordName,joinedAt:m.joinedAt||u.joinedAt||at});
  }
  data.lastCollectedAt=at;data.revision=(data.revision||0)+1;audit(data,'collect',{actor,diffs});return diffs;
}
export function currentStar(roleIds,stars){const found=roleIds.map(id=>stars.indexOf(id)).filter(n=>n>=0);return found.length===1?found[0]:null;}
export function saveData(data,body,actor){
  const {month,revision,rows}=body;
  if(!validMonth(month)||!Number.isInteger(revision)||!Array.isArray(rows)||rows.length>10000)throw new AppError('保存形式が不正です');
  if((data.revision||0)!==revision)throw new AppError('他の操作で情報が更新されました。再読み込みしてください',409);
  const seen=new Set();for(const r of rows){if(!/^\d{17,20}$/.test(r.discordId)||seen.has(r.discordId)||!data.users?.[r.discordId]||!(r.star===null||starValue(r.star))||typeof r.iriamName!=='string'||r.iriamName.length>100||!['未対応','対応中','完了','対象外'].includes(r.rewardStatus))throw new AppError('入力値が不正です');seen.add(r.discordId);}
  for(const r of rows){const u=data.users[r.discordId];u.iriamName=r.iriamName;u.rewardStatus=r.rewardStatus;u.badges||={};if(r.star===null)delete u.badges[month];else u.badges[month]={star:r.star,updatedAt:Date.now(),updatedBy:actor};u.zeroStarStreak=zeroStreak(u.badges,latestCompletedMonth());}
  data.revision=(data.revision||0)+1;audit(data,'save',{actor,month,count:rows.length});return {revision:data.revision};
}
export function planRows(data,members,month,ctx,env,userId){
  const users=userId?{[userId]:data.users?.[userId]}:data.users||{};
  if(userId&&!users[userId])throw new AppError('参加者が見つかりません');
  return buildPlan(users,members,month,ctx.starIds,ids(env.PROTECTED_DISCORD_IDS));
}
const fingerprint=row=>JSON.stringify({...row,currentRoleIds:[...row.currentRoleIds].sort()});
export class Manager{
  constructor(db,discord,env,actor){Object.assign(this,{db,discord,env,actor});}
  async execute(path,body){
    const {db,discord,actor,env}=this;
    if(path==='/api/data'){const {data}=await db.readVersion();return {users:data.users||{},revision:data.revision||0,latestCompletedMonth:latestCompletedMonth()};}
    if(path==='/api/plan'){if(!/^[a-f0-9-]{36}$/.test(body.planId||''))throw new AppError('確認IDが不正です');const p=await db.get('plans/'+body.planId);if(!p||p.actor!==actor)throw new AppError('確認プランが見つかりません',404);return p;}
    if(path==='/api/invites'&&!body)return await db.get('invites')||{};
    if(path==='/api/history'){const h=await db.get('history')||{},plans=await db.get('plans')||{};return {entries:list(h).sort((a,b)=>b.at-a.at).slice(0,100),pendingPlans:list(plans).filter(p=>p.actor===actor&&['pending','running','needs-reconciliation'].includes(p.status)).sort((a,b)=>b.createdAt-a.createdAt).slice(0,10).map(p=>({id:p.id,month:p.month,status:p.status,next:p.next||0,total:p.rows.length,expiresAt:p.expiresAt}))};}
    return db.locked(async()=>{
      let version=await db.readVersion(),data=version.data;
      if(path==='/api/badges'){const result=saveData(data,body,actor);await db.commit(data,version.etag);return result;}
      if(path==='/api/invites'){
        const rows=body.links;if(!Array.isArray(rows)||rows.length!==5)throw new AppError('⭐1〜⭐5の招待URLを入力してください');
        const records={},codes=new Set();for(let i=0;i<5;i++){const url=String(rows[i]||'').trim(),match=/^https:\/\/(?:discord\.gg\/|discord\.com\/invite\/)([A-Za-z0-9_-]+)$/.exec(url);if(!match||codes.has(match[1]))throw new AppError('異なる有効なDiscord招待URLを5つ入力してください');codes.add(match[1]);records[i+1]={star:i+1,code:match[1],url,updatedAt:Date.now()};}
        data.invites=records;audit(data,'invite-setup',{actor});await db.commit(data,version.etag);return records;
      }
      if(path==='/api/members'){
        const ctx=await discord.context(),members=await discord.members(ctx),diffs=collectData(data,members,ctx.starIds,actor);await db.commit(data,version.etag);return {diffs};
      }
      if(path==='/api/preview'){
        const ctx=await discord.context(),members=await discord.members(ctx),rows=planRows(data,members,body.month,ctx,env,body.discordId);
        const plan={id:crypto.randomUUID(),month:body.month,actor,userId:body.discordId||null,createdAt:Date.now(),expiresAt:Date.now()+600000,revision:data.revision||0,rows,status:'pending',next:0,results:[]};
        data.plans||={};data.plans[plan.id]=plan;await db.commit(data,version.etag);return plan;
      }
      if(path==='/api/sync'){
        if(!/^[a-f0-9-]{36}$/.test(body.planId||''))throw new AppError('確認IDが不正です');
        const p=data.plans?.[body.planId];if(!p||p.actor!==actor)throw new AppError('確認プランが見つかりません',404);
        if(p.status==='completed')return {done:true,results:list(p.results)};
        if(p.status==='needs-reconciliation')throw new AppError('前回の処理結果が未確定です。参加状態を取得し、履歴を確認して新しい変更確認を作成してください',409);
        if(p.expiresAt<Date.now())throw new AppError('確認プランの期限が切れました。変更確認をやり直してください',409);
        if((data.revision||0)!==p.revision)throw new AppError('保存情報が変わりました。変更確認をやり直してください',409);
        if(p.rows.some(r=>r.action==='kick')&&body.kickAck!==true)throw new AppError('キック対象者の確認チェックが必要です');
        const index=p.next||0,row=p.rows[index];if(!row){p.status='completed';await db.commit(data,version.etag);return {done:true,results:list(p.results)};}
        p.results||=[];
        if(row.running){p.status='needs-reconciliation';audit(data,'sync',{actor,month:p.month,planId:p.id,results:[{...row,status:'needs-reconciliation'}]});await db.commit(data,version.etag);throw new AppError('前回の通信が途中で終了しました。参加状態を取得して結果を確認してください',409);}
        if(['role','kick'].includes(row.action)){
          const ctx=await discord.context(),member=await discord.member(row.discordId,ctx),fresh=planRows(data,member?{[row.discordId]:member}:{},p.month,ctx,env,row.discordId)[0];
          if(fingerprint(row)!==fingerprint(fresh))throw new AppError('Discordの状態または設定が変わりました。変更確認をやり直してください',409);
          // Persist intent before making any side effect. A lost response never causes an automatic kick replay.
          row.running=true;p.status='running';await db.commit(data,version.etag);
          let started=false,result;
          try{
            const reason=`IRIAM ${p.month} plan ${p.id}`;
            started=true;
            if(row.action==='kick')await discord.call(discord.base+'/members/'+row.discordId,'DELETE',undefined,reason);
            else{
              // Individual role routes preserve ALL non-star roles, including roles above this bot.
              for(const id of member.roleIds.filter(id=>ctx.starIds.includes(id)&&id!==row.targetRoleId))await discord.call(discord.base+'/members/'+row.discordId+'/roles/'+id,'DELETE',undefined,reason);
              await discord.call(discord.base+'/members/'+row.discordId+'/roles/'+row.targetRoleId,'PUT',undefined,reason);
            }
            const checked=await discord.member(row.discordId,ctx);
            if(row.action==='kick'&&checked||row.action==='role'&&(!checked||currentStar(checked.roleIds,ctx.starIds)!==row.star))throw new AppError('変更後のDiscord状態を確認できませんでした');
            version=await db.readVersion();data=version.data;const user=data.users[row.discordId];
            if(row.action==='kick')Object.assign(user,{inServer:false,kickStatus:'kicked',lastKickedAt:Date.now(),currentRoleIds:[],currentRoles:[],currentStar:null,zeroStarStreak:row.zeroStarStreak});
            else Object.assign(user,{currentRoleIds:checked.roleIds,currentRoles:checked.roles,currentStar:row.star,zeroStarStreak:row.zeroStarStreak,lastSyncedMonth:p.month});
            result={...row,status:'success'};delete result.running;
            audit(data,row.action,{actor,month:p.month,discordId:row.discordId,star:row.star,planId:p.id});
          }catch(e){
            version=await db.readVersion();data=version.data;result={...row,status:started?'needs-reconciliation':'failed',error:String(e.message).slice(0,500)};delete result.running;
          }
          const stored=data.plans[p.id];stored.rows[index].running=false;stored.results[index]=result;stored.next=index+1;
          if(result.status==='needs-reconciliation')stored.status='needs-reconciliation';
          else stored.status=stored.next===stored.rows.length?'completed':'running';
          audit(data,'sync',{actor,month:p.month,planId:p.id,results:[result]});await db.commit(data,version.etag);
          return {done:stored.status==='completed'||stored.status==='needs-reconciliation',next:stored.next,total:stored.rows.length,results:list(stored.results),status:stored.status};
        }
        p.results[index]={...row,status:row.action};p.next=index+1;p.status=p.next===p.rows.length?'completed':'running';await db.commit(data,version.etag);
        return {done:p.status==='completed',next:p.next,total:p.rows.length,results:list(p.results),status:p.status};
      }
      throw new AppError('APIが見つかりません',404);
    });
  }
}
