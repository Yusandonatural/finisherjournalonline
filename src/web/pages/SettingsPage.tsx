import { useEffect, useState } from 'react';
import { api, post, put } from '../api';
import { ErrorBox, Loading } from '../components/ui';
import { useApi } from '../hooks';

export function SettingsPage() {
  const demo = !!(window as any).__FJ_DEMO;
  const me = useApi<any>('/me');
  const notion = useApi<any>('/notion/status');
  const [cals, setCals] = useState<any[] | null>(null);
  const [calErr, setCalErr] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  useEffect(() => {
    api('/calendar/calendars').then(setCals).catch((e) => setCalErr(e.message));
  }, []);

  if (me.error) return <ErrorBox message={me.error} onRetry={me.reload} />;
  if (!me.data) return <Loading />;
  const s = me.data.settings;
  const primaryId = cals?.find((c) => c.primary)?.id;
  const selected = (id: string) => s.calendarIds.includes(id) || (id === primaryId && s.calendarIds.includes('primary'));

  async function toggleCal(id: string, on: boolean) {
    const cur = s.calendarIds.map((x: string) => (x === 'primary' && primaryId ? primaryId : x));
    const next = on ? [...new Set([...cur, id])] : cur.filter((x: string) => x !== id);
    await put('/settings', { calendarIds: next });
    me.reload();
  }

  async function sync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await post('/notion/sync');
      setSyncMsg(`送信 ${r.pushed}件・取り込み 更新${r.updated}件／新規${r.created}件${r.errors ? `・エラー ${r.errors}件` : ''}${r.pullError ? `（取り込みでエラー: ${r.pullError}）` : ''}`);
    } catch (e: any) {
      setSyncMsg(e.message);
    }
    setSyncing(false);
    notion.reload();
  }

  return (
    <div className="page narrow-wide">
      <h1 className="page-title">設定</h1>

      <section className="card">
        <h2 className="card-title">アカウント</h2>
        <p>{me.data.user.name} <span className="muted">（{me.data.user.email}）</span></p>
        {demo ? <p className="muted small">デモ版のためログアウトはありません。</p> : <button className="btn" onClick={async () => { await post('/logout'); location.href = '/login'; }}>ログアウト</button>}
      </section>

      <section className="card">
        <h2 className="card-title">Googleカレンダー</h2>
        {calErr === 'google_reconnect' || !me.data.googleConnected ? (
          <div className="notice">
            Googleカレンダーに接続されていません。
            <a className="btn btn-small btn-primary" href="/auth/google">Googleに接続</a>
          </div>
        ) : calErr ? (
          <p className="form-error">{calErr}</p>
        ) : !cals ? (
          <Loading />
        ) : (
          <>
            <p className="muted small">ジャーナルに表示するカレンダーを選びます。</p>
            <ul className="plain-list">
              {cals.map((c) => (
                <li key={c.id}>
                  <label className="check">
                    <input type="checkbox" checked={selected(c.id)} onChange={(e) => toggleCal(c.id, e.target.checked)} />
                    <span><span className="event-dot" style={{ background: c.color }} /> {c.summary}{c.primary && '（メイン）'}{!c.writable && <span className="muted small"> 閲覧のみ</span>}</span>
                  </label>
                </li>
              ))}
            </ul>
            {!demo && <a className="btn btn-small btn-ghost" href="/auth/google">Googleに再接続</a>}
          </>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">「できなかった」の判定</h2>
        <p className="muted small">未完了のタスクを、いつ「できなかった」にするか。</p>
        {[
          ['midnight', '日付が変わった時点（0時）'],
          ['noon', '翌日の正午（朝にチェックする人向け）'],
        ].map(([v, label]) => (
          <label key={v} className="check">
            <input type="radio" name="cutoff" checked={s.missedCutoff === v} onChange={async () => { await put('/settings', { missedCutoff: v }); me.reload(); }} />
            <span>{label}</span>
          </label>
        ))}
      </section>

      <section className="card">
        <h2 className="card-title">Notion 連携</h2>
        {!notion.data ? (
          <Loading />
        ) : !notion.data.enabled ? (
          <div className="notice">
            {demo ? 'デモ版では Notion 連携は動きません。本番では「🎒 Todo リスト」と同期します。' : <>Notion が未接続です。サーバーに NOTION_TOKEN を設定し、Notion の「MY LIFE OS」ページにインテグレーションを追加してください（README の手順）。</>}
          </div>
        ) : (
          <>
            <p>
              同期先: 🎒 Todo リスト（タグ「{notion.data.tag}」の行のみ）<br />
              <span className="small">アプリで作ったタスクは「できた」にしたものだけ送ります。Notion から選んだタスクは状態を同期します。</span><br />
              <span className="muted small">
                最終取り込み: {notion.data.lastPull ? new Date(notion.data.lastPull).toLocaleString('ja-JP') : 'まだ'} ・ 未同期 {notion.data.dirty}件 ・ エラー {notion.data.errors}件
              </span>
            </p>
            <button className="btn btn-primary" onClick={sync} disabled={syncing}>{syncing ? '同期中…' : '今すぐ同期'}</button>
            {syncMsg && <p className="muted small">{syncMsg}</p>}
            {notion.data.logs.length > 0 && (
              <details className="group">
                <summary>同期ログ</summary>
                <ul className="plain-list small">
                  {notion.data.logs.map((l: any) => (
                    <li key={l.id} className={l.result === 'error' ? 'error-text' : ''}>
                      <span className="muted">{l.created_at}</span> {l.direction === 'push' ? '送信' : '取り込み'}: {l.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>
    </div>
  );
}
