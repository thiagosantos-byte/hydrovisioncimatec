-- HYDROVISION — estrutura inicial para Supabase/PostgreSQL
-- Dados da demonstração são gravados com origem DEMO; telemetria física deve usar REAL.

create extension if not exists pgcrypto;

create table if not exists public.equipamentos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  tipo text not null,
  localizacao text,
  fabricante text,
  modelo text,
  status text not null default 'ATIVO' check (status in ('ATIVO', 'INATIVO', 'MANUTENCAO')),
  created_at timestamptz not null default now()
);

create table if not exists public.sensores (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid references public.equipamentos(id) on delete set null,
  codigo text not null unique,
  nome text not null,
  tipo text not null,
  unidade text not null,
  limite_min numeric,
  limite_max numeric,
  ativo boolean not null default true,
  ultima_comunicacao timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.medicoes (
  id bigserial primary key,
  sensor_id uuid not null references public.sensores(id) on delete cascade,
  valor numeric not null,
  unidade text not null,
  origem text not null default 'REAL' check (origem in ('REAL', 'SIMULADO')),
  qualidade text not null default 'VALIDA' check (qualidade in ('VALIDA', 'SUSPEITA', 'INVALIDA', 'DESATUALIZADA')),
  registrado_em timestamptz not null default now()
);
create index if not exists medicoes_sensor_data_idx on public.medicoes(sensor_id, registrado_em desc);

create table if not exists public.alertas (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid references public.equipamentos(id) on delete set null,
  sensor_id uuid references public.sensores(id) on delete set null,
  titulo text not null,
  descricao text not null,
  gravidade text not null check (gravidade in ('INFO', 'ATENCAO', 'CRITICO')),
  origem text not null default 'REAL' check (origem in ('REAL', 'SIMULADO')),
  status text not null default 'ABERTO' check (status in ('ABERTO', 'RECONHECIDO', 'RESOLVIDO')),
  created_at timestamptz not null default now(),
  resolvido_em timestamptz
);

create table if not exists public.execucoes_simulacao (
  id uuid primary key default gen_random_uuid(),
  cenario text not null,
  parametros jsonb not null default '{}'::jsonb,
  resultado jsonb not null default '{}'::jsonb,
  origem text not null default 'DEMO' check (origem in ('DEMO', 'REAL')),
  created_at timestamptz not null default now()
);
create index if not exists simulacoes_created_at_idx on public.execucoes_simulacao(created_at desc);

-- RLS ativado. O backend usa service_role somente no servidor; nunca no frontend.
alter table public.equipamentos enable row level security;
alter table public.sensores enable row level security;
alter table public.medicoes enable row level security;
alter table public.alertas enable row level security;
alter table public.execucoes_simulacao enable row level security;

-- Não há políticas públicas de leitura/escrita. Crie políticas por perfil antes de
-- conectar usuários autenticados diretamente ao Supabase.
