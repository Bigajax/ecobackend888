const lastByUser = new Map<string, number>();
const WINDOW_MS = 120_000; // 120s

export const GreetGuard = {
  can(userId?: string) {
    if (!userId) return true;
    const last = lastByUser.get(userId) ?? 0;
    return Date.now() - last > WINDOW_MS;
  },
  mark(userId?: string) {
    if (userId) lastByUser.set(userId, Date.now());
  },
};
