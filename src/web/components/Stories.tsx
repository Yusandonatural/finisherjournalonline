import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { patch, put } from '../api';
import { IconClose } from './icons';
import { metricText } from './ui';

type Story =
  | { kind: 'life'; key: string; label: string }
  | { kind: 'project'; key: string; label: string; goal: any }
  | { kind: 'habit'; key: string; label: string; goal: any }
  | { kind: 'lockin'; key: string; label: string };

const STORY_MS = 7000;

/** 上部に並ぶ丸：人生のビジョン・目標・習慣・ロックイン。押すと全画面で1つずつ見られる */
export function StoriesBar({ date, goals, life, lockin, termId, dayNumber, editable, onChange }: {
  date: string;
  goals: any[];
  life?: { vision: string; goals: any[] };
  lockin?: any;
  termId?: string;
  dayNumber?: number | null;
  editable: boolean;
  onChange: () => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const stories: Story[] = [];
  if (life?.vision?.trim() || life?.goals?.length) stories.push({ kind: 'life', key: 'life', label: '人生' });
  for (const g of goals.filter((x) => x.type === 'project')) stories.push({ kind: 'project', key: g.id, label: g.title, goal: g });
  if (lockin) stories.push({ kind: 'lockin', key: 'lockin', label: 'ロックイン' });
  for (const g of goals.filter((x) => x.type === 'habit')) stories.push({ kind: 'habit', key: g.id, label: g.title, goal: g });

  if (stories.length === 0) {
    return termId ? (
      <p className="stories-empty muted small">目標を立てると、ここに丸で並びます。<Link to={`/term/${termId}/goals`}>目標を立てる</Link></p>
    ) : null;
  }

  return (
    <>
      <div className="stories no-swipe" role="list" aria-label="目標と習慣">
        {stories.map((s, i) => (
          <button key={s.key} type="button" role="listitem" className="story" onClick={() => setOpen(i)}>
            <StoryRing story={s} lockin={lockin} />
            <span className="story-label">{s.label}</span>
          </button>
        ))}
      </div>
      {open != null && (
        <StoryViewer
          stories={stories}
          start={open}
          date={date}
          life={life}
          lockin={lockin}
          termId={termId}
          dayNumber={dayNumber}
          editable={editable}
          onChange={onChange}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function ringValue(s: Story, lockin: any): { pct: number; text: string; done?: boolean } {
  if (s.kind === 'project') return { pct: s.goal.progress, text: `${s.goal.progress}%` };
  if (s.kind === 'habit') return { pct: s.goal.doneOnDate ? 100 : 0, text: s.goal.doneOnDate ? '✓' : s.goal.title.slice(0, 1), done: !!s.goal.doneOnDate };
  if (s.kind === 'lockin') {
    const kept = lockin.rules.filter((r: any) => r.done).length;
    return { pct: lockin.rules.length ? Math.round((kept / lockin.rules.length) * 100) : 0, text: `${kept}/${lockin.rules.length}`, done: kept === lockin.rules.length };
  }
  return { pct: 100, text: '人生' };
}

function StoryRing({ story, lockin, big }: { story: Story; lockin: any; big?: boolean }) {
  const v = ringValue(story, lockin);
  return (
    <span className={`story-ring ${big ? 'big' : ''} ${story.kind} ${v.done ? 'done' : ''} ${story.kind === 'project' && story.goal.behind ? 'behind' : ''}`} style={{ ['--p' as any]: v.pct }}>
      <span className="story-inner">{v.text}</span>
    </span>
  );
}

function StoryViewer({ stories, start, date, life, lockin, termId, dayNumber, editable, onChange, onClose }: {
  stories: Story[];
  start: number;
  date: string;
  life?: { vision: string; goals: any[] };
  lockin?: any;
  termId?: string;
  dayNumber?: number | null;
  editable: boolean;
  onChange: () => void;
  onClose: () => void;
}) {
  const [i, setI] = useState(start);
  const [paused, setPaused] = useState(false);
  const [, force] = useState(0);
  const s = stories[i];
  const go = (d: number) => {
    const n = i + d;
    if (n < 0) return setI(0);
    if (n >= stories.length) return onClose();
    setI(n);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  });

  async function toggleHabit(g: any) {
    g.doneOnDate = !g.doneOnDate;
    force((n) => n + 1);
    await put(`/goals/${g.id}/habit/${date}`, { done: g.doneOnDate });
    onChange();
  }

  async function toggleMilestone(m: any) {
    m.done = m.done ? 0 : 1;
    force((n) => n + 1);
    await patch(`/milestones/${m.id}`, { done: !!m.done });
    onChange();
  }

  return (
    <div className="story-viewer" role="dialog" aria-modal="true" aria-label="ストーリー">
      <div className="sv-frame">
        <div className="sv-segments" aria-hidden="true">
          {stories.map((x, j) => (
            <span key={x.key} className={j < i ? 'seen' : ''}>
              {j === i && (
                <i
                  key={`${x.key}-${i}`}
                  style={{ animationDuration: `${STORY_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }}
                  onAnimationEnd={() => go(1)}
                />
              )}
            </span>
          ))}
        </div>
        <header className="sv-head">
          <StoryRing story={s} lockin={lockin} />
          <span className="sv-title">
            <strong>{s.label}</strong>
            <span>{dayNumber ? `Day ${dayNumber}` : ''}</span>
          </span>
          <button type="button" className="sv-close" aria-label="閉じる" onClick={onClose}><IconClose /></button>
        </header>

        <div
          className="sv-body"
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerLeave={() => setPaused(false)}
        >
          <button type="button" className="sv-tap prev" aria-label="前へ" onClick={() => go(-1)} />
          <button type="button" className="sv-tap next" aria-label="次へ" onClick={() => go(1)} />
          <div className="sv-content">
            {s.kind === 'life' && (
              <>
                <p className="sv-eyebrow">人生のビジョン</p>
                <p className="sv-big">{life?.vision || '（まだ書かれていません）'}</p>
                {!!life?.goals?.length && (
                  <ul className="sv-list">
                    {life.goals.filter((g: any) => !g.achieved_at).slice(0, 6).map((g: any) => <li key={g.id}>{g.title}{g.target_year ? `（${g.target_year}年）` : ''}</li>)}
                  </ul>
                )}
                <Link className="sv-link" to="/life" onClick={onClose}>人生の目標を開く</Link>
              </>
            )}
            {s.kind === 'project' && (
              <>
                <p className="sv-eyebrow">90日の目標{s.goal.behind ? ' ・ 遅れ気味' : ''}</p>
                <StoryRing story={s} lockin={lockin} big />
                {metricText(s.goal) && <p className="sv-metric">{metricText(s.goal)}</p>}
                {s.goal.milestones.length > 0 && (
                  <ul className="sv-list checks">
                    {s.goal.milestones.map((m: any) => (
                      <li key={m.id}>
                        <label>
                          <input type="checkbox" checked={!!m.done} disabled={!editable} onChange={() => toggleMilestone(m)} />
                          <span className={m.done ? 'done' : ''}>{m.title}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                {s.goal.obstacle && <p className="sv-note">障害: {s.goal.obstacle}{s.goal.obstacle_plan ? ` → 対策: ${s.goal.obstacle_plan}` : ''}</p>}
                {termId && <Link className="sv-link" to={`/term/${termId}/goals`} onClick={onClose}>目標を開く</Link>}
              </>
            )}
            {s.kind === 'habit' && (
              <>
                <p className="sv-eyebrow">習慣{s.goal.scheduledOnDate === false ? ' ・ 今日はお休みの日' : ''}</p>
                <button type="button" className={`sv-habit ${s.goal.doneOnDate ? 'on' : ''}`} disabled={!editable} onClick={() => toggleHabit(s.goal)}>
                  {s.goal.doneOnDate ? '✓ 今日できた' : '今日できたら押す'}
                </button>
                {s.goal.habit && (
                  <p className="sv-metric">
                    達成率 {s.goal.habit.pct}% ・ {s.goal.habit.done}/{s.goal.habit.expected}回
                    {s.goal.habit_frequency !== 'weekly' && ` ・ 連続 ${s.goal.habit.currentStreak}日`}
                  </p>
                )}
              </>
            )}
            {s.kind === 'lockin' && lockin && (
              <>
                <p className="sv-eyebrow">今日のルール</p>
                <ul className="sv-list checks">
                  {lockin.rules.map((r: any) => (
                    <li key={r.id} className={r.done ? 'kept' : ''}>
                      {r.done ? '✓' : '・'} {r.title}{r.unit === 'min' ? `（${r.value}/${r.target_value}分）` : ''}
                    </li>
                  ))}
                </ul>
                {lockin.commit?.daysLeft != null && lockin.commit.daysLeft >= 0 && <p className="sv-metric">{lockin.commit.title}まで あと{lockin.commit.daysLeft}日</p>}
                {termId && <Link className="sv-link" to={`/term/${termId}/lockin`} onClick={onClose}>ロックインを開く</Link>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
