import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { addDays, daysInRange, mondayOf, shortDate, weekday } from '../../shared/dates';
import { COMMON_RULES, EVENT_CHECKS } from '../../shared/lockin';
import { del, patch, post, put } from '../api';
import { TermHeader } from '../components/TermHeader';
import { ErrorBox, Loading, Progress, SaveBadge, Stat, metricText } from '../components/ui';
import { useApi, useAutosave } from '../hooks';

export function LockinPage() {
  const { id = '' } = useParams();
  const term = useApi<any>(`/terms/${id}`);
  const lock = useApi<any>(`/terms/${id}/lockin`);
  const error = term.error ?? lock.error;
  if (error) return <ErrorBox message={error} onRetry={() => { term.reload(); lock.reload(); }} />;
  if (!term.data || !lock.data) return <Loading />;
  return (
    <div className="page lockin-page">
      <TermHeader term={term.data} tab="lockin" />
      {lock.data.lockin ? <LockinView key={id} d={lock.data} reload={lock.reload} /> : <LockinIntro termId={id} onStart={lock.reload} />}
    </div>
  );
}

function LockinIntro({ termId, onStart }: { termId: string; onStart: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="card lockin-intro">
      <p className="life-eyebrow">The Great Lock-In</p>
      <h2 className="lockin-headline">90日間、決めたことだけをやり抜く</h2>
      <p>このタームを「ロックイン」にすると、次のしくみが入ります。</p>
      <ol className="lockin-intro-list">
        <li><strong>毎日のルール</strong> — 運動30分・瞑想15分・禁酒の3つは共通。自分のルールを1〜3つ足して、全部で6つまで。</li>
        <li><strong>10倍の目標から逆算</strong> — 1年後に成果10倍（またはランクを3つ上げる）→ 90日の目標 → 今週 → 今日。</li>
        <li><strong>イベントモード</strong> — 飲み会の日も「飲まない・午前中は作業・翌朝は定刻」の3つを守る。</li>
        <li><strong>Day 0 の基地づくり</strong> — 始める前に、誘惑を片付け、スマホを遠ざけ、瞑想の場所を作る。</li>
        <li><strong>90日目の逃げられないイベント</strong> — 大会・試験・発売日など、ごまかしのきかない日を先に決める。</li>
      </ol>
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await put(`/terms/${termId}/lockin`, { lockin: true });
          onStart();
        }}
      >
        このタームをロックインにする
      </button>
    </section>
  );
}

