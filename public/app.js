// ---------- Utilidades ----------

const reais = (centavos) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const hojeISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const nomeDoMes = (mes) => {
  const [ano, m] = mes.split('-').map(Number);
  const texto = new Date(ano, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

const somarMeses = (mes, n) => {
  const [ano, m] = mes.split('-').map(Number);
  const d = new Date(ano, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const dataCurta = (iso) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

async function api(caminho, opcoes = {}) {
  const resposta = await fetch(caminho, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
  });
  if (resposta.status === 204) return null;
  const corpo = await resposta.json();
  if (!resposta.ok) throw new Error((corpo.erros || ['algo deu errado']).join(' · '));
  return corpo;
}

// ---------- Estado ----------

const estado = {
  mes: hojeISO().slice(0, 7),
  categorias: [],
};

const $ = (id) => document.getElementById(id);
const form = $('form-lancamento');

// ---------- Categorias no formulário ----------

function preencherCategorias() {
  const tipo = form.tipo.value;
  const opcoes = estado.categorias.filter((c) =>
    tipo === 'entrada' ? c.grupo === 'entrada' : c.grupo !== 'entrada'
  );
  form.categoria_id.innerHTML = opcoes
    .map((c) => `<option value="${c.id}">${c.nome}</option>`)
    .join('');
}

// ---------- Desenhar a tela ----------

function desenharLista(lancamentos) {
  const lista = $('lista');
  if (!lancamentos.length) {
    lista.innerHTML = '<li class="vazio">Nenhum lançamento neste mês ainda.</li>';
    return;
  }
  lista.innerHTML = lancamentos
    .map(
      (l) => `
      <li>
        <span class="faixa" style="background:${l.cor}"></span>
        <div>
          <div class="desc"></div>
          <div class="meta-info">${dataCurta(l.data)} · ${l.categoria}</div>
        </div>
        <span class="quanto ${l.tipo === 'entrada' ? 'positivo' : 'negativo'}">
          ${l.tipo === 'entrada' ? '+' : '−'} ${reais(l.valor_centavos)}
        </span>
        <button class="apagar" data-id="${l.id}" aria-label="Apagar lançamento">✕</button>
      </li>`
    )
    .join('');
  // A descrição entra como texto puro: assim ninguém injeta HTML pelo formulário.
  lista.querySelectorAll('.desc').forEach((el, i) => (el.textContent = lancamentos[i].descricao));
}

function desenharCartoes(resumo) {
  $('total-entradas').textContent = reais(resumo.entradas);
  $('total-saidas').textContent = reais(resumo.saidas);
  $('total-saldo').textContent = reais(resumo.saldo);
}

// Gráfico de rosca feito só com SVG: cada categoria é um círculo com um "traço" do tamanho da sua fatia.
function desenharRosca(resumo) {
  const svg = $('rosca');
  const legenda = $('legenda');
  const total = resumo.saidas;
  const RAIO = 70;
  const VOLTA = 2 * Math.PI * RAIO;

  if (!total) {
    svg.innerHTML = `<circle cx="100" cy="100" r="${RAIO}" fill="none" stroke="#f1e4d4" stroke-width="26"/>
      <text x="100" y="106" text-anchor="middle" class="rosca-texto">sem gastos</text>`;
    legenda.innerHTML = '<li class="vazio">Lance um gasto para ver o gráfico.</li>';
    return;
  }

  let andado = 0;
  const fatias = resumo.categorias.map((c) => {
    const tamanho = (c.total / total) * VOLTA;
    const circulo = `<circle cx="100" cy="100" r="${RAIO}" fill="none" stroke="${c.cor}" stroke-width="26"
      stroke-dasharray="${tamanho} ${VOLTA - tamanho}" stroke-dashoffset="${-andado}"
      transform="rotate(-90 100 100)"><title>${c.nome}</title></circle>`;
    andado += tamanho;
    return circulo;
  });

  svg.innerHTML = fatias.join('') + `
    <text x="100" y="96" text-anchor="middle" class="rosca-rotulo">saiu</text>
    <text x="100" y="120" text-anchor="middle" class="rosca-valor">${reais(total)}</text>`;

  legenda.innerHTML = resumo.categorias
    .map((c) => `
      <li>
        <span class="bolinha" style="background:${c.cor}"></span>
        <span>${c.nome} <small>${Math.round((c.total / total) * 100)}%</small></span>
        <span class="quanto">${reais(c.total)}</span>
      </li>`)
    .join('');
}

function desenharRegra(resumo) {
  const grupos = [
    { chave: 'necessidade', nome: 'Necessidades', limite: 50, cor: 'var(--vinho)', bom: (p) => p <= 50 },
    { chave: 'desejo', nome: 'Desejos', limite: 30, cor: 'var(--vermelho)', bom: (p) => p <= 30 },
    { chave: 'poupanca', nome: 'Guardado', limite: 20, cor: 'var(--verde)', bom: (p) => p >= 20 },
  ];

  if (!resumo.entradas) {
    $('regra').innerHTML = '<p class="vazio">Lance a sua renda do mês (uma entrada) para comparar com a regra.</p>';
    return;
  }

  $('regra').innerHTML = grupos
    .map((g) => {
      const { gasto, ideal, percentual } = resumo.regra[g.chave];
      const dentro = g.bom(percentual);
      const frase = g.chave === 'poupanca'
        ? (dentro ? 'Meta de guardar batida' : `Falta ${reais(Math.max(ideal - gasto, 0))} para os 20%`)
        : (dentro ? `Ainda cabe ${reais(ideal - gasto)}` : `Passou ${reais(gasto - ideal)} do limite`);
      return `
        <div class="regra-item">
          <div class="regra-cabeca">
            <span>${g.nome}</span>
            <span class="regra-pct">${percentual.toLocaleString('pt-BR')}%</span>
          </div>
          <div class="barra">
            <div class="barra-cheia" style="width:${Math.min(percentual, 100)}%; background:${g.cor}"></div>
            <span class="barra-limite" style="left:${g.limite}%"></span>
          </div>
          <div class="regra-texto">${reais(gasto)} de ${reais(ideal)} (${g.limite}%) ·
            <strong class="${dentro ? 'ok' : 'alerta'}">${frase}</strong></div>
        </div>`;
    })
    .join('');
}

async function carregarMes() {
  $('mes-nome').textContent = nomeDoMes(estado.mes);
  $('exportar').href = `/api/exportar?mes=${estado.mes}`;
  const [lancamentos, resumo] = await Promise.all([
    api(`/api/lancamentos?mes=${estado.mes}`),
    api(`/api/resumo?mes=${estado.mes}`),
  ]);
  desenharLista(lancamentos);
  desenharCartoes(resumo);
  desenharRosca(resumo);
  desenharRegra(resumo);
}

// ---------- Eventos ----------

form.addEventListener('change', (e) => {
  if (e.target.name === 'tipo') preencherCategorias();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  $('form-erro').textContent = '';
  const dados = Object.fromEntries(new FormData(form));
  try {
    await api('/api/lancamentos', { method: 'POST', body: JSON.stringify(dados) });
    form.descricao.value = '';
    form.valor.value = '';
    form.descricao.focus();
    estado.mes = dados.data.slice(0, 7);
    await carregarMes();
  } catch (erro) {
    $('form-erro').textContent = erro.message;
  }
});

$('lista').addEventListener('click', async (e) => {
  const botao = e.target.closest('.apagar');
  if (!botao) return;
  await api(`/api/lancamentos/${botao.dataset.id}`, { method: 'DELETE' });
  await carregarMes();
});

$('mes-anterior').addEventListener('click', () => {
  estado.mes = somarMeses(estado.mes, -1);
  carregarMes();
});
$('mes-seguinte').addEventListener('click', () => {
  estado.mes = somarMeses(estado.mes, 1);
  carregarMes();
});

// ---------- Metas ----------

async function carregarMetas() {
  const metas = await api('/api/metas');
  const caixa = $('metas');
  if (!metas.length) {
    caixa.innerHTML = '<p class="vazio">Nenhuma meta ainda. Que tal começar pela reserva de emergência?</p>';
    return;
  }
  caixa.innerHTML = metas
    .map((m) => {
      const pct = Math.min(Math.round((m.guardado_centavos / m.alvo_centavos) * 100), 100);
      return `
        <article class="meta" data-id="${m.id}">
          <div class="meta-cabeca">
            <strong class="meta-nome"></strong>
            <button class="apagar" data-acao="apagar-meta" aria-label="Apagar meta">✕</button>
          </div>
          <div class="meta-numeros">
            <span class="regra-pct">${pct}%</span>
            <span>${reais(m.guardado_centavos)} de ${reais(m.alvo_centavos)}</span>
          </div>
          <div class="barra"><div class="barra-cheia" style="width:${pct}%; background:var(--ambar)"></div></div>
          <form class="meta-guardar">
            <input name="valor" inputmode="decimal" placeholder="R$ (use - para tirar)" required>
            <button class="botao secundario" type="submit">Guardar</button>
          </form>
        </article>`;
    })
    .join('');
  caixa.querySelectorAll('.meta-nome').forEach((el, i) => (el.textContent = metas[i].nome));
}

$('form-meta').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('meta-erro').textContent = '';
  const f = e.target;
  try {
    await api('/api/metas', { method: 'POST', body: JSON.stringify({ nome: f.nome.value, alvo: f.alvo.value }) });
    f.reset();
    await carregarMetas();
  } catch (erro) {
    $('meta-erro').textContent = erro.message;
  }
});

$('metas').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = e.target.closest('.meta').dataset.id;
  try {
    await api(`/api/metas/${id}/movimentos`, { method: 'POST', body: JSON.stringify({ valor: e.target.valor.value }) });
    await carregarMetas();
  } catch (erro) {
    $('meta-erro').textContent = erro.message;
  }
});

$('metas').addEventListener('click', async (e) => {
  if (e.target.dataset.acao !== 'apagar-meta') return;
  const id = e.target.closest('.meta').dataset.id;
  if (!confirm('Apagar esta meta?')) return;
  await api(`/api/metas/${id}`, { method: 'DELETE' });
  await carregarMetas();
});

// ---------- Começo ----------

(async function iniciar() {
  estado.categorias = await api('/api/categorias');
  form.data.value = hojeISO();
  preencherCategorias();
  await Promise.all([carregarMes(), carregarMetas()]);
})();
