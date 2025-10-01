"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GREET_RE = exports.MAX_LEN_FOR_GREETING = exports.MARGIN_TOKENS = exports.TIMEOUT_ENC_MS = exports.TIMEOUT_MEM_MS = exports.TIMEOUT_EMB_MS = exports.TIMEOUT_FUZZY_MS = exports.HARD_CAP_EXTRAS = exports.NIVEL1_BUDGET = exports.MAX_PROMPT_TOKENS = exports.LOG_LEVEL = void 0;
exports.LOG_LEVEL = process.env.LOG_LEVEL ?? "info";
exports.MAX_PROMPT_TOKENS = Number(process.env.ECO_MAX_PROMPT_TOKENS ?? 8000);
exports.NIVEL1_BUDGET = Number(process.env.ECO_NIVEL1_BUDGET ?? 2500);
exports.HARD_CAP_EXTRAS = 6;
exports.TIMEOUT_FUZZY_MS = 1500;
exports.TIMEOUT_EMB_MS = 2200;
exports.TIMEOUT_MEM_MS = 2200;
exports.TIMEOUT_ENC_MS = 2000;
exports.MARGIN_TOKENS = 256;
exports.MAX_LEN_FOR_GREETING = 40;
exports.GREET_RE = /^(?:(?:oi+|oie+|ola+|ol[aá]|alo+|opa+|salve)(?:[, ]*(?:tudo\s*bem|td\s*bem))?|tudo\s*(?:bem|bom|certo)|oi+[, ]*tudo\s*bem|ol[aá]\s*eco|oi\s*eco|oie\s*eco|ola\s*eco|alo\s*eco|bom\s*dia+|boa\s*tarde+|boa\s*noite+|boa\s*madrugada+|e\s*a[ei]|e\s*a[ií]\??|eai|eae|fala(?:\s*ai)?|falae|hey+|hi+|hello+|yo+|sup|beleza|blz|suave|de\s*boa|tranq(?:s)?|tranquilo(?:\s*ai)?|como\s*(?:vai|vc\s*esta|voce\s*esta|ce\s*ta|c[eu]\s*ta))(?:[\s,]*(@?eco|eco|bot|assistente|ai|chat))?\s*[!?.…]*$/i;
//# sourceMappingURL=config.js.map