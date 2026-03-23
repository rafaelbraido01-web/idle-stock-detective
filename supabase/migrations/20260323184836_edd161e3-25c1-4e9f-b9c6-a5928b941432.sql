ALTER TABLE public.precos_mercado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to precos_mercado"
ON public.precos_mercado
FOR ALL
USING (true)
WITH CHECK (true);