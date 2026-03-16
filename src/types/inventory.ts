export interface Produto {
  id: string;
  codigo: string;
  descricao: string;
  grupo: string;
  subgrupo: string;
  marca: string;
  data_criacao: string;
}

export interface EstoqueSnapshot {
  id: string;
  data_importacao: string;
  nome_arquivo: string;
  usuario: string;
  data_criacao: string;
  total_produtos: number;
  valor_total: number;
}

export interface EstoqueProdutoSnapshot {
  id: string;
  snapshot_id: string;
  produto_id: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  data_ultima_venda: string | null;
  data_ultima_compra: string | null;
  dias_sem_venda: number;
  dias_sem_compra: number;
  categoria_estoque: CategoriaEstoque;
  nome_comissao: string;
  comissao: number;
}

export type CategoriaEstoque = '0-90' | '90-180' | '180-270' | '270-365' | '365+' | 'sem-registro';

export interface AgingCategory {
  key: CategoriaEstoque;
  label: string;
  className: string;
  bgClassName: string;
  min: number;
  max: number;
}

export const AGING_CATEGORIES: AgingCategory[] = [
  { key: '0-90', label: 'Saudável', className: 'text-aging-healthy', bgClassName: 'bg-aging-healthy', min: 0, max: 90 },
  { key: '90-180', label: 'Estável', className: 'text-aging-stable', bgClassName: 'bg-aging-stable', min: 90, max: 180 },
  { key: '180-270', label: 'Alerta', className: 'text-aging-warning', bgClassName: 'bg-aging-warning', min: 180, max: 270 },
  { key: '270-365', label: 'Risco', className: 'text-aging-alert', bgClassName: 'bg-aging-alert', min: 270, max: 365 },
  { key: '365+', label: 'Crítico', className: 'text-aging-critical', bgClassName: 'bg-aging-critical', min: 365, max: Infinity },
  { key: 'sem-registro', label: 'Sem Registro', className: 'text-muted-foreground', bgClassName: 'bg-muted', min: -1, max: -1 },
];

export function getAgingCategory(dias: number): AgingCategory {
  if (dias < 0) return AGING_CATEGORIES[5]; // sem-registro
  return AGING_CATEGORIES.find(c => dias >= c.min && dias < c.max) || AGING_CATEGORIES[4];
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('pt-BR');
}
