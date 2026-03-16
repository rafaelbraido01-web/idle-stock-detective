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

  // Excel serial date number
  if (typeof value === 'number') {
    try {
      const date = XLSX.SSF.parse_date_code(value);
      if (date && date.y > 1900) {
        return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
      }
    } catch { /* fall through */ }
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

    // Try dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy
    const match = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    if (match) {
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      let year = match[3];
      if (year.length === 2) year = `20${year}`;
      return `${year}-${month}-${day}`;
    }

    // Try yyyy-mm-dd or yyyy/mm/dd
    const isoMatch = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
    }

    // Try parsing as Date
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900) {
      return parsed.toISOString().split('T')[0];
    }
  }

  return null;
}

function calcDiasSemVenda(dataUltimaVenda: string | null, referenceDate: Date): number {
  if (!dataUltimaVenda) return -1; // -1 = sem registro
  const lastSale = new Date(dataUltimaVenda);
  if (isNaN(lastSale.getTime())) return -1;
  const diff = referenceDate.getTime() - lastSale.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

interface ImportResult {
  snapshot: EstoqueSnapshot;
  produtos: Produto[];
  produtoSnapshots: EstoqueProdutoSnapshot[];
  detectedColumns: Record<string, string>;
  warnings: string[];
}

export function processExcelFile(file: File, existingProdutos: Produto[]): Promise<ImportResult> {
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

        const now = new Date();
        const snapshotId = generateId();
        const existingMap = new Map(existingProdutos.map(p => [p.codigo, p]));

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

        // Auto-detect columns
        const sampleKeys = Object.keys(rows[0]);
        const findKey = (candidates: string[]): string => {
          // First try exact match (case-insensitive)
          for (const k of sampleKeys) {
            const kl = k.toLowerCase().replace(/[_.\s]+/g, '');
            for (const c of candidates) {
              const cl = c.toLowerCase().replace(/[_.\s]+/g, '');
              if (kl === cl) return k;
            }
          }
          // Then try includes
          return sampleKeys.find(k => {
            const kl = k.toLowerCase().replace(/[_.\s]+/g, '');
            return candidates.some(c => kl.includes(c.toLowerCase().replace(/[_.\s]+/g, '')));
          }) || '';
        };

        const colCodigo = findKey(['codigo', 'código', 'cod', 'codprod', 'cod_prod', 'cod prod', 'code']);
        const colDescricao = findKey(['descricao', 'descrição', 'descri', 'produto', 'nome', 'desc', 'nome_produto', 'nmproduto']);
        const colGrupo = findKey(['grupo', 'group', 'categoria', 'nmgrupo', 'nm_grupo']);
        const colSubgrupo = findKey(['subgrupo', 'sub_grupo', 'sub grupo', 'subcategoria', 'nmsubgrupo']);
        const colMarca = findKey(['marca', 'brand', 'fabricante', 'nmmarca']);
        const colQuantidade = findKey(['qtd', 'quantidade', 'qtde', 'quant', 'estoque', 'saldo', 'qt', 'qtdestoque', 'qtd_estoque']);
        const colValorUnit = findKey(['valorunit', 'valor_unit', 'preco', 'preço', 'unitario', 'unitário', 'vlr_unit', 'vlrunit', 'precovenda', 'preco_venda']);
        const colValorTotal = findKey(['valortotal', 'valor_total', 'vlr_total', 'vlrtotal', 'total']);
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
        };

        const warnings: string[] = [];
        if (!colCodigo) warnings.push('Coluna de código não encontrada');
        if (!colQuantidade) warnings.push('Coluna de quantidade não encontrada');
        if (!colUltimaVenda) warnings.push('Coluna de data de última venda não encontrada — todos os produtos serão classificados como "Sem registro"');

        let totalEstoque = 0;

        for (const row of rows) {
          const codigo = String(row[colCodigo] || '').trim();
          if (!codigo) continue;

          const existing = existingMap.get(codigo);
          const produtoId = existing?.id || generateId();

          if (!existing) {
            const produto: Produto = {
              id: produtoId,
              codigo,
              descricao: String(row[colDescricao] || '').trim(),
              grupo: String(row[colGrupo] || '').trim(),
              subgrupo: String(row[colSubgrupo] || '').trim(),
              marca: String(row[colMarca] || '').trim(),
              data_criacao: now.toISOString(),
            };
            produtos.push(produto);
            existingMap.set(codigo, produto);
          }

          const quantidade = Number(row[colQuantidade]) || 0;
          const valorUnit = Number(row[colValorUnit]) || 0;
          const valorTotalRow = Number(row[colValorTotal]) || (quantidade * valorUnit);
          const dataUltimaVenda = parseExcelDate(row[colUltimaVenda]);
          const diasSemVenda = calcDiasSemVenda(dataUltimaVenda, now);

          totalEstoque += valorTotalRow;

          produtoSnapshots.push({
            id: generateId(),
            snapshot_id: snapshotId,
            produto_id: produtoId,
            quantidade,
            valor_unitario: valorUnit,
            valor_total: valorTotalRow,
            data_ultima_venda: dataUltimaVenda,
            dias_sem_venda: diasSemVenda,
            categoria_estoque: getCategoriaEstoque(diasSemVenda),
          });
        }

        snapshot.total_produtos = produtoSnapshots.length;
        snapshot.valor_total = totalEstoque;

        resolve({ snapshot, produtos, produtoSnapshots, detectedColumns, warnings });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsArrayBuffer(file);
  });
}
