
CREATE TABLE public.campanhas_produto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id text NOT NULL,
  campanha text NOT NULL DEFAULT '',
  canal text NOT NULL DEFAULT 'Outro',
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campanhas_produto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to campanhas_produto"
  ON public.campanhas_produto
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
