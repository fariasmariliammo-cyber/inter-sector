import { supabase } from './supabaseClient';

type JsonMap = Record<string, any>;
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(error: string, status = 400, extra: JsonMap = {}): Response {
  return jsonResponse({ error, ...extra }, status);
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function parseNumberList(value: string | null): number[] {
  if (!value) return [];

  return value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((part) => !Number.isNaN(part));
}

function formatTicket(ticket: any): any {
  return {
    ...ticket,
    solicitor_name: ticket?.solicitor_name?.name,
    executor_name: ticket?.executor_name?.name,
    solicitor_sector_name: ticket?.solicitor_sector_name?.name,
    executor_sector_name: ticket?.executor_sector_name?.name,
    status_name: ticket?.status_name?.name,
    status_sequence: ticket?.status_sequence?.sequence,
  };
}

function formatUserRow(user: any): JsonMap {
  return {
    ...user,
    sector_name: user?.sector_name?.name,
    tenant_name: user?.tenant_name?.name,
  };
}

function buildFallbackUser(email: string, authUser?: any): JsonMap {
  const cleanEmail = normalizeEmail(email);
  const displayName =
    String(authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || cleanEmail.split('@')[0] || 'Usuario').trim() ||
    'Usuario';

  return {
    id: 0,
    tenant_id: 0,
    sector_id: 0,
    name: displayName,
    email: cleanEmail,
    role: 'user',
    theme: 'light',
  };
}

function randomFilePath(originalName: string): string {
  const dot = originalName.lastIndexOf('.');
  const ext = dot >= 0 ? originalName.slice(dot) : '';
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Math.random().toString(36).slice(2)}-${Date.now()}`;

  return `uploads/${randomPart}${ext}`;
}

function extractMentions(content: string): number[] {
  const mentions = content.match(/@\[[^\]]+\]\((\d+)\)/g) || [];
  const ids = mentions
    .map((mention) => mention.match(/\((\d+)\)/)?.[1])
    .map((id) => (id ? Number(id) : null))
    .filter((id): id is number => id !== null && !Number.isNaN(id));

  return [...new Set(ids)];
}

async function parseJsonBody(init?: RequestInit): Promise<JsonMap> {
  const body = init?.body;
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return {};
}

async function invokeAuthenticatedEdgeFunction(
  functionName: string,
  body: JsonMap,
): Promise<{ data: JsonMap | null; error: string | null; status: number }> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (sessionError || !accessToken) {
    return { data: null, error: 'Missing authenticated session.', status: 401 };
  }

  const endpoint = `${supabaseUrl}/functions/v1/${functionName}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  let payload: JsonMap | null = null;
  try {
    payload = (await response.json()) as JsonMap;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = String(payload?.error || payload?.message || `Edge function HTTP ${response.status}`);
    return { data: payload, error: message, status: response.status };
  }

  return { data: payload, error: null, status: response.status };
}

async function getTicketMentionUserIds(ticketId: number): Promise<number[]> {
  const { data, error } = await supabase
    .from('ticket_mentions')
    .select('user_id')
    .eq('ticket_id', ticketId);

  if (error || !data) return [];
  return data
    .map((row: { user_id: number }) => row.user_id)
    .filter((id) => id !== null && id !== undefined);
}

async function getExecutorSectorUserIds(ticket: any): Promise<number[]> {
  if (!ticket?.executor_sector_id) return [];

  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('sector_id', ticket.executor_sector_id)
    .eq('tenant_id', ticket.tenant_id);

  if (error || !data) return [];
  return data
    .map((row: { id: number }) => row.id)
    .filter((id) => id !== null && id !== undefined);
}

async function collectTicketNotificationRecipients(ticketId: number, ticket: any): Promise<number[]> {
  const recipients = new Set<number>();

  if (ticket?.solicitor_id) recipients.add(ticket.solicitor_id);
  if (ticket?.executor_id) {
    recipients.add(ticket.executor_id);
  } else {
    const sectorUsers = await getExecutorSectorUserIds(ticket);
    for (const id of sectorUsers) recipients.add(id);
  }

  const mentionUserIds = await getTicketMentionUserIds(ticketId);
  for (const id of mentionUserIds) recipients.add(id);

  return [...recipients].filter((id) => id !== null && id !== undefined);
}

