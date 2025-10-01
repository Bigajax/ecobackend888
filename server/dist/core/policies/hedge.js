"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hedge = hedge;
async function hedge(primary, fallback, cutOverMs = 2500) {
    let timer;
    try {
        const raced = Promise.race([
            primary,
            new Promise((resolve) => {
                timer = setTimeout(async () => resolve(await fallback), cutOverMs);
            }),
        ]);
        return await raced;
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
//# sourceMappingURL=hedge.js.map