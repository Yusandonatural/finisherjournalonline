// 画面操作の確認（playwright-core が必要: npm i -D playwright-core）
// 使い方: npm run dev のあと  node tests/e2e/ui.mjs 2026-10-15   ※日付は未使用の日を指定
import { chromium } from 'playwright-core';
const B = process.env.BASE ?? 'http://127.0.0.1:8787';
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
const D = process.argv[2] ?? '2026-10-15';
const next = new Date(Date.parse(D) + 86400000).toISOString().slice(0, 10);
const dow = new Date(D + 'T00:00:00Z').getUTCDay();
const MON = new Date(Date.parse(D) - ((dow + 6) % 7) * 86400000).toISOString().slice(0, 10);
page.on('pageerror', (e) => errors.push(e.message));
const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok -', m); };
await page.goto(B + '/auth/dev');
await page.goto(B + '/day/' + D);
await page.waitForSelector('text=今日やるべきこと');
// 空欄に入力して Enter → タスク作成
await page.getByLabel('やるべきこと 1').fill('畑の見回り');
await page.getByLabel('やるべきこと 1').press('Enter');
await page.waitForSelector('input[aria-label="やるべきこと"]');
ok(await page.locator('input[aria-label="やるべきこと"]').first().inputValue() === '畑の見回り', 'typing in an empty slot creates a task');
// 完了チェック
await page.getByLabel('できた').first().check();
await page.waitForTimeout(500);
ok(await page.locator('.task-row.status-done').count() === 1, 'checking a task marks it done');
// 自動保存
await page.getByPlaceholder('ひとつだけ').fill('内装業者に連絡する');
await page.getByPlaceholder('良かったこと 1').fill('朝日がきれいだった');
await page.waitForTimeout(1500);
await page.reload();
await page.waitForSelector('text=今日やるべきこと');
ok(await page.getByPlaceholder('ひとつだけ').inputValue() === '内装業者に連絡する', 'focus autosaves');
ok(await page.getByPlaceholder('良かったこと 1').inputValue() === '朝日がきれいだった', 'good things autosave');
// 入力直後にページを離れても保存される（sendBeacon）
await page.getByPlaceholder('自由に').fill('離れる直前のメモ');
await page.goto(B + '/settings');
await page.waitForTimeout(500);
await page.goto(B + '/day/' + D);
await page.waitForSelector('.habit-list');
ok(await page.getByPlaceholder('自由に').inputValue() === '離れる直前のメモ', 'text typed right before leaving is still there when coming back');
await page.waitForTimeout(1500);
const saved = await (await page.request.get(B + '/api/days/' + D)).json();
ok(saved.entry.memo === '離れる直前のメモ', '...and it is saved to the server');
// 習慣チェック
const habit = page.locator('.habit-list input[type=checkbox]').first();
await habit.check();
await page.waitForTimeout(600);
await page.reload();
await page.waitForSelector('.habit-list');
ok(await page.locator('.habit-list input[type=checkbox]').first().isChecked(), 'habit check persists');
// 送る メニュー
await page.locator('.task-actions .icon-btn').first().click();
ok(await page.getByRole('menuitem', { name: '未完了に戻す' }).isVisible() && !(await page.getByRole('menuitem', { name: '翌日へ送る' }).count()), 'done task menu offers undo, not carry');
await page.keyboard.press('Escape');
// マイルストーンを目標パネルから
await page.locator('.goal-head').nth(1).click();
ok(await page.locator('.goal-detail .check').count() === 4, 'goal panel expands milestones');
// 前後移動（キーボード）
await page.locator('body').click({ position: { x: 5, y: 300 } });
await page.keyboard.press('ArrowRight');
await page.waitForURL('**/day/' + next);
ok(true, 'arrow key moves to next day');
// タブの連動
await page.goto(B + '/week/2026-11-02');
await page.waitForSelector('text=の週');
await page.getByRole('navigation', { name: 'メイン' }).first().getByRole('link', { name: '月間' }).click();
await page.waitForURL('**/month/2026-11-01');
ok(true, 'month tab follows the viewed week (Nov)');
await page.getByRole('navigation', { name: 'メイン' }).first().getByRole('link', { name: '3ヶ月' }).click();
await page.waitForURL(/\/term\/[0-9a-f]+$/);
ok(await page.locator('h1').textContent() === '2026 Q4（10/1〜12/31）', '3-month tab opens the term for that date');
// 週間レビュー: 星と振り返り
await page.goto(B + '/week/' + MON + '/review');
await page.waitForSelector('text=ふりかえり');
await page.getByLabel('良かったこと・できたこと').fill('物件を2件見られた');
await page.getByRole('radio').nth(3).click();
await page.getByRole('button', { name: 'レビューを完了する' }).click();
await page.waitForTimeout(1200);
await page.reload();
await page.waitForSelector('text=ふりかえり');
ok(await page.getByLabel('良かったこと・できたこと').inputValue() === '物件を2件見られた', 'weekly review text saves');
ok(await page.getByRole('button', { name: '✓ レビュー完了' }).isVisible(), 'weekly review completion saves');
// 台帳フィルタ
await page.goto(B + '/term');
await page.waitForURL(/\/term\/[0-9a-f]+$/);
await page.getByRole('link', { name: 'タスク台帳' }).click();
await page.getByRole('button', { name: 'できた', exact: true }).click();
const rows = await page.locator('.ledger tr').evaluateAll((rs) => rs.map((r) => r.className));
ok(rows.length > 0 && rows.every((c) => c === 'status-done'), `ledger filter shows only done tasks (${rows.length})`);
// 月間予定: 目標追加
await page.goto(B + '/month/' + D.slice(0, 8) + '01');
await page.getByRole('button', { name: '＋ 目標を追加' }).click();
await page.locator('.target-list input:not([type=checkbox])').first().fill('カフェの物件を決める');
await page.waitForTimeout(1500);
await page.reload();
await page.waitForSelector('.target-list');
ok(await page.locator('.target-list input:not([type=checkbox])').first().inputValue() === 'カフェの物件を決める', 'monthly target saves');
console.log(errors.length ? 'page errors: ' + errors.join('\n') : 'no page errors');
await browser.close();