async function notifyTicketParticipants(params: {
  ticketId: number;
  ticket: any;
  content: string;
  excludeUserIds?: number[];
  actorUserId?: number | null;
}): Promise<void> {
  const { ticketId, ticket, content, excludeUserIds = [], actorUserId } = params;
  const excluded = new Set(excludeUserIds.filter((id) => id !== null && id !== undefined));
  const recipients = (await collectTicketNotificationRecipients(ticketId, ticket)).filter(
    (id) => !excluded.has(id),
  );

  if (recipients.length === 0) return;
  await supabase.from('notifications').insert(
    recipients.map((userId) => ({
      user_id: userId,
      content,
    })),
  );

  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      console.error('Failed to trigger ticket notification email: missing authenticated user.', {
        authError,
      });
      return;
    }

    const invokeResult = await invokeAuthenticatedEdgeFunction('send-ticket-notification-email', {
      ticket_id: ticketId,
      content,
      actor_user_id: actorUserId ?? null,
    });

    if (invokeResult.error || invokeResult.data?.error) {
      console.error(
        'Failed to trigger ticket notification email:',
        invokeResult.error || invokeResult.data?.error,
      );
    }
  } catch (error) {
    console.error('Failed to trigger ticket notification email:', error);
  }
}

async function isAdmin(userId: unknown): Promise<boolean> {
  const id = toNumber(userId);
  if (!id) return false;

  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return false;
  return data.role?.toLowerCase() === 'admin';
}

async function handleLogin(init?: RequestInit): Promise<Response> {
  const { email, password } = await parseJsonBody(init);
  if (!email || !password) {
    return errorResponse('E-mail e senha sao obrigatorios.', 400);
  }

  const cleanEmail = normalizeEmail(email);

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });

  if (authError) {
    return errorResponse('Falha na autenticacao: E-mail ou senha incorretos.', 401, {
      detail: authError.message,
      code: 'AUTH_FAILED',
    });
  }

  const profileEmail = normalizeEmail(authData.user?.email || cleanEmail);
  const { data: user } = await supabase
    .from('users')
    .select(`
      *,
      sector_name:sectors(name),
      tenant_name:tenants(name)
    `)
    .ilike('email', profileEmail)
    .maybeSingle();

  if (!user) {
    return jsonResponse(buildFallbackUser(profileEmail, authData.user));
  }

  return jsonResponse(formatUserRow(user));
}

async function handleCreateTenant(init?: RequestInit): Promise<Response> {
  const { name } = await parseJsonBody(init);
  const cleanName = typeof name === 'string' ? name.trim() : '';

  if (!cleanName) {
    return errorResponse('Nome da empresa e obrigatorio.', 400);
  }

  const { data, error } = await supabase.rpc('create_tenant_for_authenticated_user', {
    p_name: cleanName,
  });

  if (error || !data) {
    return errorResponse(error?.message || 'Erro ao criar empresa.', 500);
  }

  return jsonResponse({ success: true, user: data });
}

async function handleSignup(init?: RequestInit): Promise<Response> {
  const { email, name, password } = await parseJsonBody(init);
  if (!email || !name || !password) {
    return errorResponse('E-mail, nome e senha sao obrigatorios.', 400);
  }

  const cleanEmail = normalizeEmail(email);

  const { error: authError } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: { data: { full_name: name } },
  });

  if (authError) {
    return errorResponse(authError.message, 400);
  }

  const { data: existingUser, error: existingUserError } = await supabase
    .from('users')
    .select('*')
    .ilike('email', cleanEmail)
    .maybeSingle();

  if (existingUserError) {
    return errorResponse(existingUserError.message, 400);
  }

  if (existingUser) {
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({ name })
      .eq('id', existingUser.id)
      .select()
      .single();

    if (updateError) return errorResponse('Erro ao atualizar perfil.', 400);
    return jsonResponse({ success: true, user: updatedUser });
  }

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .insert({ name: `Empresa de ${name}` })
    .select()
    .single();

  if (tenantError || !tenant) {
    return errorResponse('Erro ao criar organizacao apos cadastro.', 500);
  }

  const { data: sector, error: sectorError } = await supabase
    .from('sectors')
    .insert({ tenant_id: tenant.id, name: 'Administracao' })
    .select()
    .single();

  if (sectorError || !sector) {
    return errorResponse('Erro ao criar organizacao apos cadastro.', 500);
  }

  const defaultStatuses = [
    { tenant_id: tenant.id, name: 'Aberto', sequence: 1 },
    { tenant_id: tenant.id, name: 'Em Atendimento', sequence: 2 },
    { tenant_id: tenant.id, name: 'Concluído', sequence: 3 },
  ];

  const { error: statusesError } = await supabase.from('statuses').insert(defaultStatuses);
  if (statusesError) {
    return errorResponse('Erro ao criar organizacao apos cadastro.', 500);
  }

  const { data: newUser, error: userError } = await supabase
    .from('users')
    .insert({
      tenant_id: tenant.id,
      sector_id: sector.id,
      name,
      email: cleanEmail,
      role: 'admin',
    })
    .select()
    .single();

  if (userError) {
    return errorResponse('Erro ao criar organizacao apos cadastro.', 500);
  }

  return jsonResponse({ success: true, user: newUser });
}

