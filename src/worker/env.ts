export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_TIMEZONE: string;
  APP_URL: string;
  ALLOWED_EMAILS: string;
  NOTION_TASKS_DB_ID: string;
  NOTION_JOURNAL_TAG: string;
  NOTION_ASSIGNEE: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  TOKEN_ENC_KEY?: string;
  NOTION_TOKEN?: string;
  /** テスト用: Notion API の接続先を差し替える */
  NOTION_API_BASE?: string;
  DEV_LOGIN?: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  picture_url: string | null;
}

export type AppEnv = { Bindings: Env; Variables: { user: User } };

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
