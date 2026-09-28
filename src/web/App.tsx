import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { mondayOf, monthStart, todayJST } from '../shared/dates';
import { api } from './api';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { DayPage } from './pages/DayPage';
import { GoalsPage } from './pages/GoalsPage';
import { LifePage } from './pages/LifePage';
import { LedgerPage } from './pages/LedgerPage';
import { MonthPage } from './pages/MonthPage';
import { SettingsPage } from './pages/SettingsPage';
import { TermPage } from './pages/TermPage';
import { TermReviewPage } from './pages/TermReviewPage';
import { TermsPage } from './pages/TermsPage';
import { WeekPage } from './pages/WeekPage';

/** /term?date=… → その日を含むタームへ */
function CurrentTerm() {
  const [q] = useSearchParams();
  const nav = useNavigate();
  const date = q.get('date') ?? todayJST();
  useEffect(() => {
    api(`/terms/current?date=${date}`).then((t) => nav(t ? `/term/${t.id}` : '/terms', { replace: true }));
  }, [date, nav]);
  return <Loading />;
}

function NotFound() {
  return (
    <div className="page narrow">
      <h1 className="page-title">ページが見つかりません</h1>
      <p><a href="/today">今日のページへ</a></p>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/today" replace />} />
        <Route path="today" element={<Navigate to={`/day/${todayJST()}`} replace />} />
        <Route path="day/:date" element={<DayPage />} />
        <Route path="week" element={<Navigate to={`/week/${mondayOf(todayJST())}`} replace />} />
        <Route path="week/:start" element={<WeekPage tab="plan" />} />
        <Route path="week/:start/review" element={<WeekPage tab="review" />} />
        <Route path="month" element={<Navigate to={`/month/${monthStart(todayJST())}`} replace />} />
        <Route path="month/:start" element={<MonthPage tab="plan" />} />
        <Route path="month/:start/review" element={<MonthPage tab="review" />} />
        <Route path="term" element={<CurrentTerm />} />
        <Route path="term/:id" element={<TermPage />} />
        <Route path="term/:id/tasks" element={<LedgerPage />} />
        <Route path="term/:id/review" element={<TermReviewPage />} />
        <Route path="term/:id/goals" element={<GoalsPage />} />
        <Route path="terms" element={<TermsPage />} />
        <Route path="life" element={<LifePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
