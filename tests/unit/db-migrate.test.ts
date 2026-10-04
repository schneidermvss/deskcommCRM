import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

it("db:migrate recusa sucesso sem aplicar schema e indica o fluxo protegido", () => {
  const root = path.resolve(__dirname, "../..");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  expect(pkg.scripts["db:migrate"]).toBe("node scripts/db-migrate.cjs");
  const result = spawnSync(process.execPath, ["scripts/db-migrate.cjs"], {
    cwd: root,
    encoding: "utf8",
  });
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("Nenhuma migração foi aplicada");
  expect(result.stderr).toContain("hostgator-setup-kit/update.sh");
});
