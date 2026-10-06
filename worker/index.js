import {Database,Discord,AppError,authenticate,googleToken,ids} from './platform.js';
import {Manager} from './manager.js';
export default {
  async fetch(request,env){
    const origin = request.headers.get('Origin');
    const allowed = ['https://kumatto2062-dev.github.io'];
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
    if(origin&&allowed.includes(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='Authorization, Content-Type';headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';}
    const respond=(v,status=200)=>new Response(JSON.stringify(v),{status,headers});
    try{
      if(origin&&!allowed.includes(origin))throw new AppError('この管理画面からの接続は許可されていません',403);
      if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
      const path=new URL(request.url).pathname.replace(/\/$/,'');
      if(path==='/health')return respond({ready:true});
      const methods={'/api/data':['GET'],'/api/history':['GET'],'/api/invites':['GET','POST'],'/api/members':['POST'],'/api/badges':['POST'],'/api/preview':['POST'],'/api/sync':['POST'],'/api/plan':['POST']};
      if(!methods[path])throw new AppError('APIが見つかりません',404);
      if(!methods[path].includes(request.method))throw new AppError('この操作方法は許可されていません',405);
      const actor=await authenticate(request,env);
      const required = [
        'FIREBASE_SERVICE_ACCOUNT_JSON',
        'FIREBASE_DATABASE_URL',
        'DISCORD_TOKEN',
        'DISCORD_GUILD_ID',
        'STAR_ROLE_1',
        'STAR_ROLE_2',
        'STAR_ROLE_3',
        'STAR_ROLE_4',
        'STAR_ROLE_5'
      ];
      
      const missing = required.filter(
        name => typeof env[name] !== 'string' || !env[name].trim()
      );
      
      if (missing.length) {
        throw new AppError(
          'Workerに設定がありません：' + missing.join(', '),
          503
        );
      }
      
      let account;
      try {
        account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
      } catch {
        throw new AppError(
          'サービスアカウントJSONの形式が不正です',
          503
        );
      }
      
      if (
        typeof account?.private_key !== 'string' ||
        typeof account?.client_email !== 'string'
      ) {
        throw new AppError(
          'サービスアカウントJSONにprivate_keyまたはclient_emailがありません',
          503
        );
      }
      let body;if(request.method==='POST'){const text=await request.text();if(text.length>2000000)throw new AppError('送信データが大きすぎます',413);try{body=JSON.parse(text);}catch{throw new AppError('送信形式が不正です');}if(!body||typeof body!=='object'||Array.isArray(body))throw new AppError('送信形式が不正です');}
      const db=new Database(env,await googleToken(env));return respond(await new Manager(db,new Discord(env),env,actor).execute(path,body));
    }catch(e){return respond({error:e.status?e.message:'処理を完了できませんでした。APIの設定と接続を確認してください'},e.status||500);}
  }
};
