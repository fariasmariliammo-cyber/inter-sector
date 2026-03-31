create or replace function public.create_tenant_for_authenticated_user(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_full_name text := btrim(
    coalesce(
      auth.jwt() -> 'user_metadata' ->> 'full_name',
      auth.jwt() -> 'user_metadata' ->> 'name',
      split_part(v_email, '@', 1),
      'Usuario'
    )
  );
  v_tenant tenants%rowtype;
  v_sector sectors%rowtype;
  v_user users%rowtype;
  v_user_found boolean := false;
begin
  if auth.role() is distinct from 'authenticated' then
    raise exception 'Sessao autenticada nao encontrada.' using errcode = '42501';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'Nome da empresa e obrigatorio.' using errcode = '22023';
  end if;

  if v_email = '' then
    raise exception 'E-mail autenticado invalido.' using errcode = '22023';
  end if;

  select *
  into v_user
  from public.users
  where lower(email) = v_email
  limit 1;

  v_user_found := found;

  if v_user_found and v_user.tenant_id is not null then
    return jsonb_build_object(
      'id', v_user.id,
      'tenant_id', v_user.tenant_id,
      'sector_id', v_user.sector_id,
      'name', v_user.name,
      'email', v_user.email,
      'role', v_user.role,
      'theme', v_user.theme,
      'sector_name', null,
      'tenant_name', null
    );
  end if;

  insert into public.tenants (name)
  values (btrim(p_name))
  returning * into v_tenant;

  insert into public.sectors (tenant_id, name)
  values (v_tenant.id, 'Administracao')
  returning * into v_sector;

  insert into public.statuses (tenant_id, name, sequence)
  values
    (v_tenant.id, 'Aberto', 1),
    (v_tenant.id, 'Em Atendimento', 2),
    (v_tenant.id, 'Concluído', 3);

  if v_user_found and v_user.id is not null then
    update public.users
    set tenant_id = v_tenant.id,
        sector_id = v_sector.id,
        name = coalesce(v_user.name, v_full_name),
        role = 'admin'
    where id = v_user.id
    returning * into v_user;
  else
    insert into public.users (tenant_id, sector_id, name, email, role)
    values (v_tenant.id, v_sector.id, v_full_name, v_email, 'admin')
    returning * into v_user;
  end if;

  return jsonb_build_object(
    'id', v_user.id,
    'tenant_id', v_user.tenant_id,
    'sector_id', v_user.sector_id,
    'name', v_user.name,
    'email', v_user.email,
    'role', v_user.role,
    'theme', v_user.theme,
    'sector_name', v_sector.name,
    'tenant_name', v_tenant.name
  );
end;
$$;

grant execute on function public.create_tenant_for_authenticated_user(text) to authenticated;
