import { limparResposta } from "../server/utils/text";

describe("limparResposta", () => {
  it("preserva separação de parágrafos ao remover tags", () => {
    const input = "<p>Boa tarde</p><p>Rafael</p>";

    expect(limparResposta(input)).toBe("Boa tarde\n\nRafael");
  });

  it("converte quebras de linha e listas em separadores legíveis", () => {
    const input = "<div>Ola<br/>mundo</div><ul><li>Primeiro</li><li>Segundo</li></ul>";

    expect(limparResposta(input)).toBe("Ola\nmundo\n\n- Primeiro\n- Segundo");
  });
});
