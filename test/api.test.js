const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { abrirBanco } = require('../src/db');
const { criarApp } = require('../src/app');

let servidor;
let base;

// Cada rodada de testes usa um banco novo, só na memória.
before(async () => {
  const app = criarApp(abrirBanco(':memory:'));
  await new Promise((pronto) => (servidor = app.listen(0, pronto)));
  base = `http://localhost:${servidor.address().port}`;
});
after(() => servidor.close());

const postar = (caminho, corpo) =>
  fetch(base + caminho, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });

test('cria um gasto e ele aparece na lista do mês', async () => {
  const resposta = await postar('/api/lancamentos', {
    tipo: 'saida', descricao: 'Mercado', valor: '150,00', categoria_id: 4, data: '2026-11-10',
  });
  assert.equal(resposta.status, 201);

  const lista = await (await fetch(`${base}/api/lancamentos?mes=2026-11`)).json();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].valor_centavos, 15000);
  assert.equal(lista[0].categoria, 'Mercado');
});

test('recusa lançamento inválido com mensagens claras', async () => {
  const resposta = await postar('/api/lancamentos', { tipo: 'saida', descricao: '', valor: '0', categoria_id: 999, data: 'ontem' });
  assert.equal(resposta.status, 400);
  const { erros } = await resposta.json();
  assert.equal(erros.length, 4);
});

test('resumo calcula saldo e a regra 50/30/20', async () => {
  await postar('/api/lancamentos', { tipo: 'entrada', descricao: 'Salário', valor: '2000', categoria_id: 1, data: '2026-11-05' });
  const resumo = await (await fetch(`${base}/api/resumo?mes=2026-11`)).json();

  assert.equal(resumo.entradas, 200000);
  assert.equal(resumo.saidas, 15000);
  assert.equal(resumo.saldo, 185000);
  assert.equal(resumo.regra.necessidade.ideal, 100000);
  assert.equal(resumo.regra.necessidade.percentual, 7.5);
});

test('metas: guardar e não deixar ficar negativo', async () => {
  const meta = await (await postar('/api/metas', { nome: 'Reserva', alvo: '1000' })).json();
  const depois = await (await postar(`/api/metas/${meta.id}/movimentos`, { valor: '250' })).json();
  assert.equal(depois.guardado_centavos, 25000);

  const tirarDemais = await postar(`/api/metas/${meta.id}/movimentos`, { valor: '-300' });
  assert.equal(tirarDemais.status, 400);
});

test('exporta o mês em CSV', async () => {
  const resposta = await fetch(`${base}/api/exportar?mes=2026-11`);
  const texto = await resposta.text();
  assert.match(resposta.headers.get('content-type'), /text\/csv/);
  assert.match(texto, /Mercado/);
  assert.match(texto, /-150,00/);
});
