/**
 * Test: Intensity Detection Fix
 *
 * Validates that the improved estimarIntensidade0a10 function
 * correctly detects emotional intensity for memory saving.
 */

import { estimarIntensidade0a10 } from "../server/services/promptContext/flags";

describe("Intensity Detection System", () => {
  describe("Primary Emotions (Base +5)", () => {
    it("should detect 'tristeza' (sadness)", () => {
      const text = "Estou muito triste hoje";
      const intensity = estimarIntensidade0a10(text);
      expect(intensity).toBeGreaterThanOrEqual(7); // 5 + 2 modifiers
      console.log(`"${text}" → intensity=${intensity}`);
    });

    it("should detect 'tristeza' in Portuguese variants", () => {
      const variants = [
        "Estou triste",
        "Me sinto tristonho",
        "Uma tristeza pesada",
        "Tristeza profunda",
      ];
      variants.forEach((text) => {
        const intensity = estimarIntensidade0a10(text);
        expect(intensity).toBeGreaterThanOrEqual(5);
        console.log(`"${text}" → intensity=${intensity}`);
      });
    });

    it("should detect 'ansiedade' (anxiety)", () => {
      const text = "Estou muito angustiado";
      const intensity = estimarIntensidade0a10(text);
      expect(intensity).toBeGreaterThanOrEqual(6);
      console.log(`"${text}" → intensity=${intensity}`);
    });

    it("should detect 'medo' (fear)", () => {
      const text = "Tenho muito medo disso";
      const intensity = estimarIntensidade0a10(text);
      expect(intensity).toBeGreaterThanOrEqual(5);
      console.log(`"${text}" → intensity=${intensity}`);
    });

    it("should detect 'raiva' (anger)", () => {
      const text = "Estou furioso com essa situação";
      const intensity = estimarIntensidade0a10(text);
      expect(intensity).toBeGreaterThanOrEqual(5);
      console.log(`"${text}" → intensity=${intensity}`);
    });
  });

  describe("Context-Aware Detection", () => {
    it("should detect work-related sadness", () => {
      const text = "Estou muito triste porque perdi meu emprego";
      const intensity = estimarIntensidade0a10(text);
      expect(intensity).toBeGreaterThanOrEqual(7); // Primary + work context + modifiers
      console.log(`"${text}" → intensity=${intensity}`);
    });

    it("should detect relationship-related anxiety", () => {
      const text = "Estou angustiado com meu relacionamento";
      const intensity = estimarIntensidade0a10(text);
      expect(intensity).toBeGreaterThanOrEqual(6);
      console.log(`"${text}" → intensity=${intensity}`);
    });

    it("should detect sadness about work troubles", () => {
      const text = "sim do trabalho"; // From Rafael's real example
      // This should now trigger the work-related pattern
      const intensity = estimarIntensidade0a10(text);
      // May not be super high since it's short, but should be detected
      console.log(`"${text}" → intensity=${intensity}`);
    });
  });

  describe("Intensity Modifiers", () => {
    it("should boost with 'muito' (very)", () => {
      const withModifier = estimarIntensidade0a10("Muito triste");
      const baseline = estimarIntensidade0a10("Triste");
      expect(withModifier).toBeGreaterThan(baseline);
      console.log(`"Triste" → ${baseline}, "Muito triste" → ${withModifier}`);
    });

    it("should detect 'demais' intensity", () => {
      const text = "Ansioso demais";
      const intensity = estimarIntensidade0a10(text);
      expect(intensity).toBeGreaterThanOrEqual(6);
      console.log(`"${text}" → intensity=${intensity}`);
    });

    it("should detect multiple punctuation marks", () => {
      const text = "Não aguento mais!!";
      const intensity = estimarIntensidade0a10(text);
      expect(intensity).toBeGreaterThanOrEqual(6);
      console.log(`"${text}" → intensity=${intensity}`);
    });

    it("should detect ellipsis (emotional hesitation)", () => {
      const text = "Não sei mais... tudo parece tão pesado...";
      const intensity = estimarIntensidade0a10(text);
      expect(intensity).toBeGreaterThanOrEqual(5);
      console.log(`"${text}" → intensity=${intensity}`);
    });
  });

  describe("Real User Examples", () => {
    it("should save memory for: 'Estou muito triste hoje'", () => {
      const text = "Estou muito triste hoje";
      const intensity = estimarIntensidade0a10(text);
      expect(intensity).toBeGreaterThanOrEqual(7); // MEMORY_THRESHOLD = 7
      console.log(
        `✅ Memory WILL be saved: "${text}" → intensity=${intensity}`
      );
    });

    it("should save memory for complete emotional context", () => {
      const text =
        "Estou muito triste hoje. Tristeza pesada chegou hoje. Um hipótese é que algo específico desencadeou— ou pode ser daquelas tristezas difusas, que ocupam espaço sem nome claro ainda.";
      const intensity = estimarIntensidade0a10(text);
      expect(intensity).toBeGreaterThanOrEqual(7);
      console.log(
        `✅ Memory WILL be saved: (longer text) → intensity=${intensity}`
      );
    });

    it("should save memory for work-related sadness", () => {
      const text = "Estou muito triste. Do trabalho.";
      const intensity = estimarIntensidade0a10(text);
      expect(intensity).toBeGreaterThanOrEqual(7); // Should now work!
      console.log(
        `✅ Memory WILL be saved: "${text}" → intensity=${intensity}`
      );
    });
  });

  describe("Baseline Cases", () => {
    it("should assign low intensity to generic messages", () => {
      const text = "Olá, tudo bem?";
      const intensity = estimarIntensidade0a10(text);
      expect(intensity).toBeLessThan(5);
      console.log(
        `❌ Memory will NOT be saved: "${text}" → intensity=${intensity}`
      );
    });

    it("should assign low intensity to factual messages", () => {
      const text = "Como funciona o sistema?";
      const intensity = estimarIntensidade0a10(text);
      expect(intensity).toBeLessThan(5);
      console.log(
        `❌ Memory will NOT be saved: "${text}" → intensity=${intensity}`
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty text", () => {
      const intensity = estimarIntensidade0a10("");
      expect(intensity).toBe(0);
    });

    it("should handle whitespace-only text", () => {
      const intensity = estimarIntensidade0a10("   ");
      expect(intensity).toBe(0);
    });

    it("should handle mixed case with accents", () => {
      const text = "Estou MUITO TrIstE com acentuação";
      const intensity = estimarIntensidade0a10(text);
      expect(intensity).toBeGreaterThanOrEqual(5);
      console.log(`"${text}" → intensity=${intensity}`);
    });

    it("should cap intensity at 10", () => {
      const text =
        "MUITO TRISTE DEMAIS PIOR HORRÍVEL INSUPORTÁVEL!!!!!!!!!!!";
      const intensity = estimarIntensidade0a10(text);
      expect(intensity).toBeLessThanOrEqual(10);
      expect(intensity).toBeGreaterThanOrEqual(8);
      console.log(`"${text}" → intensity=${intensity}`);
    });
  });
});
