alter table public."MD:Usuarios"
  add column if not exists "Nombre" text;

update public."MD:Usuarios"
set "Nombre" = "User_Nombre"
where "Nombre" is null
   or btrim("Nombre") = '';

create or replace view public."Usuarios_Login" as
select
  id,
  "User_Nombre",
  "User_Pass",
  "Nivel",
  "Nombre"
from public."MD:Usuarios";

grant select on public."Usuarios_Login" to anon, authenticated;

comment on column public."MD:Usuarios"."Nombre" is
  'Nombre visible de la persona usuaria.';
