# 設定手順：GitHub Pages＋Cloudflare Workers

今使っているFirebaseプロジェクト・Discordアプリ・星ロールを使用します。新しいFirebaseやBotを作る必要はありません。このZIPの中身を新しい作業フォルダーへ展開し、旧版を保管してから進めてください。旧版の.envはこのフォルダーへコピーしません。

## 1. 現在のデータを保管する

Firebase Console → Realtime Database → データ → メニューからJSONをエクスポートして、手元に保管します。バックアップJSONは個人の名簿を含むためGitHubに置きません。

この版の保存先は旧版と同じ `guilds/DiscordサーバーID` です。DiscordサーバーIDとFirebase Database URLを同じにすることで、名前・月別バッジ・返礼品・履歴を引き継ぎます。データを消す、初期JSONを上書きする操作はありません。

## 2. Discordの招待を設定する

Discordの「招待」→「招待リンクを編集」→「ロール」で⭐1を選んでリンクを作成します。同様に⭐2〜⭐5を作成します。

- 星ロールは⭐0〜⭐5を用意します。
- Botには「ロールの管理」「メンバーをキック」を付けます。
- Botのロールを全ての星ロールと変更対象メンバーの最高ロールより上に置きます。
- Developer Portal → 対象アプリ → Bot → Server Members Intentを有効にします。常時接続しなくても全員取得に必要です。
- 招待作成者には招待作成・サーバー管理・ロール管理の権限が必要です。
- 招待時の付与はDiscord標準機能が行います。旧Botの招待処理とは併用しないでください。
- 同じ人が別の星リンクを受け入れると複数の星ロールを得る場合があります。次回の取得・転送で整理します。
- 配布済みURLの共有でもロールを取得できるため、必要に応じて回数・期限を設定し、月次変更時に古いリンクをDiscordで削除します。サイトでURLを消してもDiscordのリンクは失効しません。

Discordの開発者モードをONにし、サーバーと各ロールを右クリックしてIDをコピーできます。Tokenを作り直す必要はありません。

## 3. GitHubにソースを置く

1. GitHubでリポジトリを作成します。GitHub FreeでPagesを使う場合はPublicを選びます。
2. 展開したフォルダーの「中身」をアップロードします。最初の画面に `public`、`worker`、`package.json`、`wrangler.toml` が並ぶ配置です。
3. `.github/workflows/pages.yml` も含めます。見当たらなければGitHubのAdd file → Create new fileでそのパスを入力し、同梱の内容を貼り付けます。
4. 秘密鍵JSON、.env、.dev.vars、Firebaseバックアップ、node_modulesはアップロードしません。ブラウザーの手動アップロードでは.gitignoreは自動除外しません。

現行管理画面のpublic/config.jsのFirebase Web設定は後の手順で移します。Discord Tokenと秘密鍵は移しません。

## 4. CloudflareへAPIを公開する

Cloudflareアカウントを作成し、Freeプランを使用します。

1. ダッシュボードのWorkers & PagesからWorkerを作成し、GitHubリポジトリをインポートする方式を選びます。UIの表示名は変更される場合があります。
2. 上で作ったGitHubリポジトリとmainブランチを選びます。
3. Worker名を `iriam-discord-api` にします。wrangler.tomlのnameと一致させます。
4. Root directoryはリポジトリのルート、Build commandは空欄、Deploy commandは `npx wrangler deploy` にします。npmの依存インストールはビルド環境が行います。
5. Deployを実行します。設定を入れる前でも公開はできますが、管理APIはまだ使えません。
6. 公開された実際の `https://iriam-discord-api.あなたのサブドメイン.workers.dev` を控えます。

Git連携を使わない場合は、手元でNode.js 22以降を使い、プロジェクトフォルダーで次を実行しても同じAPIを公開できます。

```powershell
npm ci
npx wrangler login
npm run deploy:api
```

公開後はPCを閉じられます。Node.jsをインストールするのは、この公開方法を選んだ場合だけです。

## 5. APIの環境変数を設定する

Cloudflare → 対象Worker → Settings → Variables and Secretsで追加します。「Build variables」ではなく、Workerの実行時の設定です。

| 名前 | 値 | 種類 |
|---|---|---|
| DISCORD_TOKEN | 現在の.envのDiscord Bot Token | Secret |
| FIREBASE_SERVICE_ACCOUNT_JSON | 現在使用しているFirebaseサービスアカウントJSONの全文 | Secret |
| DISCORD_GUILD_ID | 現在のDiscordサーバーID | Text |
| FIREBASE_DATABASE_URL | 現在のRealtime Database URL | Text |
| FIREBASE_WEB_API_KEY | 同じFirebaseプロジェクトのWeb APIキー | Text |
| ADMIN_UIDS | 操作を許可するFirebaseユーザーUID | Text |
| STAR_ROLE_0 | ⭐0ロールID | Text |
| STAR_ROLE_1 | ⭐1ロールID | Text |
| STAR_ROLE_2 | ⭐2ロールID | Text |
| STAR_ROLE_3 | ⭐3ロールID | Text |
| STAR_ROLE_4 | ⭐4ロールID | Text |
| STAR_ROLE_5 | ⭐5ロールID | Text |
| ALLOWED_ORIGINS | `https://GitHubユーザー名.github.io` | Text |
| PROTECTED_DISCORD_IDS | キックから除外するDiscordユーザーID（任意） | Text |

複数のUID・Origin・保護IDはカンマ区切りです。ADMIN_UIDSにDiscord IDやメールアドレスを入れないでください。Firebase Console → Authentication → Usersで対象管理者のUIDをコピーします。現在のメール・パスワードログインをそのまま使用できます。

