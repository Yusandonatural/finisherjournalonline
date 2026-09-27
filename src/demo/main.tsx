import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from '../web/App';
import '../web/styles.css';
import './demo.css';
import { resetDemo, startDemo } from './backend';

(window as any).__FJ_DEMO = true;

function DemoBar() {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="demo-bar" role="note">
      <span><strong>デモ版</strong> 例のデータが入っています。入力はこのブラウザだけに保存されます。カレンダーは例の予定で、Notion 連携は動きません。</span>
      {confirming ? (
        <span className="demo-actions">
          <button className="btn btn-small btn-danger" onClick={() => { resetDemo(); location.reload(); }}>例のデータに戻す</button>
          <button className="btn btn-small" onClick={() => setConfirming(false)}>やめる</button>
        </span>
      ) : (
        <button className="btn btn-small btn-ghost" onClick={() => setConfirming(true)}>リセット</button>
      )}
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
startDemo()
  .then(() =>
    root.render(
      <StrictMode>
        <HashRouter>
          <DemoBar />
          <App />
        </HashRouter>
      </StrictMode>,
    ),
  )
  .catch((e) => {
    console.error(e);
    root.render(<div className="loading">デモを起動できませんでした（{String(e?.message ?? e)}）</div>);
  });