async function handleUpload(init?: RequestInit): Promise<Response> {
  if (!(init?.body instanceof FormData)) {
    return errorResponse('No file uploaded', 400);
  }

  const file = init.body.get('file');
  if (!(file instanceof File)) {
    return errorResponse('No file uploaded', 400);
  }

  const filePath = randomFilePath(file.name);
  const { error } = await supabase.storage.from('attachments').upload(filePath, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });

  if (error) {
    if (error.message?.toLowerCase().includes('not found')) {
      return errorResponse(
        "Bucket de armazenamento 'attachments' nao encontrado. Verifique se ele foi criado no Supabase.",
        500,
      );
    }
    return errorResponse('Erro ao fazer upload do arquivo para o storage.', 500);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('attachments').getPublicUrl(filePath);

  return jsonResponse({ url: publicUrl, name: file.name });
}

async function handleListTickets(url: URL): Promise<Response> {
  const tenantId = url.searchParams.get('tenant_id');
  const userId = url.searchParams.get('user_id');
  const role = url.searchParams.get('role');
  const sectorSolicitor = url.searchParams.get('sector_solicitor');
  const sectorExecutor = url.searchParams.get('sector_executor');
  const userSolicitor = url.searchParams.get('user_solicitor');
  const userExecutor = url.searchParams.get('user_executor');
  const dashboardScope = url.searchParams.get('dashboard_scope');
  const statusIds = parseNumberList(url.searchParams.get('status_id'));
  const createdFrom = url.searchParams.get('created_from');
  const createdTo = url.searchParams.get('created_to');
  const limitParam = toNumber(url.searchParams.get('limit'));
  const offsetParam = toNumber(url.searchParams.get('offset'));
  const limit = Math.min(Math.max(limitParam ?? 50, 1), 200);
  const offset = Math.max(offsetParam ?? 0, 0);

  let query = supabase
    .from('tickets')
    .select(`
      *,
      solicitor_name:users!tickets_solicitor_id_fkey(name),
      executor_name:users!tickets_executor_id_fkey(name),
      solicitor_sector_name:sectors!tickets_solicitor_sector_id_fkey(name),
      executor_sector_name:sectors!tickets_executor_sector_id_fkey(name),
      status_name:statuses(name),
      status_sequence:statuses(sequence)
    `)
    .eq('tenant_id', tenantId);

  if (role !== 'admin' && userId) {
    if (dashboardScope === 'sector') {
      if (!sectorExecutor) return errorResponse('sector_executor is required for sector dashboard scope.', 400);

      const { data: requester, error: requesterError } = await supabase
        .from('users')
        .select('sector_id')
        .eq('id', userId)
        .maybeSingle();

      if (requesterError) return errorResponse(requesterError.message, 400);
      if (!requester) return errorResponse('User not found.', 404);
      if (String(requester.sector_id) !== String(sectorExecutor)) {
        return errorResponse('Acesso negado para dashboard de outro setor.', 403);
      }

      query = query.eq('executor_sector_id', sectorExecutor);
    } else {
      query = query.or(`solicitor_id.eq.${userId},executor_id.eq.${userId}`);
    }
  }

  if (sectorSolicitor) query = query.eq('solicitor_sector_id', sectorSolicitor);
  if (sectorExecutor) query = query.eq('executor_sector_id', sectorExecutor);
  if (userSolicitor) query = query.eq('solicitor_id', userSolicitor);
  if (userExecutor) query = query.eq('executor_id', userExecutor);
  if (statusIds.length === 1) query = query.eq('status_id', statusIds[0]);
  if (statusIds.length > 1) query = query.in('status_id', statusIds);
  if (createdFrom) query = query.gte('created_at', createdFrom);
  if (createdTo) query = query.lte('created_at', createdTo);

  const { data: tickets, error } = await query
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) return errorResponse(error.message, 400);

  return jsonResponse((tickets || []).map(formatTicket));
}

