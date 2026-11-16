const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

// Categorias que já vêm prontas. O "grupo" é o que liga cada gasto à regra 50/30/20.
const CATEGORIAS_PADRAO = [
  ['Salário', 'entrada', '#2f9e44'],
  ['Renda extra', 'entrada', '#66a80f'],
  ['Moradia', 'necessidade', '#7a1c14'],
  ['Mercado', 'necessidade', '#ce3a2a'],
  ['Contas da casa', 'necessidade', '#e8590c'],
  ['Transporte', 'necessidade', '#f08c00'],
  ['Saúde', 'necessidade', '#c2255c'],
  ['Lazer', 'desejo', '#7048e8'],
  ['Delivery', 'desejo', '#ae3ec9'],
  ['Compras', 'desejo', '#4263eb'],
  ['Assinaturas', 'desejo', '#1c7ed6'],
  ['Reserva e investimento', 'poupanca', '#0ca678'],
];

function abrirBanco(caminho = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'cofrinho.db')) {
  if (caminho !== ':memory:') {
    fs.mkdirSync(path.dirname(caminho), { recursive: true });
  }
  const db = new DatabaseSync(caminho);
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS categorias (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      nome  TEXT NOT NULL UNIQUE,
      grupo TEXT NOT NULL CHECK (grupo IN ('entrada', 'necessidade', 'desejo', 'poupanca')),
      cor   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lancamentos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo           TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
      descricao      TEXT NOT NULL,
      valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
      categoria_id   INTEGER NOT NULL REFERENCES categorias(id),
      data           TEXT NOT NULL,
      criado_em      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_lancamentos_data ON lancamentos(data);

    CREATE TABLE IF NOT EXISTS metas (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      nome              TEXT NOT NULL,
      alvo_centavos     INTEGER NOT NULL CHECK (alvo_centavos > 0),
      guardado_centavos INTEGER NOT NULL DEFAULT 0 CHECK (guardado_centavos >= 0),
      criado_em         TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const total = db.prepare('SELECT COUNT(*) AS n FROM categorias').get().n;
  if (total === 0) {
    const inserir = db.prepare('INSERT INTO categorias (nome, grupo, cor) VALUES (?, ?, ?)');
    for (const [nome, grupo, cor] of CATEGORIAS_PADRAO) inserir.run(nome, grupo, cor);
  }

  return db;
}

module.exports = { abrirBanco };
