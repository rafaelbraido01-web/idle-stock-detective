
CREATE TABLE public.produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  descricao text NOT NULL DEFAULT '',
  grupo text NOT NULL DEFAULT '',
  subgrupo text NOT NULL DEFAULT '',
  marca text NOT NULL DEFAULT '',
  data_criacao timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.estoque_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_importacao timestamptz NOT NULL DEFAULT now(),
  nome_arquivo text NOT NULL DEFAULT '',
  usuario text NOT NULL DEFAULT 'Usuário',
  data_criacao timestamptz NOT NULL DEFAULT now(),
  total_produtos integer NOT NULL DEFAULT 0,
  valor_total numeric NOT NULL DEFAULT 0
);

CREATE TABLE public.estoque_produto_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES public.estoque_snapshots(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  quantidade numeric NOT NULL DEFAULT 0,
  valor_unitario numeric NOT NULL DEFAULT 0,
  valor_total numeric NOT NULL DEFAULT 0,
  data_ultima_venda date,
  data_ultima_compra date,
  dias_sem_venda integer NOT NULL DEFAULT -1,
  dias_sem_compra integer NOT NULL DEFAULT -1,
  categoria_estoque text NOT NULL DEFAULT 'sem-registro',
  nome_comissao text NOT NULL DEFAULT '',
  comissao numeric NOT NULL DEFAULT 0,
  preco_tabela numeric NOT NULL DEFAULT 0,
  valor_promocao numeric,
  percentual_desconto numeric,
  data_fim_promocao date,
  valor_venda_total numeric NOT NULL DEFAULT 0
);

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_produto_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to produtos" ON public.produtos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to estoque_snapshots" ON public.estoque_snapshots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to estoque_produto_snapshots" ON public.estoque_produto_snapshots FOR ALL USING (true) WITH CHECK (true);

-- Update precos_mercado to reference produtos table
ALTER TABLE public.precos_mercado ADD CONSTRAINT fk_precos_mercado_produto FOREIGN KEY (produto_id) REFERENCES public.produtos(codigo) ON DELETE CASCADE;
