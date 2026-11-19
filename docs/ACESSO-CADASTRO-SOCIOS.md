# Acesso ao cadastro inicial dos sócios — 19/11/2026

O cadastro inicial tinha um link discreto no final da aba Sócios. Agora o Financeiro oferece o botão **Cadastros dos sócios** no cabeçalho. Os cartões ainda sem CPF, telefone e Pix também oferecem **Concluir cadastro de [nome]**.

Cada atalho abre o formulário com o sócio correto selecionado pela chave já existente. Apenas aurizinete, elizabete e caio são aceitos na seleção inicial por URL; um valor desconhecido conserva a opção padrão.

O formulário explica o vínculo entre a conta do portal e o cadastro financeiro. O envio para finance_register_partner, seus parâmetros e todas as validações continuam iguais. Nenhum dado pessoal foi preenchido pelo agente e nenhum vínculo foi alterado por SQL.

## Uso

1. Entrar no perfil Administrador. O perfil Somente consulta não pode preencher cadastros.
2. Abrir Financeiro → Cadastros dos sócios, ou Sócios → Concluir cadastro de Aurizinete.
3. Informar o e-mail da conta da sócia, CPF, telefone e chave Pix na página privada.
4. Concluir o cadastro inicial. Depois disso, conferir o vínculo e o acesso individual pelo portal /socios.

A conta da Aurizinete já existia, mas estava sem vínculo com finance_partners durante a investigação. A publicação dos atalhos não substitui o preenchimento privado obrigatório.

## Verificação

- 55 testes existentes aprovados; build de produção concluída; lint sem erros e com quatro avisos antigos de imagens.
- 12 cenários de layout com componentes reais e dados simulados: duas páginas, três larguras e dois temas.
- Botão do cabeçalho verificado nas três larguras.
- Nove navegações pelos atalhos dos três sócios, com confirmação da seleção correta.
- Três verificações de chave desconhecida e 27 verificações de campos obrigatórios preservados.
- Nenhum transbordamento de página ou erro de JavaScript nos cenários.
- Nenhuma gravação ou envio de formulário em produção. Sem alterações em lib/, supabase/, app/api/, migrações, permissões ou cálculos.

A verificação em navegador usou um ambiente temporário na nuvem. Não houve arquivos ou dados do sistema gravados na máquina do usuário.
