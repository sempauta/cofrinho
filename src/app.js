const express = require('express');
const path = require('node:path');
const { paraCentavos } = require('./dinheiro');

const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

function criarApp(db) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/saude', (req, res) => {
    res.json({ ok: true, app: 'Cofrinho' });
  });

  app.get('/api/categorias', (req, res) => {
    res.json(db.prepare('SELECT * FROM categorias ORDER BY id').all());
  });

  // ---------- Lançamentos ----------

  app.get('/api/lancamentos', (req, res) => {
    const mes = req.query.mes; // formato 2026-11
    const sql = `
      SELECT l.*, c.nome AS categoria, c.cor, c.grupo
      FROM lancamentos l
      JOIN categorias c ON c.id = l.categoria_id
      ${mes ? "WHERE strftime('%Y-%m', l.data) = ?" : ''}
      ORDER BY l.data DESC, l.id DESC`;
    const linhas = mes ? db.prepare(sql).all(mes) : db.prepare(sql).all();
    res.json(linhas);
  });

  app.post('/api/lancamentos', (req, res) => {
    const { tipo, descricao, valor, categoria_id, data } = req.body ?? {};
    const centavos = paraCentavos(valor);
    const erros = [];

    if (!['entrada', 'saida'].includes(tipo)) erros.push('tipo precisa ser "entrada" ou "saida"');
    if (!descricao || !String(descricao).trim()) erros.push('descrição é obrigatória');
    if (!Number.isInteger(centavos) || centavos <= 0) erros.push('valor precisa ser maior que zero');
    if (!DATA_VALIDA.test(data ?? '')) erros.push('data precisa estar no formato AAAA-MM-DD');

    const categoria = db.prepare('SELECT * FROM categorias WHERE id = ?').get(Number(categoria_id));
    if (!categoria) erros.push('categoria não existe');
    else if ((tipo === 'entrada') !== (categoria.grupo === 'entrada')) {
      erros.push('essa categoria não combina com o tipo do lançamento');
    }

    if (erros.length) return res.status(400).json({ erros });

    const resultado = db
      .prepare('INSERT INTO lancamentos (tipo, descricao, valor_centavos, categoria_id, data) VALUES (?, ?, ?, ?, ?)')
      .run(tipo, String(descricao).trim(), centavos, categoria.id, data);

    const novo = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(resultado.lastInsertRowid);
    res.status(201).json(novo);
  });

  app.delete('/api/lancamentos/:id', (req, res) => {
    const resultado = db.prepare('DELETE FROM lancamentos WHERE id = ?').run(Number(req.params.id));
    if (resultado.changes === 0) return res.status(404).json({ erros: ['lançamento não encontrado'] });
    res.status(204).end();
  });

  // ---------- Resumo do mês ----------

  app.get('/api/resumo', (req, res) => {
    const mes = req.query.mes;
    if (!/^\d{4}-\d{2}$/.test(mes ?? '')) {
      return res.status(400).json({ erros: ['informe o mês no formato AAAA-MM'] });
    }

    const porCategoria = db.prepare(`
      SELECT c.id, c.nome, c.cor, c.grupo, SUM(l.valor_centavos) AS total
      FROM lancamentos l
      JOIN categorias c ON c.id = l.categoria_id
      WHERE strftime('%Y-%m', l.data) = ?
      GROUP BY c.id
      ORDER BY total DESC`).all(mes);

    const somaDoGrupo = (grupo) =>
      porCategoria.filter((c) => c.grupo === grupo).reduce((soma, c) => soma + c.total, 0);

    const entradas = somaDoGrupo('entrada');
    const saidas = porCategoria.filter((c) => c.grupo !== 'entrada').reduce((s, c) => s + c.total, 0);

    // Regra 50/30/20: da renda, 50% para necessidades, 30% para desejos, 20% para guardar.
    const IDEAL = { necessidade: 0.5, desejo: 0.3, poupanca: 0.2 };
    const regra = {};
    for (const [grupo, fatia] of Object.entries(IDEAL)) {
      const gasto = somaDoGrupo(grupo);
      regra[grupo] = {
        gasto,
        ideal: Math.round(entradas * fatia),
        percentual: entradas ? Math.round((gasto / entradas) * 1000) / 10 : 0,
      };
    }

    res.json({
      mes,
      entradas,
      saidas,
      saldo: entradas - saidas,
      categorias: porCategoria.filter((c) => c.grupo !== 'entrada'),
      regra,
    });
  });

  // ---------- Metas ----------

  app.get('/api/metas', (req, res) => {
    res.json(db.prepare('SELECT * FROM metas ORDER BY id').all());
  });

  app.post('/api/metas', (req, res) => {
    const { nome, alvo } = req.body ?? {};
    const centavos = paraCentavos(alvo);
    const erros = [];
    if (!nome || !String(nome).trim()) erros.push('dê um nome para a meta');
    if (!Number.isInteger(centavos) || centavos <= 0) erros.push('o valor da meta precisa ser maior que zero');
    if (erros.length) return res.status(400).json({ erros });

    const { lastInsertRowid } = db
      .prepare('INSERT INTO metas (nome, alvo_centavos) VALUES (?, ?)')
      .run(String(nome).trim(), centavos);
    res.status(201).json(db.prepare('SELECT * FROM metas WHERE id = ?').get(lastInsertRowid));
  });

  // Guardar (ou tirar, com valor negativo) dinheiro de uma meta
  app.post('/api/metas/:id/movimentos', (req, res) => {
    const meta = db.prepare('SELECT * FROM metas WHERE id = ?').get(Number(req.params.id));
    if (!meta) return res.status(404).json({ erros: ['meta não encontrada'] });

    const texto = String(req.body?.valor ?? '').trim();
    const negativo = texto.startsWith('-');
    const centavos = paraCentavos(negativo ? texto.slice(1) : texto);
    if (!Number.isInteger(centavos) || centavos <= 0) {
      return res.status(400).json({ erros: ['informe um valor válido'] });
    }

    const novoTotal = meta.guardado_centavos + (negativo ? -centavos : centavos);
    if (novoTotal < 0) return res.status(400).json({ erros: ['não dá para tirar mais do que foi guardado'] });

    db.prepare('UPDATE metas SET guardado_centavos = ? WHERE id = ?').run(novoTotal, meta.id);
    res.json(db.prepare('SELECT * FROM metas WHERE id = ?').get(meta.id));
  });

  app.delete('/api/metas/:id', (req, res) => {
    const { changes } = db.prepare('DELETE FROM metas WHERE id = ?').run(Number(req.params.id));
    if (changes === 0) return res.status(404).json({ erros: ['meta não encontrada'] });
    res.status(204).end();
  });

  // ---------- Exportar planilha (CSV que abre direto no Excel e no Google Sheets) ----------

  app.get('/api/exportar', (req, res) => {
    const mes = req.query.mes;
    if (!/^\d{4}-\d{2}$/.test(mes ?? '')) {
      return res.status(400).json({ erros: ['informe o mês no formato AAAA-MM'] });
    }
    const linhas = db.prepare(`
      SELECT l.data, l.tipo, l.descricao, c.nome AS categoria, l.valor_centavos
      FROM lancamentos l JOIN categorias c ON c.id = l.categoria_id
      WHERE strftime('%Y-%m', l.data) = ?
      ORDER BY l.data, l.id`).all(mes);

    // No Brasil o Excel usa ";" para separar colunas e "," para decimais.
    const celula = (texto) => `"${String(texto).replace(/"/g, '""')}"`;
    const csv = [
      ['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor (R$)'].join(';'),
      ...linhas.map((l) => {
        const [ano, m, d] = l.data.split('-');
        const valor = ((l.tipo === 'saida' ? -1 : 1) * l.valor_centavos / 100).toFixed(2).replace('.', ',');
        return [`${d}/${m}/${ano}`, l.tipo === 'saida' ? 'Gasto' : 'Entrada', celula(l.descricao), celula(l.categoria), valor].join(';');
      }),
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cofrinho-${mes}.csv"`);
    res.send('\uFEFF' + csv); // o BOM faz o Excel entender os acentos
  });

  return app;
}

module.exports = { criarApp };
