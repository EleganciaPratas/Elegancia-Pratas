# Estornos, devoluções e correções financeiras
Data: 18/11/2026. Base: 1ae2ee10b46095266a898ef243c9d7fc144bf73e.

## O que esta etapa entrega
A aba **Estornos e devoluções** registra ajustes vinculados à venda ou movimentação original. Cada ocorrência exige data, motivo, referência de conferência e administrador com MFA. Os registros originais, os fechamentos e os repasses de meses anteriores permanecem preservados.

- Venda: devolução parcial ou total dos valores das peças e do frete recebido; recuperação separada de custo histórico comprovado, taxa e frete pago.
- O dinheiro devolvido gera saída; taxas e frete efetivamente ressarcidos geram entradas nas contas escolhidas. Recuperação do custo das peças não gera entrada fictícia de dinheiro.
- Recuperar custo exige comprovação e retorno aproveitável das peças. Sem custo conhecido, o sistema não o estima; a venda continua bloqueando fechamento até ser conferida pelo fluxo existente.
- Movimentações manuais: estorno parcial ou total, limitado ao valor ainda não estornado. Recuperar uma despesa operacional reduz as despesas na competência do ajuste; estornar aporte ou outra entrada sem efeito no lucro modifica somente o caixa.
- Transferências: reversão integral das duas pernas nas contas originais, sem alterar lucro ou inflar entradas e saídas mensais.
- Lançamentos automáticos de venda/taxa/frete usam o fluxo da venda. Pagamentos de sócios e lançamentos gerados por ajustes não podem ser estornados como movimentos manuais.
- Um ajuste confirmado não pode ser editado ou excluído. A tentativa de regravar custo já conhecido em uma venda ajustada é bloqueada; o custo ainda ausente pode ser comprovado pelo fluxo anterior.
- Cada solicitação tem identificador idempotente. Uma resposta de rede incerta mantém a solicitação e oferece **Conferir operação**, repetindo os mesmos dados e identificador. A competência, as abas e a atualização manual ficam bloqueadas enquanto essa confirmação estiver pendente na tela.
- Histórico paginado, justificativas e efeitos separados em caixa e lucro. Conta somente de consulta vê o histórico e a mesma apuração, sem novas ações de gravação.

O ajuste pertence à data em que foi conferido/ocorreu, em competência aberta, sem reescrever o passado. Ele não envia Pix, não devolve dinheiro por gateway, não altera pedidos do site e não modifica o estoque. A gestão deve conferir esses processos separadamente.

## Integração com resultado e sócios
A fórmula continua sendo receita menos custo, taxas, frete e despesas. Os componentes líquidos passam a considerar os ajustes do mês. Valores negativos em custos ou despesas podem representar recuperação de valores registrados em meses anteriores, e não uma nova entrada de venda.

A compensação de prejuízos e o rateio permanecem: primeiro absorver perdas anteriores; depois reservar 50% do excedente positivo entre dezembro/2026 e maio/2027; dividir o fundo em 60% / 25% / 15%, com o mesmo arredondamento por centavos.

Foram adicionadas duas tabelas com RLS, uma view com `security_invoker=true` e onze funções novas. Cinco RPCs são executáveis por usuários autenticados, com verificações de papel e MFA no servidor; auxiliares não têm execução direta concedida ao cliente. O gatilho de fechamento foi vinculado atomicamente à nova validação para impedir que clientes antigos fechem resultados que ignorem ajustes.

As definições das 60 funções anteriores foram comparadas e preservadas na homologação. Nenhuma migração é criada. Não há alterações em `lib/`, `supabase/` ou `app/api/`, nem mudanças de paleta ou novas bibliotecas na aplicação.

## Validação
- 55 testes da aplicação passaram.
- 22 testes novos de PostgreSQL passaram: limites cumulativos, rollback de falhas, recuperação parcial, custo desconhecido, preservação do mês anterior, acesso/MFA/RLS, histórico imutável, repetição idempotente, fechamento ajustado, concorrência entre devoluções, estornos de transferências e fechamento.
- Os 15 testes de compensação de prejuízos permanecem no CI em banco independente.
- Executor `npm run test:finance-adjustments` com banco vazio `finance_fixture` em 127.0.0.1:55439 e `FINANCE_FIXTURE_PORT=55439`. Recusa banco não vazio, não apaga bancos e compara hashes das funções anteriores antes/depois do SQL novo. A fixture tem proteção contra execução fora do banco descartável.
- Integração SQL na homologação: devolução de outubro, fechamento líquido corrigido, rejeição do fechamento antigo divergente, devolução e despesa recuperada em novembro, reversão da transferência e compensação da perda. Todo o ensaio executou em transação desfeita por rollback.
- 21 verificações de navegador do componente real em harness sintético isolado: estados vazio, venda, despesa, transferência e erro, em 1440/768/390/320px, mais repetição após resposta incerta com o mesmo identificador. Sem overflow e sem erros JavaScript.
- O harness não simula uma autenticação de produção nem substitui ensaio de login/MFA com os titulares.
- Build e lint aprovados, com quatro avisos preexistentes de imagens na loja. Não há nova medição Lighthouse nesta etapa.
- O sandbox temporário, PostgreSQL e ferramentas de navegador usados para validar ficam na nuvem; não integram as dependências da aplicação.

## Backup antes de produção
- Execução: `2026-11-18T18-58-08.126Z-faa6f3fd-bf65-4b53-8260-3668e261855b`.
- 65 tabelas e 66 imagens; 3189716 bytes, armazenamento privado.
- SHA-256: `4aea28b69e10cccf1f2ace1eddbd74603110125d87095efdce480f16807b88ac`.
- Leitura privada de retorno e reconhecimento do arquivo por `pg_restore --list` verificados; zero escritas na origem.
- Uma restauração integral do backup ainda precisa ser ensaiada; listar o arquivo não comprova restauração completa.

## Como validar sem gravar em produção
Use exclusivamente a homologação `cgcaykrtfxlkrbopycyn` para criar dados sintéticos e ensaiar ajustes. A prévia automática do projeto oficial pode usar o banco de produção e não deve receber ensaios de escrita.

1. Registre uma venda e uma despesa de teste na homologação.
2. Registre uma devolução parcial, escolhendo a conta que realmente representa o reembolso e apenas os componentes recuperados.
3. Confira o histórico, os movimentos espelhados e os componentes líquidos do resumo.
4. Estorne parcialmente a despesa; confira a recuperação sem duplicar efeito no lucro.
5. Registre e reverta uma transferência; confira as duas contas e o saldo global.
6. Teste consulta sem ações de gravação, valores excessivos, custo pendente e tentativa de fechar mês ainda aberto.
7. Fechamentos positivos futuros e cenários de rateio são ensaiados no PostgreSQL descartável com relógio sintético; o SQL implantado usa somente a data real do servidor.

## Pendências
- Conferência dos saldos iniciais reais, início/prejuízo da apuração, cadastros privados e ativação dos acessos pelos titulares.
- Conciliação detalhada por conta, categorias, relatórios e exportações.
- Fluxo específico para correção de registro de pagamento a sócios. Nenhum pagamento é apagado ou liberado automaticamente para ser pago novamente.
- Integrações de reembolso com gateways e sincronização de pedidos/estoque dependem de recursos que não foram implementados nesta etapa.
- Restauração integral de backup e primeiro fechamento real com dados conferidos.
