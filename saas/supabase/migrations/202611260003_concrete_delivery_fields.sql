begin;

alter table public.delivery_records
  add column mix text check (mix is null or length(btrim(mix)) between 1 and 100);

-- Store the mix and ticket weight for new concrete movements.
create or replace function public.log_delivery(p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 c uuid:=app_company_id(); actor uuid:=auth.uid(); did uuid; sid uuid; mid uuid;
 mat uuid; sup uuid; intent text; material_name text; supplier_name_input text;
 selected text; mix_input text; tonnage_input numeric; corrected timestamptz; device_arrival timestamptz; reason text; stamp timestamptz:=now();
 d delivery_records; material_row materials; supplier_row suppliers; definition jsonb;
 direction_input text; canonical_name text; lookup_key text; snapshot jsonb;
begin
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Delivery object required' using errcode='22023'; end if;
 did:=(p_input->>'id')::uuid; sid:=(p_input->>'site_id')::uuid; mid:=(p_input->>'marshal_id')::uuid;
 if c is null or did is null or app_can_record_as(c,sid,mid) is not true then
  raise exception 'You may only record as an authorised marshal at your assigned site' using errcode='42501';
 end if;
 if p_input->>'capture_kind' is distinct from 'arrival' then
  if p_input ? 'direction' then raise exception 'Direction requires the movement form' using errcode='22023'; end if;
  return log_delivery_legacy(p_input);
 end if;
 direction_input:=coalesce(p_input->>'direction','IN');
 if (p_input ? 'direction' and jsonb_typeof(p_input->'direction') is distinct from 'string')
   or direction_input not in ('IN','OUT') then
  raise exception 'Choose IN or OUT' using errcode='22023';
 end if;
 intent:=p_input->>'intent';
 if intent is null or intent not in ('draft','submit') then raise exception 'Invalid delivery intent' using errcode='22023'; end if;
 if p_input ? 'version' and (jsonb_typeof(p_input->'version') is distinct from 'number' or coalesce(p_input->>'version','') !~ '^[1-9][0-9]{0,8}$') then
  raise exception 'A positive integer version is required' using errcode='22023';
 end if;
 if p_input ? 'custom_item_name' then
  if jsonb_typeof(p_input->'custom_item_name') is distinct from 'string' then raise exception 'New material must be text' using errcode='22023'; end if;
  material_name:=p_input->>'custom_item_name';
  if length(material_name) not between 1 and 160 or app_normalise_name(material_name)='' then raise exception 'Enter a material name up to 160 characters' using errcode='22023'; end if;
 else
  mat:=nullif(p_input->>'material_id','')::uuid;
  if mat is null then raise exception 'Choose a material or enter a new one' using errcode='22023'; end if;
 end if;
 selected:=nullif(p_input->>'selected_category','');
 if selected is not null and selected not in ('Aggregates / Sands','Concrete','Other Materials','Services') then raise exception 'Select a valid category' using errcode='22023'; end if;
 if p_input ? 'custom_supplier_name' then
  if jsonb_typeof(p_input->'custom_supplier_name') is distinct from 'string' then raise exception 'New supplier must be text' using errcode='22023'; end if;
  supplier_name_input:=p_input->>'custom_supplier_name';
  if length(supplier_name_input) not between 1 and 200 or app_normalise_name(supplier_name_input)='' then raise exception 'Enter a supplier name up to 200 characters' using errcode='22023'; end if;
 else
  sup:=nullif(p_input->>'supplier_id','')::uuid;
  if sup is null and nullif(trim(p_input->>'supplier_name'),'') is not null then
   if jsonb_typeof(p_input->'supplier_name') is distinct from 'string' then raise exception 'Supplier must be text' using errcode='22023'; end if;
   supplier_name_input:=p_input->>'supplier_name';
   if length(supplier_name_input)>200 or app_normalise_name(supplier_name_input)='' then raise exception 'Enter a supplier name up to 200 characters' using errcode='22023'; end if;
  end if;
 end if;
 reason:=trim(coalesce(p_input->>'correction_reason',''));
 if length(reason)>500 or (p_input ? 'correction_reason' and jsonb_typeof(p_input->'correction_reason') is distinct from 'string') then raise exception 'Correction reason must be at most 500 characters' using errcode='22023'; end if;
 if nullif(p_input->>'corrected_arrival_at','') is not null then
  if jsonb_typeof(p_input->'corrected_arrival_at') is distinct from 'string' then raise exception 'Corrected time must be text' using errcode='22023'; end if;
  corrected:=(p_input->>'corrected_arrival_at')::timestamptz;
  if corrected is null or not isfinite(corrected) or corrected>stamp+interval '5 minutes' or reason='' then
   raise exception 'A valid corrected time and explanation are required' using errcode='22023';
  end if;
 elsif reason<>'' then raise exception 'Choose the time being corrected' using errcode='22023';
 end if;
 if corrected is null and p_input ? 'device_arrival_at' then
  if jsonb_typeof(p_input->'device_arrival_at') is distinct from 'string' then
   raise exception 'Automatic delivery time must be text' using errcode='22023';
  end if;
  device_arrival:=(p_input->>'device_arrival_at')::timestamptz;
  if not isfinite(device_arrival) then
   raise exception 'Valid automatic delivery time required' using errcode='22023';
  end if;
 end if;
 if p_input ? 'mix' or p_input ? 'tonnage' then
  if selected is distinct from 'Concrete' then raise exception 'Mix and tonnage are only used for concrete' using errcode='22023'; end if;
  if p_input ? 'mix' then
   if jsonb_typeof(p_input->'mix') is distinct from 'string' then raise exception 'Concrete mix must be text' using errcode='22023'; end if;
   mix_input:=trim(p_input->>'mix');
   if length(mix_input) not between 1 and 100 then raise exception 'Enter a concrete mix of up to 100 characters' using errcode='22023'; end if;
  end if;
  if p_input ? 'tonnage' then
   if jsonb_typeof(p_input->'tonnage') is distinct from 'number' then raise exception 'Concrete tonnage must be a number' using errcode='22023'; end if;
   tonnage_input:=(p_input->>'tonnage')::numeric;
   if tonnage_input<=0 or tonnage_input>1000000000 or trunc(tonnage_input,3)<>tonnage_input then
    raise exception 'Tonnage must be positive, with at most 3 decimal places' using errcode='22023';
   end if;
  end if;
 end if;
 snapshot:=jsonb_build_object('site_id',sid,'marshal_id',mid,'material_id',mat,'custom_item_name',material_name,
  'supplier_id',sup,'custom_supplier_name',supplier_name_input,'selected_category',selected,
  'corrected_arrival_at',corrected,'correction_reason',reason);
 -- Preserve the exact snapshot shape for drafts created before device time was recorded.
 if device_arrival is not null then
  snapshot:=snapshot||jsonb_build_object('device_arrival_at',device_arrival);
 end if;
 if mix_input is not null then snapshot:=snapshot||jsonb_build_object('mix',mix_input); end if;
 if tonnage_input is not null then snapshot:=snapshot||jsonb_build_object('tonnage',tonnage_input); end if;
 perform pg_advisory_xact_lock(hashtextextended(did::text,0));
 select * into d from delivery_records where id=did for update;
 if found then
  if d.company_id is distinct from c or d.site_id is distinct from sid or d.created_by is distinct from actor then raise exception 'Delivery does not belong to you' using errcode='42501'; end if;
  if d.capture_mode<>'simple' or d.direction is distinct from direction_input or d.capture_input is distinct from snapshot then raise exception 'This save ID contains different delivery details. Retry the original save.' using errcode='23505'; end if;
  if d.submitted_at is not null or intent='draft' then return jsonb_build_object('delivery',app_delivery_json(did)); end if;
  if d.status<>'Draft' then raise exception 'This delivery cannot be submitted' using errcode='22023'; end if;
  if not(p_input ? 'version') or d.version is distinct from (p_input->>'version')::integer then raise exception 'Record changed. Refresh before saving.' using errcode='40001'; end if;
  if not exists(select 1 from delivery_evidence e join storage.objects o on o.bucket_id='delivery-evidence' and o.name=e.storage_path where e.delivery_id=did) then
   raise exception 'Upload a delivery image before saving' using errcode='22023';
  end if;
  update delivery_records set status='Submitted',submitted_at=stamp,updated_at=stamp,version=version+1 where id=did;
  return jsonb_build_object('delivery',app_delivery_json(did));
 end if;
 if intent<>'draft' then raise exception 'Save the draft and upload a delivery image first' using errcode='22023'; end if;
 if sup is null and supplier_name_input is null then
  raise exception 'Choose a supplier or enter a new supplier name' using errcode='22023';
 end if;
 if selected='Concrete' and (mix_input is null or tonnage_input is null) then
  raise exception 'Enter the concrete mix and tonnage' using errcode='22023';
 end if;
 if material_name is not null then
  definition:=app_material_definition(material_name);
  canonical_name:=coalesce(definition->>'name',trim(material_name));
  lookup_key:=app_normalise_name(canonical_name);
  perform pg_advisory_xact_lock(hashtextextended(c::text||':materials:'||lookup_key,8));
  select * into material_row from materials where company_id=c and normalised_name in(app_normalise_name(material_name),lookup_key)
    order by (normalised_name=app_normalise_name(material_name)) desc,id limit 1;
  if not found then
   insert into materials(company_id,name,normalised_name,category,entry_type,approval_status,synonyms,capture_hidden,created_by)
   values(c,canonical_name,lookup_key,coalesce(definition->>'category','Pending classification'),
    coalesce(definition->>'entry_type','Pending review'),case when definition is null then 'Pending' else 'Approved' end,
    array(select jsonb_array_elements_text(coalesce(definition->'synonyms','[]'::jsonb))),false,actor) returning * into material_row;
  end if;
  mat:=material_row.id;
 else select * into material_row from materials where id=mat and company_id=c;
 end if;
 if material_row.id is null or not material_row.active then raise exception 'Material is unavailable' using errcode='22023'; end if;
 if material_name is not null and material_row.capture_hidden then update materials set capture_hidden=false where id=mat returning * into material_row; end if;
 if supplier_name_input is not null then
  lookup_key:=app_normalise_name(supplier_name_input);
  perform pg_advisory_xact_lock(hashtextextended(c::text||':suppliers:'||lookup_key,8));
  select * into supplier_row from suppliers where company_id=c and normalised_name=lookup_key order by id limit 1;
  if not found then
   insert into suppliers(company_id,name,normalised_name,created_by) values(c,trim(supplier_name_input),lookup_key,actor) returning * into supplier_row;
  end if;
  sup:=supplier_row.id;
 elsif sup is not null then select * into supplier_row from suppliers where id=sup and company_id=c;
 end if;
 if sup is not null and (supplier_row.id is null or not supplier_row.active) then raise exception 'Supplier is unavailable' using errcode='22023'; end if;
 insert into delivery_records(id,company_id,site_id,material_id,supplier_id,vehicle,ticket_number,ticket_quantity,ticket_unit,
  arrival_at,recorded_at,created_by,creator_name,notes,status,marshal_id,marshal_name,supplier_name,capture_mode,
  item_name,category,entry_type,catalogue_status,selected_category,correction_reason,capture_input,direction,mix)
 values(did,c,sid,mat,sup,'','',tonnage_input,case when tonnage_input is null then 'loads' else 'tonnes' end,coalesce(corrected,case when device_arrival<=stamp+interval '5 minutes' then device_arrival end,stamp),stamp,actor,
  (select name from user_profiles where id=actor),'','Draft',mid,(select name from traffic_marshals where id=mid),
  coalesce(supplier_name_input,supplier_row.name,''),'simple',coalesce(material_name,material_row.name),
  material_row.category,
  material_row.entry_type,material_row.approval_status,selected,reason,snapshot,direction_input,mix_input);
 return jsonb_build_object('delivery',app_delivery_json(did));
end $$;

commit;
