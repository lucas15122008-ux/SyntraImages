import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

// Emula só o que o Supabase fornece (auth.uid(), roles e storage) para rodar a
// migração real em Postgres embutido, sem Docker.
const SUPABASE_STUBS = `
  create role authenticated nologin;
  create role anon nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema auth, storage to authenticated;
  grant execute on function auth.uid() to authenticated;
`;

const ADMIN = '00000000-0000-0000-0000-0000000000a1';
const ALICE = '00000000-0000-0000-0000-0000000000b1';
const BOB = '00000000-0000-0000-0000-0000000000b2';

let db: PGlite;

async function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

const denied = async (p: Promise<unknown>) => {
  await expect(p).rejects.toThrow(/row-level security|permission denied/i);
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  const dir = resolve(import.meta.dirname, '../migrations');
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(resolve(dir, name), 'utf8'));
  }
  await db.exec(`grant select, insert, update, delete on all tables in schema public, storage to authenticated;`);
  await db.exec(`insert into auth.users (id) values ('${ADMIN}'), ('${ALICE}'), ('${BOB}');`);
  await db.exec(`update public.profiles set role = 'admin' where id = '${ADMIN}';`);
});

afterAll(async () => {
  await db.close();
});

const newKit = (owner: string) =>
  db.query<{ id: string }>(
    `insert into public.kits (owner, product_name, config, original_path) values ($1, 'Pastilha', '{}', $2) returning id`,
    [owner, `${owner}/a.jpg`],
  );

describe('perfis', () => {
  test('todo usuário novo ganha perfil de membro', async () => {
    const { rows } = await db.query<{ role: string }>(`select role from public.profiles where id = $1`, [ALICE]);
    expect(rows[0].role).toBe('member');
  });

  test('membro não consegue virar admin', async () => {
    await as(ALICE, async () => {
      await db.query(`update public.profiles set role = 'admin' where id = $1`, [ALICE]);
    });
    const { rows } = await db.query<{ role: string }>(`select role from public.profiles where id = $1`, [ALICE]);
    expect(rows[0].role).toBe('member');
  });
});

describe('kits e fotos', () => {
  test('usuário A não lê o kit do usuário B, mas lê o próprio', async () => {
    const bobKit = await as(BOB, () => newKit(BOB));
    await as(ALICE, () => newKit(ALICE));
    const seenByAlice = await as(ALICE, () => db.query<{ owner: string }>(`select owner from public.kits`));
    expect(seenByAlice.rows.map((r) => r.owner)).toEqual([ALICE]);
    const direct = await as(ALICE, () => db.query(`select * from public.kits where id = $1`, [bobKit.rows[0].id]));
    expect(direct.rows).toHaveLength(0);
  });

  test('usuário A não cria kit em nome de B', async () => {
    await denied(as(ALICE, () => newKit(BOB)));
  });

  test('usuário A não altera nem apaga o kit de B', async () => {
    const bobKit = await as(BOB, () => newKit(BOB));
    await as(ALICE, async () => {
      await db.query(`update public.kits set product_name = 'x' where id = $1`, [bobKit.rows[0].id]);
      await db.query(`delete from public.kits where id = $1`, [bobKit.rows[0].id]);
    });
    const { rows } = await db.query<{ product_name: string }>(`select product_name from public.kits where id = $1`, [bobKit.rows[0].id]);
    expect(rows).toEqual([{ product_name: 'Pastilha' }]);
  });

  test('fotos seguem o dono do kit e a posição é única por kit', async () => {
    const kit = await as(BOB, () => newKit(BOB));
    const kitId = kit.rows[0].id;
    await as(BOB, () => db.query(`insert into public.kit_photos (kit_id, position, kind) values ($1, 1, 'cover')`, [kitId]));
    await as(BOB, async () => {
      await expect(db.query(`insert into public.kit_photos (kit_id, position, kind) values ($1, 1, 'generated')`, [kitId])).rejects.toThrow(/unique|duplicate/i);
    });
    const alice = await as(ALICE, () => db.query(`select * from public.kit_photos where kit_id = $1`, [kitId]));
    expect(alice.rows).toHaveLength(0);
    await denied(as(ALICE, () => db.query(`insert into public.kit_photos (kit_id, position, kind) values ($1, 2, 'generated')`, [kitId])));
  });
});

