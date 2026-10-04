-- 0509 — schema da sincronização OpenSquad já consumida pela rota e pela tela.
-- Escrita somente pelo serviço autenticado da API; leitura pelo admin da empresa.
create table if not exists public.prospeccao_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id text not null,
  tema text,
  resultado text,
  created_at timestamptz not null default now()
);
create unique index if not exists prospeccao_runs_org_run_unique
  on public.prospeccao_runs (organization_id, run_id);

create table if not exists public.prospeccao_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id text not null,
  filename text not null,
  content text not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, run_id)
    references public.prospeccao_runs (organization_id, run_id) on delete cascade
);
create unique index if not exists prospeccao_results_org_run_file_unique
  on public.prospeccao_results (organization_id, run_id, filename);

alter table public.prospeccao_runs enable row level security;
alter table public.prospeccao_results enable row level security;
revoke all on public.prospeccao_runs, public.prospeccao_results from public, anon, authenticated;
grant select on public.prospeccao_runs, public.prospeccao_results to authenticated;
grant all on public.prospeccao_runs, public.prospeccao_results to service_role;

drop policy if exists tenant_isolation_prospeccao_runs_read on public.prospeccao_runs;
create policy tenant_isolation_prospeccao_runs_read on public.prospeccao_runs
  for select to authenticated
  using (organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'admin'));
drop policy if exists tenant_isolation_prospeccao_results_read on public.prospeccao_results;
create policy tenant_isolation_prospeccao_results_read on public.prospeccao_results
  for select to authenticated
  using (organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'admin'));
