-- Additive live logging integration. Apply after the two existing pilot migrations.
-- No companies, people, arrivals, evidence or historical rows are removed/renamed.
begin;

create or replace function public.app_normalise_name(p_name text) returns text
language sql immutable set search_path=public,pg_temp as $$
 select lower(regexp_replace(normalize(coalesce(p_name,''),NFKD),'[^[:alnum:]]','','g'))
$$;

-- Versioned canonical mappings mirror src/lib/catalogue.ts. Unknown names never
-- inherit a guessed category/type; aliases use exact normalisation only.
create or replace function public.app_material_definitions() returns jsonb
language sql immutable set search_path=public,pg_temp as $$
 select $catalogue$[{"name":"6F5","normalised_name":"6f5","category":"Aggregates / Sands","entry_type":"Delivery","synonyms":["6 f5","6f 5"],"capture_hidden":false},{"name":"Type 1","normalised_name":"type1","category":"Aggregates / Sands","entry_type":"Delivery","synonyms":["type1","type one"],"capture_hidden":false},{"name":"Type 2","normalised_name":"type2","category":"Aggregates / Sands","entry_type":"Delivery","synonyms":["type2","type two"],"capture_hidden":false},{"name":"MOT Type 1","normalised_name":"mottype1","category":"Aggregates / Sands","entry_type":"Delivery","synonyms":["mot type1","mot1"],"capture_hidden":false},{"name":"Sand","normalised_name":"sand","category":"Aggregates / Sands","entry_type":"Delivery","synonyms":[],"capture_hidden":false},{"name":"Building sand","normalised_name":"buildingsand","category":"Aggregates / Sands","entry_type":"Delivery","synonyms":[],"capture_hidden":false},{"name":"Sharp sand","normalised_name":"sharpsand","category":"Aggregates / Sands","entry_type":"Delivery","synonyms":[],"capture_hidden":false},{"name":"10mm shingles","normalised_name":"10mmshingles","category":"Aggregates / Sands","entry_type":"Delivery","synonyms":["10 mm","10mm","10mm shingle","10 mil shingle","10 mill shingles"],"capture_hidden":false},{"name":"20mm shingles","normalised_name":"20mmshingles","category":"Aggregates / Sands","entry_type":"Delivery","synonyms":["20 mm","20mm","20mm shingle","20 mil shingle","20 mill shingles"],"capture_hidden":false},{"name":"Gravel","normalised_name":"gravel","category":"Aggregates / Sands","entry_type":"Delivery","synonyms":[],"capture_hidden":false},{"name":"Crushed stone","normalised_name":"crushedstone","category":"Aggregates / Sands","entry_type":"Delivery","synonyms":[],"capture_hidden":false},{"name":"Hardcore","normalised_name":"hardcore","category":"Aggregates / Sands","entry_type":"Delivery","synonyms":[],"capture_hidden":false},{"name":"Ballast","normalised_name":"ballast","category":"Aggregates / Sands","entry_type":"Delivery","synonyms":[],"capture_hidden":false},{"name":"Ready-mix concrete","normalised_name":"readymixconcrete","category":"Aggregates / Sands","entry_type":"Delivery","synonyms":["readymix","ready mixed concrete","ready mix"],"capture_hidden":false},{"name":"Concrete","normalised_name":"concrete","category":"Aggregates / Sands","entry_type":"Delivery","synonyms":[],"capture_hidden":false},{"name":"Concrete blocks","normalised_name":"concreteblocks","category":"Aggregates / Sands","entry_type":"Delivery","synonyms":[],"capture_hidden":false},{"name":"Precast concrete","normalised_name":"precastconcrete","category":"Aggregates / Sands","entry_type":"Delivery","synonyms":[],"capture_hidden":false},{"name":"Cement","normalised_name":"cement","category":"Aggregates / Sands","entry_type":"Delivery","synonyms":[],"capture_hidden":false},{"name":"Mortar","normalised_name":"mortar","category":"Aggregates / Sands","entry_type":"Delivery","synonyms":[],"capture_hidden":false},{"name":"Timber","normalised_name":"timber","category":"Other Materials","entry_type":"Delivery","synonyms":["wood","lumber"],"capture_hidden":true},{"name":"Plywood","normalised_name":"plywood","category":"Other Materials","entry_type":"Delivery","synonyms":["ply wood","ply"],"capture_hidden":true},{"name":"Wooden boards","normalised_name":"woodenboards","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Timber beams","normalised_name":"timberbeams","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Wooden pallets","normalised_name":"woodenpallets","category":"Other Materials","entry_type":"Delivery","synonyms":["wood pallets","pallets"],"capture_hidden":true},{"name":"Formwork timber","normalised_name":"formworktimber","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Diesel","normalised_name":"diesel","category":"Services","entry_type":"Delivery","synonyms":["deisel","desiel","deseil"],"capture_hidden":true},{"name":"Petrol","normalised_name":"petrol","category":"Services","entry_type":"Delivery","synonyms":["gasoline"],"capture_hidden":true},{"name":"HVO fuel","normalised_name":"hvofuel","category":"Services","entry_type":"Delivery","synonyms":["hvo"],"capture_hidden":true},{"name":"AdBlue","normalised_name":"adblue","category":"Services","entry_type":"Delivery","synonyms":["ad blue"],"capture_hidden":true},{"name":"Fuel delivery","normalised_name":"fueldelivery","category":"Services","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Excavator","normalised_name":"excavator","category":"Other Materials","entry_type":"Delivery","synonyms":["digger"],"capture_hidden":true},{"name":"Dumper","normalised_name":"dumper","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Roller","normalised_name":"roller","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Telehandler","normalised_name":"telehandler","category":"Other Materials","entry_type":"Delivery","synonyms":["tele handler","telescopic handler"],"capture_hidden":true},{"name":"Generator","normalised_name":"generator","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Compressor","normalised_name":"compressor","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Machinery delivery","normalised_name":"machinerydelivery","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Tools","normalised_name":"tools","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Site equipment","normalised_name":"siteequipment","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Portable toilet","normalised_name":"portabletoilet","category":"Services","entry_type":"Delivery","synonyms":["portaloo","portable loo","site toilet"],"capture_hidden":true},{"name":"Welfare cabin","normalised_name":"welfarecabin","category":"Services","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Water tank","normalised_name":"watertank","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Storage container","normalised_name":"storagecontainer","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Site cabin","normalised_name":"sitecabin","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Temporary fencing","normalised_name":"temporaryfencing","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Road sweeper","normalised_name":"roadsweeper","category":"Services","entry_type":"Service visit","synonyms":["sweeper","road sweeping"],"capture_hidden":true},{"name":"Toilet servicing","normalised_name":"toiletservicing","category":"Services","entry_type":"Service visit","synonyms":["toilet service","portaloo servicing","toilet wash"],"capture_hidden":true},{"name":"Toilet cleaning","normalised_name":"toiletcleaning","category":"Services","entry_type":"Service visit","synonyms":["toilet clean","portaloo cleaning"],"capture_hidden":true},{"name":"Plant maintenance","normalised_name":"plantmaintenance","category":"Services","entry_type":"Service visit","synonyms":[],"capture_hidden":true},{"name":"Equipment servicing","normalised_name":"equipmentservicing","category":"Services","entry_type":"Service visit","synonyms":[],"capture_hidden":true},{"name":"Site cleaning","normalised_name":"sitecleaning","category":"Services","entry_type":"Service visit","synonyms":[],"capture_hidden":true},{"name":"Waste skip","normalised_name":"wasteskip","category":"Other Materials","entry_type":"Delivery","synonyms":["skip"],"capture_hidden":true},{"name":"Waste bin","normalised_name":"wastebin","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Wheelie bin","normalised_name":"wheeliebin","category":"Other Materials","entry_type":"Delivery","synonyms":["wheeliebin","wheeled bin"],"capture_hidden":true},{"name":"Empty skip delivery","normalised_name":"emptyskipdelivery","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Drainage pipes","normalised_name":"drainagepipes","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Manhole","normalised_name":"manhole","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Ducting","normalised_name":"ducting","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Drainage channels","normalised_name":"drainagechannels","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Pipe fittings","normalised_name":"pipefittings","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Water pipes","normalised_name":"waterpipes","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Bricks","normalised_name":"bricks","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Reinforcement steel","normalised_name":"reinforcementsteel","category":"Other Materials","entry_type":"Delivery","synonyms":["reinforcing steel"],"capture_hidden":true},{"name":"Rebar","normalised_name":"rebar","category":"Other Materials","entry_type":"Delivery","synonyms":["re bar","reinforcing bar"],"capture_hidden":true},{"name":"Steel mesh","normalised_name":"steelmesh","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Barriers","normalised_name":"barriers","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Fencing","normalised_name":"fencing","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"PPE","normalised_name":"ppe","category":"Other Materials","entry_type":"Delivery","synonyms":["personal protective equipment","protective equipment"],"capture_hidden":true},{"name":"General building supplies","normalised_name":"generalbuildingsupplies","category":"Other Materials","entry_type":"Delivery","synonyms":[],"capture_hidden":true},{"name":"Pipes","normalised_name":"pipes","category":"Other Materials","entry_type":"Delivery","synonyms":["pipe"],"capture_hidden":false},{"name":"Cables","normalised_name":"cables","category":"Other Materials","entry_type":"Delivery","synonyms":["cable","electrical cable","electrical cables"],"capture_hidden":false},{"name":"Fuel","normalised_name":"fuel","category":"Services","entry_type":"Delivery","synonyms":[],"capture_hidden":false},{"name":"Toilets","normalised_name":"toilets","category":"Services","entry_type":"Delivery","synonyms":["toilet"],"capture_hidden":false},{"name":"Welfare","normalised_name":"welfare","category":"Services","entry_type":"Delivery","synonyms":[],"capture_hidden":false}]$catalogue$::jsonb
$$;
create or replace function public.app_material_definition(p_name text) returns jsonb
language sql immutable set search_path=public,pg_temp as $$
 select value from jsonb_array_elements(app_material_definitions())
 where value->>'normalised_name'=app_normalise_name(p_name)
 or exists(select 1 from jsonb_array_elements_text(value->'synonyms') a
           where app_normalise_name(a)=app_normalise_name(p_name))
 order by (value->>'normalised_name'=app_normalise_name(p_name)) desc limit 1
$$;

alter table public.materials
 add column if not exists normalised_name text,
 add column if not exists category text,
 add column if not exists entry_type text,
 add column if not exists approval_status text,
 add column if not exists synonyms text[],
 add column if not exists capture_hidden boolean,
 add column if not exists created_by uuid references public.user_profiles(id),
 add column if not exists created_at timestamptz;
alter table public.suppliers
 add column if not exists normalised_name text,
 add column if not exists created_by uuid references public.user_profiles(id),
 add column if not exists created_at timestamptz;
-- Widen existing limits to match validated manual-entry fields; old rows remain valid.
alter table public.materials drop constraint if exists materials_name_check;
alter table public.materials add constraint materials_name_check check(length(name) between 1 and 160);
alter table public.suppliers drop constraint if exists suppliers_name_check;
alter table public.suppliers add constraint suppliers_name_check check(length(name) between 1 and 200);
update public.materials m set
 normalised_name=app_normalise_name(m.name),
 category=coalesce(m.category,app_material_definition(m.name)->>'category','Pending classification'),
 entry_type=coalesce(m.entry_type,app_material_definition(m.name)->>'entry_type','Pending review'),
 approval_status=coalesce(m.approval_status,case when app_material_definition(m.name) is null then 'Pending' else 'Approved' end),
 synonyms=coalesce(m.synonyms,array(select jsonb_array_elements_text(coalesce(app_material_definition(m.name)->'synonyms','[]'::jsonb)))),
 capture_hidden=coalesce(m.capture_hidden,(app_material_definition(m.name)->>'capture_hidden')::boolean,false)
 where m.normalised_name is null or m.category is null or m.entry_type is null
 or m.approval_status is null or m.synonyms is null or m.capture_hidden is null;
update public.suppliers set normalised_name=app_normalise_name(name) where normalised_name is null;
alter table public.materials
 alter column normalised_name set not null,
 alter column category set default 'Pending classification', alter column category set not null,
 alter column entry_type set default 'Pending review', alter column entry_type set not null,
 alter column approval_status set default 'Pending', alter column approval_status set not null,
 alter column synonyms set default '{}', alter column synonyms set not null,
 alter column capture_hidden set default false, alter column capture_hidden set not null,
 alter column created_at set default now();
alter table public.suppliers alter column normalised_name set not null, alter column created_at set default now();
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.materials'::regclass and conname='material_live_classification') then
  alter table public.materials add constraint material_live_classification check(
   category in ('Aggregates / Sands','Other Materials','Services','Pending classification')
   and entry_type in ('Delivery','Service visit','Pending review') and approval_status in ('Approved','Pending')
   and (approval_status<>'Approved' or (category<>'Pending classification' and entry_type<>'Pending review')));
 end if;
end $$;
-- Existing case/spacing duplicates are retained, not merged. New writes serialize
-- by normalized name and reject new duplicates, even through legacy admin RPCs.
create index if not exists material_normalised_lookup on public.materials(company_id,normalised_name,id);
create index if not exists supplier_normalised_lookup on public.suppliers(company_id,normalised_name,id);
create or replace function public.app_catalogue_normalise() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare duplicate_exists boolean;
begin
 new.normalised_name:=app_normalise_name(new.name);
 if new.normalised_name='' then raise exception 'Name must contain letters or numbers' using errcode='22023'; end if;
 if TG_OP='INSERT' or new.name is distinct from old.name then
  perform pg_advisory_xact_lock(hashtextextended(new.company_id::text||':'||TG_TABLE_NAME||':'||new.normalised_name,8));
  execute format('select exists(select 1 from public.%I where company_id=$1 and normalised_name=$2 and id<>$3)',TG_TABLE_NAME)
   into duplicate_exists using new.company_id,new.normalised_name,new.id;
  if duplicate_exists then raise exception 'This name already exists in the company catalogue' using errcode='23505'; end if;
 end if;
 return new;
end $$;
drop trigger if exists live_material_normalise on public.materials;
create trigger live_material_normalise before insert or update of name on public.materials for each row execute function public.app_catalogue_normalise();
drop trigger if exists live_supplier_normalise on public.suppliers;
create trigger live_supplier_normalise before insert or update of name on public.suppliers for each row execute function public.app_catalogue_normalise();

-- Only a trusted operator seeds reference options. This creates no sample company,
-- employee, supplier or delivery. Repeat calls retain existing names and IDs.
create or replace function public.app_seed_company_catalogue(p_company uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare item jsonb; inserted_count integer:=0;
begin
 if not exists(select 1 from companies where id=p_company) then raise exception 'Company not found' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(app_material_definitions()) loop
  perform pg_advisory_xact_lock(hashtextextended(p_company::text||':materials:'||(item->>'normalised_name'),8));
  if not exists(select 1 from materials where company_id=p_company and normalised_name=item->>'normalised_name') then
   insert into materials(company_id,name,normalised_name,category,entry_type,approval_status,synonyms,capture_hidden,created_by)
   values(p_company,item->>'name',item->>'normalised_name',item->>'category',item->>'entry_type','Approved',
     array(select jsonb_array_elements_text(item->'synonyms')),(item->>'capture_hidden')::boolean,auth.uid());
   inserted_count:=inserted_count+1;
  end if;
 end loop;
 return jsonb_build_object('inserted',inserted_count);
end $$;

alter table public.traffic_marshals
 add column if not exists user_id uuid,
 add column if not exists photo_path text;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.traffic_marshals'::regclass and conname='marshal_membership_fk') then
  alter table public.traffic_marshals add constraint marshal_membership_fk foreign key(company_id,user_id) references public.company_memberships(company_id,user_id);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.traffic_marshals'::regclass and conname='marshal_private_photo_path') then
  alter table public.traffic_marshals add constraint marshal_private_photo_path check(photo_path is null or
   (photo_path like company_id::text||'/'||site_id::text||'/'||id::text||'/%'
    and array_length(string_to_array(photo_path,'/'),1)=4 and length(photo_path)<=300));
 end if;
end $$;
-- Never guess an account binding when people or cards share the same name.
with candidates as (
 select t.id, t.company_id,t.site_id,m.user_id,
  count(*) over(partition by t.id) name_matches,
  count(*) over(partition by t.company_id,t.site_id,m.user_id) card_matches
 from traffic_marshals t
 join company_memberships m on m.company_id=t.company_id and m.role='gate'
 join site_assignments a on a.company_id=m.company_id and a.user_id=m.user_id and a.site_id=t.site_id
 join user_profiles p on p.id=m.user_id
 where t.user_id is null and lower(trim(t.name))=lower(trim(p.name))
)
update traffic_marshals t set user_id=c.user_id from candidates c
 where t.id=c.id and c.name_matches=1 and c.card_matches=1;
create unique index if not exists marshal_one_card_per_site_user on traffic_marshals(company_id,site_id,user_id) where user_id is not null;
create or replace function public.app_can_record_as(p_company uuid,p_site uuid,p_marshal uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(app_can_site(p_company,p_site) and app_role() in ('gate','company_admin')
 and exists(select 1 from traffic_marshals m where m.id=p_marshal and m.company_id=p_company and m.site_id=p_site and m.active
 and (app_role()='company_admin' or m.user_id=auth.uid())),false)
$$;

alter table public.delivery_records
 add column if not exists item_name text check(item_name is null or length(item_name) between 1 and 160),
 add column if not exists category text,
 add column if not exists entry_type text,
 add column if not exists catalogue_status text,
 add column if not exists selected_category text,
 add column if not exists recorded_at timestamptz,
 add column if not exists correction_reason text not null default '' check(length(correction_reason)<=500),
 add column if not exists capture_input jsonb;
-- An unknown supplier is represented by an empty snapshot, never an invented company.
alter table public.delivery_records drop constraint if exists delivery_records_supplier_name_check;
alter table public.delivery_records add constraint delivery_records_supplier_name_check
 check(supplier_name is null or length(trim(supplier_name)) between 0 and 200);
create index if not exists delivery_recorded_at on public.delivery_records(company_id,site_id,recorded_at desc);

-- Keep the original endpoint implementation for old saved drafts, but remove its
-- direct grant so the ownership check in the new wrapper cannot be bypassed.
do $$ begin
 if to_regprocedure('public.log_delivery_legacy(jsonb)') is null then
  alter function public.log_delivery(jsonb) rename to log_delivery_legacy;
 end if;
end $$;
revoke all on function public.log_delivery_legacy(jsonb) from public,anon,authenticated;

create or replace function public.log_delivery(p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 c uuid:=app_company_id(); actor uuid:=auth.uid(); did uuid; sid uuid; mid uuid;
 mat uuid; sup uuid; intent text; material_name text; supplier_name_input text;
 selected text; corrected timestamptz; reason text; stamp timestamptz:=now();
 d delivery_records; material_row materials; supplier_row suppliers; definition jsonb;
 canonical_name text; lookup_key text; snapshot jsonb;
begin
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Delivery object required' using errcode='22023'; end if;
 did:=(p_input->>'id')::uuid; sid:=(p_input->>'site_id')::uuid; mid:=(p_input->>'marshal_id')::uuid;
 if c is null or did is null or app_can_record_as(c,sid,mid) is not true then
  raise exception 'You may only record as an authorised marshal at your assigned site' using errcode='42501';
 end if;
 if p_input->>'capture_kind' is distinct from 'arrival' then return log_delivery_legacy(p_input); end if;
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
 if selected is not null and selected not in ('Aggregates / Sands','Other Materials','Services') then raise exception 'Select a valid category' using errcode='22023'; end if;
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
 snapshot:=jsonb_build_object('site_id',sid,'marshal_id',mid,'material_id',mat,'custom_item_name',material_name,
  'supplier_id',sup,'custom_supplier_name',supplier_name_input,'selected_category',selected,
  'corrected_arrival_at',corrected,'correction_reason',reason);
 perform pg_advisory_xact_lock(hashtextextended(did::text,0));
 select * into d from delivery_records where id=did for update;
 if found then
  if d.company_id is distinct from c or d.site_id is distinct from sid or d.created_by is distinct from actor then raise exception 'Delivery does not belong to you' using errcode='42501'; end if;
  if d.capture_mode<>'simple' or d.capture_input is distinct from snapshot then raise exception 'This save ID contains different delivery details. Retry the original save.' using errcode='23505'; end if;
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
  item_name,category,entry_type,catalogue_status,selected_category,correction_reason,capture_input)
 values(did,c,sid,mat,sup,'','',null,'loads',coalesce(corrected,stamp),stamp,actor,
  (select name from user_profiles where id=actor),'','Draft',mid,(select name from traffic_marshals where id=mid),
  coalesce(supplier_name_input,supplier_row.name,''),'simple',coalesce(material_name,material_row.name),
  material_row.category,
  material_row.entry_type,material_row.approval_status,selected,reason,snapshot);
 return jsonb_build_object('delivery',app_delivery_json(did));
end $$;

-- The superseded vehicle/ticket API cannot create new live arrivals. Keep its
-- implementation private for controlled corrections to existing legacy rows.
do $$ begin
 if to_regprocedure('public.save_delivery_legacy(jsonb)') is null then
  alter function public.save_delivery(jsonb) rename to save_delivery_legacy;
 end if;
end $$;
revoke all on function public.save_delivery_legacy(jsonb) from public,anon,authenticated;
create or replace function public.save_delivery(p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare did uuid; d delivery_records;
begin
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Delivery object required' using errcode='22023'; end if;
 did:=(p_input->>'id')::uuid;
 if app_company_id() is null or coalesce(app_role() in ('gate','company_admin'),false) is not true then
  raise exception 'Delivery capture is not permitted' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(did::text,0));
 select * into d from delivery_records where id=did for update;
 if not found or d.company_id is distinct from app_company_id() or d.created_by is distinct from auth.uid()
 or app_can_site(d.company_id,d.site_id) is not true then
  raise exception 'Use Gate Delivery to record a new arrival' using errcode='42501';
 end if;
 if d.capture_mode='simple' then raise exception 'Use the delivery logging endpoint for this record' using errcode='22023'; end if;
 return save_delivery_legacy(p_input);
end $$;

create or replace function public.app_delivery_json(p_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select to_jsonb(d)||jsonb_build_object(
 'category',case when m.approval_status='Approved' then m.category else d.category end,
 'entry_type',case when m.approval_status='Approved' then m.entry_type else coalesce(d.entry_type,'Pending review') end,
 'catalogue_status',m.approval_status,
 'evidence',coalesce((select jsonb_agg(to_jsonb(e)-'company_id'-'site_id'-'storage_path'-'created_by'-'sha256' order by e.created_at) from delivery_evidence e where e.delivery_id=d.id),'[]'::jsonb),
 'reviews',coalesce((select jsonb_agg(to_jsonb(r)-'company_id'-'site_id' order by r.created_at) from delivery_reviews r where r.delivery_id=d.id),'[]'::jsonb))
 from delivery_records d join materials m on m.id=d.material_id and m.company_id=d.company_id
 where d.id=p_id and app_can_read_delivery(d.id)
$$;

create or replace function public.app_bootstrap() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c uuid:=app_company_id(); result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if c is null then raise exception 'No company membership. Ask a company administrator to invite you.' using errcode='42501'; end if;
 select jsonb_build_object(
 'actor',(select jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'company_id',m.company_id,'role',m.role,'site_ids',coalesce((select jsonb_agg(s.id) from sites s where app_can_site(s.company_id,s.id)),'[]'::jsonb)) from user_profiles p join company_memberships m on m.user_id=p.id where p.id=auth.uid()),
 'company',(select jsonb_build_object('id',id,'name',name) from companies where id=c),
 'sites',coalesce((select jsonb_agg(to_jsonb(s) order by s.name) from sites s where app_can_site(s.company_id,s.id)),'[]'::jsonb),
 'materials',coalesce((select jsonb_agg(to_jsonb(m) order by m.name) from materials m where m.company_id=c),'[]'::jsonb),
 'suppliers',coalesce((select jsonb_agg(to_jsonb(s) order by s.name) from suppliers s where s.company_id=c),'[]'::jsonb),
 'marshals',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('can_record',app_can_record_as(m.company_id,m.site_id,m.id)) order by m.name) from traffic_marshals m where app_can_site(m.company_id,m.site_id)),'[]'::jsonb),
 'deliveries',coalesce((select jsonb_agg(app_delivery_json(d.id) order by d.arrival_at desc,d.id) from delivery_records d where app_can_read_delivery(d.id)),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select * from audit_events a where app_can_audit(a.company_id,a.site_id,a.action) and app_role()<>'gate' order by a.created_at desc limit 500) a),'[]'::jsonb),
 'historical',coalesce((select jsonb_agg(to_jsonb(h) order by h.date desc) from historical_delivery_summaries h where app_can_site(h.company_id,h.site_id)),'[]'::jsonb),
 'members',case when app_role()='company_admin' then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'company_id',m.company_id,'role',m.role,'site_ids',coalesce((select jsonb_agg(a.site_id) from site_assignments a where a.company_id=c and a.user_id=p.id),'[]'::jsonb))) from user_profiles p join company_memberships m on m.user_id=p.id where m.company_id=c),'[]'::jsonb) else '[]'::jsonb end,
 'mode','supabase') into result;
 return result;
