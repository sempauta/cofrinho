const { abrirBanco } = require('./db');
const { criarApp } = require('./app');

const PORTA = process.env.PORT || 3000;
const app = criarApp(abrirBanco());

app.listen(PORTA, () => {
  console.log(`Cofrinho rodando em http://localhost:${PORTA}`);
});
