import { useState, useEffect, useMemo } from 'react';
import { parseLocalDate } from '@/types/inventory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Megaphone, Plus, Upload, Trash2, CalendarIcon, Search, ArrowUpDown, ChevronDown, ChevronRight, Users } from 'lucide-react';
import { KPICard } from '@/components/KPICard';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface CampanhaProduto {
  id: string;
  produto_id: string;
  campanha: string;
  canal: string;
  data_inicio: string;
  data_fim: string;
  created_at: string;
}

const CANAIS_CAMPANHA = ['Marketplace', 'Ecommerce', 'Mailing', 'Televendas'] as const;
type CanalCampanha = typeof CANAIS_CAMPANHA[number];

type StatusCampanha = 'ativa' | 'futura' | 'encerrada';
type StatusFilter = 'todas' | StatusCampanha;
type SortKey = 'campanha' | 'canal' | 'data_inicio' | 'data_fim' | 'status' | 'produtos';

interface CampanhaGroup {
  key: string;
  campanha: string;
  canal: string;
  data_inicio: string;
  data_fim: string;
  status: StatusCampanha;
  produtos: Array<{ id: string; produto_id: string }>;
}

function getCampanhaStatus(dataInicio: string, dataFim: string): StatusCampanha {
  const now = new Date(new Date().toDateString());
  const inicio = parseLocalDate(dataInicio);
  const fim = parseLocalDate(dataFim);
  if (now < inicio) return 'futura';
  if (now > fim) return 'encerrada';
  return 'ativa';
}

