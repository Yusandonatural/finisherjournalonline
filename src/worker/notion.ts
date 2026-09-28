// 既存の Notion データベース「🎒 Todo リスト」との同期。
// アプリで作ったタスクは「できた」にしたものだけを完了の記録として送る。
// アプリが触るのはタグ「目標達成ジャーナル」が付いた行だけ。
import { todayJST } from '../shared/dates';
import type { TaskStatus } from '../shared/progress';
import { all, one, run } from './db';
import type { Env } from './env';
import { createTask, nextPosition } from './tasks';

const DEFAULT_API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';

/** Todo リストのプロパティ名（Notion 側で名前を変えたらここを直す） */
export const PROP = {
  title: 'Name',
  date: 'Date',
  status: 'ステータス',
  checked: 'Checked',
  tags: 'タグ',
  content: '内容',
  url: 'URL',
  assignee: '担当者',
  priority: '優先度',
  place: '場所',
} as const;

export const STATUS_TO_NOTION: Record<TaskStatus, string> = {
  todo: '未着手',
  done: '完了',
  missed: 'できなかった',
  carried: '延期',
  dropped: 'キャンセル',
};

/** 「Notionから選ぶ」の候補にするステータス */
export const CANDIDATE_STATUSES = ['Inbox', '今週の対応事項', '今月対応予定', '未着手'];

export function notionEnabled(env: Env): boolean {
  return !!env.NOTION_TOKEN && !!env.NOTION_TASKS_DB_ID;
}

async function notion(env: Env, method: string, path: string, body?: unknown): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch((env.NOTION_API_BASE || DEFAULT_API) + path, {
      method,
      headers: {
        Authorization: `Bearer ${env.NOTION_TOKEN}`,
        'Notion-Version': VERSION,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after') ?? '1');
      await new Promise((r) => setTimeout(r, Math.min(wait, 5) * 1000));
      continue;
    }
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new Error(`Notion ${res.status}: ${json.message ?? ''}`);
    return json;
  }
  throw new Error('Notion: レート制限が続いています');
}

/** アプリの URL: 設定があればそれ、なければ実際に開かれた URL */
async function appUrl(env: Env): Promise<string> {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, '');
  const r = await one(env.DB, "SELECT value FROM sync_state WHERE key = 'app_origin'");
  return r?.value ?? 'http://localhost:8787';
}

/** Notion のセレクト名にカンマは使えないので置き換える */
function optionName(s: string): string {
  return s.replace(/,/g, '、').slice(0, 100);
}

export interface NotionTaskView {
  pageId: string;
  title: string;
  date: string | null;
  status: string | null;
  checked: boolean;
  tags: string[];
  places: string[];
  priority: string | null;
  url: string;
}

export function readPage(page: any): NotionTaskView {
  const p = page.properties ?? {};
  return {
    pageId: page.id,
    title: (p[PROP.title]?.title ?? []).map((t: any) => t.plain_text).join(''),
    date: p[PROP.date]?.date?.start ? String(p[PROP.date].date.start).slice(0, 10) : null,
    status: p[PROP.status]?.select?.name ?? null,
    checked: !!p[PROP.checked]?.checkbox,
    tags: (p[PROP.tags]?.multi_select ?? []).map((t: any) => t.name),
    places: (p[PROP.place]?.multi_select ?? []).map((t: any) => t.name),
    priority: p[PROP.priority]?.select?.name ?? null,
    url: page.url,
  };
}

/** Notion 側の状態 → アプリのタスク状態 */
export function statusFromNotion(v: Pick<NotionTaskView, 'status' | 'checked'>): TaskStatus {
  if (v.checked || v.status === '完了') return 'done';
  if (v.status === 'できなかった' || v.status === '延期') return 'missed';
  if (v.status === 'キャンセル') return 'dropped';
  return 'todo';
}

function snapshotOf(v: { title: string; date: string | null; status: TaskStatus }) {
  return JSON.stringify({ title: v.title, date: v.date, status: v.status });
}

