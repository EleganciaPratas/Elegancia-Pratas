# Troca entre administrador e consulta da gestão
Implementação de 16/11/2026, inteiramente na nuvem.

## Uso
Clique no nome no canto superior direito → Trocar conta. As duas opções são Administrador e Somente consulta. A troca desmonta o conteúdo autenticado, aguarda o encerramento local da sessão e a limpeza do cookie, preenche o e-mail escolhido e exige senha e segundo fator da outra conta. Nenhum token master é guardado para voltar silenciosamente.
O administrador ativo foi preservado. A conta adicional de consulta tem cadastro Auth próprio, sem linha em admin_users; e-mails e IDs pessoais ficam somente no Supabase e nas respostas privadas das contas vinculadas, nunca neste repositório público. A conta aguarda ativação pelo titular. O convite foi autorizado pelo usuário; o aceite do provedor será conferido após a publicação.
Não foi criado outro sócio nem preenchido CPF, telefone ou Pix. A participação de Caio no Financeiro não foi modificada.

## Leitura e permissões
A mesma navegação atende Visão geral, Joias, Coleções, Campanhas, Estoque, Precificação, Catálogo, Financeiro, Cadastros financeiros e Integrações/Frete. O perfil de consulta recebe telas sem formulários ou comandos de gravação, com busca, paginação, valores existentes, fotos autorizadas e campanhas salvas.
A Visão geral reutiliza os indicadores e gráficos existentes. Resumos de vendas e resultado financeiro usam cópias de leitura das consultas existentes, com autorização própria; fórmulas e RPCs originais foram preservados. Saldos de conta e fluxo mensal seguem as mesmas regras de entradas, saídas e exclusão de transferências já usadas na página financeira.
Tokens OAuth e outras credenciais não são expostos. O perfil não conecta integrações, solicita fretes, gera IA, publica peças, altera estoque, cadastra dados, fecha competências ou registra pagamentos.
O banco limita a nova conta a SELECT por políticas adicionais com MFA e cadastro próprio. Uma conta em admin_users não é considerada leitora. As funções de alteração existentes continuam exigindo seus papéis originais; elas não foram alteradas.
A rota /gestao/sessao aceita somente um leitor verificado, checa origem e grava cookie HttpOnly de acesso à gestão. Middleware distingue acesso administrador de consulta. As APIs de administração originais continuam recusando o leitor.
A regra de quinze minutos sem atividade permanece nas duas contas. Revogar uma sessão não representa invalidação instantânea de todo JWT antigo: permanece o limite já documentado em SESSAO-INATIVIDADE.md.

## Banco e preservação
Objetos novos: management_readers com RLS, seis funções management_*, view management_account_balances com security_invoker e políticas de leitura nas tabelas necessárias e nas fotos privadas já cadastradas. Nenhuma concessão para escrita foi criada para o leitor.
SQL aditivo em docs/sql/management-readers.review.sql; aplicado primeiro na homologação e depois no projeto oficial. Nenhuma migração ou mudança em lib/, supabase/ e app/api/. Os 48 RPCs anteriores tiveram hashes comparados sem diferença. As 21 tabelas de negócio existentes tiveram contagens e checksums comparados sem diferença. Apenas o cadastro de acesso solicitado foi acrescentado.
Backup privado verificado antes da aplicação oficial: dpl_9yQwkLVq74x8ymN3DPrPCvriVGFc, execução 2026-11-16T17-35-02.024Z-92e1cb3d-ded9-4cd3-955a-c9df2d9f4523, 62 tabelas, 66 imagens, 3.186.054 bytes, SHA256 5bbfeeb654a7414601690f6aa83f1c8e84dae31b12e0282470d272d3b04a1171. Leitura privada conferida e zero gravações pela rotina na origem; arquivo analisado, sem restauração integral real.

## Testes
- 54 testes da aplicação passaram; lint sem erros e quatro avisos preexistentes no site público.
- 65 verificações hospedadas com Auth, MFA e RLS reais: acesso anônimo/AAL1 recusado, leitura, conta vinculada, promoção de papel recusada, INSERT/UPDATE/DELETE recusados, upload privado recusado e 30 funções de alteração recusadas.
- Quatro verificações adicionais de caixa: saldo inicial R$100, despesa R$10 e transferência R$25 resultam em saldo total R$90, entradas R$0, saídas R$10; lucro do mês sem vendas R$-10, igual ao resumo original. Exclusivamente fixtures da homologação.
- 40 verificações de navegador passaram: logins com senha e TOTP, troca real de contas, cookie do leitor separado, APIs master recusadas, 11 rotas em 1440/768/390 sem overflow e retorno ao administrador com senha e MFA; zero erros de página.
- A primeira captura da troca aguardava o e-mail antes de terminar o logout e foi corrigida para aguardar o preenchimento; outra captura aguardava um atalho que o layout esconde em telas pequenas e foi corrigida para usar a largura adequada. A navegação não foi alterada para satisfazer essas capturas.
- Build otimizado aprovado na homologação. Resultado da implantação oficial será conferido antes de declarar publicado.
- Nenhuma dependência adicionada ao produto. Ferramentas de navegador permanecem apenas no sandbox.
- Advisor confirma que novas funções não são executáveis por anon. Avisos genéricos de SECURITY DEFINER para authenticated e avisos preexistentes da estrutura-base continuam sujeitos à revisão registrada anteriormente; não representam certificação integral de segurança.

## Validação e encerramento
Usar a homologação isolada para testes de escrita. O teste hospedado exige explicitamente HOMOLOGATION_REF=cgcaykrtfxlkrbopycyn e credenciais sintéticas guardadas somente no sandbox. Nunca testar cadastro, alteração, exclusão ou fechamento com dados de produção.
Na conta de consulta, confira filtros e páginas; verifique que gravações são recusadas também na API. Para voltar ao administrador, use Trocar conta e autentique novamente.
As contas, registros e funções temporárias de provisionamento usados nos testes devem ser removidos ou encerrados com HTTP 410 ao final. O cadastro de leitura solicitado permanece na produção. Nenhum código, banco, imagem ou credencial foi salvo na máquina do usuário.