function LockinView({ d, reload }: { d: any; reload: () => void }) {
  const termId = d.term.id;
  const [form, setForm] = useState({ tenx_goal: d.tenx_goal, commit_title: d.commit.title, commit_date: d.commit.date ?? '', commit_proof: d.commit.proof });
  const save = useAutosave((v: any) => put(`/terms/${termId}/lockin`, v), 800, `/api/terms/${termId}/lockin`, `fj.draft.lockin.${termId}`);
  const update = (p: Partial<typeof form>, now = false) => {
    setForm({ ...form, ...p });
    save.schedule(p);
    if (now) void save.flush().then(reload);
  };
  const [setup, setSetup] = useState<Record<string, boolean>>(d.setup);
  const steps = d.steps;
  const doneSteps = Object.values(steps).filter(Boolean).length;
  const custom = d.rules.filter((r: any) => r.category === 'custom');

  async function toggleSetup(key: string, v: boolean) {
    setSetup({ ...setup, [key]: v });
    await put(`/terms/${termId}/lockin`, { setup: { [key]: v } });
    reload();
  }

  return (
    <>
      <div className="period-toolbar">
        <span className={`chip ${d.ready ? 'chip-good' : 'chip-warn'}`}>{d.ready ? '準備完了 — ロックイン中' : `準備 ${doneSteps} / 5`}</span>
        <span className="spacer" />
        <SaveBadge state={save.state} />
      </div>

      {/* 1. 1年後の10倍目標（いちばん上の階層） */}
      <section className="card tenx-card">
        <div className="card-head">
          <h2 className="card-title"><StepMark ok={steps.tenx} /> 1年後の10倍目標</h2>
          <span className="muted small">成果を10倍に、またはランクを3つ上げる</span>
        </div>
        <textarea
          className="vision-input"
          rows={2}
          value={form.tenx_goal}
          placeholder="例: 自然茶の年間売上を10倍にする／海外の取引先を10か国にする"
          onChange={(e) => update({ tenx_goal: e.target.value })}
        />
        <p className="muted small">ここから逆算して、90日でどこまで行くかを下の「90日の目標」に置きます。</p>
      </section>

      {/* 90日目の逃げられないイベント */}
      <section className={`card commit-card ${steps.commit ? '' : 'pending'}`}>
        <div className="card-head">
          <h2 className="card-title"><StepMark ok={steps.commit} /> 90日目の、逃げられないイベント</h2>
          {d.commit.daysLeft != null && (
            <span className="lockin-countdown">
              {d.commit.daysLeft > 0 ? <>あと <strong>{d.commit.daysLeft}</strong>日</> : d.commit.daysLeft === 0 ? <strong>今日です</strong> : '終わりました'}
            </span>
          )}
        </div>
        <div className="form-row">
          <label className="field">
            何をするか
            <input value={form.commit_title} placeholder="例: 新商品の発売日／フルマラソン／資格試験" onChange={(e) => update({ commit_title: e.target.value })} />
          </label>
          <label className="field" style={{ flex: '0 0 auto' }}>
            日付
            <input type="date" value={form.commit_date} min={d.term.start_date} onChange={(e) => update({ commit_date: e.target.value }, true)} />
          </label>
        </div>
        <label className="field">
          申し込み・予約の証拠（URL や受付番号など）
          <input value={form.commit_proof} placeholder="例: 大会のエントリー完了メール／発売告知のURL" onChange={(e) => update({ commit_proof: e.target.value })} />
        </label>
        <p className="muted small">ごまかしのきかない日を先に決めておくと、90日間の言い訳がなくなります。</p>
      </section>

      {/* 2〜4. 90日 → 今週 → 今日 */}
      <section className="card hierarchy">
        <h2 className="card-title">目標の階段</h2>
        <div className="tier">
          <p className="tier-label"><StepMark ok={steps.goal} /> 90日の目標</p>
          {d.projects.length === 0 && <p className="muted small">まだありません。<Link to={`/term/${termId}/goals`}>目標設定で立てる</Link></p>}
          <ul className="goal-progress">
            {d.projects.map((g: any) => (
              <li key={g.id} className={g.behind ? 'behind' : ''}>
                <div className="row">
                  <span>{g.title}</span>
                  <span className="num">{g.progress}%</span>
                </div>
                <Progress value={g.progress} tone={g.behind ? 'warn' : undefined} />
                {metricText(g) && <p className="muted small">数値 {metricText(g)}</p>}
              </li>
            ))}
          </ul>
        </div>
        <div className="tier">
          <p className="tier-label">今週の目標 <Link className="small" to={`/week/${d.week.start}`}>{shortDate(d.week.start)}の週を開く</Link></p>
          {d.week.theme && <p className="small"><strong>テーマ:</strong> {d.week.theme}</p>}
          {d.week.targets.length === 0 ? (
            <p className="muted small">まだありません。<Link to={`/week/${d.week.start}`}>週間予定で立てる</Link></p>
          ) : (
            <ul className="plain-list">
              {d.week.targets.map((t: any, i: number) => (
                <li key={i} className={t.done ? 'done' : ''}>{t.done ? '✓ ' : '・'}{t.text}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="tier">
          <p className="tier-label">今日のタスク <Link className="small" to={`/day/${d.asOf}`}>{shortDate(d.asOf)}のページを開く</Link></p>
          {d.todayTasks.length === 0 ? (
            <p className="muted small">まだありません。</p>
          ) : (
            <ul className="plain-list">
              {d.todayTasks.filter((t: any) => t.status !== 'carried').map((t: any) => (
                <li key={t.id}>{t.status === 'done' ? '✓ ' : '・'}{t.title}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="tier">
          <p className="tier-label">進み具合（数字）</p>
          {d.metrics.length === 0 ? (
            <p className="muted small">毎日のページの「今日の進み具合」に数字で書くと、ここに並びます。</p>
          ) : (
            <ul className="plain-list metric-log">
              {d.metrics.map((m: any) => (
                <li key={m.date}><Link to={`/day/${m.date}`} className="muted small">{shortDate(m.date)}</Link> {m.text}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="stats">
        <Stat label="ロックインできた日" value={`${d.perfectDays}日`} sub={`${d.elapsedDays}日のうち・全ルールを守れた日`} tone="good" />
        <Stat label="連続" value={`${d.perfectStreak}日`} sub="全ルールを守れた日が続いている" />
        <Stat label="ルールの数" value={`${d.rules.length} / ${d.limits.total}`} sub={`自分のルール ${custom.length} / ${d.limits.custom}`} />
        <Stat label="イベントの日" value={`${d.events.length}日`} sub={`3条件を守れた日 ${d.events.filter((e: any) => e.noAlcohol && e.morningWork && e.nextDayOnTime).length}`} />
      </div>

      <RulesCard d={d} reload={reload} />

      {/* Day 0 */}
      <section className={`card ${steps.setup ? '' : 'pending'}`}>
        <div className="card-head">
          <h2 className="card-title"><StepMark ok={steps.setup} /> Day 0 — 基地づくり</h2>
          <span className="muted small">{d.setupItems.filter((i: any) => setup[i.key]).length} / {d.setupItems.length}</span>
        </div>
        {[...new Set<string>(d.setupItems.map((i: any) => i.group))].map((g) => (
          <div key={g}>
            <h3 className="mini-title">{g}</h3>
            {d.setupItems.filter((i: any) => i.group === g).map((i: any) => (
              <label key={i.key} className="check">
                <input type="checkbox" checked={!!setup[i.key]} onChange={(e) => toggleSetup(i.key, e.target.checked)} />
                <span>{i.label}</span>
              </label>
            ))}
          </div>
        ))}
      </section>

      {d.events.length > 0 && (
        <section className="card">
          <h2 className="card-title">イベントの日の記録</h2>
          <table className="simple-table">
            <thead>
              <tr><th>日付</th><th>イベント</th>{EVENT_CHECKS.map((c) => <th key={c.key} className="num" title={c.label}>{c.short}</th>)}</tr>
            </thead>
            <tbody>
              {d.events.map((e: any) => (
                <tr key={e.date}>
                  <td><Link to={`/day/${e.date}`}>{shortDate(e.date)}</Link></td>
                  <td>{e.title || <span className="muted">—</span>}</td>
                  {EVENT_CHECKS.map((c) => <td key={c.key} className="num">{e[c.key] ? '✓' : e[c.key] === false ? '×' : <span className="muted">—</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function StepMark({ ok }: { ok: boolean }) {
  return <span className={`step-mark ${ok ? 'ok' : ''}`} aria-label={ok ? '済み' : 'まだ'}>{ok ? '✓' : '・'}</span>;
}

function RulesCard({ d, reload }: { d: any; reload: () => void }) {
  const [title, setTitle] = useState('');
  const [unit, setUnit] = useState<'check' | 'min'>('check');
  const [minutes, setMinutes] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const custom = d.rules.filter((r: any) => r.category === 'custom');
  const full = custom.length >= d.limits.custom || d.rules.length >= d.limits.total;

  async function run(p: Promise<unknown>) {
    try {
      await p;
      setError(null);
      reload();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <section className={`card ${d.steps.rules ? '' : 'pending'}`}>
      <div className="card-head">
        <h2 className="card-title"><StepMark ok={d.steps.rules} /> 毎日のルール</h2>
        <span className="muted small">共通3つ ＋ 自分のルール1〜3つ（全部で6つまで）</span>
      </div>
      <ul className="rule-list">
        {d.rules.map((r: any) => (
          <li key={r.id}>
            <div className="row">
              <span>
                {r.title}
                <span className="chip chip-soft">{r.category === 'common' ? '共通' : '自分'}</span>
                {r.unit === 'min' && (
                  <span className="muted small">
                    {' '}1日
                    <input
                      className="min-input"
                      type="number"
                      min={1}
                      max={1440}
                      defaultValue={r.target_value}
                      aria-label={`${r.title}の目安（分）`}
                      onBlur={(e) => Number(e.target.value) !== r.target_value && run(patch(`/lockin/rules/${r.id}`, { target_value: Number(e.target.value) }))}
                    />
                    分
                  </span>
                )}
                {r.category === 'common' && r.unit === 'check' && <span className="muted small"> {COMMON_RULES.find((c) => c.key === r.rule_key)?.hint}</span>}
              </span>
              <span className="row">
                <span className="num small">{r.doneDays} / {r.elapsedDays}日{r.streak > 1 && ` ・ 連続${r.streak}日`}</span>
                {r.category === 'custom' && (
                  <button className="icon-btn small" aria-label={`${r.title}を外す`} onClick={() => confirm(`「${r.title}」を外しますか？記録も消えます。`) && run(del(`/lockin/rules/${r.id}`))}>×</button>
                )}
              </span>
            </div>
            <RuleHeat d={d} rule={r} />
          </li>
        ))}
      </ul>
      {full ? (
        <p className="muted small">ルールはこれ以上増やせません。増やしすぎると続かなくなるため、上限で止めています。</p>
      ) : (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            run(post(`/terms/${d.term.id}/lockin/rules`, { title, unit, target_value: minutes }).then(() => setTitle('')));
          }}
        >
          <input value={title} placeholder="自分のルール（例: 朝5時に起きる／SNSは夜だけ）" onChange={(e) => setTitle(e.target.value)} style={{ flex: 1, minWidth: '14em' }} />
          <select value={unit} onChange={(e) => setUnit(e.target.value as any)} aria-label="記録のしかた">
            <option value="check">守れたかチェック</option>
            <option value="min">分数を記録</option>
          </select>
          {unit === 'min' && <input className="min-input" type="number" min={1} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="1日の目安（分）" />}
          <button className="btn btn-small btn-primary" type="submit">追加</button>
          <span className="muted small">あと{Math.min(d.limits.custom - custom.length, d.limits.total - d.rules.length)}つ</span>
        </form>
      )}
      {error && <p className="error-text small">{error}</p>}
    </section>
  );
}

/** ルールを守れた日のマス（週ごとの行） */
function RuleHeat({ d, rule }: { d: any; rule: any }) {
  const done = new Set<string>(rule.dates);
  const { start_date, end_date } = d.term;
  const weeks: string[] = [];
  for (let w = mondayOf(start_date); w <= end_date; w = addDays(w, 7)) weeks.push(w);
  return (
    <div className="heatmap compact" aria-label={`${rule.title} を守れた日`}>
      {weeks.map((w) => (
        <div key={w} className="heat-row">
          {daysInRange(w, addDays(w, 6)).map((day) => {
            const inTerm = day >= start_date && day <= end_date;
            const cls = !inTerm ? 'out' : done.has(day) ? 'on' : day > d.today ? 'future' : 'miss';
            return <span key={day} className={`heat ${cls} ${weekday(day) === 0 ? 'sun' : ''}`} title={`${shortDate(day)}${done.has(day) ? ' ✓' : ''}`} />;
          })}
        </div>
      ))}
    </div>
  );
}

