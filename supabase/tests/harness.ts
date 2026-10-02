import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

/** The pieces of a Supabase database our migrations depend on. */
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  create publication supabase_realtime;
`;

const GRANTS = `
  grant usage on schema public to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
`;

export async function freshDb(): Promise<Db> {
  const pg = new PGlite();
  await pg.exec(SUPABASE_STUB);
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  }
  await pg.exec(GRANTS);
  return new Db(pg);
}

export class Db {
  constructor(readonly pg: PGlite) {}

  /** Runs as the database owner (like the service role / edge functions). */
  async q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.pg.query<T>(sql, params)).rows;
  }

  /** Runs as a signed-in user, subject to RLS. */
  async as<T = Record<string, unknown>>(userId: string, sql: string, params: unknown[] = []): Promise<T[]> {
    await this.pg.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
    await this.pg.exec("set role authenticated");
    try {
      return (await this.pg.query<T>(sql, params)).rows;
    } finally {
      await this.pg.exec("reset role");
      await this.pg.query(`select set_config('request.jwt.claim.sub', '', false)`);
    }
  }

  async createUser(name: string): Promise<string> {
    const [row] = await this.q<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('display_name', $2::text)) returning id`,
      [`${name.toLowerCase()}@example.com`, name],
    );
    return row!.id;
  }
}
