-- Descrição complementar das categorias do Plano de Contas (GLOBAL).
-- Texto de apoio opcional que explica quando usar cada categoria; aparece na
-- árvore do plano de contas e na seleção de categoria do formulário de lançamentos.
ALTER TABLE public.plano_contas
  ADD COLUMN IF NOT EXISTS descricao_complementar TEXT;