describe('modelos de kit', () => {
  test('a equipe toda vê; só quem criou ou o admin apaga', async () => {
    const created = await as(ALICE, () =>
      db.query<{ id: string }>(`insert into public.kit_templates (name, config) values ('Padrão', '{}') returning id`),
    );
    const id = created.rows[0].id;
    expect((await as(BOB, () => db.query(`select 1 from public.kit_templates where id = $1`, [id]))).rows).toHaveLength(1);

    await as(BOB, () => db.query(`delete from public.kit_templates where id = $1`, [id]));
    expect((await db.query(`select 1 from public.kit_templates where id = $1`, [id])).rows).toHaveLength(1);

    await as(ADMIN, () => db.query(`delete from public.kit_templates where id = $1`, [id]));
    expect((await db.query(`select 1 from public.kit_templates where id = $1`, [id])).rows).toHaveLength(0);
  });

  test('não dá para criar modelo em nome de outra pessoa', async () => {
    await denied(as(ALICE, () => db.query(`insert into public.kit_templates (name, config, created_by) values ('x', '{}', $1)`, [BOB])));
  });
});

describe('artes da loja', () => {
  test('membro não grava em store_assets', async () => {
    await denied(as(ALICE, () => db.query(`insert into public.store_assets (slot, storage_path) values (0, 'a.jpg')`)));
  });

  test('admin grava e substitui; todos leem', async () => {
    await as(ADMIN, async () => {
      await db.query(`insert into public.store_assets (slot, storage_path) values (0, 'a.jpg')`);
      await db.query(`update public.store_assets set storage_path = 'b.jpg' where slot = 0`);
    });
    const { rows } = await as(BOB, () => db.query<{ storage_path: string }>(`select storage_path from public.store_assets where slot = 0`));
    expect(rows).toEqual([{ storage_path: 'b.jpg' }]);
  });
});

describe('storage', () => {
  test('usuário A não lê arquivos de B em originals', async () => {
    await as(BOB, () => db.query(`insert into storage.objects (bucket_id, name) values ('originals', $1)`, [`${BOB}/k/orig.jpg`]));
    const { rows } = await as(ALICE, () => db.query(`select name from storage.objects where bucket_id = 'originals'`));
    expect(rows).toHaveLength(0);
    await denied(as(ALICE, () => db.query(`insert into storage.objects (bucket_id, name) values ('originals', $1)`, [`${BOB}/k/x.jpg`])));
  });

  test('só admin grava no bucket store; todos leem', async () => {
    await denied(as(ALICE, () => db.query(`insert into storage.objects (bucket_id, name) values ('store', 'loja-1.jpg')`)));
    await as(ADMIN, () => db.query(`insert into storage.objects (bucket_id, name) values ('store', 'loja-1.jpg')`));
    const { rows } = await as(ALICE, () => db.query(`select name from storage.objects where bucket_id = 'store'`));
    expect(rows).toEqual([{ name: 'loja-1.jpg' }]);
  });
});

describe('log de gerações', () => {
  test('membro não lê nem grava; só a chave de serviço (superusuário aqui) enxerga', async () => {
    await db.query(`insert into public.generation_log (user_id, kit_id, position) values ($1, null, 1)`, [ALICE]);
    const seen = await as(ALICE, () => db.query(`select * from public.generation_log`));
    expect(seen.rows).toHaveLength(0);
    await denied(as(ALICE, () => db.query(`insert into public.generation_log (user_id) values ($1)`, [ALICE])));
    await denied(as(ADMIN, () => db.query(`insert into public.generation_log (user_id) values ($1)`, [ADMIN])));
    const all = await db.query(`select * from public.generation_log`);
    expect(all.rows).toHaveLength(1);
  });
});

describe('conexão com o Mercado Livre', () => {
  test('ninguém pelo navegador lê ou grava os tokens, nem o admin', async () => {
    await db.query(
      `insert into public.ml_connection (ml_user_id, access_token_enc, refresh_token_enc, expires_at) values (1, 'a', 'r', now())`,
    );
    for (const user of [ALICE, ADMIN]) {
      const seen = await as(user, () => db.query(`select * from public.ml_connection`));
      expect(seen.rows).toHaveLength(0);
      await denied(
        as(user, () =>
          db.query(`insert into public.ml_connection (id, ml_user_id, access_token_enc, refresh_token_enc, expires_at) values (1, 2, 'x', 'y', now())`),
        ),
      );
    }
    const updated = await as(ADMIN, () => db.query(`update public.ml_connection set nickname = 'hack'`));
    expect(updated.affectedRows ?? 0).toBe(0);
    const all = await db.query<{ nickname: string | null }>(`select nickname from public.ml_connection`);
    expect(all.rows).toEqual([{ nickname: null }]);
  });

  test('só existe uma conexão (a da loja)', async () => {
    await expect(
      db.query(`insert into public.ml_connection (id, ml_user_id, access_token_enc, refresh_token_enc, expires_at) values (2, 1, 'a', 'r', now())`),
    ).rejects.toThrow(/check/i);
  });
});
