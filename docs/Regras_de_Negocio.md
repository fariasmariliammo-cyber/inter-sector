# Regras de Negócio - Gestão 360

## 1. Autenticação e Perfil

- Todo usuário autenticado via Supabase Auth **DEVE** ter um registro correspondente na tabela `public.users`.
- O login falha com erro 401 se a conta de Auth existir mas o perfil não.

## 2. Tickets

- Um ticket **DEVE** ter um setor solicitante e um setor executor.
- O setor solicitante **NÃO PODE** ser o mesmo que o setor executor (Intersetorialidade).
- Apenas administradores ou o solicitante do ticket podem editar o título e descrição.

## 3. Fluxo de Status

- A progressão de status deve ser linear conforme a sequência definida para o tenant.
- A transição automática para "Em Atendimento" ocorre no primeiro comentário não-sistema.

## 4. Administração

- Apenas usuários com a role `admin` podem acessar o `AdminPanel`.
- Setores com usuários ou tickets vinculados não podem ser excluídos.
- Usuários com tickets ou comentários vinculados não podem ser excluídos.

## 5. Arquitetura e Enforcement Técnico

- Este app **DEVE** ser apenas frontend React (Vite) + Supabase.
- Este app **NUNCA PODE** possuir backend proprio fora do Supabase.
- E **PROIBIDO** adicionar servidor de API (Node/Express/Fastify/Nest), BFF, rotas backend customizadas ou funcoes server-side fora do ambiente Supabase.
- As regras deste documento devem ser aplicadas no Supabase (RLS/policies, constraints, triggers e/ou RPC/Edge Functions).
- O frontend nao e fonte de autoridade para seguranca ou integridade de dados.
- Toda logica de dados, autorizacao e integridade deve permanecer no Supabase.

## 6. Feedback ao Usuario

- O app **NAO DEVE** usar `alert()`, `confirm()` ou `prompt()` do JavaScript.
- O app **DEVE** usar toast padrao para feedback de interface.
- Categorias de toast obrigatorias: `success`, `error` e `warning` (alerta).
- Paleta de feedback deve garantir legibilidade com contraste minimo WCAG AA (>= 4.5:1).

## 7. Padrao de Engenharia Frontend

- Componentes devem ser projetados para reutilizacao e composicao.
- O desenvolvimento deve seguir DRY (Don’t Repeat Yourself), evitando duplicacao desnecessaria de logica e UI.
- Elementos visuais e de interacao devem manter consistencia (espacamento, tipografia, estados, feedback e comportamento).
- Qualidade de codigo e obrigatoria: legibilidade, manutencao facilitada e padroes consistentes no projeto.

## 8. Criterios de Revisao (PR Gate)

Uma mudanca deve ser bloqueada se incluir qualquer um dos itens abaixo:

- Adicao de framework/backend server-side fora do Supabase.
- Introducao de arquivos de servidor (ex.: `server.ts`, `app.ts` de API, handlers backend externos).
- Dependencias de API backend propria sem justificativa de frontend.
- Fluxo de dados que retire do Supabase a autoridade sobre seguranca e integridade.
- Introducao de `alert(`, `confirm(` ou `prompt(` no frontend.
- Adicao de componentes duplicados sem justificativa tecnica quando composicao/reuso for possivel.

## 9. Notificacoes de Tickets

- Sempre que um ticket for alterado (edicao, mudanca de status ou novo comentario), todos os usuarios envolvidos devem receber notificacao.
- Usuarios envolvidos: solicitante, executor (ou usuarios do setor executor quando nao houver executor), e usuarios marcados no ticket.
- As notificacoes devem ser enviadas via app (sininho) e por e-mail.