FIREBASE_DATABASE_URLには現在の実際のURLを使います。このプロジェクトで以前使用したURLは `https://badge-management-71209-default-rtdb.firebaseio.com` でしたが、現在の.envとFirebase Consoleで一致を確認してください。

FIREBASE_SERVICE_ACCOUNT_JSONは「JSONファイルのパス」ではなくファイル内の全文を貼り付けます。引用符やprivate_key内の `\n` を書き換えないでください。GitHubに置かず、Secretに登録します。同じFirebaseプロジェクトのサービスアカウントを使用します。

保存してDeployが必要と表示された場合は実行します。wrangler.tomlのkeep_varsは、Gitから再公開するときにダッシュボードのText設定を維持するための設定です。

`/health` はAPIコードの稼働確認だけです。Firebase・Discordの設定成功は後の取得操作で確認します。

## 6. 管理画面を設定する

GitHubの `public/config.js` を編集します。

```javascript
export const config = {
  apiBase: "https://実際のWorker名.実際のサブドメイン.workers.dev",
  firebase: {
    apiKey: "現在のFirebase Web APIキー",
    authDomain: "現在のプロジェクト.firebaseapp.com",
    projectId: "現在のプロジェクトID",
    appId: "現在のWebアプリID"
  }
};
```

apiBaseの末尾に `/` や `/api` は付けません。Firebase Web設定は現在のconfig.jsか、Firebase Console → プロジェクト設定 → マイアプリ → WebアプリのConfigからコピーします。Admin JSONの内容をここに入れません。

## 7. GitHub Pagesを公開する

1. GitHubのSettings → Pages → SourceをGitHub Actionsにします。
2. Actions → Publish admin page → Run workflow → mainで実行します。
3. 緑のチェックが付いたらSettings → Pagesで公開URLを確認します。
4. Firebase Console → Authentication → Settings → Authorized domainsに `GitHubユーザー名.github.io` を追加します。https://もリポジトリ名も付けません。
5. CloudflareのALLOWED_ORIGINSには `https://GitHubユーザー名.github.io` を設定します。こちらはhttps://が必要で、リポジトリ名は付けません。

Pagesにはpublicだけが公開されます。workerと設定ファイルをPagesへ配信しません。GitHubのソースは公開されるので秘密情報を含めません。

Firebaseのルールは、このAPI専用のDBなら同梱の `firebase/database.rules.json` のようにブラウザーからの直接読み書きを禁止できます。別のサイトも同じDBを使っている場合は、ルール全体を上書きせず既存ルールを維持し、この管理用の領域を公開しないようにしてください。APIはサービスアカウントでアクセスします。

## 8. 移行と動作確認

旧Botを動かしているPowerShellでCtrl+Cを押し停止します。旧版と新版を同時に操作しないでください。

1. Pagesの公開URLで現在の管理者アカウントにログインします。
2. 既存のIRIAM名・過去月の星・返礼品が表示されるか確認します。
3. 「Discord参加状態を取得」を押します。名簿と日本語の差分が表示されれば取得成功です。
4. 名前を1人分編集 → Firebaseへ保存 → 再読み込みして残るか確認します。
5. 星別招待リンクに、Discordで付与ロールを設定した5種類のURLを登録します。
6. 転送はまず実際に変更してよい1人の「確認」ボタンで試してください。キック対象者を含めない内容で確認後に実行します。
7. 「履歴を更新」で成功結果を確認し、Discord側のロールも確認します。
8. PCの旧Botが停止した状態で、別の端末からログイン・取得できるか確認します。

## 月ごとの使い方

月末の状況を残したい時はその時点で「Discord参加状態を取得」を押します。自動で月末に取得する機能はありません。

翌月初めに最新完了月を選択し、獲得星数と名前・返礼品を入力 → Firebaseへ保存 → Discordへの変更を確認 → 内容を確認 → この内容でDiscordへ転送、の順に実行します。

キックは対象月と直前月の両方が明示的に⭐0の場合だけです。未入力、Bot、未参加、オーナー、保護IDは除外します。退去対象カウンターは星数に基づく候補数です。実行できるかどうかは確認画面の権限判定で確認してください。

## エラー・中断時

- 非管理者：ADMIN_UIDSにFirebase UIDが登録されているか確認します。
- 接続元が許可されない：ALLOWED_ORIGINSのhttps://とGitHubユーザー名を確認します。
- Firebase認証・保存失敗：秘密鍵・DB URL・サービスアカウントのプロジェクトと権限を確認します。秘密を画面やログに表示しない設計です。
- Discord 403・Missing Permissions：Botのロール位置とロール管理・キック権限を確認します。全員取得が403の場合はServer Members Intentも確認します。
- Discord回数制限：短い制限はAPIが待って1回再試行します。長い制限は待ち時間を表示します。取得・確認・転送の間に一律30秒待つ必要はありません。
- 通信中断：「履歴を更新」→「中断した転送の内容を確認」から10分以内の未確定ではないプランを再開できます。
- 要確認：Discord処理の直前に記録した後で応答が失われた場合、キック等を自動再実行しません。参加状態を取得して実際の状態を確認し、新しい変更確認を作ります。
- 情報が変わった：参加状態を取得・再読み込みし、新しい変更確認を作ります。
- 競合・処理中：同じサーバーで並行操作が発生した場合は待って再実行します。停止した処理のロックは最大3分で失効します。
- Free枠・CPU上限：WorkersのUsageとFirebaseの使用量を確認します。過去履歴が大きくなった場合はバックアップして整理する必要があります。この版は履歴の自動削除をしません。
