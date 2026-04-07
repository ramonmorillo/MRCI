import test from "node:test";
import assert from "node:assert/strict";
import { createDebouncedSearch, filterAndRankCimaResults, highlightMatch } from "../src/lib/integrations/cimaSearchController.js";

test("CIMA results are filtered and ranked by typed query", () => {
  const items = [
    { name: "Aspirin", activeIngredients: "acetylsalicylic acid", registrationNumber: "1", nationalCode: "111", form: "tablet" },
    { name: "Metformin STADA", activeIngredients: "metformin", registrationNumber: "2", nationalCode: "222", form: "tablet" },
    { name: "Metoprolol", activeIngredients: "metoprolol", registrationNumber: "3", nationalCode: "333", form: "capsule" }
  ];
  const filtered = filterAndRankCimaResults(items, "met");
  assert.equal(filtered.length, 2);
  assert.equal(filtered[0].name, "Metformin STADA");
});

test("highlightMatch wraps matching query fragment", () => {
  assert.equal(highlightMatch("Metformin STADA", "for"), "Met<mark>for</mark>min STADA");
});

test("debounced search ignores stale async responses", async () => {
  const updates = [];
  const deferred = [];
  const debounceFactory = (fn) => fn;
  const runner = createDebouncedSearch({
    waitMs: 0,
    minLength: 2,
    debounceFactory,
    searchFn: async (query) =>
      await new Promise((resolve) => {
        deferred.push({ query, resolve });
      }),
    onState: (state) => updates.push(state)
  });

  runner.run("me");
  runner.run("met");
  deferred.find((entry) => entry.query === "me").resolve([{ name: "Old" }]);
  deferred.find((entry) => entry.query === "met").resolve([{ name: "New" }]);
  await Promise.resolve();
  await Promise.resolve();

  const successStates = updates.filter((entry) => entry.type === "success");
  assert.equal(successStates.length, 1);
  assert.equal(successStates[0].query, "met");
  assert.equal(successStates[0].results[0].name, "New");
});
