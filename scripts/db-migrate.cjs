// O schema self-host usa o baseline e as proteções do kit, não db push.
console.error(
  "Nenhuma migração foi aplicada. Para atualizar uma instalação existente, " +
    "use bash hostgator-setup-kit/update.sh (backup e checagem de saúde). " +
    "Para instalação nova ou desenvolvimento local, siga o README e aplique " +
    "supabase/baseline.sql pelo instalador correspondente.",
);
process.exitCode = 1;
