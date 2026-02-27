# Regras de Negócio - InterSector

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
