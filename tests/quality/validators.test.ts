import { checkBlocoTecnico, checkEstrutura, checkMemoria, computeQ } from "../../src/quality/validators";

describe("quality validators", () => {
  describe("checkEstrutura", () => {
    it("accepts responses containing the expected sections", () => {
      const text = `Contexto\n- Detalhes\nPlano\n1. passo\nAção\n2. executar`;
      expect(checkEstrutura(text)).toBe(true);
    });

    it("is tolerant to alternative headings", () => {
      const text = `Fundamentação\nDetalhes\nEstratégia\n- passo\nNext steps\n- executar`;
      expect(checkEstrutura(text)).toBe(true);
    });

    it("rejects responses missing plan/action structure", () => {
      const text = `Contexto\n- Somente contexto`;
      expect(checkEstrutura(text)).toBe(false);
    });
  });

  describe("checkMemoria", () => {
    it("returns true when at least one memory id is referenced", () => {
      const text = "Usando memoria ABC-123 para explicar.";
      expect(checkMemoria(text, ["abc-123", "def-999"])).toBe(true);
    });

    it("handles empty memory lists as pass", () => {
      expect(checkMemoria("qualquer", [])).toBe(true);
    });

    it("returns false when no memory identifiers are present", () => {
      const text = "Sem referencias";
      expect(checkMemoria(text, ["mem-001"])).toBe(false);
    });
  });

  describe("checkBlocoTecnico", () => {
    it("allows missing block when intensity is low", () => {
      expect(checkBlocoTecnico("texto livre", 5)).toBe(true);
    });

    it("requires explicit block when intensity is high", () => {
      const text = "BLOCO TÉCNICO\n- passo 1";
      expect(checkBlocoTecnico(text, 8)).toBe(true);
    });

    it("fails when high intensity lacks block cues", () => {
      expect(checkBlocoTecnico("resposta narrativa", 9)).toBe(false);
    });
  });

  describe("computeQ", () => {
    it("computes the average score", () => {
      const q = computeQ({ estruturado_ok: true, memoria_ok: false, bloco_ok: true });
      expect(q).toBeCloseTo(2 / 3, 4);
    });
  });
});
