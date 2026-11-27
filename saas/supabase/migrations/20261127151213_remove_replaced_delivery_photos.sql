begin;

-- Only the recorder can remove a private file and only after a successor exists.
create policy delivery_file_delete_replaced on storage.objects
  for delete to authenticated using (
    bucket_id = 'delivery-evidence'
    and public.app_storage_insert(name)
    and exists (
      select 1 from public.delivery_evidence original
      join public.delivery_evidence replacement on replacement.replaces_id = original.id
      where original.storage_path = storage.objects.name
    )
  );

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
    'pending_photo_cleanup', case when d.created_by = auth.uid() and app_role() in ('gate', 'company_admin')
      then coalesce((
        select jsonb_agg(original.id)
        from delivery_evidence replacement
        join delivery_evidence original on original.id = replacement.replaces_id
        join storage.objects file on file.bucket_id = 'delivery-evidence' and file.name = original.storage_path
        where replacement.delivery_id = d.id
      ), '[]'::jsonb)
      else '[]'::jsonb end,
    'reviews', coalesce((
      select jsonb_agg(to_jsonb(r) - 'company_id' - 'site_id' order by r.created_at)
      from delivery_reviews r where r.delivery_id = d.id
    ), '[]'::jsonb)
  )
  from delivery_records d join materials m on m.id = d.material_id and m.company_id = d.company_id
  where d.id = p_id and app_can_read_delivery(d.id);
$$;

commit;