async function handleGetTicket(ticketId: number): Promise<Response> {
  const { data: ticket, error } = await supabase
    .from('tickets')
    .select(`
      *,
      solicitor_name:users!tickets_solicitor_id_fkey(name),
      executor_name:users!tickets_executor_id_fkey(name),
      solicitor_sector_name:sectors!tickets_solicitor_sector_id_fkey(name),
      executor_sector_name:sectors!tickets_executor_sector_id_fkey(name),
      status_name:statuses(name),
      status_sequence:statuses(sequence)
    `)
    .eq('id', ticketId)
    .maybeSingle();

  if (error) return errorResponse(error.message, 400);
  if (!ticket) return errorResponse('Ticket not found', 404);
  return jsonResponse(formatTicket(ticket));
}

async function handleCreateTicket(init?: RequestInit): Promise<Response> {
  const {
    tenant_id,
    title,
    description,
    solicitor_id,
    executor_id,
    solicitor_sector_id,
    executor_sector_id,
    attachments,
  } = await parseJsonBody(init);

  const solicitorSectorId = toNumber(solicitor_sector_id);
  const executorSectorId = toNumber(executor_sector_id);
  const tenantId = toNumber(tenant_id);
  const solicitorId = toNumber(solicitor_id);
  const executorId = toNumber(executor_id);

  if (!tenantId || !solicitorId || !solicitorSectorId || !title || !description) {
    return errorResponse('Dados obrigatorios ausentes para criar ticket.', 400);
  }

  if (executorSectorId && solicitorSectorId === executorSectorId) {
    return errorResponse('Tickets must be intersectoral.', 400);
  }

  const { data: firstStatus, error: firstStatusError } = await supabase
    .from('statuses')
    .select('id')
    .eq('tenant_id', tenantId)
    .order('sequence')
    .limit(1)
    .maybeSingle();

  if (firstStatusError) return errorResponse(firstStatusError.message, 400);
  if (!firstStatus) return errorResponse('No statuses configured for this tenant.', 500);

  const { data: result, error } = await supabase
    .from('tickets')
    .insert({
      tenant_id: tenantId,
      title,
      description,
      solicitor_id: solicitorId,
      executor_id: executorId,
      solicitor_sector_id: solicitorSectorId,
      executor_sector_id: executorSectorId,
      status_id: firstStatus.id,
      attachments: attachments || [],
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 400);
  return jsonResponse({ id: result.id });
}

async function handleUpdateTicket(ticketId: number, init?: RequestInit): Promise<Response> {
  const { user_id, title, description, attachments } = await parseJsonBody(init);

  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('solicitor_id, executor_id, executor_sector_id, tenant_id')
    .eq('id', ticketId)
    .maybeSingle();

  if (ticketError) return errorResponse(ticketError.message, 400);
  if (!ticket) return errorResponse('Ticket not found', 404);

  const userId = toNumber(user_id);
  const userIsAdmin = await isAdmin(user_id);
  const userIsSolicitor = userId !== null && ticket.solicitor_id === userId;

  if (!userIsAdmin && !userIsSolicitor) {
    return errorResponse(
      'Acesso negado: Apenas o administrador ou o solicitante podem editar este ticket.',
      403,
    );
  }

  const { error } = await supabase
    .from('tickets')
    .update({ title, description, attachments })
    .eq('id', ticketId);

  if (error) return errorResponse(error.message, 400);

  await supabase.from('comments').insert({
    ticket_id: ticketId,
    user_id: userId,
    content: `Ticket editado pelo ${userIsAdmin ? 'administrador' : 'solicitante'}`,
    type: 'system',
  });

  await notifyTicketParticipants({
    ticketId,
    ticket,
    content: `Ticket #${ticketId} atualizado.`,
    actorUserId: userId,
  });

  return jsonResponse({ success: true });
}

async function handleListComments(ticketId: number, url: URL): Promise<Response> {
  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', ticketId)
    .maybeSingle();

  if (ticketError) return errorResponse(ticketError.message, 400);
  if (!ticket) return errorResponse('Ticket not found', 404);

  const limitParam = toNumber(url.searchParams.get('limit'));
  const offsetParam = toNumber(url.searchParams.get('offset'));
  const orderParam = url.searchParams.get('order');
  const ascending = orderParam !== 'desc';
  const limit = Math.min(Math.max(limitParam ?? 100, 1), 200);
  const offset = Math.max(offsetParam ?? 0, 0);

  const { data: comments, error } = await supabase
    .from('comments')
    .select('*, user_name:users(name)')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending })
    .order('id', { ascending })
    .range(offset, offset + limit - 1);
  if (error) return errorResponse(error.message, 400);

  const formattedComments = (comments || []).map((comment: any) => ({
    ...comment,
    user_name: comment?.user_name?.name,
  }));

  return jsonResponse(formattedComments);
}

