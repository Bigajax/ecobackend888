import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

const Module = require("node:module");

type StubMap = Record<string, unknown>;

type Loader<T> = () => Promise<T> | T;

const withPatchedModules = async <T>(stubs: StubMap, loader: Loader<T>): Promise<T> => {
  const originalLoad = Module._load;
  Module._load = function patched(request: string, parent: any, isMain: boolean) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) {
      return stubs[request];
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    return await loader();
  } finally {
    Module._load = originalLoad;
  }
};

const loadAppWithStubs = async (stubs: StubMap) => {
  return withPatchedModules(stubs, () => {
    const modulePath = "../../core/http/app";
    const resolved = require.resolve(modulePath);
    delete require.cache[resolved];
    const mod = require(modulePath);
    return mod.createApp();
  });
};

test("POST /api/mensagem persiste mensagem usando Supabase e retorna payload", async () => {
  const insertedRows: any[] = [];

  const supabaseStub = {
    from(table: string) {
      assert.equal(table, "mensagem");
      return {
        insert(rows: any[]) {
          insertedRows.push(...rows);
          return {
            select() {
              return {
                single: async () => ({
                  data: {
                    id: "mensagem-123",
                    ...rows[0],
                    created_at: "2024-01-01T00:00:00.000Z",
                    updated_at: "2024-01-01T00:00:00.000Z",
                  },
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  };

  const supabaseAdminStub = {
    ensureSupabaseConfigured: () => supabaseStub,
    SupabaseConfigError: class SupabaseConfigError extends Error {},
    tryGetAdmin: () => supabaseStub,
    getSupabaseAdmin: () => supabaseStub,
    isSupabaseConfigured: () => true,
    supabase: supabaseStub,
    default: supabaseStub,
  };

  const app = await loadAppWithStubs({
    "../lib/supabaseAdmin": supabaseAdminStub,
    "../../lib/supabaseAdmin": supabaseAdminStub,
  });

  const payload = {
    usuario_id: "f4e9b1c2-1234-4a5b-9cde-1234567890ab",
    conteudo: "Olá Eco, quero registrar uma mensagem",
    sentimento: "alegria",
    salvar_memoria: true,
  };

  const response = await request(app).post("/api/mensagem").send(payload);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.ok, true);
  assert.equal(response.body.data.id, "mensagem-123");
  assert.equal(response.body.data.usuario_id, payload.usuario_id);
  assert.equal(response.body.data.conteudo, payload.conteudo);
  assert.equal(response.body.data.sentimento, payload.sentimento);
  assert.equal(response.body.data.salvar_memoria, true);
  assert.equal(typeof response.body.data.data_hora, "string");

  assert.equal(insertedRows.length, 1);
  const inserted = insertedRows[0];
  assert.equal(inserted.usuario_id, payload.usuario_id);
  assert.equal(inserted.conteudo, payload.conteudo);
  assert.equal(inserted.sentimento, payload.sentimento);
  assert.equal(inserted.salvar_memoria, true);
  assert.equal(typeof inserted.data_hora, "string");
});