end $$;

-- Reassert privacy without deleting or replacing any retained delivery objects.
update storage.buckets set public=false where id='delivery-evidence';
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('staff-portraits','staff-portraits',false,3145728,array['image/jpeg','image/png','image/webp'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists staff_portrait_read on storage.objects;
create policy staff_portrait_read on storage.objects for select to authenticated using(bucket_id='staff-portraits' and
 exists(select 1 from public.traffic_marshals m where m.photo_path=storage.objects.name and public.app_can_site(m.company_id,m.site_id)));

create or replace function public.app_provisioning_status() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('migration','202611070001_live_delivery_backend',
  'private_evidence_bucket',exists(select 1 from storage.buckets where id='delivery-evidence' and not public),
  'private_portrait_bucket',exists(select 1 from storage.buckets where id='staff-portraits' and not public))
$$;

revoke all on function public.app_provisioning_status(),public.app_material_definitions(),public.app_normalise_name(text),public.app_material_definition(text),public.app_catalogue_normalise(),public.app_seed_company_catalogue(uuid),public.app_can_record_as(uuid,uuid,uuid),public.log_delivery(jsonb),public.save_delivery(jsonb) from public,anon,authenticated;
grant execute on function public.log_delivery(jsonb),public.save_delivery(jsonb),public.app_can_record_as(uuid,uuid,uuid) to authenticated;
do $$ declare c record; begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  execute 'grant execute on function public.app_seed_company_catalogue(uuid),public.app_provisioning_status() to service_role';
 end if;
 for c in select id from companies loop perform app_seed_company_catalogue(c.id); end loop;
end $$;
commit;
