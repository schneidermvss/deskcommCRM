import { afterEach, describe, expect, it, vi } from "vitest";

import { crmLookupFipePrice } from "./fipe";

const MARCAS = [
  { code: "21", name: "Fiat" },
  { code: "59", name: "VW - VolksWagen" },
  { code: "22", name: "Ford" },
];

const MODELOS_FIAT = [
  { code: "4828", name: "Mobi Like 1.0" },
  { code: "4829", name: "Mobi Trekking 1.0" },
];

const ANOS_MOBI_LIKE = [
  { code: "2023-1", name: "2023 Gasolina" },
  { code: "2022-1", name: "2022 Gasolina" },
];

const PRECO_MOBI_LIKE_2023 = {
  vehicleType: 1,
  price: "R$ 68.000,00",
  brand: "Fiat",
  model: "Mobi Like 1.0",
  modelYear: 2023,
  fuel: "Gasolina",
  codeFipe: "001234-5",
  referenceMonth: "outubro de 2026",
  fuelAcronym: "G",
};

function respostaPara(url: string): unknown {
  if (url.endsWith("/cars/brands")) return MARCAS;
  if (url.endsWith("/cars/brands/21/models")) return MODELOS_FIAT;
  if (url.endsWith("/cars/brands/21/models/4828/years")) return ANOS_MOBI_LIKE;
  if (url.endsWith("/cars/brands/21/models/4828/years/2023-1")) return PRECO_MOBI_LIKE_2023;
  throw new Error(`rota não dublada: ${url}`);
}

function dublarFipe() {
  const fetchSpy = vi.fn(async (url: string) => {
    return new Response(JSON.stringify(respostaPara(url)), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("crm_lookup_fipe_price", () => {
  it("encontra marca, modelo e ano exatos e devolve o preço", async () => {
    dublarFipe();
    const resultado = (await crmLookupFipePrice.handler(
      { marca: "Fiat", modelo: "Mobi Like 1.0", ano_modelo: 2023, tipo: "carro" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      undefined as any,
    )) as Record<string, unknown>;

    expect(resultado.preco_fipe).toBe("R$ 68.000,00");
    expect(resultado.codigo_fipe).toBe("001234-5");
    expect(resultado.erro).toBeUndefined();
  });

  it("marca ambígua pede desambiguação em vez de adivinhar", async () => {
    dublarFipe();
    // "v" bate em mais de uma marca dubladas acima só por acidente do fixture
    // ("VW - VolksWagen" tem "v"); o teste real de ambiguidade usa um termo
    // vazio de interseção clara entre duas marcas fabricadas aqui.
    const marcasAmbiguas = [
      { code: "1", name: "Chevrolet" },
      { code: "2", name: "Chery" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/cars/brands")) return new Response(JSON.stringify(marcasAmbiguas), { status: 200 });
        throw new Error(`não deveria chamar: ${url}`);
      }),
    );

    const resultado = (await crmLookupFipePrice.handler(
      { marca: "Che", modelo: "qualquer", ano_modelo: 2020, tipo: "carro" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      undefined as any,
    )) as Record<string, unknown>;

    expect(resultado.precisa_escolher).toBe("marca");
    expect(resultado.opcoes).toEqual(["Chevrolet", "Chery"]);
  });

  it("marca sem nenhuma correspondência devolve erro, não lança", async () => {
    dublarFipe();
    const resultado = (await crmLookupFipePrice.handler(
      { marca: "MarcaQueNaoExiste123", modelo: "x", ano_modelo: 2020, tipo: "carro" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      undefined as any,
    )) as Record<string, unknown>;

    expect(resultado.erro).toBe("marca_nao_encontrada");
  });

  it("ano fora do catálogo do modelo devolve os anos disponíveis em vez de travar", async () => {
    dublarFipe();
    const resultado = (await crmLookupFipePrice.handler(
      { marca: "Fiat", modelo: "Mobi Like 1.0", ano_modelo: 1999, tipo: "carro" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      undefined as any,
    )) as Record<string, unknown>;

    expect(resultado.erro).toBe("ano_nao_encontrado");
    expect(resultado.anos_disponiveis).toEqual(["2023", "2022"]);
  });

  it("indisponibilidade da FIPE devolve erro estruturado, não lança exceção", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const resultado = (await crmLookupFipePrice.handler(
      { marca: "Fiat", modelo: "Mobi", ano_modelo: 2023, tipo: "carro" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      undefined as any,
    )) as Record<string, unknown>;

    expect(resultado.erro).toContain("fipe_indisponivel");
  });
});
