async function timedFetch(url,options={}){return fetch(url,{...options,signal:AbortSignal.timeout(10000)});}
export class AppError extends Error { constructor(message,status=400){super(message);this.status=status;} }
export const list=v=>Array.isArray(v)?v.filter(Boolean):Object.values(v||{}).filter(Boolean);
export const ids=s=>(s||'').split(',').map(v=>v.trim()).filter(Boolean);
const enc=new TextEncoder();
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const json64=v=>b64(enc.encode(JSON.stringify(v)));
let cachedToken;
export async function googleToken(env){
  if(cachedToken?.account===env.FIREBASE_SERVICE_ACCOUNT_JSON&&cachedToken.until>Date.now())return cachedToken.token;
  let a;try{a=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);}catch{throw new AppError('API側のFirebase秘密鍵設定を確認してください',503);}
  const now=Math.floor(Date.now()/1000),pem=a.private_key.replace(/-----[^-]+-----|\s/g,'');
  const key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const jwt=json64({alg:'RS256',typ:'JWT'})+'.'+json64({iss:a.client_email,scope:'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,enc.encode(jwt));
  const r=await timedFetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt+'.'+b64(signature)})});
  const d=await r.json();if(!r.ok)throw new AppError('Firebaseサーバー認証に失敗しました。サービスアカウントの権限を確認してください',503);
  cachedToken={account:env.FIREBASE_SERVICE_ACCOUNT_JSON,token:d.access_token,until:Date.now()+(d.expires_in-120)*1000};return d.access_token;
}
export async function authenticate(request,env){
  const token=/^Bearer (.+)$/.exec(request.headers.get('Authorization')||'')?.[1];if(!token)throw new AppError('ログインしてください',401);
  const r=await timedFetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(env.FIREBASE_WEB_API_KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})});
  const d=await r.json(),u=d.users?.[0];if(!r.ok||!u||u.disabled)throw new AppError('認証が無効です。再ログインしてください',401);
  // accounts:lookup validates this project's token; also reject tokens issued before revocation.
  const payload=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));
  if(payload.auth_time<Number(u.validSince||0))throw new AppError('ログインが取り消されています。再ログインしてください',401);
  if(!ids(env.ADMIN_UIDS).includes(u.localId))throw new AppError('管理者権限がありません',403);return u.localId;
}
export class Database {
  constructor(env,token){this.env=env;this.token=token;}
  async request(path='',method='GET',body,extra={}){
    const url=this.env.FIREBASE_DATABASE_URL.replace(/\/$/,'')+'/guilds/'+this.env.DISCORD_GUILD_ID+(path?'/'+path:'')+'.json';
    const r=await timedFetch(url,{method,headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json',...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    if(r.status===412)throw new AppError('別の処理がデータを変更しました。再読み込みしてください',409);
    if(!r.ok)throw new AppError('Firebaseへの接続・保存に失敗しました（'+r.status+'）',503);
    return {value:await r.json(),etag:r.headers.get('etag')};
  }
  async get(path=''){return (await this.request(path)).value;}
  async set(path,v){return this.request(path,'PUT',v);}
  async patch(path,v){return this.request(path,'PATCH',v);}
  async readVersion(){const d=await this.request('','GET',undefined,{'X-Firebase-ETag':'true'});return {data:d.value||{},etag:d.etag};}
  async commit(data,etag){return this.request('','PUT',data,{'if-match':etag});}
  async locked(fn){
    const path='_apiLock',key=crypto.randomUUID(),r=await this.request(path,'GET',undefined,{'X-Firebase-ETag':'true'});
    if(r.value?.until>Date.now())throw new AppError('他の処理が実行中です。少し待って再実行してください',409);
    await this.request(path,'PUT',{key,until:Date.now()+180000},{'if-match':r.etag});
    try{return await fn();}finally{try{const v=await this.request(path,'GET',undefined,{'X-Firebase-ETag':'true'});if(v.value?.key===key)await this.request(path,'PUT',null,{'if-match':v.etag});}catch{/* expires automatically; never erase another request's lock */}}
  }
}
export class Discord {
  constructor(env){this.env=env;this.count=0;}
  async call(path,method='GET',body,reason='IRIAM badge manager'){
    for(let attempt=0;attempt<2;attempt++){
      this.count++;if(this.count>34)throw new AppError('処理量が無料枠の1回の上限に近づきました。参加者数を確認してください',413);
      const r=await timedFetch('https://discord.com/api/v10'+path,{method,headers:{Authorization:'Bot '+this.env.DISCORD_TOKEN,'Content-Type':'application/json','X-Audit-Log-Reason':encodeURIComponent(reason)},...(body?{body:JSON.stringify(body)}:{})});
      if(r.status===204)return null;const d=await r.json();
      if(r.status===429){const wait=Math.ceil(Number(d.retry_after||1)*1000);if(attempt===0&&wait<=5000){await new Promise(r=>setTimeout(r,wait));continue;}throw new AppError(`Discordの回数制限です。${Math.ceil(wait/1000)}秒後に再実行してください`,429);}
      if(!r.ok)throw new AppError(`Discord処理に失敗（${r.status}）：${d.message||'権限・ロール階層を確認してください'}`,r.status===404?404:400);return d;
    }
  }
  get base(){return '/guilds/'+this.env.DISCORD_GUILD_ID;}
  async context(){
    const guild=await this.call(this.base),roles=await this.call(this.base+'/roles'),me=await this.call('/users/@me'),bot=await this.call(this.base+'/members/'+me.id);
    const map=Object.fromEntries(roles.map(r=>[r.id,r]));
    let permissions=BigInt(map[guild.id]?.permissions||0);for(const id of bot.roles)permissions|=BigInt(map[id]?.permissions||0);
    const has=bit=>(permissions&8n)!==0n||(permissions&bit)!==0n;
    // Discord breaks equal-position ties by snowflake ID; the lower ID is the higher role.
    const higher=(a,b)=>a.position!==b.position?a.position>b.position:BigInt(a.id)<BigInt(b.id);
    const highest=roleIds=>roleIds.map(id=>map[id]).filter(Boolean).reduce((a,b)=>higher(a,b)?a:b,map[guild.id]);
    const top=highest(bot.roles),starIds=[null,...Array.from({length:5},(_,i)=>this.env['STAR_ROLE_'+(i+1)])];
    if(starIds.slice(1).some(id=>!/^\d{17,20}$/.test(id||''))||new Set(starIds.slice(1)).size!==5)throw new AppError('⭐1〜⭐5のロールIDを5種類設定してください',503);
    for(const id of starIds.filter(Boolean))if(!map[id]||map[id].managed||id===guild.id||!higher(top,map[id]))throw new AppError('星ロールが存在しない、またはBotより上位です',503);
    return {guild,map,starIds,normalize:m=>({discordId:m.user.id,discordName:m.user.global_name||m.user.username,displayName:m.nick||m.user.global_name||m.user.username,joinedAt:Date.parse(m.joined_at)||null,inServer:true,bot:!!m.user.bot,owner:m.user.id===guild.owner_id,manageable:m.user.id!==guild.owner_id&&higher(top,highest(m.roles))&&has(268435456n),kickable:m.user.id!==guild.owner_id&&higher(top,highest(m.roles))&&has(2n),roleIds:[...m.roles].sort(),roles:m.roles.map(id=>({id,name:map[id]?.name||id}))})};
  }
  async members(ctx){
    const result={};let after;
    while(true){const page=await this.call(this.base+'/members?limit=1000'+(after?'&after='+after:''));for(const m of page)result[m.user.id]=ctx.normalize(m);if(page.length<1000)break;const next=page.reduce((a,b)=>BigInt(a)>BigInt(b.user.id)?a:b.user.id,'0');if(after&&BigInt(next)<=BigInt(after))throw new AppError('参加者取得が進みません');after=next;}
    return result;
  }
  async member(id,ctx){try{return ctx.normalize(await this.call(this.base+'/members/'+id));}catch(e){if(e.status===404)return null;throw e;}}
}
