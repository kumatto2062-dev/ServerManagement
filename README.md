# IRIAM 星バッジ・Discord管理（PC常時起動不要版）

管理画面はGitHub Pages、APIはCloudflare Workers、保存先は現在のFirebase Realtime Databaseです。招待時のロール付与はDiscord標準のロール付き招待が担当します。Node.jsのBotをPCで起動し続ける必要はありません。

最初に [設定手順](docs/SETUP_JA.md) を読んでください。

## 機能

- 管理者のFirebaseメール・パスワード認証、管理者UIDによるAPIアクセス制限。
- Discord参加者の取得、在籍・退出・ロール差分の日本語表示。
- 名前、⭐0〜⭐5、未入力、返礼品対応状況の月別管理。現在のデータを引き継ぎます。
- 前月の星と連続⭐0を表示。未入力は⭐0にしません。
- 最新完了月の星に基づいて星ロールだけを入れ替えます。他のロールは維持します。
- 対象月と直前月が両方⭐0なら、確認画面とキック確認チェックの後にキック。BANではありません。
- 保護対象ID・オーナー・Bot・Discord未参加者はキックしません。
- 過去月は編集・保存のみ。誤って古い履歴に基づくロール変更・キックを実行しません。
- 確認プランは10分有効。変更後の情報は転送前に再確認します。
- 転送は1人ずつ実行し結果を保存。通信中断時は「履歴を更新」から有効なプランを確認して再開できます。
- Discordで作成した⭐1〜⭐5の招待URLを登録・コピー。サイトは招待設定そのものを変更しません。
- 参加状態差分、保存、ロール変更、キック、転送結果を日本語で表示。旧版の履歴も表示します。

## 旧版との違い

BotはDiscordに常時接続しません。そのためオンライン表示は不要です。参加・退出は「Discord参加状態を取得」を押した時点で取り込みます。招待時の月別獲得星数は自動入力しません。招待ロール付与には使用したURLの推測処理を使いません。

秘密鍵・Discord TokenはCloudflareのSecretに設定します。GitHubやpublic/config.jsには入れません。

## ファイル

| 場所 | 内容 |
|---|---|
| public/ | GitHub Pagesに公開する管理画面 |
| worker/ | Cloudflareで操作時だけ実行するAPI |
| .github/workflows/pages.yml | publicだけをPagesへ公開 |
| wrangler.toml | APIのデプロイ設定 |
| firebase/database.rules.json | ブラウザーからの直接読み書きを禁止するルール |
| test/ | 判定・保存・転送・認証等の自動テスト |
| docs/SETUP_JA.md | 最初からの設定手順 |
| docs/TEST_REPORT.md | 検証範囲と制約 |

## 開発用コマンド

Node.js 22以降を使用します。

```sh
npm ci
npm test
npm run check
npx wrangler login
npm run deploy:api
```

これは開発・公開時だけ必要です。運用のためにPCでNode.jsを動かし続ける必要はありません。

ローカルAPIの設定は `.dev.vars` に書き、`npm run dev:api` で確認できます。設定名は設定手順の表と同じです。ローカルUIには別のHTTPサーバーが必要です。HTMLのダブルクリックで開かないでください。

## 無料枠について

Workers Freeには1日10万リクエスト、1回のCPU時間や外部通信回数などの上限があります。転送を1人ずつ分割して1回の通信回数を抑えています。大人数の取得、大きくなった履歴、通信障害等によって上限に達する可能性があります。無料・無停止を保証するものではありません。課金プランへの変更はこのソースでは行いません。

## 公式資料

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/
- https://firebase.google.com/docs/database/rest/auth
- https://firebase.google.com/docs/database/rest/save-data
- https://firebase.google.com/docs/reference/rest/auth
- https://github.com/discord/discord-api-docs/blob/main/developers/communities/guides/community-invites.mdx
- https://github.com/discord/discord-api-docs/blob/main/developers/resources/guild.mdx