async function log(env: Env, taskId: string | null, direction: string, result: string, message: string) {
  await run(env.DB, 'INSERT INTO notion_sync_log (task_id, direction, result, message) VALUES (?, ?, ?, ?)', taskId, direction, result, message.slice(0, 500));
  await run(env.DB, 'DELETE FROM notion_sync_log WHERE id < (SELECT MAX(id) - 500 FROM notion_sync_log)');
}

/** アプリのタスク 1件を Notion に書き込む（なければ作る） */
async function pushTask(env: Env, task: any) {
  const goal = task.goal_id ? await one(env.DB, 'SELECT title FROM goals WHERE id = ?', task.goal_id) : null;
  const term = await one(
    env.DB,
    'SELECT start_date FROM terms WHERE user_id = ? AND start_date <= ? AND end_date >= ?',
    task.user_id, task.date, task.date,
  );
  const day = term ? Math.round((Date.parse(task.date) - Date.parse(term.start_date)) / 86400000) + 1 : null;
  const content = [day ? `Day ${day}` : null, goal ? `目標: ${goal.title}` : null, task.carry_count ? `送った回数: ${task.carry_count}` : null]
    .filter(Boolean)
    .join(' ｜ ');
  const status = task.status as TaskStatus;
  const properties: any = {
    [PROP.title]: { title: [{ text: { content: task.title } }] },
    [PROP.date]: { date: { start: task.date } },
    [PROP.status]: { select: { name: STATUS_TO_NOTION[status] } },
    [PROP.checked]: { checkbox: status === 'done' },
    [PROP.content]: { rich_text: content ? [{ text: { content } }] : [] },
    [PROP.url]: { url: `${await appUrl(env)}/day/${task.date}#task-${task.id}` },
  };
  const wantTags = [env.NOTION_JOURNAL_TAG, ...(goal ? [optionName(goal.title)] : [])];

  let pageId = task.notion_page_id as string | null;
  if (pageId) {
    const page = await notion(env, 'GET', `/pages/${pageId}`);
    const current = readPage(page).tags;
    properties[PROP.tags] = { multi_select: [...new Set([...current, ...wantTags])].map((name) => ({ name })) };
    await notion(env, 'PATCH', `/pages/${pageId}`, { properties });
  } else {
    properties[PROP.tags] = { multi_select: wantTags.map((name) => ({ name })) };
    if (env.NOTION_ASSIGNEE) properties[PROP.assignee] = { multi_select: [{ name: env.NOTION_ASSIGNEE }] };
    const page = await notion(env, 'POST', '/pages', { parent: { database_id: env.NOTION_TASKS_DB_ID }, properties });
    pageId = page.id;
  }
  await run(
    env.DB,
    "UPDATE tasks SET notion_page_id = ?, notion_dirty = 0, notion_error = NULL, notion_synced_at = datetime('now'), notion_snapshot = ? WHERE id = ?",
    pageId, snapshotOf({ title: task.title, date: task.date, status }), task.id,
  );
}

/**
 * Notion に送る対象:
 * - アプリで作ったタスクは「できた」になったものだけ（完了の記録として Todo リストに追加）。
 *   すでに送った行は、完了を外したときに片付けるため対象に含める
 * - Notion から選んだ／取り込んだ行は、もともと Notion の行なので状態を送り続ける
 */
const SENDABLE = `notion_dirty = 1 AND kind = 'must' AND title != '' AND (
  notion_page_id IS NOT NULL OR (source = 'app' AND status = 'done')
)`;

/** 未同期のタスクを Notion へ送る */
export async function pushDirty(env: Env, limit = 30) {
  if (!notionEnabled(env)) return { pushed: 0, errors: 0 };
  const tasks = await all(
    env.DB,
    `SELECT * FROM tasks WHERE ${SENDABLE} ORDER BY updated_at LIMIT ?`,
    limit,
  );
  let pushed = 0;
  let errors = 0;
  for (const t of tasks) {
    try {
      if (t.source === 'app' && t.status !== 'done' && t.notion_page_id) {
        // 完了を外したアプリのタスク → Notion の行を片付ける
        await notion(env, 'PATCH', `/pages/${t.notion_page_id}`, { archived: true });
        await run(env.DB, 'UPDATE tasks SET notion_page_id = NULL, notion_snapshot = NULL, notion_dirty = 0, notion_error = NULL WHERE id = ?', t.id);
        pushed++;
        continue;
      }
      await pushTask(env, t);
      pushed++;
    } catch (e: any) {
      errors++;
      await run(env.DB, 'UPDATE tasks SET notion_error = ? WHERE id = ?', String(e.message).slice(0, 300), t.id);
      await log(env, t.id, 'push', 'error', e.message);
    }
  }
  if (pushed) await log(env, null, 'push', 'ok', `${pushed}件を送信`);
  return { pushed, errors };
}

