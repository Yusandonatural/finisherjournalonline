// デモ用の例データ。今日を含む四半期と、その前の四半期に「使ってきた記録」を作る。
import { addDays, daysInRange, mondayOf, monthStart, quarterOf, todayJST, weekday } from '../shared/dates';

export const DEMO_USER = { id: 'demo', email: 'demo@example.com', name: 'デモ', picture_url: null };

type Run = (sql: string, p?: unknown[]) => void;

/** 毎回同じ例になるように、決まった順で出る乱数 */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const GOODS = [
  '朝の茶畑がきれいだった', '卸先から追加の注文が来た', '動画の編集が早く終わった', '家族で夕飯を囲めた',
  'フランス語で日記を5行書けた', 'お客さんにお茶をほめられた', '紅茶の発酵がうまくいった', 'よく眠れた',
  '古民家の掃除が進んだ', 'ツアーの予約が1件入った', '新しい茶器が届いた', '雨上がりの空気が気持ちよかった',
  '若手生産者と話せた', '炭焼きの段取りが決まった', '朝拝で気持ちが整った', '子どもと散歩した',
];
const FOCUS = ['物件の条件を決める', '動画を1本仕上げる', '書類をそろえる', 'メニューの試作', '卸先に連絡する', '内装の打ち合わせ', '茶畑の手入れ', '請求書の整理'];

