# Enquadramento e temas da gestão — 19/11/2026

A navegação lateral continua somente com ícones e nomes acessíveis por aria-label e title. A mudança trata do layout compartilhado do sistema de gestão, mantendo a identidade vinho e o funcionamento existente.

## Alterações

- Área útil central com limite de 1680 px, margens responsivas e espaçamentos internos padronizados.
- Quadros, títulos, formulários, indicadores, avisos e drawers usam a mesma estrutura visual.
- Joias: busca, situação, ordenação e alternância Tabela/Grade ficam agrupadas dentro do quadro. Seleção, densidade e configuração de colunas conservam as ações existentes e ganham preenchimento interno.
- Ações fixas na lateral da tabela em desktop; dados largos rolam dentro da tabela. A página inteira não precisa rolar horizontalmente.
- Miniaturas de joias de 72 px na listagem; identidade, nomes longos e valores conservam espaço próprio.
- Claro/Escuro no menu do perfil, com botões acessíveis e estado anunciado. As páginas antigas usam variáveis semânticas com os valores anteriores como fallback do tema claro.
- Campos têm bordas distinguíveis e trocam texto/fundo juntos, evitando um estado intermediário ilegível.
- A aparência também alcança os componentes de consulta, pois usa o mesmo shell. As permissões e a troca de conta não foram alteradas.

## Armazenamento e segurança

A escolha do tema fica apenas em memória durante a navegação. Nenhuma preferência nova é gravada em localStorage, sessionStorage, cookies ou banco. Ao recarregar completamente, o sistema segue a preferência de cor do dispositivo. Preferências preexistentes de Joias permanecem como estavam.

Todo o trabalho de código, instalação e verificação ocorreu em ambiente temporário na nuvem e no GitHub. Não houve clone, download de código, arquivos de clientes ou credenciais na máquina do usuário.

Sem alterações em lib/, supabase/ ou app/api/. Sem migrações, alterações de RPCs, fórmulas, validações, fluxos de gravação ou registros de negócio. A loja pública não recebeu regras de tema da gestão.

## Verificação

- 55 testes existentes de regressão aprovados, incluindo cálculos de estoque, precificação e rateio.
- TypeScript e build de produção concluídos.
- Lint: zero erros; quatro avisos anteriores de imagens, fora deste escopo.
- 66 combinações no Chromium: 11 páginas × 375/768/1440 px × Claro/Escuro. Nenhum transbordamento horizontal da página ou erro de JavaScript.
- 198 verificações amostrais de contraste: texto principal e secundário com mínimo 4,5:1; borda do campo contra seu fundo com mínimo 3:1.
- Interações verificadas em Joias: Tabela/Grade, ocultar/restaurar coluna, busca sem resultados, limpar filtros, abrir e fechar drawer. Tema verificado pelo menu em todas as combinações.

Páginas: visão geral, joias, coleções, estoque, precificação, catálogo, integrações, financeiro, cadastro financeiro, frete e campanhas.

Os testes de navegador montam os componentes reais com consultas simuladas e bloqueio de gravações, sem sessão ou dados de produção. Isso não substitui uma revisão com login/MFA real e todas as combinações possíveis de dados. Os indicadores de contraste são amostrais, não uma certificação integral de WCAG.

Não foi realizada uma nova auditoria Lighthouse das páginas internas autenticadas. Não há pontuações ou promessa de superar 90: o login/MFA real não está disponível na automação, e a montagem visual isolada não representa esse fluxo. Essa medição continua pendente.

## Reproduzir na nuvem

Sem dependências novas na aplicação. Playwright e esbuild são usados apenas no ambiente de QA, em uma pasta externa ao repositório:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run lint
npx tsc --noEmit
npm run build
npm install --prefix /tmp/elegancia-qa --ignore-scripts --no-audit --no-fund playwright esbuild
/tmp/elegancia-qa/node_modules/.bin/playwright install --with-deps chromium
NODE_PATH=/tmp/elegancia-qa/node_modules node scripts/verify-management-appearance.cjs
```

O script produz relatório JSON e capturas no diretório temporário da nuvem. Não execute na máquina do usuário se a restrição de armazenamento local continuar valendo.

## Validar sem gravar em produção

Na homologação, entrar com uma conta autorizada, abrir o perfil e testar Aparência → Claro/Escuro. Navegar pelas páginas, redimensionar a janela e usar busca, filtros, densidade, colunas e o drawer de cadastro. Fechar o drawer sem salvar. Não enviar formulários, excluir peças, publicar catálogo, lançar vendas ou fechar competências durante uma revisão visual.

A homologação usa o projeto Supabase cgcaykrtfxlkrbopycyn; ela não deve ser reconectada ao banco oficial para esses testes.

Evidência resumida: [quality/appearance-layout.json](quality/appearance-layout.json).
