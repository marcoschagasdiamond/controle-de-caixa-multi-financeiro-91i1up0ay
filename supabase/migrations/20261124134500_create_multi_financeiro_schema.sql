-- Migration: 20261124134500_create_multi_financeiro_schema.sql
-- Multi-financial cash management system with segregation and RLS

-- 1. Create tables
CREATE TABLE IF NOT EXISTS public.financeiros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('PF', 'PJ')),
  cpf_cnpj TEXT,
  socios TEXT,
  regime_tributario TEXT,
  cor TEXT NOT NULL DEFAULT '#00D68F',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  financeiro_id UUID REFERENCES public.financeiros(id) ON DELETE CASCADE NOT NULL,
  banco TEXT NOT NULL,
  agencia TEXT,
  conta TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'Corrente',
  pix TEXT,
  saldo_inicial NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.plano_contas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  financeiro_id UUID REFERENCES public.financeiros(id) ON DELETE CASCADE NOT NULL,
  codigo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contas_fixas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  financeiro_id UUID REFERENCES public.financeiros(id) ON DELETE CASCADE NOT NULL,
  conta_id UUID REFERENCES public.contas(id) ON DELETE SET NULL,
  plano_conta_id UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL,
  descricao TEXT NOT NULL,
  valor_estimado NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  dia_vencimento INT NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
  tipo TEXT NOT NULL DEFAULT 'despesa' CHECK (tipo IN ('receita', 'despesa')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lancamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  financeiro_id UUID REFERENCES public.financeiros(id) ON DELETE RESTRICT NOT NULL,
  conta_id UUID REFERENCES public.contas(id) ON DELETE RESTRICT NOT NULL,
  plano_conta_id UUID REFERENCES public.plano_contas(id) ON DELETE RESTRICT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('credito', 'debito')),
  valor NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  descricao TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'realizado' CHECK (status IN ('previsto', 'realizado')),
  contraparte TEXT,
  documento TEXT,
  observacao TEXT,
  conciliado BOOLEAN NOT NULL DEFAULT false,
  extrato_item_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.importacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  financeiro_id UUID REFERENCES public.financeiros(id) ON DELETE CASCADE NOT NULL,
  conta_id UUID REFERENCES public.contas(id) ON DELETE CASCADE NOT NULL,
  nome_arquivo TEXT NOT NULL,
  total_linhas INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.extrato_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  importacao_id UUID REFERENCES public.importacoes(id) ON DELETE CASCADE NOT NULL,
  financeiro_id UUID REFERENCES public.financeiros(id) ON DELETE CASCADE NOT NULL,
  conta_id UUID REFERENCES public.contas(id) ON DELETE CASCADE NOT NULL,
  data DATE NOT NULL,
  descricao TEXT NOT NULL,
  documento TEXT,
  valor NUMERIC(15,2) NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('credito', 'debito')),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('conciliado', 'pendente', 'sem_correspondencia', 'ignorado')),
  lancamento_id UUID REFERENCES public.lancamentos(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.regras_conciliacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  financeiro_id UUID REFERENCES public.financeiros(id) ON DELETE CASCADE NOT NULL,
  padrao_texto TEXT NOT NULL,
  plano_conta_id UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL,
  tipo TEXT CHECK (tipo IN ('credito', 'debito')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mutuos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  origem_financeiro_id UUID REFERENCES public.financeiros(id) ON DELETE RESTRICT NOT NULL,
  origem_conta_id UUID REFERENCES public.contas(id) ON DELETE RESTRICT NOT NULL,
  destino_financeiro_id UUID REFERENCES public.financeiros(id) ON DELETE RESTRICT NOT NULL,
  destino_conta_id UUID REFERENCES public.contas(id) ON DELETE RESTRICT NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  valor NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  tipo TEXT NOT NULL DEFAULT 'emprestimo' CHECK (tipo IN ('adiantamento', 'reembolso', 'emprestimo')),
  taxa_juros NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  documento TEXT,
  observacao TEXT,
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'quitado', 'parcial')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_mutuo_diferentes_financeiros CHECK (origem_financeiro_id <> destino_financeiro_id)
);

CREATE TABLE IF NOT EXISTS public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  financeiro_id UUID REFERENCES public.financeiros(id) ON DELETE CASCADE NOT NULL,
  plano_conta_id UUID REFERENCES public.plano_contas(id) ON DELETE CASCADE NOT NULL,
  mes_ano TEXT NOT NULL, -- formato YYYY-MM
  valor_orcado NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_budget_plano_mes UNIQUE (financeiro_id, plano_conta_id, mes_ano)
);

-- 2. Trigger de Segregação Patrimonial (Bloqueia lançamento cruzado entre financeiros)
CREATE OR REPLACE FUNCTION public.validar_segregacao_lancamento()
RETURNS TRIGGER AS $$
DECLARE
  conta_fin_id UUID;
  plano_fin_id UUID;
