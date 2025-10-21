import type { Express } from "express";

export async function createTestApp(): Promise<Express> {
  const { createApp } = await import("../../../core/http/app");
  return createApp();
}
