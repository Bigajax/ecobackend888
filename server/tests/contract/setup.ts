import { afterEach, jest } from "@jest/globals";

process.env.NODE_ENV = "test";

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  jest.resetModules();
});
