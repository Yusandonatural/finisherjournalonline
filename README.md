# 目標達成ジャーナル｜90日の挑戦

紙の「フィニッシャージャーナル」（90日ジャーナル）をもとにした Web アプリです。
3ヶ月（1ターム）の目標を立て、1日1ページのジャーナルで「やるべきこと3つ」を積み上げ、
週・月・3ヶ月の単位で予定とふりかえりを行います。

- 仕様書: [docs/SPEC.md](docs/SPEC.md)
- 最初のターム: 2026-10-01〜2026-12-31（92日）。初回ログイン時に自動で作られます。

## 画面

上部（スマホは下部）のタブで切り替えます。週間・月間・3ヶ月のタブは「いま見ている日付」に連動します。

| タブ | 中のタブ | 内容 |
|---|---|---|
| 今日 | — | 1日1ページ。3ヶ月の目標（常時表示・習慣チェック）、Googleカレンダーの予定、やるべきこと3つ、集中すべきこと、良かったこと3つ、メモ |
| 週間 | 週間予定／週間レビュー | 週のテーマと目標、7日分の予定とタスク、習慣の表。レビューは達成率（前週比）、できた／できなかった、良かったこと、ふりかえり |
| 月間 | 月間予定／月間レビュー | 月のテーマと目標、月カレンダー（予定・タスク・記入状況）。レビューは週ごとの一覧、目標別、習慣、ふりかえり |
| 3ヶ月 | 進捗／タスク台帳／総括／目標設定 | 経過と目標の進捗・習慣のヒートマップ、全タスクの台帳、できた／できなかったの総括、目標の編集 |

## 構成

| 層 | 使っているもの |
|---|---|
| 配信・API | Cloudflare Workers（Hono）。画面の静的ファイルも同じ Worker から配信 |
| DB | Cloudflare D1（`migrations/`） |
| 画面 | React + Vite（`src/web/`） |
| 共通ロジック | `src/shared/`（日付・進捗の計算。単体テストあり） |
| 定期処理 | Cron（15分ごと）: 期限切れタスクを「できなかった」に更新し、Notion と同期 |

## ローカルで動かす

```bash
npm install
cp .dev.vars.example .dev.vars   # TOKEN_ENC_KEY に `openssl rand -base64 32` の値を入れる
npm run db:migrate:local
npm run dev                      # http://localhost:8787
```

`.dev.vars` に `DEV_LOGIN=true` があれば、ログイン画面の「開発用ログイン」から Google なしで入れます（localhost のときだけ有効）。
Googleカレンダーと Notion を試すときは、それぞれの値も `.dev.vars` に入れます。

## 本番公開の手順

### 1. Cloudflare（D1 とデプロイ）

```bash
npx wrangler login
npx wrangler d1 create finisher-journal     # 表示された database_id を wrangler.toml に書く
npm run db:migrate:remote
npx wrangler secret put TOKEN_ENC_KEY        # openssl rand -base64 32 の値
npm run deploy
```

### 2. Google（ログインとカレンダー）

1. Google Cloud Console でプロジェクトを作り、「Google Calendar API」を有効にする。
2. 「OAuth 同意画面」を作る。yusando.com が Google Workspace なら種類は「内部」にする。
   「外部」にする場合は、公開ステータスを「本番環境」にする。テストのままだと7日ごとに再ログインが必要になる。
3. 「認証情報 → OAuth クライアント ID（ウェブアプリケーション）」を作り、承認済みリダイレクト URI に次を登録する。
   - `https://<本番のURL>/auth/callback`
   - `http://localhost:8787/auth/callback`（ローカル用）
4. クライアント ID とシークレットを登録する。

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

使えるアカウントは `wrangler.toml` の `ALLOWED_EMAILS` で決まります（カンマ区切り）。

### 3. Notion（Todo リストとの同期）

1. https://www.notion.so/profile/integrations で「内部インテグレーション」を作る。機能は「コンテンツを読み取る・更新する・挿入する」。
2. Notion の「MY LIFE OS」ページ右上の「…」→「コネクト」で、作ったインテグレーションを追加する（中の「🎒 Todo リスト」にも権限が付く）。
3. トークンを登録する。

```bash
npx wrangler secret put NOTION_TOKEN
```

同期先のデータベース ID、タグ名、担当者名は `wrangler.toml` の `[vars]` にあります。
ステータスの「できなかった」とタグの「目標達成ジャーナル」は、最初に書き込んだときに Notion 側で自動的に選択肢として追加されます。
アプリが読み書きするのはタグ「目標達成ジャーナル」が付いた行だけです。
アプリで作ったタスクは「できた」にしたものだけが、完了の記録として Todo リストに追加されます。

### 4. URL（ドメイン）

`wrangler.toml` の `APP_URL`（Notion に書くリンク）と、ログイン画面の canonical・OGP は `https://journal.yusando.com` を前提にしています。
yusando.com の DNS は Route 53 にあるため、Workers のカスタムドメインはそのままでは使えません。次のどちらかを選びます。

- **workers.dev をそのまま使う**: デプロイ後に表示される `https://finisher-journal.<アカウント>.workers.dev` を使う。`APP_URL` と Google のリダイレクト URI をその URL に合わせる。
- **journal.yusando.com を使う**: yusando.com のネームサーバーを Cloudflare に移すか、Cloudflare 側で別の方法（Cloudflare for SaaS など）を用意する。

### 5. 公開後の確認（Google 標準装備）

計測と検索登録はログイン画面（`/login`）だけが対象です。ログイン後の画面は `noindex` で、計測タグも入れていません。

1. GA4（`G-9JG1FFTL1B`）のリアルタイムで、ログイン画面の表示と `login` イベントが届くか確認する。サイト別の集計は「ホスト名」で切る。
2. Search Console に URL プレフィックスで追加し、`sitemap.xml` を送信する（任意）。
3. OGP は Facebook / X のカードデバッガで `og.png` が出るか確認する。

## 自動デプロイ（GitHub Actions）

`main` と `claude/confident-newton-rvehln` に push すると、型チェックと単体テストのあと、D1 のマイグレーションを当てて本番にデプロイします（`.github/workflows/deploy.yml`）。
最初に一度だけ、GitHub のリポジトリに次の2つのシークレットを登録します（Settings → Secrets and variables → Actions → New repository secret）。

| 名前 | 値 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare の「My Profile → API Tokens → Create Token」で、テンプレート「Edit Cloudflare Workers」を選び、権限に「Account → D1 → Edit」を追加して作ったトークン |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare ダッシュボードの「Workers & Pages」右側に表示される Account ID |

未登録のあいだは、テストだけ実行してデプロイはスキップします。手動で実行するときは Actions タブの「Deploy」→「Run workflow」。

## テスト

```bash
npm test          # 日付・進捗計算の単体テスト
npm run typecheck
```

通しのテスト（`tests/e2e/`）はローカルのサーバーに対して実行します。

```bash
# API の通しテスト（空のローカル DB で1回）
npm run dev &
node tests/e2e/api-smoke.mjs

# Notion 同期（モックの Notion を使う）
node tests/e2e/notion-mock.mjs &
npx wrangler dev --port 8788 --persist-to .wrangler/notion-test \
  --var NOTION_TOKEN:test --var NOTION_API_BASE:http://127.0.0.1:9999 &
npx wrangler d1 migrations apply finisher-journal --local --persist-to .wrangler/notion-test
node tests/e2e/notion-sync.mjs

# 画面操作（playwright-core が必要）
node tests/e2e/ui.mjs 2026-10-15
```
