"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPromptMestre = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
let promptMestreCache;
async function carregarPromptMestre() {
    const assetsDir = path_1.default.join(process.cwd(), 'assets');
    const arquivos = [
        'eco_prompt_programavel.txt',
        'eco_manifesto_fonte.txt',
        'eco_principios_poeticos.txt',
        'eco_behavioral_instructions.txt',
        'eco_core_personality.txt',
        'eco_guidelines_general.txt',
        'eco_emotions.txt',
        'eco_examples_realistic.txt',
        'eco_generic_inputs.txt',
        'eco_forbidden_patterns.txt',
        'eco_farewell.txt',
    ];
    const textos = await Promise.all(arquivos.map(filename => promises_1.default.readFile(path_1.default.join(assetsDir, filename), 'utf-8')));
    promptMestreCache = textos
        .map((conteudo, idx) => {
        const titulo = arquivos[idx]
            .replace('.txt', '')
            .replace(/eco_/g, '')
            .replace(/_/g, ' ')
            .toUpperCase();
        return `## ${titulo}\n\n${conteudo.trim()}`;
    })
        .join('\n\n');
}
carregarPromptMestre().catch(err => {
    console.error('Falha ao carregar prompt mestre:', err);
    process.exit(1);
});
const getPromptMestre = (_req, res) => {
    res.json({ prompt: promptMestreCache });
};
exports.getPromptMestre = getPromptMestre;
//# sourceMappingURL=promptController.js.map