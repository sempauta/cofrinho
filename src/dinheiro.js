// Dinheiro é guardado em centavos (número inteiro) para nunca ter erro de arredondamento.
// 0.1 + 0.2 = 0.30000000000000004 em JavaScript; 10 + 20 = 30 centavos, sempre.

function paraCentavos(valor) {
  if (typeof valor === 'number') return Math.round(valor * 100);
  if (typeof valor !== 'string') return NaN;
  // Aceita "1.234,56", "1234,56" e "1234.56"
  let texto = valor.trim().replace(/^R\$\s*/, '');
  if (texto.includes(',')) texto = texto.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(texto)) return NaN;
  return Math.round(Number(texto) * 100);
}

function formatarReais(centavos) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

module.exports = { paraCentavos, formatarReais };
