# AQUA BOAT GRAND PRIX ONLINE

誰でも登録できる、無料ゲーム内メダル制のオンライン・ボートレースゲームのスターターキットです。

## できること
- メールアドレス＋パスワードで新規登録・ログイン（Supabase Auth）
- 新規ユーザーに無料メダル10,000枚を付与
- レース一覧、レース作成、6艇までの参加登録
- 舟券（単勝・複勝・2連単・2連複・3連単・3連複・拡連複）の購入UI
- レース結果・ゲーム内メダルの精算を行うDB関数
- Supabase Realtimeでレース一覧の更新を購読
- スマホ対応のWeb UI

## セットアップ

### 1. Supabaseプロジェクトを作成
https://supabase.com でプロジェクトを作成します。

### 2. DBを作成
SupabaseのSQL Editorで `supabase/schema.sql` の内容を実行してください。

### 3. 環境変数
`.env.local.example` を `.env.local` にコピーして値を設定します。
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon/public key

### 4. 起動
Node.js 20以上を用意して、プロジェクトフォルダで実行します。

```bash
npm install
npm run dev
```

ブラウザで http://localhost:3000 を開きます。

## 公開
GitHubにプロジェクトをpushし、VercelにImportします。VercelのEnvironment Variablesにも上記2つを設定してDeployしてください。

## 大事な注意
- このZIPは公開可能な土台となるスターターであり、こちらからSupabase/Vercelアカウントを作成したり、実際にインターネットへ公開したりはしていません。
- メダルは換金・譲渡不可のゲーム内ポイントとして設計しています。現金賭博や現実の舟券購入には接続しません。
- レース結果はサーバー側のデモ用シミュレーションです。本番運用前に、不正対策、レート制限、監査ログ、年齢・地域に応じた法務確認、バックアップ、監視を追加してください。
- 公開前にSupabase Authのメール確認、パスワードポリシー、RLS、SMTP、利用規約・プライバシーポリシーを設定してください。
