# Fechamento mensal e compensação de prejuízos
Data: 18/11/2026. Base: a903d4b8c8a02ef5f1b16697c12e3cf73fde8394.

## Regra aprovada e comportamento
O lucro líquido continua sendo calculado pelos registros existentes: vendas e frete recebido, menos custo histórico comprovado, taxas, frete pago e despesas operacionais. Nenhuma precificação atual é aplicada retroativamente.

O resultado positivo primeiro absorve o prejuízo acumulado. Uma perda mensal aumenta o saldo a compensar. Entre dezembro/2026 e maio/2027, metade do excedente positivo, em centavos inteiros, forma o fundo dos sócios. O rateio mantém 60% / 25% / 15%, com o mesmo critério de maiores restos para distribuir centavos; o meio centavo do fundo permanece na empresa. Fora dessa janela, o fechamento continua funcionando e não cria repasses. Perdas não são apagadas ao terminar o plano.

Exemplo exclusivamente didático, não cadastrado: prejuízo anterior de R$ 100,00 e lucro de R$ 150,00 deixam R$ 50,00 disponíveis. O fundo é R$ 25,00; o resultado retido é R$ 125,00, incluindo a recuperação do prejuízo. Resultado retido não equivale a saldo bancário.

## Implementação
- Aba Fechamento com base da apuração, prejuízo anterior, absorção, saldo futuro, excedente e fundo dos sócios.
- Base confirmada uma única vez pelo administrador: primeira competência, prejuízo anterior e referência de conferência. Nenhum desses valores foi preenchido automaticamente em produção.
- Meses fechados em sequência desde o início confirmado, inclusive competências sem movimento. Prévia de meses posteriores depende do fechamento dos anteriores.
- Fechamento bloqueado durante o mês, com custo ausente, sem conferência, com sequência incompleta ou sem administrador com MFA.
- Escritas posteriores ao fechamento continuam bloqueadas pelas rotinas existentes. Um novo controle impede movimentos anteriores ao início confirmado.
- Proteção adicional sobre o fechamento legado: ele não consegue ignorar prejuízo acumulado ou pular competências. Sua definição permanece intacta.
- Conta de consulta recebe a mesma apuração, sem formulário nem ações de fechamento.
- Nenhuma ação executa Pix, altera estoque ou registra receitas, despesas e cadastros pessoais por iniciativa própria.
- A tela inicia na competência atual, descarta respostas antigas de carregamento e pede nova conferência após atualizar registros.

SQL aditivo: `docs/sql/financeiro-fechamento-prejuizos.review.sql`. Duas tabelas com RLS, seis funções novas (três RPCs públicas autenticadas e três auxiliares sem execução direta) e três gatilhos. Não há migração nem alterações em `lib/`, `supabase/` ou `app/api/`. A fórmula original do lucro, as RPCs antigas, a autenticação e a paleta foram preservadas.

Bibliotecas adicionadas à aplicação: nenhuma. Ferramentas de navegador e PostgreSQL usadas somente no sandbox temporário em nuvem não integram o projeto.

## Validação executada
- 55 testes da aplicação: passaram.
- 14 testes PostgreSQL existentes: passaram, em banco descartável independente.
- 15 testes PostgreSQL novos: passaram. Cobrem perdas sucessivas, recuperação parcial e exata, lucro excedente, janela de seis meses, centavos, custos pendentes, privacidade/MFA, acesso anônimo, predicado de autorização nulo, fechamento duplicado e lançamento concorrente ao fechamento.
- Job `finance-losses` incorporado ao CI; usa PostgreSQL descartável e porta local fixa 55439. O executor recusa banco com tabelas existentes e não apaga bancos.
- Build e lint passaram; quatro avisos preexistentes de imagens nas páginas públicas.
- Integração SQL na homologação com papel autenticado e identidade administrativa: perda em outubro, transporte para novembro e bloqueio de mês fechado, tudo em transação com rollback. As tabelas financeiras permaneceram sem registros de teste.
- 20 verificações de navegador do componente real em harness sintético isolado: estados sem base, aberto, sequência pendente, fechado e somente consulta, nos tamanhos 1440, 768, 390 e 320px. Sem overflow ou erros de JavaScript; ações de consulta ausentes e confirmação obrigatória para fechar.
- O harness não substitui um teste completo de login/MFA real e não foi publicado.
- Não houve nova medição Lighthouse nesta etapa; números de relatórios anteriores não são apresentados como medição desta versão.

## Preservação e backup
Backup privado em nuvem verificado antes da aplicação em produção:
- Run: `2026-11-18T18-23-21.658Z-c4a3050e-fa91-4de3-a01e-b5eba0fe7df3`.
- 63 tabelas e 66 imagens; 3187104 bytes.
- SHA-256: `1118e77f6382a79af90741e99de2b8dc88ec07905086231c31244a0e57a2ea08`.
- Leitura privada de retorno verificada e arquivo reconhecido por `pg_restore --list`. Ainda não equivale a uma restauração integral ensaiada.
- Nenhuma escrita no banco de origem durante o backup.

Após SQL em produção, as definições das 54 funções existentes permaneceram idênticas. Hashes dos registros de produtos, contas e sócios permaneceram iguais. Mantidos 65 produtos e três contas; zero vendas financeiras, movimentos, fechamentos e pagamentos foram criados pelo deploy. As tabelas novas estão vazias, aguardando conferência real da gestão.

## Como validar sem gravar em produção
Use o projeto isolado `cgcaykrtfxlkrbopycyn` e a prévia da homologação. Nunca use a prévia automática do projeto oficial para testes de escrita: ela pode apontar para o banco oficial.

Em um sandbox descartável em nuvem, com PostgreSQL vazio chamado `finance_fixture` acessível em 127.0.0.1:55439, execute `FINANCE_FIXTURE_PORT=55439 npm run test:finance-losses`. A fixture contém identificadores sintéticos e relógio de teste; esse relógio não está no SQL implantado. O banco de produção não tem possibilidade de escolher uma data fictícia para fechar meses futuros.

No navegador, confira Financeiro → Fechamento e Sócios, assim como a mesma consulta na conta somente leitura. Confirmar a base ou fechar um mês é uma gravação: essas ações de ensaio devem ocorrer exclusivamente na homologação.

## Pendências para consolidação operacional completa
1. A gestão conferir os três saldos iniciais, definir início e prejuízo anterior com comprovantes, e preencher os cadastros privados dos sócios. Não há fundamento para inventar esses dados.
2. Completar a ativação dos acessos de consulta e testar os acessos pessoais pelos próprios titulares.
3. Implementar fluxo específico de estornos, devoluções e correções, com vínculo ao registro original, evidência, efeitos distintos em caixa e lucro e trilha de auditoria. Esta etapa não oferece edição ou exclusão de registros financeiros.
4. Ampliar conciliação por conta, categorias e relatórios/exportações; ensaiar restauração integral do backup.
5. Realizar o primeiro fechamento real somente após encerramento do mês, conferência dos dados e regularização das pendências aplicáveis.

Os avisos preexistentes do consultor Supabase sobre funções antigas executáveis por anônimos e proteção contra senhas vazadas permanecem como revisão de segurança separada. As funções novas não concedem execução a anônimos, usam caminho de busca vazio e verificam o papel/MFA no servidor. O módulo não é apresentado como 100% consolidado enquanto as pendências acima não forem concluídas.
