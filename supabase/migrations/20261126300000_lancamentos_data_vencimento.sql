-- Vencimento dos lançamentos (opcional). A coluna `data` continua significando
-- a data do pagamento/recebimento; `data_vencimento` é a data prevista de vencimento.
alter table public.lancamentos
  add column if not exists data_vencimento date;

comment on column public.lancamentos.data_vencimento is
  'Data de vencimento (opcional). Pagamento/recebimento em data posterior = em atraso.';
