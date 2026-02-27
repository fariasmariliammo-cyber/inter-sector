# InterSector PRD (Product Requirements Document)

## Mission

InterSector is a platform designed to manage and streamline communication and tasks between different sectors of an organization.

## Core Features

1. **Authentication**: Supabase-based authentication with organization (tenant) isolation.
2. **Ticket Management**: Create, view, and update tickets across sectors.
   - Tickets must define a solicitor sector and an executor sector.
   - Linear status progression (Aberto -> Em Atendimento -> Em Revisão -> Concluído).
3. **Admin Panel**: Management of sectors and users within a tenant.
4. **Notifications**: Real-time or polled notifications for ticket updates and mentions.
5. **Storage**: File attachment support for tickets and comments.

## Technical Stack

- **Frontend**: React (Vite) + Tailwind CSS + Lucide Icons.
- **Backend**: Node.js (Express) + TSX.
- **Database**: Supabase (PostgreSQL + Auth + Storage).
