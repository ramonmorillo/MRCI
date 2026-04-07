import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mrciClassic } from '../src/engines/mrciClassic.js';
import { aMrci } from '../src/engines/aMrci.js';

const mappings = {
  dosageForms: JSON.parse(await readFile(new URL('../config/dosageForms.json', import.meta.url))),
  frequencies: JSON.parse(await readFile(new URL('../config/frequencies.json', import.meta.url))),
  additionalDirections: JSON.parse(await readFile(new URL('../config/additionalDirections.json', import.meta.url)))
};

function med(overrides) {
  return {
    id: crypto.randomUUID(),
    drugName: 'Drug',
    dosageFormRoute: 'tablet',
    frequency: 'daily',
    prn: false,
    additionalInstructions: '',
    notes: '',
    validated: true,
    ...overrides
  };
}

test('PRN increases Section B in both engines', () => {
  const base = mrciClassic([med({ prn: false })], mappings).total;
  const prn = mrciClassic([med({ prn: true })], mappings).total;
  assert.ok(prn > base);

  const aBase = aMrci([med({ prn: false })], mappings).total;
  const aPrn = aMrci([med({ prn: true })], mappings).total;
  assert.ok(aPrn > aBase);
});

test('alternating dose adds complexity', () => {
  const standard = mrciClassic([med({ frequency: 'daily' })], mappings).total;
  const alt = mrciClassic([med({ frequency: 'daily', additionalInstructions: 'alternate days' })], mappings).total;
  assert.ok(alt > standard);
});

test('food instructions impact section C', () => {
  const noFood = mrciClassic([med({ additionalInstructions: '' })], mappings).subtotalC;
  const withFood = mrciClassic([med({ additionalInstructions: 'take with food' })], mappings).subtotalC;
  assert.ok(withFood > noFood);
});

test('inhalers score above simple tablets in section A', () => {
  const tab = mrciClassic([med({ dosageFormRoute: 'tablet' })], mappings).subtotalA;
  const inh = mrciClassic([med({ dosageFormRoute: 'inhaler' })], mappings).subtotalA;
  assert.ok(inh > tab);
});

test('injectables captured in both engines', () => {
  const classic = mrciClassic([med({ dosageFormRoute: 'injection' })], mappings).subtotalA;
  const abr = aMrci([med({ dosageFormRoute: 'injection' })], mappings).subtotalA;
  assert.ok(classic >= 3);
  assert.ok(abr >= 2);
});

test('multiple daily frequencies increase score', () => {
  const once = mrciClassic([med({ frequency: 'daily' })], mappings).subtotalB;
  const q4h = mrciClassic([med({ frequency: 'q4h' })], mappings).subtotalB;
  assert.ok(q4h > once);
});

test('missing/ambiguous instructions fallback to unknown safely', () => {
  const result = mrciClassic([
    med({ dosageFormRoute: '???', frequency: 'sometimes', additionalInstructions: 'unclear' })
  ], mappings);
  assert.ok(result.total > 0);
});
