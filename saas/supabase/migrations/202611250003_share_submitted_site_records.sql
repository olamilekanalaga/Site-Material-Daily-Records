-- Share submitted deliveries and their evidence within the assigned site.
-- The existing edit and storage write policies still enforce recorder ownership.
create or replace function public.app_can_read_delivery(p_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists (
    select 1
    from public.delivery_records d
    where d.id = p_id
      and public.app_can_site(d.company_id, d.site_id)
      and (
        public.app_role() <> 'gate'
        or d.created_by = (select auth.uid())
        or (d.submitted_at is not null and d.status <> 'Draft')
      )
  )
$$;
