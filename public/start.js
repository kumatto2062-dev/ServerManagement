try { await import('./app.js'); }
catch { const node=document.getElementById('message'); node.textContent='初期設定を読み込めませんでした。Botサーバーの公開URLで開き、FIREBASE_WEB_API_KEYの設定を確認してください。GitHub Pagesではconfig.jsを手動設定してください。';node.className='alert'; }
