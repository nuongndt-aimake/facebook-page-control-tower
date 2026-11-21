-- Status: Đang dùng when this migration is applied.
-- Impact: a signed-in, active user may update only their own display name/contact profile.
-- Email remains Supabase Auth / Google-owned and is not accepted by this RPC.
create or replace function public.profile_self_save(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor public.profiles%rowtype;name_value text;phone_value text;facebook_value text;changed_fields jsonb;
begin
 select * into actor from public.profiles where id=p_actor for update;
 if not found or actor.status<>'active' then raise exception 'Forbidden';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or p_input='{}'::jsonb or p_input-array['display_name','phone','facebook_profile_url']<>'{}'::jsonb then raise exception 'Invalid profile fields';end if;
 name_value:=case when p_input ? 'display_name' then nullif(regexp_replace(btrim(p_input->>'display_name'),'\s+',' ','g'),'') else actor.display_name end;
 phone_value:=case when p_input ? 'phone' then nullif(btrim(p_input->>'phone'),'') else actor.phone end;
 facebook_value:=case when p_input ? 'facebook_profile_url' then nullif(btrim(p_input->>'facebook_profile_url'),'') else actor.facebook_profile_url end;
 if p_input ? 'display_name' and (name_value is null or char_length(name_value)<2 or char_length(name_value)>120 or name_value ~ '[[:cntrl:]]') then raise exception 'Invalid display name';end if;
 if phone_value is not null and (char_length(phone_value)>32 or phone_value !~ '^\+?[0-9() .-]+$' or char_length(regexp_replace(phone_value,'\D','','g')) not between 7 and 15) then raise exception 'Invalid phone';end if;
 if facebook_value is not null and (char_length(facebook_value)>2000 or facebook_value !~ '^https://(www\.|m\.|web\.)?facebook\.com/.+') then raise exception 'Invalid Facebook profile';end if;
 update public.profiles set display_name=name_value,phone=phone_value,facebook_profile_url=facebook_value,updated_at=now() where id=p_actor returning * into actor;
 select coalesce(jsonb_agg(key),'[]'::jsonb) into changed_fields from jsonb_object_keys(p_input) key;
 insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details) values(p_actor,'self_profile_update','profile',p_actor,jsonb_build_object('changed_fields',changed_fields));
 return jsonb_build_object('profile',jsonb_build_object('id',actor.id,'email',actor.email,'display_name',actor.display_name,'phone',actor.phone,'facebook_profile_url',actor.facebook_profile_url,'role',actor.role,'status',actor.status,'permissions',actor.permissions));
end $$;

revoke all on function public.profile_self_save(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.profile_self_save(uuid,jsonb) to service_role;
