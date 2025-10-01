"use strict";
/// <reference types="node" />
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModuleStore = void 0;
const path = __importStar(require("path"));
const fs_1 = require("fs");
const logger_1 = require("./logger");
function makeEncoder() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { get_encoding } = require("@dqbd/tiktoken");
        const enc = get_encoding("cl100k_base");
        if ((0, logger_1.isDebug)())
            logger_1.log.debug("[ModuleStore] Encoder: tiktoken(cl100k_base)");
        return enc;
    }
    catch (err) {
        const te = new TextEncoder();
        if ((0, logger_1.isDebug)())
            logger_1.log.debug("[ModuleStore] Encoder: TextEncoder fallback", { err: String(err) });
        return { encode: (s) => Array.from(te.encode(s)) };
    }
}
const enc = makeEncoder();
/** Normaliza nome de arquivo para chave do índice (case-insensitive). */
function normKey(name) {
    return name.normalize("NFC").toLowerCase();
}
/** Extensões suportadas para módulos. */
const ALLOWED_EXT = new Set([".txt", ".md"]);
/** -------------------------- Helpers de path -------------------------- */
/** Retorna apenas diretórios que existem. */
async function filterExistingDirs(paths) {
    const out = [];
    for (const p of paths) {
        try {
            const st = await fs_1.promises.stat(p);
            if (st.isDirectory())
                out.push(p);
        }
        catch {
            // ignore
        }
    }
    return out;
}
/** Tenta resolver roots a partir da env ou de candidatos padrão. */
async function resolveDefaultRoots() {
    // 1) Via env CSV (prioridade)
    const envRoots = (process.env.ECO_PROMPT_ROOTS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    if (envRoots.length) {
        const existing = await filterExistingDirs(envRoots);
        if (existing.length) {
            if ((0, logger_1.isDebug)())
                logger_1.log.debug("[ModuleStore] Using ECO_PROMPT_ROOTS", { roots: existing });
            return existing;
        }
        if ((0, logger_1.isDebug)())
            logger_1.log.debug("[ModuleStore] ECO_PROMPT_ROOTS provided but none exist", { envRoots });
    }
    // 2) Candidatos padrão (produção e dev)
    // __dirname = dist/services/promptContext (neste módulo)
    const candidates = [
        path.resolve(__dirname, "../assets"), // dist/services/assets
        path.resolve(__dirname, "../../assets"), // dist/assets
        path.resolve(process.cwd(), "dist/assets"), // dist/assets (fallback)
        path.resolve(process.cwd(), "assets"), // assets (dev)
    ];
    const existing = await filterExistingDirs(candidates);
    if (existing.length && (0, logger_1.isDebug)()) {
        logger_1.log.debug("[ModuleStore] Using default roots", { roots: existing });
    }
    return existing;
}
/** ----------------------------- Classe ----------------------------- */
class ModuleStore {
    static _i;
    static get I() { return (this._i ??= new ModuleStore()); }
    roots = [];
    fileIndexBuilt = false;
    fileIndex = new Map(); // key(norm) -> fullPath
    cacheModulos = new Map(); // key(norm) -> content
    tokenCountCache = new Map(); // key -> tokens
    buildLock = null;
    bootstrapped = false;
    /** --------------------- Configuração & util --------------------- */
    /** Define pastas e limpa caches/índices. */
    configure(roots) {
        this.roots = (roots || []).filter(Boolean);
        this.fileIndexBuilt = false;
        this.fileIndex.clear();
        this.cacheModulos.clear();
        this.tokenCountCache.clear();
        this.bootstrapped = this.roots.length > 0;
        if ((0, logger_1.isDebug)())
            logger_1.log.debug("[ModuleStore.configure]", { roots: this.roots });
    }
    /** Inicializa roots automaticamente se não houver configuração explícita. */
    async ensureBootstrapped() {
        if (this.bootstrapped && this.roots.length > 0)
            return;
        const defaults = await resolveDefaultRoots();
        if (defaults.length === 0) {
            // Ainda assim permita funcionar via registerInline(); mas avise.
            if ((0, logger_1.isDebug)())
                logger_1.log.debug("[ModuleStore.ensureBootstrapped] no roots found; relying on inline modules only");
            this.bootstrapped = true;
            return;
        }
        this.configure(defaults);
        this.bootstrapped = true;
        if ((0, logger_1.isDebug)())
            logger_1.log.debug("[ModuleStore.bootstrap] configurado", { roots: this.roots });
    }
    /** Exposto para o servidor chamar no boot (recomendado). */
    async bootstrap() {
        await this.ensureBootstrapped();
        await this.buildFileIndexOnce();
    }
    /** Estatísticas rápidas (para debug endpoints). */
    stats() {
        return {
            roots: [...this.roots],
            indexedCount: this.fileIndex.size,
            cachedCount: this.cacheModulos.size,
            built: this.fileIndexBuilt,
        };
    }
    /** Lista até N nomes indexados (sem caminhos), útil para debug. */
    listIndexed(limit = 50) {
        return Array.from(this.fileIndex.keys()).slice(0, limit);
    }
    /** Invalida caches (tudo ou só um módulo). */
    invalidate(name) {
        if (!name) {
            this.cacheModulos.clear();
            this.tokenCountCache.clear();
            return;
        }
        const k = normKey(name);
        this.cacheModulos.delete(k);
        this.tokenCountCache.delete(k);
        // inline caches usam chaves __INLINE__: não dá para invalidar seletivo sem parâmetro extra
    }
    /** Registra um módulo “inline” (fallback em memória) com esse nome. */
    registerInline(name, content) {
        const k = normKey(name);
        const c = (content ?? "").trim();
        this.cacheModulos.set(k, c);
        this.tokenCountCache.set(k, enc.encode(c).length);
        // NÃO grava no fileIndex; é somente cache em memória.
        if ((0, logger_1.isDebug)())
            logger_1.log.debug("[ModuleStore.registerInline] registrado", { name, tokens: this.tokenCountCache.get(k) });
    }
    // ------- Wrappers estáticos (compat) -------
    static async buildFileIndexOnce() { return this.I.buildFileIndexOnce(); }
    static async bootstrap() { return this.I.bootstrap(); }
    static configure(roots) { this.I.configure(roots); }
    static async read(name) { return this.I.read(name); }
    static tokenCountOf(name, content) { return this.I.tokenCountOf(name, content); }
    static stats() { return this.I.stats(); }
    static listIndexed(limit) { return this.I.listIndexed(limit); }
    static invalidate(name) { return this.I.invalidate(name); }
    static registerInline(name, content) { return this.I.registerInline(name, content); }
    // -------------------------------------------
    /** -------------------- Indexação de arquivos ------------------- */
    /** Varre diretórios recursivamente e retorna arquivos suportados. */
    async walkDir(base) {
        const out = [];
        try {
            const entries = await fs_1.promises.readdir(base, { withFileTypes: true });
            for (const ent of entries) {
                const full = path.join(base, ent.name);
                if (ent.isDirectory()) {
                    const nested = await this.walkDir(full);
                    out.push(...nested);
                }
                else {
                    const ext = path.extname(ent.name).toLowerCase();
                    if (ALLOWED_EXT.has(ext)) {
                        out.push({ name: ent.name, full });
                    }
                }
            }
        }
        catch (err) {
            if ((0, logger_1.isDebug)())
                logger_1.log.debug("[ModuleStore.walkDir] skipping root (not found)", { base, err: String(err) });
        }
        return out;
    }
    /** Constrói índice de arquivos (garante execução única com lock). */
    async buildFileIndexOnce() {
        if (this.fileIndexBuilt)
            return;
        await this.ensureBootstrapped();
        // lock para evitar corrida em ambientes com boot concorrente
        if (!this.buildLock) {
            this.buildLock = (async () => {
                let totalIndexed = 0;
                if (this.roots.length === 0) {
                    // sem roots: funciona apenas com inline; não é erro.
                    if ((0, logger_1.isDebug)())
                        logger_1.log.debug("[ModuleStore.buildFileIndexOnce] no roots; inline-only mode");
                    this.fileIndexBuilt = true;
                    return;
                }
                for (const base of this.roots) {
                    const files = await this.walkDir(base);
                    for (const f of files) {
                        const key = normKey(f.name);
                        // primeiro root na lista vence em duplicado
                        if (!this.fileIndex.has(key)) {
                            this.fileIndex.set(key, f.full);
                            totalIndexed++;
                        }
                    }
                }
                this.fileIndexBuilt = true;
                if ((0, logger_1.isDebug)())
                    logger_1.log.debug("[ModuleStore.buildFileIndexOnce] index built", {
                        roots: this.roots.length,
                        files: totalIndexed,
                    });
            })().catch((err) => {
                // se falhar, zera lock para permitir nova tentativa futura
                this.buildLock = null;
                throw err;
            });
        }
        await this.buildLock;
    }
    /** ----------------------- Leitura e tokens ---------------------- */
    /** Lê um módulo por nome (ex.: "IDENTIDADE.txt"). */
    async read(name) {
        if (!name?.trim())
            return null;
        const key = normKey(name);
        const cached = this.cacheModulos.get(key);
        if (cached != null) {
            if ((0, logger_1.isDebug)())
                logger_1.log.debug("[ModuleStore.read] cache hit", { name, tokens: this.tokenCountCache.get(key) ?? -1 });
            return cached;
        }
        await this.buildFileIndexOnce();
        // 1) caminho pelo índice
        const p = this.fileIndex.get(key);
        if (p) {
            try {
                const c = (await fs_1.promises.readFile(p, "utf-8")).trim();
                this.cacheModulos.set(key, c);
                this.tokenCountCache.set(key, enc.encode(c).length);
                if ((0, logger_1.isDebug)())
                    logger_1.log.debug("[ModuleStore.read] index path", { name, path: p, tokens: this.tokenCountCache.get(key) });
                return c;
            }
            catch (err) {
                if ((0, logger_1.isDebug)())
                    logger_1.log.debug("[ModuleStore.read] read fail (indexed path)", { name, path: p, err: String(err) });
            }
        }
        // 2) fallback direto (arquivo recém-criado pode não estar no índice)
        for (const base of this.roots) {
            try {
                const full = path.join(base, name);
                const c = (await fs_1.promises.readFile(full, "utf-8")).trim();
                this.cacheModulos.set(key, c);
                this.tokenCountCache.set(key, enc.encode(c).length);
                if ((0, logger_1.isDebug)())
                    logger_1.log.debug("[ModuleStore.read] fallback path", { name, path: full, tokens: this.tokenCountCache.get(key) });
                return c;
            }
            catch {
                // tenta próximo root
            }
        }
        if ((0, logger_1.isDebug)())
            logger_1.log.debug("[ModuleStore.read] not found", { name });
        return null;
    }
    /**
     * Conta tokens de um módulo (por nome) ou conteúdo inline.
     * - Para inline: chave __INLINE__:name:len
     * - Para módulo: usa nome normalizado
     */
    tokenCountOf(name, content) {
        if (typeof content === "string") {
            const key = `__INLINE__:${normKey(name)}:${content.length}`;
            const cached = this.tokenCountCache.get(key);
            if (cached != null)
                return cached;
            const n = enc.encode(content).length;
            this.tokenCountCache.set(key, n);
            if ((0, logger_1.isDebug)())
                logger_1.log.debug("[ModuleStore.tokenCountOf] inline", { key, n });
            return n;
        }
        const key = normKey(name);
        const hit = this.tokenCountCache.get(key);
        if (hit != null)
            return hit;
        const cachedContent = this.cacheModulos.get(key) ?? "";
        const n = enc.encode(cachedContent).length;
        this.tokenCountCache.set(key, n);
        if ((0, logger_1.isDebug)())
            logger_1.log.debug("[ModuleStore.tokenCountOf] module", {
                name,
                n,
                hadContent: cachedContent.length > 0,
            });
        return n;
    }
}
exports.ModuleStore = ModuleStore;
/** Export default + bootstrap helpers */
exports.default = ModuleStore;
/**
 * Sugerido no start do servidor (ex.: server.ts):
 *   import ModuleStore from "services/promptContext/ModuleStore";
 *   await ModuleStore.bootstrap();
 *
 * Ou defina ECO_PROMPT_ROOTS no Render:
 *   ECO_PROMPT_ROOTS=/opt/render/project/src/dist/assets
 */
//# sourceMappingURL=ModuleStore.js.map