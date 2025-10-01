"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GreetGuard = void 0;
const lastByUser = new Map();
const WINDOW_MS = 120_000; // 120s
exports.GreetGuard = {
    can(userId) {
        if (!userId)
            return true;
        const last = lastByUser.get(userId) ?? 0;
        return Date.now() - last > WINDOW_MS;
    },
    mark(userId) {
        if (userId)
            lastByUser.set(userId, Date.now());
    },
};
//# sourceMappingURL=GreetGuard.js.map