import { beforeAll, describe, expect, it } from "vitest";

import { countAs, GOV_ADMIN, GOV_MANAGER, GOV_ORG, seedGov, sql } from "./gov-helpers";

const OUTRA_ORG = "cccccccc-0509-4000-8000-000000000001";

beforeAll(() => {
  seedGov();
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${OUTRA_ORG}', 'prospeccao-0509', 'Teste', 'Teste') on conflict do nothing;
    insert into public.prospeccao_runs (organization_id, run_id)
      values ('${GOV_ORG}', 'sync-0509'), ('${OUTRA_ORG}', 'sync-0509')
      on conflict (organization_id, run_id) do update set tema = 'atualizado';
    insert into public.prospeccao_results (organization_id, run_id, filename, content)
      values ('${GOV_ORG}', 'sync-0509', 'leads.csv', 'primeiro'),
             ('${OUTRA_ORG}', 'sync-0509', 'leads.csv', 'outra empresa')
      on conflict (organization_id, run_id, filename) do update set content = excluded.content;
    insert into public.prospeccao_results (organization_id, run_id, filename, content)
      values ('${GOV_ORG}', 'sync-0509', 'leads.csv', 'atualizado')
      on conflict (organization_id, run_id, filename) do update set content = excluded.content;
  `);
});

describe("0509 — sincronização da prospecção com isolamento por empresa", () => {
  it("reenvio atualiza o arquivo sem duplicá-lo", () => {
    expect(
      sql(
        `select count(*) from public.prospeccao_results where organization_id = '${GOV_ORG}' and content = 'atualizado'`,
      ),
    ).toBe("1");
  });

  it.each(["prospeccao_runs", "prospeccao_results"])(
    "admin lê somente sua empresa em %s",
    (table) => {
      expect(countAs(GOV_ADMIN, `select count(*) from public.${table}`)).toBe(1);
      expect(countAs(GOV_MANAGER, `select count(*) from public.${table}`)).toBe(0);
      expect(sql(`select has_table_privilege('anon', 'public.${table}', 'SELECT')`)).toBe("f");
      expect(
        sql(
          `select has_table_privilege('authenticated', 'public.${table}', 'INSERT,UPDATE,DELETE')`,
        ),
      ).toBe("f");
    },
  );

  it("não associa um arquivo a uma execução de outra empresa", () => {
    sql(
      `insert into public.prospeccao_runs (organization_id, run_id) values ('${OUTRA_ORG}', 'exclusiva-0509')`,
    );
    expect(() =>
      sql(
        `insert into public.prospeccao_results (organization_id, run_id, filename, content) values ('${GOV_ORG}', 'exclusiva-0509', 'x.csv', 'x')`,
      ),
    ).toThrow();
  });
});
