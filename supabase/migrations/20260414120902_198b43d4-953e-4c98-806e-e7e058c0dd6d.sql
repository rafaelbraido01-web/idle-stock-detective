
ALTER TABLE estoque_produto_snapshots
  ADD COLUMN preco_padrao numeric DEFAULT 0,
  ADD COLUMN preco_atacado numeric DEFAULT 0,
  ADD COLUMN preco_internet numeric DEFAULT 0,
  ADD COLUMN preco_marketplace numeric DEFAULT 0,
  ADD COLUMN margem numeric DEFAULT NULL;

ALTER TABLE produtos
  ADD COLUMN sku_mktplace text DEFAULT '',
  ADD COLUMN no_mktplace text DEFAULT 'N';
