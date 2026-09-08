alter table public."Solicitudes"
  add column if not exists "Comentarios" text;

comment on column public."Solicitudes"."Comentarios" is
  'Observaciones adicionales capturadas para la solicitud.';
