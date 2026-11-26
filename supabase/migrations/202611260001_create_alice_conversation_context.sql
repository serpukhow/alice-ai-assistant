-- Durable conversational context for Alice.
-- Apply this migration in Supabase SQL Editor before testing the feature branch.

create table if not exists public.alice_conversation_context (
    yandex_user_id text primary key,
    conversation_id uuid not null default gen_random_uuid(),
    summary text not null default '',
    recent_messages jsonb not null default '[]'::jsonb,
    turn_count integer not null default 0 check (turn_count >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint alice_conversation_recent_messages_array
        check (jsonb_typeof(recent_messages) = 'array')
);

create index if not exists alice_conversation_context_updated_idx
    on public.alice_conversation_context (updated_at desc);

alter table public.alice_conversation_context
    enable row level security;

revoke all on table public.alice_conversation_context
    from anon, authenticated;

grant select, insert, update, delete
    on table public.alice_conversation_context
    to service_role;

grant usage on schema public to service_role;