async function handleCreateComment(ticketId: number, init?: RequestInit): Promise<Response> {
  const { user_id, content = '', type, attachments } = await parseJsonBody(init);
  const userId = toNumber(user_id);

  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', ticketId)
    .maybeSingle();

  if (ticketError) return errorResponse(ticketError.message, 400);
  if (!ticket) return errorResponse('Ticket not found', 404);

  const { data: currentStatus, error: currentStatusError } = await supabase
    .from('statuses')
    .select('*')
    .eq('id', ticket.status_id)
    .maybeSingle();

  if (currentStatusError) return errorResponse(currentStatusError.message, 400);

  if (currentStatus?.sequence === 1 && type !== 'system') {
    const { data: nextStatus } = await supabase
      .from('statuses')
      .select('id')
      .eq('tenant_id', ticket.tenant_id)
      .eq('sequence', 2)
      .maybeSingle();

    if (nextStatus) {
      await supabase.from('tickets').update({ status_id: nextStatus.id }).eq('id', ticketId);
      await supabase.from('comments').insert({
        ticket_id: ticketId,
        user_id: userId,
        content: 'Status alterado automaticamente para Em Atendimento',
        type: 'system',
      });
    }
  }

  const { data: result, error } = await supabase
    .from('comments')
    .insert({
      ticket_id: ticketId,
      user_id: userId,
      content,
      type: type || 'user',
      attachments: attachments || [],
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 400);

  const mentionUserIds = extractMentions(content);
  for (const mentionedUserId of mentionUserIds) {
    await supabase.from('ticket_mentions').upsert({ ticket_id: ticketId, user_id: mentionedUserId });
    await supabase.from('notifications').insert({
      user_id: mentionedUserId,
      content: `Voce foi mencionado no ticket #${ticketId}`,
    });
  }

  await notifyTicketParticipants({
    ticketId,
    ticket,
    content: `Novo comentario no ticket #${ticketId}.`,
    excludeUserIds: mentionUserIds,
    actorUserId: userId,
  });

  return jsonResponse({ id: result.id });
}

async function handleUpdateTicketStatus(ticketId: number, init?: RequestInit): Promise<Response> {
  const { status_id, user_id, role } = await parseJsonBody(init);
  const statusId = toNumber(status_id);
  const userId = toNumber(user_id);

  if (!statusId) return errorResponse('status_id is required', 400);

  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', ticketId)
    .maybeSingle();

  if (ticketError) return errorResponse(ticketError.message, 400);
  if (!ticket) return errorResponse('Ticket not found', 404);

  const { data: currentStatus, error: currentStatusError } = await supabase
    .from('statuses')
    .select('*')
    .eq('id', ticket.status_id)
    .maybeSingle();

  if (currentStatusError) return errorResponse(currentStatusError.message, 400);

  const { data: targetStatus, error: targetStatusError } = await supabase
    .from('statuses')
    .select('*')
    .eq('id', statusId)
    .maybeSingle();

  if (targetStatusError) return errorResponse(targetStatusError.message, 400);
  if (!targetStatus) return errorResponse('Status alvo nao encontrado.', 400);

  if (role !== 'admin' && currentStatus) {
    if (targetStatus.sequence !== currentStatus.sequence + 1) {
      return errorResponse('Invalid status transition. Progression must be linear.', 400);
    }
  }

  const { error: updateError } = await supabase
    .from('tickets')
    .update({ status_id: statusId })
    .eq('id', ticketId);

  if (updateError) return errorResponse(updateError.message, 400);

  await supabase.from('comments').insert({
    ticket_id: ticketId,
    user_id: userId,
    content: `Status alterado para ${targetStatus.name}`,
    type: 'system',
  });

  await notifyTicketParticipants({
    ticketId,
    ticket,
    content: `Status do ticket #${ticketId} alterado para ${targetStatus.name}.`,
    actorUserId: userId,
  });

  return jsonResponse({ success: true });
}

async function handleListNotifications(userId: number): Promise<Response> {
  const { data: notifications, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .eq('is_read', false)
    .order('created_at', { ascending: false });

  if (error) return errorResponse(error.message, 400);
  return jsonResponse(notifications || []);
}

async function handleMarkNotificationAsRead(notificationId: number): Promise<Response> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

  if (error) return errorResponse(error.message, 400);
  return jsonResponse({ success: true });
}

async function handleUpdateTenant(tenantId: number, init?: RequestInit): Promise<Response> {
  const { name, admin_id } = await parseJsonBody(init);

  if (!(await isAdmin(admin_id))) {
    return errorResponse('Unauthorized', 403);
  }

  const { error } = await supabase.from('tenants').update({ name }).eq('id', tenantId);
  if (error) return errorResponse('Erro ao atualizar nome da empresa.', 400);

  return jsonResponse({ success: true });
}

async function handleAdminCreateSector(init?: RequestInit): Promise<Response> {
  const { tenant_id, name, admin_id } = await parseJsonBody(init);

  if (!(await isAdmin(admin_id))) {
    return errorResponse('Acesso negado: Voce nao tem permissao de administrador.', 403);
  }

  const { data: result, error } = await supabase
    .from('sectors')
    .insert({ tenant_id, name })
    .select()
    .single();

  if (error) return errorResponse(error.message, 400);
  return jsonResponse(result);
}

async function handleAdminCreateUser(init?: RequestInit): Promise<Response> {
  const { tenant_id, sector_id, name, email, role, admin_id } = await parseJsonBody(init);

  if (!(await isAdmin(admin_id))) {
    return errorResponse('Acesso negado: Voce nao tem permissao de administrador.', 403);
  }

  const tenantId = toNumber(tenant_id);
  const sectorId = toNumber(sector_id);
  const adminId = toNumber(admin_id);
  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanEmail = typeof email === 'string' ? normalizeEmail(email) : '';
  const cleanRole = typeof role === 'string' ? role.trim().toLowerCase() : '';

  if (!tenantId || !sectorId || !adminId || !cleanName || !cleanEmail) {
    return errorResponse('Dados obrigatorios ausentes para convidar usuario.', 400);
  }

  if (cleanRole !== 'admin' && cleanRole !== 'user') {
    return errorResponse('Role invalida para convite de usuario.', 400);
  }

  const { data: result, error } = await supabase
    .from('users')
    .insert({ tenant_id: tenantId, sector_id: sectorId, name: cleanName, email: cleanEmail, role: cleanRole })
    .select()
    .single();

  if (error) return errorResponse(error.message, 400);

  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      await supabase.from('users').delete().eq('id', result.id);
      return errorResponse(
        'Sessao autenticada nao encontrada para envio do convite por e-mail. O usuario nao foi criado.',
        401,
      );
    }

    const inviteInvoke = await invokeAuthenticatedEdgeFunction('send-user-invitation-email', {
      invited_user_id: result.id,
      invited_user_name: cleanName,
      invited_user_email: cleanEmail,
      tenant_id: tenantId,
      sector_id: sectorId,
      role: cleanRole,
      admin_user_id: adminId,
    });

    if (inviteInvoke.error || inviteInvoke.data?.error) {
      await supabase.from('users').delete().eq('id', result.id);
      return errorResponse(
        inviteInvoke.error || inviteInvoke.data?.error || 'Nao foi possivel enviar o e-mail de convite. O usuario nao foi criado.',
        502,
      );
    }
  } catch (inviteUnhandledError) {
    await supabase.from('users').delete().eq('id', result.id);
    return errorResponse('Nao foi possivel enviar o e-mail de convite. O usuario nao foi criado.', 502);
  }

  return jsonResponse(result);
}

