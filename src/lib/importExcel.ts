import * as XLSX from 'xlsx';
import type { Produto, EstoqueSnapshot, EstoqueProdutoSnapshot, CategoriaEstoque } from '@/types/inventory';

function generateId(): string {
  return crypto.randomUUID();
}

function getCategoriaEstoque(dias: number): CategoriaEstoque {
  if (dias < 0) return 'sem-registro';
  if (dias <= 90) return '0-90';
  if (dias <= 180) return '90-180';
  if (dias <= 270) return '180-270';
  if (dias <= 365) return '270-365';
  return '365+';
}

function parseExcelDate(value: any): string | null {
  if (!value) return null;

  if (typeof value === 'number') {
    try {
      const date = XLSX.SSF.parse_date_code(value);
      if (date && date.y > 1900) {
        return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
      }
    } catch {
      /* fall through */
    }
    return null;
  }

  if (value instanceof Date) {
    if (!isNaN(value.getTime())) {
      return value.toISOString().split('T')[0];
    }
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const match = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (match) {
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      let year = match[3];
      if (year.length === 2) year = `20${year}`;
      return `${year}-${month}-${day}`;
    }

    const isoMatch = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
    }

    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900) {
      return parsed.toISOString().split('T')[0];
    }
  }

  return null;
}