BEGIN
  -- Validar se a conta pertence ao mesmo financeiro
  SELECT financeiro_id INTO conta_fin_id FROM public.contas WHERE id = NEW.conta_id;
  IF conta_fin_id IS NULL OR conta_fin_id <> NEW.financeiro_id THEN
    RAISE EXCEPTION 'VIOLAÇÃO DE SEGREGAÇÃO PATRIMONIAL: A conta bancária informada não pertence ao financeiro selecionado.'
      USING ERRCODE = '23514';
  END IF;

  -- Validar se o plano de contas pertence ao mesmo financeiro
  SELECT financeiro_id INTO plano_fin_id FROM public.plano_contas WHERE id = NEW.plano_conta_id;
  IF plano_fin_id IS NULL OR plano_fin_id <> NEW.financeiro_id THEN
    RAISE EXCEPTION 'VIOLAÇÃO DE SEGREGAÇÃO PATRIMONIAL: O plano de contas informado não pertence ao financeiro selecionado.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_segregacao_lancamento ON public.lancamentos;
CREATE TRIGGER trigger_segregacao_lancamento
  BEFORE INSERT OR UPDATE ON public.lancamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_segregacao_lancamento();

-- Trigger de Segregação para Mútuos
CREATE OR REPLACE FUNCTION public.validar_segregacao_mutuo()
RETURNS TRIGGER AS $$
DECLARE
  origem_fin_id UUID;
  destino_fin_id UUID;
BEGIN
  SELECT financeiro_id INTO origem_fin_id FROM public.contas WHERE id = NEW.origem_conta_id;
  IF origem_fin_id <> NEW.origem_financeiro_id THEN
    RAISE EXCEPTION 'VIOLAÇÃO DE SEGREGAÇÃO PATRIMONIAL: A conta de origem não pertence ao financeiro de origem.'
      USING ERRCODE = '23514';
  END IF;

  SELECT financeiro_id INTO destino_fin_id FROM public.contas WHERE id = NEW.destino_conta_id;
  IF destino_fin_id <> NEW.destino_financeiro_id THEN
    RAISE EXCEPTION 'VIOLAÇÃO DE SEGREGAÇÃO PATRIMONIAL: A conta de destino não pertence ao financeiro de destino.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_segregacao_mutuo ON public.mutuos;
CREATE TRIGGER trigger_segregacao_mutuo
  BEFORE INSERT OR UPDATE ON public.mutuos
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_segregacao_mutuo();

-- 3. View vw_fechamento_financeiro
DROP VIEW IF EXISTS public.vw_fechamento_fechamento_financeiro;
DROP VIEW IF EXISTS public.vw_fechamento_financeiro;
CREATE OR REPLACE VIEW public.vw_fechamento_financeiro AS
SELECT 
  f.id AS financeiro_id,
  f.user_id,
  f.nome AS financeiro_nome,
  f.tipo AS financeiro_tipo,
  COALESCE(SUM(c.saldo_inicial), 0) AS saldo_inicial_total,
  COALESCE(SUM(CASE WHEN l.tipo = 'credito' AND l.status = 'realizado' THEN l.valor ELSE 0 END), 0) AS total_entradas_realizadas,
  COALESCE(SUM(CASE WHEN l.tipo = 'debito' AND l.status = 'realizado' THEN l.valor ELSE 0 END), 0) AS total_saidas_realizadas,
  (COALESCE(SUM(CASE WHEN l.tipo = 'credito' AND l.status = 'realizado' THEN l.valor ELSE 0 END), 0) -
   COALESCE(SUM(CASE WHEN l.tipo = 'debito' AND l.status = 'realizado' THEN l.valor ELSE 0 END), 0)) AS resultado_realizado,
  (COALESCE(SUM(c.saldo_inicial), 0) +
   COALESCE(SUM(CASE WHEN l.tipo = 'credito' AND l.status = 'realizado' THEN l.valor ELSE 0 END), 0) -
   COALESCE(SUM(CASE WHEN l.tipo = 'debito' AND l.status = 'realizado' THEN l.valor ELSE 0 END), 0)) AS saldo_atual,
  COALESCE(SUM(CASE WHEN l.tipo = 'credito' AND l.status = 'previsto' THEN l.valor ELSE 0 END), 0) AS a_receber_previsto,
  COALESCE(SUM(CASE WHEN l.tipo = 'debito' AND l.status = 'previsto' THEN l.valor ELSE 0 END), 0) AS a_pagar_previsto
FROM public.financeiros f
LEFT JOIN public.contas c ON c.financeiro_id = f.id
LEFT JOIN public.lancamentos l ON l.financeiro_id = f.id
GROUP BY f.id, f.user_id, f.nome, f.tipo;

-- 4. Enable RLS on all tables
ALTER TABLE public.financeiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plano_contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contas_fixas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.importacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extrato_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regras_conciliacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mutuos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

-- 5. Policies by user_id
DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY['financeiros', 'contas', 'plano_contas', 'contas_fixas', 'lancamentos', 'importacoes', 'extrato_itens', 'regras_conciliacao', 'mutuos', 'budgets'];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth_all_%I" ON public.%I', tbl, tbl);
    EXECUTE format('CREATE POLICY "auth_all_%I" ON public.%I FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', tbl, tbl);
  END LOOP;
END $$;

-- 6. Seed initial user marcoschagasdiamond@icloud.com
DO $$
DECLARE
  new_user_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'marcoschagasdiamond@icloud.com') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      'marcoschagasdiamond@icloud.com',
      crypt('Skip@Pass123', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Marcos Chagas"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL,
      '', '', ''
    );
  END IF;
END $$;