export async function archivePage(env: Env, pageId: string) {
  if (!notionEnabled(env)) return;
  try {
    await notion(env, 'PATCH', `/pages/${pageId}`, { archived: true });
  } catch (e: any) {
    await log(env, null, 'push', 'error', `アーカイブ失敗: ${e.message}`);
  }
}

/** 絞り込みに使ったタグ（選択肢）がまだデータベースにないときの Notion のエラー */
function isMissingOption(e: unknown): boolean {
  return /option .* not found for property/i.test(String((e as Error)?.message ?? ''));
}

async function queryAll(env: Env, filter: unknown, max = 500) {
  const pages: any[] = [];
  let cursor: string | undefined;
  do {
    const r = await notion(env, 'POST', `/databases/${env.NOTION_TASKS_DB_ID}/query`, {
      filter,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    pages.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor && pages.length < max);
  return pages;
}

/** Notion 側の変更（完了チェック・ステータス・日付・タスク名・新規行）を取り込む */
export async function pull(env: Env) {
  if (!notionEnabled(env)) return { updated: 0, created: 0 };
  const owner = await one(env.DB, 'SELECT id FROM users ORDER BY created_at LIMIT 1');
  if (!owner) return { updated: 0, created: 0 };

  const cursorRow = await one(env.DB, "SELECT value FROM sync_state WHERE key = 'notion_pull_cursor'");
  // Notion の last_edited_time は分単位に丸められるので、余裕をもって2分戻す
  const startedAt = new Date(Date.now() - 2 * 60_000).toISOString();
  const filter: any = { and: [{ property: PROP.tags, multi_select: { contains: env.NOTION_JOURNAL_TAG } }] };
  if (cursorRow?.value) filter.and.push({ timestamp: 'last_edited_time', last_edited_time: { on_or_after: cursorRow.value } });

  let updated = 0;
  let created = 0;
  let pages: any[] = [];
  try {
    pages = await queryAll(env, filter);
  } catch (e) {
    // タグ「目標達成ジャーナル」がまだ一度も使われていない → 取り込む行はない
    if (!isMissingOption(e)) throw e;
  }
  for (const page of pages) {
    if (page.archived || page.in_trash) continue;
    const v = readPage(page);
    const status = statusFromNotion(v);
    const task = await one(env.DB, 'SELECT * FROM tasks WHERE notion_page_id = ?', page.id);
    const snap = snapshotOf({ title: v.title, date: v.date, status });

    if (task) {
      if (task.notion_snapshot === snap) continue; // 自分の書き込みの跳ね返り、または変更なし
      const prev = task.notion_snapshot ? JSON.parse(task.notion_snapshot) : {};
      const fields: Record<string, unknown> = {};
      if (v.title && v.title !== prev.title) fields.title = v.title;
      if (status !== prev.status) {
        fields.status = status;
        fields.done_at = status === 'done' ? new Date().toISOString() : null;
      }
      if (v.date && v.date !== prev.date && v.date !== task.date) {
        fields.date = v.date;
        fields.position = await nextPosition(env.DB, task.user_id, v.date);
      }
      const keys = Object.keys(fields);
      if (keys.length) {
        await run(
          env.DB,
          `UPDATE tasks SET ${keys.map((k) => `${k} = ?`).join(', ')}, notion_snapshot = ?, updated_at = datetime('now') WHERE id = ?`,
          ...keys.map((k) => fields[k]), snap, task.id,
        );
        updated++;
      } else {
        await run(env.DB, 'UPDATE tasks SET notion_snapshot = ? WHERE id = ?', snap, task.id);
      }
    } else if (v.date && v.title) {
      // Notion でタグ＋日付を付けて作った行 → その日のタスクとして取り込む
      const t = await createTask(env, owner.id, {
        date: v.date, title: v.title, source: 'notion', notion_page_id: page.id, notion_snapshot: snap,
      });
      await run(env.DB, 'UPDATE tasks SET status = ?, notion_dirty = 1 WHERE id = ?', status, t.id);
      created++;
    }
  }
  await run(env.DB, "INSERT INTO sync_state (key, value) VALUES ('notion_pull_cursor', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", startedAt);
  await run(env.DB, "INSERT INTO sync_state (key, value) VALUES ('notion_last_pull', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", new Date().toISOString());
  if (updated || created) await log(env, null, 'pull', 'ok', `更新${updated}件・新規${created}件を取り込み`);
  return { updated, created };
}

export async function syncAll(env: Env) {
  if (!notionEnabled(env)) return null;
  // 先に Notion の変更を取り込んでから送る（Notion 側の編集を古い値で上書きしないため）。
  // 取り込みに失敗しても送信は行う
  let q = { updated: 0, created: 0 };
  let pullError: string | null = null;
  try {
    q = await pull(env);
  } catch (e: any) {
    pullError = e.message;
    await log(env, null, 'pull', 'error', e.message);
  }
  const p = await pushDirty(env);
  return { ...p, ...q, pullError };
}

/** 「Notionから選ぶ」: まだジャーナルに入っていない Inbox／今週／今月／未着手 の行 */
export async function candidates(env: Env) {
  const filter = {
    and: [
      { or: CANDIDATE_STATUSES.map((s) => ({ property: PROP.status, select: { equals: s } })) },
      { property: PROP.tags, multi_select: { does_not_contain: env.NOTION_JOURNAL_TAG } },
    ],
  };
  let pages: any[];
  try {
    pages = await queryAll(env, filter, 200);
  } catch (e) {
    if (!isMissingOption(e)) throw e;
    // タグがまだないときは、ステータスだけで絞り込む（どの行にもまだタグは付いていない）
    pages = await queryAll(env, filter.and[0], 200);
  }
  const order = (p: string | null) => (p?.startsWith('高') ? 0 : p === '中' ? 1 : p === '低' ? 3 : 2);
  return pages
    .map(readPage)
    .filter((v) => v.title)
    .sort((a, b) => order(a.priority) - order(b.priority) || CANDIDATE_STATUSES.indexOf(a.status ?? '') - CANDIDATE_STATUSES.indexOf(b.status ?? ''));
}

/** Notion の行を指定日のタスクとして取り込む（行は複製しない） */
export async function pickFromNotion(env: Env, userId: string, pageId: string, date: string) {
  const existing = await one(env.DB, "SELECT * FROM tasks WHERE notion_page_id = ? AND status NOT IN ('carried', 'dropped')", pageId);
  if (existing) return existing;
  const v = readPage(await notion(env, 'GET', `/pages/${pageId}`));
  const task = await createTask(env, userId, { date, title: v.title || '（無題）', source: 'notion', notion_page_id: pageId });
  await pushTask(env, task); // タグ・日付・URL を付ける
  return one(env.DB, 'SELECT * FROM tasks WHERE id = ?', task.id);
}

export async function status(env: Env) {
  const last = await one(env.DB, "SELECT value FROM sync_state WHERE key = 'notion_last_pull'");
  const dirty = await one(env.DB, `SELECT COUNT(*) AS n FROM tasks WHERE ${SENDABLE}`);
  const errors = await one(env.DB, 'SELECT COUNT(*) AS n FROM tasks WHERE notion_error IS NOT NULL');
  const logs = await all(env.DB, 'SELECT * FROM notion_sync_log ORDER BY id DESC LIMIT 20');
  return {
    enabled: notionEnabled(env),
    databaseId: env.NOTION_TASKS_DB_ID,
    tag: env.NOTION_JOURNAL_TAG,
    lastPull: last?.value ?? null,
    dirty: dirty?.n ?? 0,
    errors: errors?.n ?? 0,
    today: todayJST(),
    logs,
  };
}
