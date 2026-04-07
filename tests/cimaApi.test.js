import test from "node:test";
import assert from "node:assert/strict";
import { searchMedications } from "../src/lib/integrations/cimaApi.js";

test("successful CIMA search maps results", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ resultados: [{ nombre: "Metformin STADA", nregistro: "123", pactivos: "Metformina" }] })
  });
  const result = await searchMedications("metformin", { fetchImpl });
  assert.equal(result.length, 1);
  assert.equal(result[0].registrationNumber, "123");
});

test("empty CIMA search returns empty list", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ resultados: [] }) });
  const result = await searchMedications("none", { fetchImpl });
  assert.deepEqual(result, []);
});

test("CIMA API failure rejects", async () => {
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(() => searchMedications("metformin", { fetchImpl }), /CIMA API error 503/);
});