const STATUS_CONFIG: Record<StatusCampanha, { label: string; className: string }> = {
  ativa: { label: 'Ativa', className: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
  futura: { label: 'Futura', className: 'bg-blue-600 hover:bg-blue-700 text-white' },
  encerrada: { label: 'Encerrada', className: 'bg-muted text-muted-foreground' },
};

export default function Campanhas() {
  const [campanhas, setCampanhas] = useState<CampanhaProduto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todas');
  const [marcaFilter, setMarcaFilter] = useState('todas');
  const [sortKey, setSortKey] = useState<SortKey>('data_fim');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [produtoMarcaMap, setProdutoMarcaMap] = useState<Map<string, string>>(new Map());

  // Single campaign dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [campanhaNome, setCampanhaNome] = useState('');
  const [campanhaCanais, setCampanhaCanais] = useState<CanalCampanha[]>([]);
  const [campanhaCodigo, setCampanhaCodigo] = useState('');
  const [campanhaDataInicio, setCampanhaDataInicio] = useState<Date | undefined>();
  const [campanhaDataFim, setCampanhaDataFim] = useState<Date | undefined>();
  const [saving, setSaving] = useState(false);

  // Bulk dialog
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkNome, setBulkNome] = useState('');
  const [bulkCanais, setBulkCanais] = useState<CanalCampanha[]>([]);
  const [bulkDataInicio, setBulkDataInicio] = useState<Date | undefined>();
  const [bulkDataFim, setBulkDataFim] = useState<Date | undefined>();
  const [bulkCodigos, setBulkCodigos] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Pagination
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(0);

  const loadCampanhas = async () => {
    setLoading(true);
    const allData: CampanhaProduto[] = [];
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase
        .from('campanhas_produto')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + 999);
      if (error) { console.error(error); break; }
      const rows = (data || []) as CampanhaProduto[];
      allData.push(...rows);
      hasMore = rows.length === 1000;
      from += 1000;
    }
    setCampanhas(allData);
    setLoading(false);
  };

  useEffect(() => { loadCampanhas(); }, []);

  // Load produtos for marca filter
  useEffect(() => {
    const loadProdutos = async () => {
      const { data } = await supabase.from('produtos').select('codigo, marca');
      if (data) {
        const map = new Map<string, string>();
        data.forEach((p: any) => { if (p.marca) map.set(p.codigo, p.marca); });
        setProdutoMarcaMap(map);
      }
    };
    loadProdutos();
  }, []);

  const marcasUnicas = useMemo(() => {
    const set = new Set<string>();
    produtoMarcaMap.forEach(m => { if (m) set.add(m); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [produtoMarcaMap]);

  const enriched = useMemo(() => {
    return campanhas.map(c => ({
      ...c,
      status: getCampanhaStatus(c.data_inicio, c.data_fim),
    }));
  }, [campanhas]);

  // Group by identical campaign attributes
  const grouped = useMemo(() => {
    const map = new Map<string, CampanhaGroup>();
    for (const c of enriched) {
      const key = `${c.campanha}||${c.canal}||${c.data_inicio}||${c.data_fim}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          campanha: c.campanha,
          canal: c.canal,
          data_inicio: c.data_inicio,
          data_fim: c.data_fim,
          status: c.status,
          produtos: [],
        });
      }
      map.get(key)!.produtos.push({ id: c.id, produto_id: c.produto_id });
    }
    return Array.from(map.values());
  }, [enriched]);

  const filtered = useMemo(() => {
    let result = grouped;

    if (statusFilter !== 'todas') {
      result = result.filter(g => g.status === statusFilter);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(g =>
        g.campanha.toLowerCase().includes(term) ||
        g.canal.toLowerCase().includes(term) ||
        g.produtos.some(p => p.produto_id.toLowerCase().includes(term))
      );
    }

    result.sort((a, b) => {
      let va: any, vb: any;
      if (sortKey === 'status') {
        const order = { ativa: 0, futura: 1, encerrada: 2 };
        va = order[a.status]; vb = order[b.status];
      } else if (sortKey === 'produtos') {
        va = a.produtos.length; vb = b.produtos.length;
      } else {
        va = a[sortKey] || ''; vb = b[sortKey] || '';
      }
      if (typeof va === 'string') {
        const cmp = va.localeCompare(vb as string);
        return sortDir === 'desc' ? -cmp : cmp;
      }
      return sortDir === 'desc' ? (vb as number) - (va as number) : (va as number) - (vb as number);
    });

    return result;
  }, [grouped, statusFilter, searchTerm, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);

  useEffect(() => { setPage(0); }, [statusFilter, searchTerm]);

  const kpis = useMemo(() => {
    const ativas = grouped.filter(g => g.status === 'ativa').length;
    const futuras = grouped.filter(g => g.status === 'futura').length;
    const encerradas = grouped.filter(g => g.status === 'encerrada').length;
    const produtosUnicos = new Set(enriched.map(c => c.produto_id)).size;
    return { total: grouped.length, ativas, futuras, encerradas, produtosUnicos };
  }, [grouped, enriched]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
    setPage(0);
  };

  const SortableHeader = ({ label, keyName }: { label: string; keyName: SortKey }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(keyName)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
        {sortKey === keyName && <span className="text-xs">{sortDir === 'desc' ? '↓' : '↑'}</span>}
      </span>
    </TableHead>
  );

  const handleSaveSingle = async () => {
    if (!campanhaNome || campanhaCanais.length === 0 || !campanhaCodigo.trim() || !campanhaDataInicio || !campanhaDataFim) {
      toast.error('Preencha todos os campos');
      return;
    }
    setSaving(true);
    const payload = {
      produto_id: campanhaCodigo.trim(),
      campanha: campanhaNome,
      canal: campanhaCanais.join(', '),
      data_inicio: format(campanhaDataInicio, 'yyyy-MM-dd'),
      data_fim: format(campanhaDataFim, 'yyyy-MM-dd'),
    };
    const { error } = await supabase.from('campanhas_produto').insert(payload as any);
    if (error) {
      toast.error('Erro ao salvar campanha');
    } else {
      toast.success('Campanha criada!');
      setDialogOpen(false);
      resetSingleForm();
      loadCampanhas();
    }
    setSaving(false);
  };

  const handleSaveBulk = async () => {
    if (!bulkNome || bulkCanais.length === 0 || !bulkDataInicio || !bulkDataFim || !bulkCodigos.trim()) {
      toast.error('Preencha todos os campos');
      return;
    }
    setBulkSaving(true);
    const codigos = bulkCodigos.split(/[,;\n]+/).map(c => c.trim()).filter(Boolean);
    const canal = bulkCanais.join(', ');
    const dataInicio = format(bulkDataInicio, 'yyyy-MM-dd');
    const dataFim = format(bulkDataFim, 'yyyy-MM-dd');
    const rows = codigos.map(codigo => ({
      produto_id: codigo,
      campanha: bulkNome,
      canal,
      data_inicio: dataInicio,
      data_fim: dataFim,
    }));
    const { error } = await supabase.from('campanhas_produto').insert(rows as any);
    if (error) {
      toast.error('Erro ao salvar campanhas');
    } else {
      toast.success(`${codigos.length} produto(s) vinculados à campanha!`);
      setBulkDialogOpen(false);
      resetBulkForm();
      loadCampanhas();
    }
    setBulkSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('campanhas_produto').delete().eq('id', deleteId);
    if (error) {
      toast.error('Erro ao excluir campanha');
    } else {
      toast.success('Campanha excluída');
      setCampanhas(prev => prev.filter(c => c.id !== deleteId));
    }
    setDeleteId(null);
  };

  const resetSingleForm = () => {
    setCampanhaNome(''); setCampanhaCanais([]); setCampanhaCodigo('');
    setCampanhaDataInicio(undefined); setCampanhaDataFim(undefined);
  };

  const resetBulkForm = () => {
    setBulkNome(''); setBulkCanais([]); setBulkCodigos('');
    setBulkDataInicio(undefined); setBulkDataFim(undefined);
  };

  const formatDateBR = (d: string) => {
    const date = new Date(d + 'T00:00:00');
    return date.toLocaleDateString('pt-BR');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Campanhas</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { resetBulkForm(); setBulkDialogOpen(true); }}>
            <Upload className="h-4 w-4 mr-1" /> Em lote
          </Button>
          <Button size="sm" onClick={() => { resetSingleForm(); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nova Campanha
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard title="Total" value={String(kpis.total)} />
        <KPICard title="Ativas" value={String(kpis.ativas)} />
        <KPICard title="Futuras" value={String(kpis.futuras)} />
        <KPICard title="Encerradas" value={String(kpis.encerradas)} />
        <KPICard title="Produtos" value={String(kpis.produtosUnicos)} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Buscar</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 w-[250px]"
              placeholder="Campanha, código ou canal..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</label>
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="ativa">Ativas</SelectItem>
              <SelectItem value="futura">Futuras</SelectItem>
              <SelectItem value="encerrada">Encerradas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Megaphone className="h-10 w-10" />
              <p>Nenhuma campanha encontrada</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]" />
                    <SortableHeader label="Campanha" keyName="campanha" />
                    <SortableHeader label="Canal" keyName="canal" />
                    <SortableHeader label="Produtos" keyName="produtos" />
                    <SortableHeader label="Início" keyName="data_inicio" />
                    <SortableHeader label="Fim" keyName="data_fim" />
                    <SortableHeader label="Status" keyName="status" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map(g => {
                    const cfg = STATUS_CONFIG[g.status];
                    const isExpanded = expandedGroups.has(g.key);
                    return (
                      <>
                        <TableRow
                          key={g.key}
                          className="cursor-pointer hover:bg-accent/50"
                          onClick={() => toggleGroup(g.key)}
                        >
                          <TableCell className="px-2">
                            {isExpanded
                              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </TableCell>
                          <TableCell className="font-medium">{g.campanha}</TableCell>
                          <TableCell>{g.canal}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="gap-1">
                              <Users className="h-3 w-3" />
                              {g.produtos.length}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDateBR(g.data_inicio)}</TableCell>
                          <TableCell>{formatDateBR(g.data_fim)}</TableCell>
                          <TableCell>
                            <Badge className={cfg.className}>{cfg.label}</Badge>
                          </TableCell>
                        </TableRow>
                        {isExpanded && g.produtos.map(p => (
                          <TableRow key={p.id} className="bg-muted/30">
                            <TableCell />
                            <TableCell colSpan={2} className="font-mono text-xs text-muted-foreground pl-8">
                              Produto: {p.produto_id}
                            </TableCell>
                            <TableCell colSpan={3} />
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={(e) => { e.stopPropagation(); setDeleteId(p.id); }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    );
                  })}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <span className="text-xs text-muted-foreground">
                    {filtered.length} campanha(s) — Página {page + 1} de {totalPages}
                  </span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                    <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Próxima</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Single campaign dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Campanha</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Código do Produto</label>
              <Input value={campanhaCodigo} onChange={e => setCampanhaCodigo(e.target.value)} placeholder="Ex: 12345" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Nome da Campanha</label>
              <Input value={campanhaNome} onChange={e => setCampanhaNome(e.target.value)} placeholder="Ex: Black Friday 2025" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Canais</label>
              <div className="flex flex-wrap gap-3">
                {CANAIS_CAMPANHA.map(canal => (
                  <label key={canal} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={campanhaCanais.includes(canal)}
                      onCheckedChange={checked => {
                        setCampanhaCanais(prev => checked ? [...prev, canal] : prev.filter(c => c !== canal));
                      }}
                    />
                    {canal}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Data Início</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !campanhaDataInicio && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {campanhaDataInicio ? format(campanhaDataInicio, 'dd/MM/yyyy') : 'Selecionar'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={campanhaDataInicio} onSelect={setCampanhaDataInicio} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Data Fim</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !campanhaDataFim && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {campanhaDataFim ? format(campanhaDataFim, 'dd/MM/yyyy') : 'Selecionar'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={campanhaDataFim} onSelect={setCampanhaDataFim} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveSingle} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk campaign dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Campanha em Lote</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Nome da Campanha</label>
              <Input value={bulkNome} onChange={e => setBulkNome(e.target.value)} placeholder="Ex: Liquidação Verão" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Canais</label>
              <div className="flex flex-wrap gap-3">
                {CANAIS_CAMPANHA.map(canal => (
                  <label key={canal} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={bulkCanais.includes(canal)}
                      onCheckedChange={checked => {
                        setBulkCanais(prev => checked ? [...prev, canal] : prev.filter(c => c !== canal));
                      }}
                    />
                    {canal}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Data Início</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !bulkDataInicio && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {bulkDataInicio ? format(bulkDataInicio, 'dd/MM/yyyy') : 'Selecionar'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={bulkDataInicio} onSelect={setBulkDataInicio} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Data Fim</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !bulkDataFim && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {bulkDataFim ? format(bulkDataFim, 'dd/MM/yyyy') : 'Selecionar'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={bulkDataFim} onSelect={setBulkDataFim} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Códigos dos Produtos</label>
              <Textarea
                value={bulkCodigos}
                onChange={e => setBulkCodigos(e.target.value)}
                placeholder="Cole os códigos separados por vírgula, ponto e vírgula ou um por linha"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveBulk} disabled={bulkSaving}>{bulkSaving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
