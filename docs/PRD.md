# Gestão 360 PRD (Product Requirements Document)

## Mission

Gestão 360 is a platform designed to manage and streamline communication and tasks between different sectors of an organization.

## Core Features

1. **Authentication**: Supabase-based authentication with organization (tenant) isolation.
   - The public experience must present a short landing page before the login/register form, explaining the product value and main capabilities.
2. **Ticket Management**: Create, view, and update tickets across sectors.
   - Tickets must define a solicitor sector and an executor sector.
   - Linear status progression (Aberto -> Em Atendimento -> Concluido).
   - The default tickets view must open filtered by the logged-in user's executor sector, since the primary user workflow is to resolve their own sector queue.
   - The main filter in the tickets list must be the period, and the default range should load the last 3 months.
   - The status filter in the tickets list must support selecting multiple statuses at once, and the default queue should start with Aberto + Em Atendimento selected.
   - The tickets screen must support both card view and Kanban view, and Kanban must allow status manipulation using the existing linear progression rules.
3. **Admin Panel**: Management of sectors and users within a tenant.
4. **Notifications**: Real-time or polled notifications for ticket updates and mentions, via app and e-mail.
5. **Storage**: File attachment support for tickets and comments.
6. **Dashboard & Navigation**: Home dashboard with key ticket metrics (by status, pending, recent, notifications) and sidebar navigation (Dashboard, Tickets, Admin for admins).
   - Dashboard period filter must default to the last 3 months and support quick ranges: last 30 days, last 6 months, and last year.
   - The status distribution and total tickets in dashboard must be presented in a pie chart.
   - Dashboard must be role-specific: common users can access only the common dashboard and admins can access only the admin dashboard.
   - Common dashboard must show only the health data of the logged-in user's sector.
   - Admin dashboard must include a complete cross-sector view, highlighting best and worst performing sectors.
   - In admin dashboard, the status distribution chart must support sector filter (`Todos os setores` + each tenant sector).

## Architecture

- **Frontend**: Single React (Vite) application, sem Next.js.
- **Backend**: Supabase (Auth, Postgres, Storage, Edge Functions).
- **Regras obrigatorias**: ver `docs/Regras_de_Negocio.md`.

## Technical Stack

- **Frontend**: React (Vite) + Tailwind CSS + Lucide Icons.
- **Data/Auth/Storage**: Supabase (PostgreSQL + Auth + Storage).