async function handleAdminListUsers(url: URL): Promise<Response> {
  const tenantId = url.searchParams.get('tenant_id');
  const adminId = url.searchParams.get('admin_id');

  if (!adminId) return errorResponse('admin_id is required', 400);
  if (!(await isAdmin(adminId))) {
    return errorResponse('Acesso negado: Voce nao tem permissao de administrador.', 403);
  }

  const { data: users, error } = await supabase
    .from('users')
    .select('*, sector_name:sectors(name)')
    .eq('tenant_id', tenantId);

  if (error) return errorResponse('Erro ao buscar usuarios administrativos.', 500);

  const formattedUsers = (users || []).map((user: any) => ({
    ...user,
    sector_name: user?.sector_name?.name,
  }));

  return jsonResponse(formattedUsers);
}

async function handleAdminDeleteSector(sectorId: number, url: URL): Promise<Response> {
  const adminId = url.searchParams.get('admin_id');

  if (!(await isAdmin(adminId))) {
    return errorResponse('Acesso negado: Voce nao tem permissao de administrador.', 403);
  }

  const { count: userCount, error: userError } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('sector_id', sectorId);

  if (userError) return errorResponse(userError.message, 400);
  if ((userCount || 0) > 0) {
    return errorResponse(
      'Nao e possivel excluir um setor que possui usuarios vinculados. Remova ou mova os usuarios primeiro.',
      400,
    );
  }

  const { count: ticketCount, error: ticketError } = await supabase
    .from('tickets')
    .select('*', { count: 'exact', head: true })
    .or(`solicitor_sector_id.eq.${sectorId},executor_sector_id.eq.${sectorId}`);

  if (ticketError) return errorResponse(ticketError.message, 400);
  if ((ticketCount || 0) > 0) {
    return errorResponse(
      'Este setor possui historico de tickets e nao pode ser excluido para preservar a integridade dos dados.',
      400,
    );
  }

  const { error } = await supabase.from('sectors').delete().eq('id', sectorId);
  if (error) return errorResponse(`Erro ao excluir setor no banco de dados: ${error.message}`, 400);

  return jsonResponse({ success: true });
}

