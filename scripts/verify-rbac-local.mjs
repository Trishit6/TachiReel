#!/usr/bin/env node
/**
 * Local RBAC/authz integration check for TachiReel admin RPCs.
 *
 * Creates a throwaway PostgreSQL cluster, stubs the few Supabase objects the
 * migrations depend on, applies schema.sql -> admin_schema.sql ->
 * admin_rbac_v2.sql, then runs supabase/tests/rbac_local.sql.
 *
 * This is intentionally local-only: it creates test auth users and never
 * touches a configured Supabase project.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const env = { ...process.env, LC_ALL: 'C', LANG: 'C' };

function postgresBin() {
  const configured = process.env.PG_BIN;
  const candidates = configured
    ? [configured]
    : ['/usr/lib/postgresql', '/usr/local/lib/postgresql']
        .filter((base) => existsSync(base))
        .flatMap((base) =>
          readdirSync(base)
            .filter((version) => /^\d+$/.test(version))
            .sort((a, b) => Number(b) - Number(a))
            .map((version) => join(base, version, 'bin')),
        );
  for (const bin of [...candidates, '/usr/bin', '/usr/local/bin']) {
    if (existsSync(join(bin, 'initdb')) && existsSync(join(bin, 'pg_ctl')) && existsSync(join(bin, 'psql'))) {
      return bin;
    }
  }
  throw new Error('PostgreSQL binaries not found. Set PG_BIN to the directory containing initdb, pg_ctl and psql.');
}

function run(file, args) {
  const result = spawnSync(file, args, { encoding: 'utf8', env });
  if (result.error) throw result.error;
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0) {
    throw new Error(`${file} exited ${result.status}:\n${output}`);
  }
  return output;
}

const stubs = `
create extension if not exists pgcrypto;
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  last_sign_in_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
grant usage on schema auth to authenticated, anon, service_role;
create schema storage;
create table storage.buckets (
  id text primary key,
  name text unique not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null
);
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
grant usage on schema storage to authenticated, anon, service_role;
`;

let dir;
let started = false;
let bin;

try {
  bin = postgresBin();
  const base = existsSync('/tmp/opencode') ? '/tmp/opencode' : tmpdir();
  dir = mkdtempSync(join(base, 'tachireel-rbac-'));
  const data = join(dir, 'data');
  const port = 55432 + Math.floor(Math.random() * 1000);

  run(join(bin, 'initdb'), ['-D', data, '-U', 'postgres', '--auth=trust']);
  run(join(bin, 'pg_ctl'), [
    '-D', data,
    '-o', `-k ${dir} -p ${port} -c listen_addresses=''`,
    '-l', join(dir, 'server.log'),
    'start',
  ]);
  started = true;

  const stubFile = join(dir, 'stubs.sql');
  writeFileSync(stubFile, stubs);

  const psql = (file) =>
    run(join(bin, 'psql'), [
      '-h', dir, '-p', String(port), '-U', 'postgres', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-q', '-f', file,
    ]);

  for (const file of [
    stubFile,
    join(root, 'supabase/schema.sql'),
    join(root, 'supabase/admin_schema.sql'),
    join(root, 'supabase/admin_rbac_v2.sql'),
  ]) {
    psql(file);
  }

  // Idempotency: the RBAC migration must be safe to re-apply.
  psql(join(root, 'supabase/admin_rbac_v2.sql'));

  const output = psql(join(root, 'supabase/tests/rbac_local.sql'));
  const lines = output.split('\n').filter((line) => line.includes('NOTICE:'));
  for (const line of lines) console.log(line.replace(/^psql:.*NOTICE:\s*/, ''));

  const passes = lines.filter((line) => line.includes('PASS:')).length;
  if (passes < 18 || /FAIL:|ERROR:/.test(output)) {
    throw new Error(`RBAC assertions failed (${passes} passed). Full output:\n${output}`);
  }
  readFileSync(join(root, 'src/lib/admin.ts'), 'utf8');
  console.log(`\nAll ${passes} local RBAC assertions passed.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (started && bin && dir) {
    try {
      run(join(bin, 'pg_ctl'), ['-D', join(dir, 'data'), 'stop', '-m', 'fast']);
    } catch {
      // Best effort cleanup.
    }
  }
  if (dir) rmSync(dir, { recursive: true, force: true });
}
