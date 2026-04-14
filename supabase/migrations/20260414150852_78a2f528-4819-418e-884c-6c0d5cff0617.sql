ALTER TABLE estoque_produto_snapshots
  ADD COLUMN preco_filial_sp numeric DEFAULT 0,
  ADD COLUMN preco_filial_sc numeric DEFAULT 0,
  ADD COLUMN preco_software_by_maringa numeric DEFAULT 0,
  ADD COLUMN preco_corporativo numeric DEFAULT 0,
  ADD COLUMN preco_maff numeric DEFAULT 0;