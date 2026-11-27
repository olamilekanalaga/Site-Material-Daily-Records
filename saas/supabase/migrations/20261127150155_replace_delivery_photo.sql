begin;

-- Keep both private files and give each photo at most one successor.
alter table public.delivery_evidence
  add column replaces_id uuid unique references public.delivery_evidence(id),
  add constraint evidence_replacement_is_new check (replaces_id <> id);

create function public.app_can_replace_delivery_photo(p_delivery_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from delivery_records d
    where d.id = p_delivery_id
      and d.created_by = auth.uid()
      and d.submitted_at is not null
      and app_can_site(d.company_id, d.site_id)
      and app_role() in ('gate', 'company_admin')
      and exists (select 1 from delivery_evidence e where e.delivery_id = d.id)
  );
$$;
revoke all on function public.app_can_replace_delivery_photo(uuid) from public, anon, authenticated;

create or replace function public.app_storage_insert(p_name text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  parts text[] := string_to_array(p_name, '/');
  d delivery_records;
begin
  if array_length(parts, 1) <> 4 then return false; end if;
  perform parts[4]::uuid;
  select * into d from delivery_records
    where id = parts[3]::uuid and company_id = parts[1]::uuid and site_id = parts[2]::uuid;
  return found and (app_can_edit_delivery(d.id) or app_can_replace_delivery_photo(d.id));
exception when invalid_text_representation then return false;
end;
$$;

create or replace function public.app_delivery_json(p_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select to_jsonb(d) || jsonb_build_object(
    'category', case when m.approval_status = 'Approved' then m.category else d.category end,
    'entry_type', case when m.approval_status = 'Approved' then m.entry_type else coalesce(d.entry_type, 'Pending review') end,
    'catalogue_status', m.approval_status,
    'evidence', coalesce((
      select jsonb_agg(to_jsonb(e) - 'company_id' - 'site_id' - 'storage_path' - 'created_by' - 'sha256'
        order by (e.replaces_id is not null) desc,
          case when e.replaces_id is not null then e.created_at end desc, e.created_at, e.id)
      from delivery_evidence e
      where e.delivery_id = d.id
        and not exists (select 1 from delivery_evidence replacement where replacement.replaces_id = e.id)
    ), '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(to_jsonb(r) - 'company_id' - 'site_id' order by r.created_at)
      from delivery_reviews r where r.delivery_id = d.id
    ), '[]'::jsonb)
  )
  from delivery_records d join materials m on m.id = d.material_id and m.company_id = d.company_id
  where d.id = p_id and app_can_read_delivery(d.id);
$$;

create or replace function public.register_evidence(p_delivery_id uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d delivery_records;
  e delivery_evidence;
  eid uuid := (p_input->>'id')::uuid;
  previous_id uuid := (p_input->>'replaces_id')::uuid;
  file_size integer := (p_input->>'size')::integer;
  path text;
begin
  select * into d from delivery_records where id = p_delivery_id for update;
  if previous_id is null and (not found or app_can_edit_delivery(p_delivery_id) is not true) then
    raise exception 'Evidence upload is not permitted' using errcode = '42501';
  elsif previous_id is not null and (not found or app_can_replace_delivery_photo(p_delivery_id) is not true) then
    raise exception 'You can only change photos on your own deliveries' using errcode = '42501';
  end if;
  path := d.company_id::text || '/' || d.site_id::text || '/' || d.id::text || '/' || eid::text;
  if p_input->>'storage_path' is distinct from path then
    raise exception 'Invalid evidence path' using errcode = '22023';
  end if;

  select * into e from delivery_evidence where id = eid;
  if found then
    if e.delivery_id is distinct from d.id or e.replaces_id is distinct from previous_id
      or e.size is distinct from file_size or e.mime is distinct from p_input->>'mime'
      or e.kind is distinct from p_input->>'kind' or e.name is distinct from left(p_input->>'name', 200)
      or e.sha256 is distinct from p_input->>'sha256' then
      raise exception 'Evidence ID already exists' using errcode = '22023';
    end if;
    if previous_id is not null then return jsonb_build_object('delivery', app_delivery_json(d.id)); end if;
    return to_jsonb(e) - 'company_id' - 'site_id' - 'storage_path' - 'created_by' - 'sha256';
  end if;

  if previous_id is not null then
    if file_size is null or file_size not between 1 and 500000 then
      raise exception 'Replacement photos must be 500 KB or less' using errcode = '22023';
    end if;
    if not exists (select 1 from delivery_evidence old where old.id = previous_id
      and old.delivery_id = d.id and old.kind = p_input->>'kind') then
      raise exception 'Photo does not belong to this delivery' using errcode = '22023';
    end if;
    if exists (select 1 from delivery_evidence replacement where replacement.replaces_id = previous_id) then
      raise exception 'This photo has already been replaced. Open the latest photo and try again.' using errcode = '40001';
    end if;
  end if;

  if not exists (select 1 from storage.objects where bucket_id = 'delivery-evidence' and name = path
    and (previous_id is null or metadata->>'size' = file_size::text)) then
    raise exception 'Upload the private file before registering evidence' using errcode = '22023';
  end if;
  insert into delivery_evidence(id, company_id, site_id, delivery_id, kind, name, mime, size, storage_path, sha256, created_by, replaces_id)
  values(eid, d.company_id, d.site_id, d.id, p_input->>'kind', left(p_input->>'name', 200), p_input->>'mime',
    file_size, path, p_input->>'sha256', auth.uid(), previous_id) returning * into e;

  if previous_id is not null then
    update delivery_records set updated_at = now(), version = version + 1 where id = d.id;
    return jsonb_build_object('delivery', app_delivery_json(d.id));
  end if;
  return to_jsonb(e) - 'company_id' - 'site_id' - 'storage_path' - 'created_by' - 'sha256';
end;
$$;

commit;
