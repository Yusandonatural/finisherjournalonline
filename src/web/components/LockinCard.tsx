import { useState } from 'react';
import { Link } from 'react-router-dom';
import { shortDate } from '../../shared/dates';
import { EVENT_CHECKS } from '../../shared/lockin';
import { put } from '../api';

type Rule = { id: string; category: string; rule_key: string | null; title: string; target_value: number; unit: 'min' | 'check'; value: number; done: boolean };

/** デイリーページの「ロックイン」：毎日のルール・イベントの日の例外モード・今日の進み具合 */
export function LockinCard({ date, termId, data, progress, onProgress }: {
  date: string;
  termId: string;
  data: any;
  progress: string;
  onProgress: (v: string) => void;
}) {
  const [rules, setRules] = useState<Rule[]>(data.rules);
  const [event, setEvent] = useState(data.event);
  const [prevEvent, setPrevEvent] = useState(data.prevEvent);
  const [error, setError] = useState<string | null>(null);
  const kept = rules.filter((r) => r.done).length;
  const commit = data.commit;

  async function log(rule: Rule, body: { value?: number; add?: number; done?: boolean }) {
    // 先に画面を変えておき、保存の結果で上書きする
    const guess = { ...rule };
    if (body.add != null) guess.value = Math.max(0, rule.value + body.add);
    if (body.value != null) guess.value = body.value;
    if (body.done != null) guess.done = body.done;
    if (rule.unit === 'min') guess.done = guess.value >= rule.target_value;
    setRules((rs) => rs.map((r) => (r.id === rule.id ? guess : r)));
    try {
      const r = await put(`/days/${date}/lockin/${rule.id}`, body);
      setRules((rs) => rs.map((x) => (x.id === rule.id ? { ...x, ...r } : x)));
      setError(null);
    } catch (e: any) {
      setRules((rs) => rs.map((x) => (x.id === rule.id ? rule : x)));
      setError(e.message);
    }
  }

  async function saveEvent(on: boolean | null, patch: Record<string, unknown> = {}) {
    const next = { ...event, ...(on == null ? {} : { on }), ...patch };
    setEvent(next);
    try {
      await put(`/days/${date}`, { ...(on == null ? {} : { event_day: on }), ...(Object.keys(patch).length ? { event: patch } : {}) });
      if ('noAlcohol' in patch) {
        setRules((rs) => rs.map((r) => (r.rule_key === 'alcohol' ? { ...r, done: !!patch.noAlcohol } : r)));
      }
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function answerPrev(v: boolean) {
    setPrevEvent({ ...prevEvent, nextDayOnTime: v });
    try {
      await put(`/days/${prevEvent.date}`, { event: { nextDayOnTime: v } });
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <section className="card lockin-card no-swipe">
      <div className="card-head">
        <h2 className="card-title">
          ロックイン <span className={`chip ${kept === rules.length ? 'chip-good' : ''}`}>{kept} / {rules.length}</span>
        </h2>
        {commit?.daysLeft != null && commit.daysLeft >= 0 && (
          <span className="lockin-countdown">{commit.title}まで <strong>{commit.daysLeft}</strong>日</span>
        )}
      </div>

      {!data.ready && (
        <p className="notice small">
          始める前の準備（Day 0）がまだ終わっていません。
          <Link className="btn btn-small" to={`/term/${termId}/lockin`}>準備する</Link>
        </p>
      )}

      <ul className="lockin-rules">
        {rules.map((r) => (
          <li key={r.id} className={r.done ? 'kept' : ''}>
            {r.unit === 'check' ? (
              <label className="check">
                <input type="checkbox" checked={r.done} onChange={(e) => log(r, { done: e.target.checked })} />
                <span>{r.title}{r.rule_key === 'alcohol' && <span className="muted small">（1滴も飲まない）</span>}</span>
              </label>
            ) : (
              <MinuteRule rule={r} onLog={(b) => log(r, b)} />
            )}
          </li>
        ))}
      </ul>
      {kept === rules.length && rules.length > 0 && <p className="celebrate">今日のルールは全部守れました。ロックインできています。</p>}

      {prevEvent && (
        <div className="lockin-prev">
          <p className="small">昨日（{shortDate(prevEvent.date)}）はイベントの日でした{prevEvent.title ? `：${prevEvent.title}` : ''}。</p>
          <span className="seg" role="group" aria-label="今朝、定刻に起きて作業を再開できたか">
            <span className="seg-label small">今朝、定刻に起きて作業を再開できた？</span>
            <button type="button" className={prevEvent.nextDayOnTime === true ? 'active' : ''} onClick={() => answerPrev(true)}>できた</button>
            <button type="button" className={prevEvent.nextDayOnTime === false ? 'active' : ''} onClick={() => answerPrev(false)}>できなかった</button>
          </span>
        </div>
      )}

      <div className="lockin-event">
        <label className="check">
          <input type="checkbox" checked={!!event.on} onChange={(e) => saveEvent(e.target.checked)} />
          <span><strong>イベントモード</strong> <span className="muted small">飲み会・会食などがある日</span></span>
        </label>
        {event.on && (
          <div className="lockin-event-body">
            <input
              className="small-input"
              defaultValue={event.title ?? ''}
              placeholder="何のイベント？（例: 取引先との会食）"
              onBlur={(e) => e.target.value !== (event.title ?? '') && saveEvent(null, { title: e.target.value })}
            />
            <p className="muted small">イベントの日も、この3つは守ります。</p>
            {EVENT_CHECKS.map((c) => (
              <label key={c.key} className="check">
                <input type="checkbox" checked={!!event[c.key]} onChange={(e) => saveEvent(null, { [c.key]: e.target.checked })} />
                <span>{c.label}{c.key === 'nextDayOnTime' && <span className="muted small">（翌日のページでも答えられます）</span>}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <label className="field lockin-metric">
        今日の進み具合（数字で）
        <input value={progress} placeholder="例: 原稿 3,000字 ／ 動画 1本 ／ 商談 2件" onChange={(e) => onProgress(e.target.value)} />
      </label>
      {error && <p className="error-text small">{error}</p>}
    </section>
  );
}

function MinuteRule({ rule, onLog }: { rule: Rule; onLog: (b: { value?: number; add?: number }) => void }) {
  const pctDone = Math.min(100, Math.round((rule.value / rule.target_value) * 100));
  return (
    <div className="minute-rule">
      <div className="row">
        <span className={`rule-title ${rule.done ? 'done-mark' : ''}`}>
          {rule.done ? '✓ ' : ''}{rule.title}
          <span className="muted small"> {rule.target_value}分{rule.rule_key === 'meditation' ? '（分けてOK）' : ''}</span>
        </span>
        <span className="num">
          <input
            className="min-input"
            type="number"
            inputMode="numeric"
            min={0}
            max={1440}
            key={rule.value}
            defaultValue={rule.value || ''}
            placeholder="0"
            aria-label={`${rule.title}の分数`}
            onBlur={(e) => {
              const v = Math.max(0, Number(e.target.value) || 0);
              if (v !== rule.value) onLog({ value: v });
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          分
        </span>
      </div>
      <div className="minute-bar" aria-hidden="true"><span style={{ width: `${pctDone}%` }} /></div>
      <div className="minute-add">
        {[5, 10, 15, 30].map((n) => (
          <button key={n} type="button" className="btn btn-small btn-ghost" onClick={() => onLog({ add: n })}>＋{n}分</button>
        ))}
        {rule.value > 0 && <button type="button" className="btn btn-small btn-ghost" onClick={() => onLog({ value: 0 })}>0に戻す</button>}
      </div>
    </div>
  );
}
