-- Coluna observacao (texto livre, opcional) em lancamentos_recorrentes.
-- Exibida de forma discreta na linha da Projeção Anual de Recorrentes.
alter table public.lancamentos_recorrentes
  add column if not exists observacao text;

comment on column public.lancamentos_recorrentes.observacao is
  'Texto livre opcional exibido sob o rótulo da linha na Projeção Anual de Recorrentes';
