create table if not exists upwork_tokens (
  id text primary key default 'singleton',
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  scope text,
  updated_at timestamptz not null default now()
);

-- allow service role to upsert (server-side usage only)
