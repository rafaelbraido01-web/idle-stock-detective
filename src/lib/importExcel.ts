import * as XLSX from 'xlsx';
import type { Produto, EstoqueSnapshot, EstoqueProdutoSnapshot, CategoriaEstoque } from '@/types/inventory';

function generateId(): string {
  return crypto.randomUUID();
}

function getCategoriaEstoque(dias: number): CategoriaEstoque {
  if (dias <= 90) return '0-90';
  if (dias <= 180) return '90-180';
  if (dias <= 270) return '180-270';
  if (dias <= 365) return '270-365';
  return '365+';
}

function parseExcelDate(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }
  if (typeof value === 'string') {
    // Try dd/mm/yyyy
    const parts = value.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return value;
  }
  return null;
}

function calcDiasSemVenda(dataUltimaVenda: string | null, referenceDate: Date): number {
  if (!dataUltimaVenda) return 9999;
  const lastSale = new Date(dataUltimaVenda);
  const diff = referenceDate.getTime() - lastSale.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

interface ImportResult {
  snapshot: EstoqueSnapshot;
  produtos: Produto[];
  produtoSnapshots: EstoqueProdutoSnapshot[];
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

        // Auto-detect columns by looking at header keys
        const sampleKeys = Object.keys(rows[0]);
        const findKey = (candidates: string[]) => 
          sampleKeys.find(k => candidates.some(c => k.toLowerCase().includes(c.toLowerCase()))) || '';

        const colCodigo = findKey(['codigo', 'código', 'cod', 'Codigo', 'CODIGO', 'Código']);
        const colDescricao = findKey(['descri', 'Descri', 'DESCRI', 'produto', 'Produto', 'PRODUTO']);
        const colGrupo = findKey(['grupo', 'Grupo', 'GRUPO']);
        const colSubgrupo = findKey(['subgrupo', 'Subgrupo', 'SUBGRUPO', 'sub_grupo']);
        const colMarca = findKey(['marca', 'Marca', 'MARCA']);
        const colQuantidade = findKey(['qtd', 'quantidade', 'Quantidade', 'QUANTIDADE', 'Qtd', 'QTD', 'estoque', 'Estoque']);
        const colValorUnit = findKey(['valor_unit', 'preco', 'Preco', 'PRECO', 'unitario', 'Unitário', 'Unitario', 'vlr_unit', 'Vlr']);
        const colValorTotal = findKey(['valor_total', 'total', 'Total', 'TOTAL', 'vlr_total']);
        const colUltimaVenda = findKey(['ultima_venda', 'Ultima_Venda', 'dt_ultima', 'Dt_Ultima', 'última', 'ultima', 'Ultima', 'ult_venda', 'data_venda']);

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

        resolve({ snapshot, produtos, produtoSnapshots });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsArrayBuffer(file);
  });
}
