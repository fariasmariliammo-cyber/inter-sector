# Gestão 360

Aplicacao de gestao intersetorial com arquitetura **frontend-only + Supabase** (React + Vite, sem Next.js).

## Stack

- Frontend: React + Vite + Tailwind CSS
- Backend-as-a-Service: Supabase (Auth, Postgres, Storage)
- Deploy: build estatico

## Executar localmente

1. Instale dependencias:
   `npm install`
2. Crie o arquivo `.env` com base em `.env.example` e configure:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Rode em desenvolvimento:
   `npm run dev`

## Scripts

- `npm run dev`: inicia Vite em modo desenvolvimento
- `npm run build`: gera build de producao
- `npm run start`: sobe preview local da build
- `npm run lint`: roda typecheck (`tsc --noEmit`)
