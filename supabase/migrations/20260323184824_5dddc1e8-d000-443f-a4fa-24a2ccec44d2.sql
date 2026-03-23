CREATE TABLE public.precos_mercado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id text NOT NULL UNIQUE,
  preco numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.precos_mercado DISABLE ROW LEVEL SECURITY;