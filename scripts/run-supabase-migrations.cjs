/**
 * Aplica as migrations do Supabase via Management API.
 * Usa NEXT_PAT_SUPABASE_TOKEN e NEXT_PUBLIC_SUPABASE_URL do .env.local.
 *
 * Uso: node scripts/run-supabase-migrations.cjs
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');

const PAT = process.env.NEXT_PAT_SUPABASE_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!PAT) {
  console.error('Erro: defina NEXT_PAT_SUPABASE_TOKEN no .env.local');
  console.error(
    '       Este token NÃO é anon nem service_role. Crie em:\n' +
    '       https://supabase.com/dashboard/account/tokens\n' +
    '       (Personal Access Token; formato costuma ser sbp_...)'
  );
  process.exit(1);
}

if (PAT.startsWith('eyJ')) {
  console.error(
    'Erro: NEXT_PAT_SUPABASE_TOKEN parece um JWT (anon/service_role).\n' +
    '       Este script precisa de um Personal Access Token da sua CONTA Supabase:\n' +
    '       https://supabase.com/dashboard/account/tokens'
  );
  process.exit(1);
}
if (!SUPABASE_URL) {
  console.error('Erro: defina NEXT_PUBLIC_SUPABASE_URL no .env.local');
  process.exit(1);
}

// ref = subdomínio (ex: https://xyz.supabase.co -> xyz)
const ref = SUPABASE_URL.replace(/^https?:\/\//, '').split('.')[0];
if (!ref) {
  console.error('Erro: não foi possível extrair o project ref de NEXT_PUBLIC_SUPABASE_URL');
  process.exit(1);
}

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const API_URL = `https://api.supabase.com/v1/projects/${ref}/database/query`;

async function runQuery(sql, name) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PAT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${name}: ${res.status} ${res.statusText}\n${body}`);
  }
  return res;
}

async function main() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('Nenhuma migration em supabase/migrations.');
    return;
  }

  console.log(`Project ref: ${ref}`);
  console.log(`Rodando ${files.length} migration(s)...\n`);

  for (const file of files) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf8').trim();
    if (!sql) {
      console.log(`  [skip] ${file} (vazio)`);
      continue;
    }
    process.stdout.write(`  ${file} ... `);
    try {
      await runQuery(sql, file);
      console.log('ok');
    } catch (err) {
      console.error('erro');
      console.error(err.message);
      process.exit(1);
    }
  }

  console.log('\nMigrations aplicadas.');
}

main();