async function handleAdminDeleteUser(targetUserId: number, url: URL): Promise<Response> {
  const adminId = url.searchParams.get('admin_id');

  if (!(await isAdmin(adminId))) {
    return errorResponse('Acesso negado: Voce nao tem permissao de administrador.', 403);
  }

  if (String(targetUserId) === String(adminId)) {
    return errorResponse('Voce nao pode excluir a sua propria conta administrativa.', 400);
  }

  const { data: targetUser, error: targetUserError } = await supabase
    .from('users')
    .select('role')
    .eq('id', targetUserId)
    .maybeSingle();

  if (targetUserError) return errorResponse(targetUserError.message, 400);

  if (targetUser?.role === 'admin') {
    return errorResponse('Nao e permitido excluir outros administradores pelo painel.', 400);
  }

  const { count: ticketCount, error: ticketError } = await supabase
    .from('tickets')
    .select('*', { count: 'exact', head: true })
    .or(`solicitor_id.eq.${targetUserId},executor_id.eq.${targetUserId}`);

  if (ticketError) return errorResponse(ticketError.message, 400);
  if ((ticketCount || 0) > 0) {
    return errorResponse(
      'Este colaborador possui tickets vinculados (como solicitante ou executor) e nao pode ser excluido.',
      400,
    );
  }

  const { count: commentCount, error: commentError } = await supabase
    .from('comments')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', targetUserId);

  if (commentError) return errorResponse(commentError.message, 400);
  if ((commentCount || 0) > 0) {
    return errorResponse(
      'Este colaborador possui comentarios registrados em tickets e nao pode ser excluido.',
      400,
    );
  }

  await supabase.from('notifications').delete().eq('user_id', targetUserId);

  const { error } = await supabase.from('users').delete().eq('id', targetUserId);
  if (error) return errorResponse(`Erro ao excluir usuario no banco de dados: ${error.message}`, 400);

  return jsonResponse({ success: true });
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  if (!input.startsWith('/api/')) {
    return fetch(input, init);
  }

  const url = new URL(input, window.location.origin);
  const method = (init?.method || 'GET').toUpperCase();
  const pathname = url.pathname;

  try {
    if (pathname === '/api/health' && method === 'GET') {
      return jsonResponse({
        status: 'ok',
        time: new Date().toISOString(),
        provider: 'supabase',
        architecture: 'frontend-only',
      });
    }

    if (pathname === '/api/upload' && method === 'POST') {
      return handleUpload(init);
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      return handleLogin(init);
    }

    if (pathname === '/api/auth/signup' && method === 'POST') {
      return handleSignup(init);
    }

    if (pathname === '/api/tenants' && method === 'POST') {
      return handleCreateTenant(init);
    }

    if (pathname === '/api/sectors' && method === 'GET') {
      const tenantId = url.searchParams.get('tenant_id');
      const { data: sectors, error } = await supabase
        .from('sectors')
        .select('*')
        .eq('tenant_id', tenantId);

      if (error) return errorResponse(error.message, 400);
      return jsonResponse(sectors || []);
    }

    if (pathname === '/api/users' && method === 'GET') {
      const tenantId = url.searchParams.get('tenant_id');
      const sectorId = url.searchParams.get('sector_id');

      let query = supabase
        .from('users')
        .select('id, name, email, sector_id')
        .eq('tenant_id', tenantId);

      if (sectorId && sectorId !== 'null' && sectorId !== 'undefined') {
        query = query.eq('sector_id', sectorId);
      }

      const { data: users, error } = await query;
      if (error) return errorResponse(error.message, 400);

      return jsonResponse(users || []);
    }

    if (pathname === '/api/statuses' && method === 'GET') {
      const tenantId = url.searchParams.get('tenant_id');
      const { data: statuses, error } = await supabase
        .from('statuses')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('sequence');

      if (error) return errorResponse(error.message, 400);
      return jsonResponse(statuses || []);
    }

    if (pathname === '/api/tickets' && method === 'GET') {
      return handleListTickets(url);
    }

    if (pathname === '/api/tickets' && method === 'POST') {
      return handleCreateTicket(init);
    }

    const ticketMatch = pathname.match(/^\/api\/tickets\/(\d+)$/);
    if (ticketMatch && method === 'GET') {
      return handleGetTicket(Number(ticketMatch[1]));
    }

    if (ticketMatch && method === 'PATCH') {
      return handleUpdateTicket(Number(ticketMatch[1]), init);
    }

    const commentsMatch = pathname.match(/^\/api\/tickets\/(\d+)\/comments$/);
    if (commentsMatch && method === 'GET') {
      return handleListComments(Number(commentsMatch[1]), url);
    }

    if (commentsMatch && method === 'POST') {
      return handleCreateComment(Number(commentsMatch[1]), init);
    }

    const statusMatch = pathname.match(/^\/api\/tickets\/(\d+)\/status$/);
    if (statusMatch && method === 'PATCH') {
      return handleUpdateTicketStatus(Number(statusMatch[1]), init);
    }

    const notificationsMatch = pathname.match(/^\/api\/notifications\/(\d+)$/);
    if (notificationsMatch && method === 'GET') {
      return handleListNotifications(Number(notificationsMatch[1]));
    }

    const notificationReadMatch = pathname.match(/^\/api\/notifications\/(\d+)\/read$/);
    if (notificationReadMatch && method === 'POST') {
      return handleMarkNotificationAsRead(Number(notificationReadMatch[1]));
    }

    const tenantMatch = pathname.match(/^\/api\/tenants\/(\d+)$/);
    if (tenantMatch && method === 'PATCH') {
      return handleUpdateTenant(Number(tenantMatch[1]), init);
    }

    if (pathname === '/api/admin/sectors' && method === 'POST') {
      return handleAdminCreateSector(init);
    }

    if (pathname === '/api/admin/users' && method === 'POST') {
      return handleAdminCreateUser(init);
    }

    if (pathname === '/api/admin/users' && method === 'GET') {
      return handleAdminListUsers(url);
    }

    const adminSectorDeleteMatch = pathname.match(/^\/api\/admin\/sectors\/(\d+)$/);
    if (adminSectorDeleteMatch && method === 'DELETE') {
      return handleAdminDeleteSector(Number(adminSectorDeleteMatch[1]), url);
    }

    const adminUserDeleteMatch = pathname.match(/^\/api\/admin\/users\/(\d+)$/);
    if (adminUserDeleteMatch && method === 'DELETE') {
      return handleAdminDeleteUser(Number(adminUserDeleteMatch[1]), url);
    }

    return errorResponse('Not found', 404);
  } catch (error: any) {
    console.error('apiFetch error:', error);
    return errorResponse(error?.message || 'Internal Server Error', 500);
  }
}
