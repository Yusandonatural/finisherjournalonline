import { Hono } from 'hono';
import { authRoutes, requireUser } from './auth';
import { HttpError, type AppEnv, type Env } from './env';
import { syncAll } from './notion';
import { dayRoutes } from './routes/days';
import { integrationRoutes } from './routes/integrations';
import { lifeRoutes } from './routes/life';
import { termRoutes } from './routes/terms';
import { markMissed } from './tasks';

const app = new Hono<AppEnv>();

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status as any);
  console.error(err);
  return c.json({ error: 'サーバーでエラーが起きました' }, 500);
});

app.route('/', authRoutes);
app.use('/api/*', requireUser);
app.route('/api', termRoutes);
app.route('/api', dayRoutes);
app.route('/api', integrationRoutes);
app.route('/api', lifeRoutes);
app.all('/api/*', (c) => c.json({ error: 'not found' }, 404));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        await markMissed(env);
        await syncAll(env).catch((e) => console.error('notion sync', e));
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
