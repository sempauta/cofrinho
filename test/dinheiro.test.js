const { test } = require('node:test');
const assert = require('node:assert/strict');
const { paraCentavos } = require('../src/dinheiro');

test('entende valores no jeito brasileiro', () => {
  assert.equal(paraCentavos('87,50'), 8750);
  assert.equal(paraCentavos('1.234,56'), 123456);
  assert.equal(paraCentavos('R$ 10'), 1000);
});

test('entende ponto como decimal e números', () => {
  assert.equal(paraCentavos('19.90'), 1990);
  assert.equal(paraCentavos(0.1 + 0.2), 30);
});

test('recusa o que não é dinheiro', () => {
  assert.ok(Number.isNaN(paraCentavos('abc')));
  assert.ok(Number.isNaN(paraCentavos('-5')));
  assert.ok(Number.isNaN(paraCentavos(undefined)));
});
