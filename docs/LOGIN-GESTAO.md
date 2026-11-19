# Entrada editorial da gestão — 19/11/2026

A tela de acesso passa a usar uma composição editorial da Elegância Pratas: colar prateado sobre tecido vinho, marca em destaque e formulário com alinhamento e proporções próprios para cada tamanho de tela. A imagem já existia na loja em public/images/category-colares.png; nenhum produto, imagem de catálogo ou registro foi criado ou substituído.

A composição cobre login, carregamento, recuperação de senha e verificação em duas etapas, inclusive a apresentação do QR de configuração. O formulário mantém os handlers, valores controlados, autocomplete, campos obrigatórios, padrão do código e fluxo de gravação anteriores. A exibição/ocultação da senha é acessível por teclado. Os temas claro e escuro continuam usando o mecanismo da gestão.

## Implementação e limites

- Novo componente visual app/admin/ui/access-panel.tsx, com CSS restrito à entrada administrativa.
- Fotografia reutilizada por next/image com tamanhos responsivos e carregamento prioritário; dimensões do espaço reservadas.
- WorkspaceTools e AccountMenu carregam sob demanda após o login. O código dos handlers de autenticação e o JSX da gestão autenticada foram comparados com a base e permanecem idênticos.
- Ícone E✦ do navegador incluído, com fonte SVG editável e ICO de 1008 bytes. É o único ajuste compartilhado de identidade no navegador; o conteúdo e o funcionamento da loja pública não mudaram.
- Nenhuma alteração em lib/, supabase/, app/api/, dados, fórmulas, RPCs, sessões, política de inatividade ou validações. Sem migrações.
- Nenhuma biblioteca nova na aplicação. Ferramentas de QA ficaram fora do repositório, em ambiente temporário na nuvem.
- Não houve envio de e-mails reais, uso de senha/MFA real ou gravação em produção nos testes.

## Validação

- 55 testes existentes de regressão aprovados.
- TypeScript e build de produção concluídos.
- Lint sem erros; quatro avisos anteriores de imagens permanecem.
- 48 cenários no Chromium: seis larguras (360, 390, 768, 1024, 1440, 1920 px), dois temas e quatro apresentações (login, recuperação, MFA já configurado e configuração com QR).
- Nenhum erro de JavaScript ou transbordamento horizontal nos cenários; imagem editorial carregada em todos.
- Interações: mostrar/ocultar senha pelo teclado e mouse, falha de login simulada, recuperação simulada, retorno ao login e erro de código MFA simulado.
- Todas as chamadas ao Supabase foram interceptadas no QA; tokens e usuários são exclusivamente fixtures locais ao ambiente temporário. Isso testa a integração visual do cliente, sem comprovar uma autenticação real no servidor.

## Lighthouse

Medição final isolada em build de produção servida na nuvem, rota /admin/acesso, Lighthouse 13.6.0, perfil móvel, sem outros testes de CPU concorrentes:

| Categoria | Pontuação |
| --- | ---: |
| Desempenho | 93 |
| Acessibilidade | 100 |
| Boas práticas | 100 |

LCP: 2.02 s. TBT: 296 ms. CLS: 0. Sem falhas nas auditorias binárias verificadas.

Os valores são medições de laboratório, não garantia para todas as redes e dispositivos. A tela ainda hidrata o cliente de autenticação e componentes compartilhados da aplicação; o tempo de bloqueio não é zero. Não foi executado Lighthouse em áreas internas com credenciais reais/MFA.

## Reproduzir apenas na nuvem

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run lint
npx tsc --noEmit
npm run build
npm install --prefix /tmp/elegancia-login-qa --ignore-scripts --no-audit --no-fund playwright lighthouse
/tmp/elegancia-login-qa/node_modules/.bin/playwright install --with-deps chromium
# Iniciar a build de produção em localhost, com apenas as variáveis públicas da homologação.
npm run start
# Em outro terminal do mesmo ambiente:
NODE_PATH=/tmp/elegancia-login-qa/node_modules node scripts/verify-management-login.cjs
```

O script aceita apenas localhost/127.0.0.1, intercepta chamadas ao Supabase e grava evidências em uma pasta temporária da nuvem. Não aponte um teste automatizado para produção nem use credenciais reais.

Na prévia, conferir a tela, alternar a visibilidade da senha, abrir e fechar a recuperação e redimensionar a janela. Esses passos não exigem enviar formulários. A prévia deve continuar ligada ao banco separado da homologação.

Evidência: [quality/login-editorial.json](quality/login-editorial.json).
