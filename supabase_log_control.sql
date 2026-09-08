-- Log Control para auditoria basica del sistema.
-- Ejecuta este SQL en Supabase antes de usar el boton "Log Control".

create extension if not exists pgcrypto;

create table if not exists public."Log_Control" (
  id uuid primary key default gen_random_uuid(),
  fecha timestamptz not null default now(),
  usuario text,
  usuario_id text,
  modulo text not null,
  accion text not null,
  tabla text,
  registro_id text,
  codigo_sap text,
  descripcion text,
  antes jsonb,
  despues jsonb
);

create index if not exists log_control_fecha_idx
  on public."Log_Control" (fecha desc);

create index if not exists log_control_modulo_accion_idx
  on public."Log_Control" (modulo, accion);

create index if not exists log_control_codigo_sap_idx
  on public."Log_Control" (codigo_sap);

alter table public."Log_Control" enable row level security;

drop policy if exists "Log_Control_select" on public."Log_Control";
create policy "Log_Control_select"
on public."Log_Control"
for select
to anon, authenticated
using (true);

drop policy if exists "Log_Control_insert" on public."Log_Control";
create policy "Log_Control_insert"
on public."Log_Control"
for insert
to anon, authenticated
with check (true);
