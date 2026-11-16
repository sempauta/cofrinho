// Enche o banco com um mês de exemplo, para ver o Cofrinho funcionando na hora.
// Uso: npm run exemplo
const { abrirBanco } = require('./db');

const db = abrirBanco();
const hoje = new Date();
const mes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
const id = (nome) => db.prepare('SELECT id FROM categorias WHERE nome = ?').get(nome).id;

const exemplos = [
  ['entrada', 'Salário', 320000, 'Salário', '05'],
  ['entrada', 'Freela de design', 45000, 'Renda extra', '12'],
  ['saida', 'Aluguel', 120000, 'Moradia', '05'],
  ['saida', 'Mercado do mês', 52340, 'Mercado', '06'],
  ['saida', 'Luz, água e internet', 23840, 'Contas da casa', '10'],
  ['saida', 'Bilhete único', 18000, 'Transporte', '03'],
  ['saida', 'Farmácia', 6790, 'Saúde', '09'],
  ['saida', 'Cinema com os amigos', 5800, 'Lazer', '08'],
  ['saida', 'Pizza de sexta', 6490, 'Delivery', '07'],
  ['saida', 'Tênis', 24990, 'Compras', '11'],
  ['saida', 'Streaming', 4490, 'Assinaturas', '02'],
  ['saida', 'Tesouro Selic', 50000, 'Reserva e investimento', '06'],
];

const inserir = db.prepare(
  'INSERT INTO lancamentos (tipo, descricao, valor_centavos, categoria_id, data) VALUES (?, ?, ?, ?, ?)'
);
for (const [tipo, descricao, centavos, categoria, dia] of exemplos) {
  inserir.run(tipo, descricao, centavos, id(categoria), `${mes}-${dia}`);
}

if (db.prepare('SELECT COUNT(*) AS n FROM metas').get().n === 0) {
  db.prepare('INSERT INTO metas (nome, alvo_centavos, guardado_centavos) VALUES (?, ?, ?)').run('Reserva de emergência', 600000, 185000);
  db.prepare('INSERT INTO metas (nome, alvo_centavos, guardado_centavos) VALUES (?, ?, ?)').run('Viagem de férias', 350000, 92000);
}

console.log(`Pronto: ${exemplos.length} lançamentos de exemplo em ${mes}.`);