export function seedData(run: Run) {
  const today = todayJST();
  const cur = quarterOf(today);
  const prev = quarterOf(addDays(cur.start, -1));
  const r = rng(20261001);
  const id = () => Math.floor(r() * 1e16).toString(16) + Math.floor(r() * 1e16).toString(16);

  run('INSERT INTO users (id, email, name) VALUES (?, ?, ?)', [DEMO_USER.id, DEMO_USER.email, DEMO_USER.name]);
  run('INSERT INTO user_settings (user_id, calendar_ids_json, life_vision) VALUES (?, ?, ?)', [DEMO_USER.id, '["primary","yusando"]', '自然と共に生き、自然茶の豊かさを世界に届ける']);
  [
    ['自然茶を世界20か国に届ける', '仕事', 2035],
    ['日本自然茶協会を全国の仲間とつくる', '仕事', 2030],
    ['家族と毎年、長い旅に出る', '家族', null],
    ['フランス語と中国語で茶を語れるようになる', '学び', 2030],
    ['自分の手で建てた茶室でお茶会をひらく', '暮らし', 2032],
  ].forEach(([t, c, y], i) => run('INSERT INTO life_goals (id, user_id, title, category, target_year, sort_order) VALUES (?, ?, ?, ?, ?, ?)', [`lg${i}`, DEMO_USER.id, t, c, y, i]));

  for (const term of [prev, cur]) {
    const tid = id();
    const isCur = term === cur;
    run('INSERT INTO terms (id, user_id, title, start_date, end_date) VALUES (?, ?, ?, ?, ?)', [tid, DEMO_USER.id, term.title, term.start, term.end]);
    const until = isCur ? addDays(today, -1) : term.end;
    const elapsed = daysInRange(term.start, until).length;
    const ratio = elapsed / daysInRange(term.start, term.end).length;

    // プロジェクト目標
    const cafe = id();
    const yt = id();
    const lic = id();
    run(
      `INSERT INTO goals (id, term_id, type, title, why, sort_order, obstacle, obstacle_plan) VALUES (?, ?, 'project', ?, ?, 0, ?, ?)`,
      [cafe, tid, 'カフェ／SHOPをオープンする', '自然茶を体験できる場所をつくる', '内装業者の日程が合わない', '2社に見積もりを取り、早めに日程を押さえる'],
    );
    const ms = ['物件の契約', '内装工事', 'メニューを決める', 'プレオープン', 'オープン'];
    ms.forEach((m, i) => run('INSERT INTO milestones (id, goal_id, title, done, sort_order) VALUES (?, ?, ?, ?, ?)', [id(), cafe, m, i < Math.floor(ms.length * ratio * 0.9) ? 1 : 0, i]));
    run(
      `INSERT INTO goals (id, term_id, type, title, why, sort_order, metric_unit, metric_start, metric_current, metric_target, obstacle, obstacle_plan)
       VALUES (?, ?, 'project', ?, ?, 1, '人', 3200, ?, 10000, ?, ?)`,
      [yt, tid, 'YouTube 登録者 1万人', '自然茶の魅力を世界に届ける', Math.round(3200 + 6800 * ratio * 0.62), '撮影の時間が取れない', '朝の30分を撮影に固定する'],
    );
    run(`INSERT INTO goals (id, term_id, type, title, why, sort_order) VALUES (?, ?, 'project', ?, ?, 2)`, [lic, tid, '許認可をそろえる', 'カフェと販売を始めるため']);
    ['食品衛生責任者', '飲食店営業許可', '酒類販売業免許', '有機JAS'].forEach((m, i) =>
      run('INSERT INTO milestones (id, goal_id, title, done, sort_order) VALUES (?, ?, ?, ?, ?)', [id(), lic, m, i < Math.floor(4 * ratio) ? 1 : 0, i]),
    );

    // 習慣目標
    const habits: [string, string, string | null, number | null, number][] = [
      ['朝拝', 'daily', null, null, 0.9],
      ['フランス語の日記', 'daily', null, null, 0.7],
      ['トイレ掃除', 'daily', null, null, 0.8],
      ['筋トレ', 'weekly', null, 3, 0.45],
      ['瞑想', 'weekdays', '[1,2,3,4,5]', null, 0.6],
    ];
    habits.forEach(([title, freq, wds, times, p], i) => {
      const hid = id();
      run(
        `INSERT INTO goals (id, term_id, type, title, sort_order, habit_frequency, habit_weekdays_json, habit_times_per_week) VALUES (?, ?, 'habit', ?, ?, ?, ?, ?)`,
        [hid, tid, title, 10 + i, freq, wds, times],
      );
      for (const d of daysInRange(term.start, until)) if (r() < p) run('INSERT INTO habit_logs (goal_id, date, done) VALUES (?, ?, 1)', [hid, d]);
    });

    // 毎日のページとタスク
    const pool: [string, string | null][] = [
      ['内装業者に連絡', cafe], ['メニューの試作', cafe], ['物件の図面を確認', cafe], ['テーブルを選ぶ', cafe],
      ['動画を1本撮る', yt], ['サムネイルを作る', yt], ['ショート動画を2本投稿', yt], ['コメントに返信', yt],
      ['保健所に相談', lic], ['申請書類をそろえる', lic],
      ['卸先に見積もりを送る', null], ['請求書を送る', null], ['茶畑の見回り', null], ['発送の準備', null],
    ];
    for (const d of daysInRange(term.start, until)) {
      const eid = id();
      const goods = [0, 1, 2].map(() => (r() < 0.8 ? GOODS[Math.floor(r() * GOODS.length)] : ''));
      run('INSERT INTO daily_entries (id, user_id, date, focus, goods_json, completed) VALUES (?, ?, ?, ?, ?, ?)', [
        eid, DEMO_USER.id, d, FOCUS[Math.floor(r() * FOCUS.length)], JSON.stringify(goods), r() < 0.85 ? 1 : 0,
      ]);
      const n = r() < 0.1 ? 2 : 3;
      for (let pos = 1; pos <= n; pos++) {
        const [title, goal] = pool[Math.floor(r() * pool.length)];
        const done = r() < (weekday(d) === 6 || weekday(d) === 0 ? 0.55 : 0.78);
        run(
          `INSERT INTO tasks (id, user_id, date, position, title, status, goal_id, carry_count, notion_dirty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [id(), DEMO_USER.id, d, pos, title, done ? 'done' : 'missed', goal, !done && r() < 0.3 ? 1 + Math.floor(r() * 2) : 0],
        );
      }
    }

    if (isCur) {
      // 今日: やるべきこと3つ（1つ完了）と、時間があればやること
      const todays: [string, string | null, string][] = [
        ['内装業者と打ち合わせ', cafe, 'done'],
        ['動画を1本撮る', yt, 'todo'],
        ['飲食店営業許可の書類をそろえる', lic, 'todo'],
      ];
      todays.forEach(([t, g, s], i) =>
        run(`INSERT INTO tasks (id, user_id, date, position, title, status, goal_id, notion_dirty) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`, [id(), DEMO_USER.id, today, i + 1, t, s, g]),
      );
      ['茶器の写真を撮る', '本を20ページ読む'].forEach((t, i) =>
        run(`INSERT INTO tasks (id, user_id, date, position, title, kind, notion_dirty) VALUES (?, ?, ?, ?, ?, 'might', 0)`, [id(), DEMO_USER.id, today, i + 1, t]),
      );
      run('INSERT INTO daily_entries (id, user_id, date, focus, goods_json) VALUES (?, ?, ?, ?, ?)', [id(), DEMO_USER.id, today, '内装の段取りを決めきる', JSON.stringify(['朝の茶畑がきれいだった', '', ''])]);

      // ロックイン: 10倍目標・90日目のイベント・Day 0（1つだけ残す）・ルールと記録
      run(
        `UPDATE terms SET lockin = 1, tenx_goal = ?, commit_title = ?, commit_date = ?, commit_proof = ?, setup_json = ? WHERE id = ?`,
        ['自然茶の年間売上を10倍にする（海外の卸先を10か国に）', '古民家カフェのグランドオープン', term.end, '告知ページ公開済み・招待状100通発送',
          JSON.stringify({ alcohol: true, temptations: true, phone: true, desk: true, cushion: true, green: false }), tid],
      );
      const rules: [string, string | null, string, string, number, string, number][] = [
        [id(), 'exercise', 'common', '運動', 30, 'min', 0.8],
        [id(), 'meditation', 'common', '瞑想', 15, 'min', 0.75],
        [id(), 'alcohol', 'common', '禁酒', 1, 'check', 0.95],
        [id(), null, 'custom', '朝5時に起きる', 1, 'check', 0.7],
        [id(), null, 'custom', 'SNSは夜20時以降だけ', 1, 'check', 0.65],
      ];
      rules.forEach(([rid, key, cat, title, target, unit, p], i) => {
        run('INSERT INTO lockin_rules (id, term_id, category, rule_key, title, target_value, unit, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [rid, tid, cat, key, title, target, unit, i]);
        for (const d of daysInRange(term.start, until)) {
          const ok = r() < p;
          const value = unit === 'min' ? (ok ? target + Math.floor(r() * 15) : Math.floor(r() * target)) : 0;
          run('INSERT INTO lockin_logs (rule_id, date, value, done) VALUES (?, ?, ?, ?)', [rid, d, value, ok ? 1 : 0]);
        }
        if (key === 'meditation') run('INSERT INTO lockin_logs (rule_id, date, value, done) VALUES (?, ?, 10, 0)', [rid, today]);
        if (key === 'exercise') run('INSERT INTO lockin_logs (rule_id, date, value, done) VALUES (?, ?, 30, 1)', [rid, today]);
      });
      const metrics = ['動画 1本 編集', '原稿 2,400字', '見積もり 3社', '試作 4品', '動画 2本 撮影', '申請書 2枚'];
      daysInRange(addDays(today, -6), addDays(today, -1)).forEach((d, i) =>
        run('UPDATE daily_entries SET progress_metric = ? WHERE user_id = ? AND date = ?', [metrics[i % metrics.length], DEMO_USER.id, d]),
      );
      const ev = addDays(today, -1);
      run('UPDATE daily_entries SET event_day = 1, event_json = ? WHERE user_id = ? AND date = ?', [
        JSON.stringify({ title: '卸先との会食', noAlcohol: true, morningWork: true }), DEMO_USER.id, ev,
      ]);

      // 週と月の予定・レビュー
      const thisWeek = mondayOf(today);
      const lastWeek = addDays(thisWeek, -7);
      run(
        `INSERT INTO period_notes (user_id, kind, start_date, theme, targets_json, review_good, review_bad, review_learn, review_next, review_score, reviewed)
         VALUES (?, 'week', ?, ?, ?, ?, ?, ?, ?, 4, 1)`,
        [DEMO_USER.id, lastWeek, '内装を前に進める週', JSON.stringify([{ text: '内装の見積もりを2社から取る', done: true }, { text: '動画を3本出す', done: false }]),
         '見積もりが2社そろった', '動画は1本しか出せなかった', '撮影は朝にしないと後回しになる', '撮影は朝7時から30分に固定する'],
      );
      run(`INSERT INTO period_notes (user_id, kind, start_date, theme, targets_json) VALUES (?, 'week', ?, ?, ?)`, [
        DEMO_USER.id, thisWeek, '許認可の書類を片づける週',
        JSON.stringify([{ text: '飲食店営業許可を申請する', done: false }, { text: '動画を2本出す', done: true }, { text: '朝拝を毎日', done: false }]),
      ]);
      run(`INSERT INTO period_notes (user_id, kind, start_date, theme, targets_json) VALUES (?, 'month', ?, ?, ?)`, [
        DEMO_USER.id, monthStart(today), 'カフェの形を決めきる月',
        JSON.stringify([{ text: '内装の契約', done: true }, { text: 'メニュー10品の試作', done: false }, { text: '登録者を500人増やす', done: false }]),
      ]);
    }
  }
}

/** 今日の前後2週間の例の予定 */
export function seedCalendar() {
  const today = todayJST();
  const out: any[] = [];
  const t = (d: string, hm: string) => `${d}T${hm}:00+09:00`;
  let n = 0;
  for (const d of daysInRange(addDays(today, -14), addDays(today, 21))) {
    const w = weekday(d);
    if (w >= 1 && w <= 5) out.push({ id: `e${n++}`, calendarId: 'primary', summary: '朝拝', description: '', location: '自宅', allDay: false, start: t(d, '06:30'), end: t(d, '07:00') });
    if (w === 2 || w === 4) out.push({ id: `e${n++}`, calendarId: 'yusando', summary: '茶畑の見回り', description: '', location: '高尾', allDay: false, start: t(d, '09:00'), end: t(d, '11:00') });
    if (w === 3) out.push({ id: `e${n++}`, calendarId: 'yusando', summary: '発送作業', description: '', location: 'HQ', allDay: false, start: t(d, '14:00'), end: t(d, '16:00') });
  }
  out.push({ id: `e${n++}`, calendarId: 'yusando', summary: '卸先と打ち合わせ', description: '新茶の数量について', location: 'HQ', allDay: false, start: t(today, '13:00'), end: t(today, '14:00') });
  out.push({ id: `e${n++}`, calendarId: 'yusando', summary: '古民家カフェ 内装の打ち合わせ', description: '', location: '古民家', allDay: false, start: t(addDays(today, 1), '10:00'), end: t(addDays(today, 1), '12:00') });
  out.push({ id: `e${n++}`, calendarId: 'yusando', summary: '製茶作業', description: '', location: '茶工場', allDay: true, start: addDays(today, 3), end: addDays(today, 5) });
  out.push({ id: `e${n++}`, calendarId: 'primary', summary: 'サッカー（子ども）', description: '', location: '', allDay: false, start: t(addDays(today, 5), '09:00'), end: t(addDays(today, 5), '12:00') });
  return out;
}