function parseNumericValue(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;

  const trimmed = value.trim();
  if (!trimmed) return 0;

  const normalized = trimmed
    .replace(/\s+/g, '')
    .replace(/R\$/gi, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calcDiasSemVenda(dataUltimaVenda: string | null, referenceDate: Date): number {
  if (!dataUltimaVenda) return -1;
  const lastSale = new Date(dataUltimaVenda);
  if (isNaN(lastSale.getTime())) return -1;
  const diff = referenceDate.getTime() - lastSale.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

interface ImportDiagnostics {
  totalLinhasArquivo: number;
  linhasSemCodigo: number;
  linhasValorZero: number;
  linhasProcessadas: number;
}

interface ImportResult {
  snapshot: EstoqueSnapshot;
  produtos: Produto[];
  produtoSnapshots: EstoqueProdutoSnapshot[];
  detectedColumns: Record<string, string>;
  warnings: string[];
  diagnostics: ImportDiagnostics;
}

export function processExcelFile(file: File, existingProdutos: Produto[], referenceDate?: Date): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: false });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (rows.length === 0) {
          reject(new Error('Arquivo vazio ou formato inválido'));
          return;
        }

        const now = referenceDate || new Date();
        const snapshotId = generateId();
        const existingMap = new Map(existingProdutos.map((p) => [p.codigo, p]));

        const snapshot: EstoqueSnapshot = {
          id: snapshotId,
          data_importacao: now.toISOString(),
          nome_arquivo: file.name,
          usuario: 'Usuário',
          data_criacao: now.toISOString(),
          total_produtos: rows.length,
          valor_total: 0,
        };

        const produtos: Produto[] = [];
        const produtoSnapshots: EstoqueProdutoSnapshot[] = [];

        const sampleKeys = Object.keys(rows[0]);
        const findKey = (candidates: string[]): string => {
          for (const k of sampleKeys) {
            const kl = k.toLowerCase().replace(/[_.\s]+/g, '');
            for (const c of candidates) {
              const cl = c.toLowerCase().replace(/[_.\s]+/g, '');
              if (kl === cl) return k;
            }
          }

          return sampleKeys.find((k) => {
            const kl = k.toLowerCase().replace(/[_.\s]+/g, '');
            return candidates.some((c) => kl.includes(c.toLowerCase().replace(/[_.\s]+/g, '')));
          }) || '';
        };

        const colCodigo = findKey(['codigo', 'código', 'cod', 'codprod', 'cod_prod', 'cod prod', 'code']);
        const colDescricao = findKey(['descricao', 'descrição', 'descri', 'produto', 'nome', 'desc', 'nome_produto', 'nmproduto']);
        const colGrupo = findKey(['grupo', 'group', 'categoria', 'nmgrupo', 'nm_grupo']);
        const colSubgrupo = findKey(['subgrupo', 'sub_grupo', 'sub grupo', 'subcategoria', 'nmsubgrupo']);
        const colMarca = findKey(['marca', 'brand', 'fabricante', 'nmmarca']);
        const colQuantidade = findKey([
          'quantidadeestoque',
          'quantidade_estoque',
          'quantidade estoque',
          'qtdestoque',
          'qtd_estoque',
          'saldo',
          'unidades',
          'qtd',
          'quantidade',
          'qtde',
          'quant',
          'qt',
        ]);
        const colValorUnit = findKey(['valorunit', 'valor_unit', 'preco', 'preço', 'unitario', 'unitário', 'vlr_unit', 'vlrunit', 'precovenda', 'preco_venda']);
        const colValorTotal = findKey(['valorestoque', 'valor_estoque', 'vlrestoque', 'vlr_estoque', 'valortotal', 'valor_total', 'vlr_total', 'vlrtotal', 'total']);
        const colUltimaVenda = findKey([
          'ultimavenda', 'ultima_venda', 'últimavenda', 'última_venda',
          'dtultvenda', 'dt_ult_venda', 'dt ult venda', 'dtultimavenda',
          'data_ultima_venda', 'dataultimavenda', 'data ultima venda',
          'ultvenda', 'ult_venda', 'ult venda',
          'datavenda', 'data_venda', 'data venda',
          'lastsale', 'last_sale',
        ]);
        const colNomeComissao = findKey(['nomecomiss', 'nome_comiss', 'nome comiss', 'nomecomissao', 'nome_comissao', 'nome comissão', 'tipocomissao', 'tipo_comissao']);
        const colComissao = findKey(['comissao', 'comissão', 'commission', 'comiss', 'vlrcomissao', 'vlr_comissao', 'valorcomissao']);
        const colUltimaCompra = findKey([
          'ultcompra', 'ult_compra', 'ult compra', 'ultimacompra', 'ultima_compra', 'última_compra',
          'dtultcompra', 'dt_ult_compra', 'dt ult compra', 'dtultimacompra',
          'data_ultima_compra', 'dataultimacompra', 'data ultima compra',
          'lastpurchase', 'last_purchase',
        ]);
        const colPrecoTabela = findKey(['precotabela', 'preco_tabela', 'preço_tabela', 'preçotabela', 'prcotabela', 'preco tabela', 'vlrtabela', 'vlr_tabela', 'precacheio', 'precocheio', 'preco_cheio']);
        const colValorPromocao = findKey(['valorpromocao', 'valor_promocao', 'vlrpromocao', 'vlr_promocao', 'precopromocao', 'preco_promocao', 'precopromo', 'preco_promo', 'vlrpromo', 'promocao']);
        const colDataFimPromocao = findKey(['datafimpromocao', 'data_fim_promocao', 'dtfimpromocao', 'dt_fim_promocao', 'fimpromocao', 'fim_promocao', 'validadepromocao', 'validade_promocao', 'dtfimpromo', 'validprom', 'valid_prom', 'valid prom', 'vlprom', 'vl_prom']);
        const colValorVendaTotal = findKey(['valorvenda', 'valor_venda', 'vlrvenda', 'vlr_venda', 'totalvenda', 'total_venda', 'vendatotal', 'venda_total', 'vlrvendatotal', 'vlr_venda_total']);
        const colEstoqueMinimo = findKey(['estoqueminimo', 'estoque_minimo', 'estoque minimo', 'estmin', 'est_min', 'estoquemin', 'estoque_min', 'min_estoque', 'minestoque', 'minimo', 'qtdminima', 'qtd_minima']);

        const detectedColumns: Record<string, string> = {
          'Código': colCodigo || '❌ Não encontrado',
          'Descrição': colDescricao || '❌ Não encontrado',
          'Grupo': colGrupo || '—',
          'Subgrupo': colSubgrupo || '—',
          'Marca': colMarca || '—',
          'Quantidade': colQuantidade || '❌ Não encontrado',
          'Valor Unitário': colValorUnit || '—',
          'Valor Total': colValorTotal || '—',
          'Última Venda': colUltimaVenda || '⚠️ Não encontrado',
          'Última Compra': colUltimaCompra || '—',
          'Nome Comissão': colNomeComissao || '—',
          'Comissão': colComissao || '—',
          'Preço Tabela': colPrecoTabela || '—',
          'Valor Promoção': colValorPromocao || '—',
          'Fim Promoção': colDataFimPromocao || '—',
          'Valor Venda Total': colValorVendaTotal || '—',
          'Estoque Mínimo': colEstoqueMinimo || '—',
        };

        const warnings: string[] = [];
        if (!colCodigo) warnings.push('Coluna de código não encontrada');
        if (!colQuantidade) warnings.push('Coluna de quantidade não encontrada');
        if (!colUltimaVenda) warnings.push('Coluna de data de última venda não encontrada — todos os produtos serão classificados como "Sem registro"');

        // Debug: log all column names and sample values for date columns
        console.log('[Import] Todas as colunas do Excel:', sampleKeys);
        console.log('[Import] Coluna detectada para Última Compra:', colUltimaCompra || 'NENHUMA');
        console.log('[Import] Coluna detectada para Última Venda:', colUltimaVenda || 'NENHUMA');
        if (colUltimaCompra) {
          const sampleRaw = rows.slice(0, 5).map(r => r[colUltimaCompra]);
          const sampleParsed = sampleRaw.map(v => parseExcelDate(v));
          console.log('[Import] Valores brutos Última Compra (5 primeiros):', sampleRaw);
          console.log('[Import] Valores parseados Última Compra (5 primeiros):', sampleParsed);
        }
        if (colUltimaVenda) {
          const sampleRaw = rows.slice(0, 5).map(r => r[colUltimaVenda]);
          const sampleParsed = sampleRaw.map(v => parseExcelDate(v));
          console.log('[Import] Valores brutos Última Venda (5 primeiros):', sampleRaw);
          console.log('[Import] Valores parseados Última Venda (5 primeiros):', sampleParsed);
        }

        let totalEstoque = 0;

        let skippedNoCodigo = 0;
        let skippedZeroValue = 0;

        // First pass: aggregate rows by product code
        interface AggregatedRow {
          produtoId: string;
          quantidade: number;
          valorUnit: number;
          valorTotal: number;
          dataUltimaVenda: string | null;
          dataUltimaCompra: string | null;
          nomeComissao: string;
          comissao: number;
          precoTabela: number;
          valorPromocao: number | null;
          dataFimPromocao: string | null;
          valorVendaTotal: number;
        }

        const aggregatedMap = new Map<string, AggregatedRow>();

        for (const row of rows) {
          const codigo = String(row[colCodigo] || '').trim();
          if (!codigo) { skippedNoCodigo++; continue; }

          const valorEstoqueCheck = parseNumericValue(row[colValorTotal]);
          if (colValorTotal && valorEstoqueCheck === 0) { skippedZeroValue++; continue; }

          const existing = existingMap.get(codigo);
          const produtoId = existing?.id || generateId();

          if (!existing) {
            const estoqueMinimo = colEstoqueMinimo ? parseNumericValue(row[colEstoqueMinimo]) : 0;
            const produto: Produto = {
              id: produtoId,
              codigo,
              descricao: String(row[colDescricao] || '').trim(),
              grupo: String(row[colGrupo] || '').trim(),
              subgrupo: String(row[colSubgrupo] || '').trim(),
              marca: String(row[colMarca] || '').trim(),
              estoque_minimo: estoqueMinimo,
              data_criacao: now.toISOString(),
            };
            produtos.push(produto);
            existingMap.set(codigo, produto);
          }

          const quantidade = parseNumericValue(row[colQuantidade]);
          const valorUnit = parseNumericValue(row[colValorUnit]);
          const valorTotalRow = parseNumericValue(row[colValorTotal]) || (quantidade * valorUnit);
          const dataUltimaVenda = parseExcelDate(row[colUltimaVenda]);
          const dataUltimaCompra = parseExcelDate(row[colUltimaCompra]);
          const nomeComissao = String(row[colNomeComissao] || '').trim();
          const comissao = parseNumericValue(row[colComissao]);
          const precoTabela = colPrecoTabela ? parseNumericValue(row[colPrecoTabela]) : 0;
          const valorPromocaoRaw = colValorPromocao ? parseNumericValue(row[colValorPromocao]) : null;
          const valorPromocao = valorPromocaoRaw && valorPromocaoRaw > 0 ? valorPromocaoRaw : null;
          const dataFimPromocao = colDataFimPromocao ? parseExcelDate(row[colDataFimPromocao]) : null;
          const valorVendaTotal = colValorVendaTotal ? parseNumericValue(row[colValorVendaTotal]) : 0;

          const prev = aggregatedMap.get(codigo);
          if (prev) {
            // Aggregate: sum quantities and values, keep most recent dates, keep highest promo price
            prev.quantidade += quantidade;
            prev.valorTotal += valorTotalRow;
            prev.valorVendaTotal += valorVendaTotal;
            // Keep the most recent sale date
            if (dataUltimaVenda && (!prev.dataUltimaVenda || dataUltimaVenda > prev.dataUltimaVenda)) {
              prev.dataUltimaVenda = dataUltimaVenda;
            }
            // Keep the most recent purchase date
            if (dataUltimaCompra && (!prev.dataUltimaCompra || dataUltimaCompra > prev.dataUltimaCompra)) {
              prev.dataUltimaCompra = dataUltimaCompra;
            }
            // Keep the latest promo end date
            if (dataFimPromocao && (!prev.dataFimPromocao || dataFimPromocao > prev.dataFimPromocao)) {
              prev.dataFimPromocao = dataFimPromocao;
            }
            // Keep promo values if present
            if (valorPromocao && (!prev.valorPromocao || valorPromocao > prev.valorPromocao)) {
              prev.valorPromocao = valorPromocao;
            }
            if (precoTabela > prev.precoTabela) prev.precoTabela = precoTabela;
          } else {
            aggregatedMap.set(codigo, {
              produtoId,
              quantidade,
              valorUnit,
              valorTotal: valorTotalRow,
              dataUltimaVenda,
              dataUltimaCompra,
              nomeComissao,
              comissao,
              precoTabela,
              valorPromocao,
              dataFimPromocao,
              valorVendaTotal,
            });
          }
        }

        // Second pass: create snapshots from aggregated data
        for (const [, agg] of aggregatedMap) {
          const diasSemVenda = calcDiasSemVenda(agg.dataUltimaVenda, now);
          const diasSemCompra = calcDiasSemVenda(agg.dataUltimaCompra, now);

          totalEstoque += agg.valorTotal;

          let percentualDesconto: number | null = null;
          if (agg.valorPromocao && agg.precoTabela > 0) {
            percentualDesconto = Math.round(((agg.precoTabela - agg.valorPromocao) / agg.precoTabela) * 10000) / 100;
          }

          // Use dias_sem_venda for categorization; fallback to dias_sem_compra if venda unavailable
          const diasParaCategoria = diasSemVenda >= 0 ? diasSemVenda : diasSemCompra;

          produtoSnapshots.push({
            id: generateId(),
            snapshot_id: snapshotId,
            produto_id: agg.produtoId,
            quantidade: agg.quantidade,
            valor_unitario: agg.valorUnit,
            valor_total: agg.valorTotal,
            data_ultima_venda: agg.dataUltimaVenda,
            data_ultima_compra: agg.dataUltimaCompra,
            dias_sem_venda: diasSemVenda,
            dias_sem_compra: diasSemCompra,
            categoria_estoque: getCategoriaEstoque(diasParaCategoria),
            nome_comissao: agg.nomeComissao,
            comissao: agg.comissao,
            preco_tabela: agg.precoTabela,
            valor_promocao: agg.valorPromocao,
            percentual_desconto: percentualDesconto,
            data_fim_promocao: agg.dataFimPromocao,
            valor_venda_total: agg.valorVendaTotal,
          });
        }

        snapshot.total_produtos = produtoSnapshots.length;
        snapshot.valor_total = totalEstoque;

        const diagnostics: ImportDiagnostics = {
          totalLinhasArquivo: rows.length,
          linhasSemCodigo: skippedNoCodigo,
          linhasValorZero: skippedZeroValue,
          linhasProcessadas: produtoSnapshots.length,
        };

        console.log('[Import Diagnostics]', diagnostics);

        resolve({ snapshot, produtos, produtoSnapshots, detectedColumns, warnings, diagnostics });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsArrayBuffer(file);
  });
}
