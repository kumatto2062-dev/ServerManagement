export function validMonth(month) { return typeof month === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(month); }
export function previousMonth(month) {
  if (!validMonth(month)) throw new Error('月が不正です');
  const [y,m]=month.split('-').map(Number); return m===1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2,'0')}`;
}
export function latestCompletedMonth(now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).formatToParts(now);
  return previousMonth(`${parts.find(p=>p.type==='year').value}-${parts.find(p=>p.type==='month').value}`);
}
export function starValue(v) { return Number.isInteger(v) && v>=0 && v<=5; }
export function zeroStreak(badges={},month) {
  let count=0; while (badges[month]?.star===0) { count++; month=previousMonth(month); } return count;
}

export function inviteMatch(before,after) {
  const increases=after.map(i=>({code:i.code,delta:(i.uses||0)-(before[i.code]??i.uses??0)})).filter(i=>i.delta>0);
  return increases.length===1 && increases[0].delta===1 ? increases[0].code : null;
}
export function buildPlan(users,members,month,roleIds,protectedIds=[],completed=latestCompletedMonth()) {
  if (!validMonth(month) || month>completed) throw new Error('転送は完了した月のみ可能です');
  return Object.keys(users).sort().map(id=>{
    const u=users[id], member=members[id], star=u.badges?.[month]?.star;
    const streak=zeroStreak(u.badges,month);
    const current=(member?.roleIds||[]).filter(r=>roleIds.includes(r)).sort();
    const base={discordId:id,discordName:member?.discordName||u.discordName||id,star:star??null,zeroStarStreak:streak,currentRoleIds:current};
    if (!member) return {...base,action:'skip',reason:'Discord未参加'};
    if (member.bot) return {...base,action:'skip',reason:'Botは対象外'};
    if (!starValue(star)) return {...base,action:'skip',reason:'星数未入力'};
    // Retroactive records can be corrected but must never cause old-month role changes/kicks.
    if (month!==completed) return {...base,action:'skip',reason:'過去月は履歴確認のみ。最新完了月を選択してください'};
    if(streak>=2) {
      if(protectedIds.includes(id)||member.owner) return {...base,action:'blocked',reason:'保護対象・サーバーオーナー'};
      return {...base,action:member.kickable?'kick':'blocked',reason:member.kickable?'2か月連続⭐0':'キック権限またはロール階層不足'};
    }
    const target=roleIds[star];
    if(current.length===1 && current[0]===target) return {...base,action:'none',targetRoleId:target,reason:'変更なし'};
    return {...base,action:member.manageable?'role':'blocked',targetRoleId:target,reason:member.manageable?'星ロール変更':'ロール階層不足'};
  });
}
