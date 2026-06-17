-- Add atomic operations for contract registry with optimistic concurrency control
-- This migration ensures that registry publishes are atomic and durable

-- Add unique constraint to prevent multiple active entries for the same contract/network
-- This is critical for preventing race conditions during concurrent publishes
drop index if exists public.contract_registry_entries_network_idx;
create unique index if not exists contract_registry_entries_active_unique
  on public.contract_registry_entries (network, contract_name)
  where is_active = true;

-- Recreate the non-unique index for general queries
create index if not exists contract_registry_entries_network_idx
  on public.contract_registry_entries (network, contract_name, is_active);

-- Create transactional RPC for publishing contract registry entries
-- This function uses optimistic concurrency by checking the current max version
-- and performs all operations in a single transaction
create or replace function publish_contract_registry(
  p_network text,
  p_records jsonb,
  p_expected_version bigint default null
)
returns jsonb
language plpgsql
as $$
declare
  v_current_max_version bigint;
  v_next_version bigint;
  v_record jsonb;
  v_contract_name text;
  v_contract_id text;
  v_previous_contract_id text;
  v_effective_ledger bigint;
  v_effective_time timestamptz;
  v_wasm_hash text;
  v_contract_version integer;
  v_deployment_id text;
  v_metadata jsonb;
  v_published_by text;
  v_network_passphrase text;
  v_is_active boolean;
  v_created_at timestamptz;
  v_updated_at timestamptz;
  v_result jsonb := '{}'::jsonb;
  v_published_count integer := 0;
begin
  -- Get current max version for optimistic concurrency check
  select coalesce(max(version), 0) into v_current_max_version
  from public.contract_registry_entries
  where network = p_network;

  -- If expected version is provided, verify it matches current state
  if p_expected_version is not null and v_current_max_version != p_expected_version then
    raise exception 'Optimistic concurrency check failed: expected version %, found %',
      p_expected_version, v_current_max_version;
  end if;

  -- Start transaction (implicit in function)
  
  -- Deactivate existing entries for contracts being published
  for v_record in select * from jsonb_array_elements(p_records)
  loop
    v_contract_name := (v_record->>'name');
    
    update public.contract_registry_entries
    set is_active = false,
        updated_at = timezone('utc', now())
    where network = p_network
      and contract_name = v_contract_name
      and is_active = true;
  end loop;

  -- Insert new entries
  v_next_version := v_current_max_version;
  
  for v_record in select * from jsonb_array_elements(p_records) order by (v_record->>'name')
  loop
    v_next_version := v_next_version + 1;
    v_contract_name := (v_record->>'name');
    v_contract_id := (v_record->>'contractId');
    v_previous_contract_id := (v_record->>'previousContractId');
    v_effective_ledger := (v_record->>'effectiveLedger')::bigint;
    v_effective_time := (v_record->>'effectiveTime')::timestamptz;
    v_wasm_hash := (v_record->>'wasmHash');
    v_contract_version := (v_record->>'contractVersion')::integer;
    v_deployment_id := (v_record->>'deploymentId');
    v_metadata := coalesce((v_record->>'metadata')::jsonb, '{}'::jsonb);
    v_published_by := (v_record->>'publishedBy');
    v_network_passphrase := (v_record->>'networkPassphrase');
    v_is_active := (v_record->>'active')::boolean;
    v_created_at := (v_record->>'createdAt')::timestamptz;
    v_updated_at := (v_record->>'updatedAt')::timestamptz;

    insert into public.contract_registry_entries (
      contract_name,
      network,
      contract_id,
      previous_contract_id,
      effective_ledger,
      effective_time,
      wasm_hash,
      contract_version,
      deployment_id,
      metadata,
      published_by,
      version,
      network_passphrase,
      is_active,
      created_at,
      updated_at
    ) values (
      v_contract_name,
      p_network,
      v_contract_id,
      v_previous_contract_id,
      v_effective_ledger,
      v_effective_time,
      v_wasm_hash,
      v_contract_version,
      v_deployment_id,
      v_metadata,
      v_published_by,
      v_next_version,
      v_network_passphrase,
      v_is_active,
      v_created_at,
      v_updated_at
    );

    v_published_count := v_published_count + 1;
  end loop;

  -- Build result
  v_result := jsonb_build_object(
    'success', true,
    'newVersion', v_next_version,
    'publishedCount', v_published_count,
    'previousVersion', v_current_max_version
  );

  return v_result;
end;
$$;

-- Create transactional RPC for finalizing dual-read
create or replace function finalize_dual_read(
  p_network text,
  p_contract_name text
)
returns jsonb
language plpgsql
as $$
declare
  v_candidate_id uuid;
  v_previous_contract_id text;
  v_effective_ledger bigint;
  v_result jsonb;
begin
  -- Find the active entry for this contract
  select id, previous_contract_id, effective_ledger
  into v_candidate_id, v_previous_contract_id, v_effective_ledger
  from public.contract_registry_entries
  where network = p_network
    and contract_name = p_contract_name
    and is_active = true;

  if v_candidate_id is null then
    raise exception 'No active registry entry found for %', p_contract_name;
  end if;

  if v_previous_contract_id is null then
    raise exception 'Registry entry for % is not in a dual-read transition window', p_contract_name;
  end if;

  -- Clear dual-read fields in a single update
  update public.contract_registry_entries
  set previous_contract_id = null,
      effective_time = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = v_candidate_id;

  v_result := jsonb_build_object(
    'success', true,
    'contractName', p_contract_name,
    'finalizedAt', timezone('utc', now())
  );

  return v_result;
end;
$$;

-- Create transactional RPC for rollback
create or replace function rollback_contract_registry(
  p_network text,
  p_contract_name text,
  p_target_contract_version integer
)
returns jsonb
language plpgsql
as $$
declare
  v_current_max_version bigint;
  v_next_version bigint;
  v_target_id uuid;
  v_target_contract_id text;
  v_target_wasm_hash text;
  v_result jsonb;
begin
  -- Get current max version
  select coalesce(max(version), 0) into v_current_max_version
  from public.contract_registry_entries
  where network = p_network;

  -- Find the target entry to rollback to
  select id, contract_id, wasm_hash
  into v_target_id, v_target_contract_id, v_target_wasm_hash
  from public.contract_registry_entries
  where network = p_network
    and contract_name = p_contract_name
    and contract_version = p_target_contract_version;

  if v_target_id is null then
    raise exception 'No registry entry found for % at version %', p_contract_name, p_target_contract_version;
  end if;

  v_next_version := v_current_max_version + 1;

  -- Deactivate all entries for this contract
  update public.contract_registry_entries
  set is_active = false,
      updated_at = timezone('utc', now())
  where network = p_network
    and contract_name = p_contract_name;

  -- Activate the target entry with new version
  update public.contract_registry_entries
  set is_active = true,
      version = v_next_version,
      updated_at = timezone('utc', now())
  where id = v_target_id;

  v_result := jsonb_build_object(
    'success', true,
    'contractName', p_contract_name,
    'targetVersion', p_target_contract_version,
    'newRegistryVersion', v_next_version,
    'contractId', v_target_contract_id,
    'wasmHash', v_target_wasm_hash
  );

  return v_result;
end;
$$;

-- Grant execute permissions to the service role
grant execute on function publish_contract_registry to service_role;
grant execute on function finalize_dual_read to service_role;
grant execute on function rollback_contract_registry to service_role;
