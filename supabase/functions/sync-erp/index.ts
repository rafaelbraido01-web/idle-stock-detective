import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { connect } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getCategoriaEstoque(dias: number): string {
  if (dias < 0) return "sem-registro";
  if (dias <= 90) return "0-90";
  if (dias <= 180) return "90-180";
  if (dias <= 270) return "180-270";
  if (dias <= 365) return "270-365";
  return "365+";
}

function calcDias(dateStr: string | null, ref: Date): number {
  if (!dateStr) return -1;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return -1;
  return Math.max(0, Math.floor((ref.getTime() - d.getTime()) / 86400000));
}

function formatMySQLDate(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.toISOString().split("T")[0];
  }
  const s = String(v).trim();
  if (!s || s === "0000-00-00") return null;
  return s.substring(0, 10);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { data_referencia } = await req.json();
    const refDate = data_referencia ? new Date(data_referencia) : new Date();

    // Check ERP credentials
    const erpHost = Deno.env.get("ERP_DB_HOST");
    const erpPort = Deno.env.get("ERP_DB_PORT") || "3306";
    const erpUser = Deno.env.get("ERP_DB_USER");
    const erpPassword = Deno.env.get("ERP_DB_PASSWORD");
    const erpDbName = Deno.env.get("ERP_DB_NAME") || "mesquita_publico";

    if (!erpHost || !erpUser || !erpPassword) {
      return new Response(
        JSON.stringify({ error: "Credenciais do ERP não configuradas. Configure ERP_DB_HOST, ERP_DB_USER e ERP_DB_PASSWORD." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Connect to MySQL ERP
    const mysqlConn = await connect({
      hostname: erpHost,
      port: parseInt(erpPort),
      username: erpUser,
      password: erpPassword,
      db: erpDbName,
    });

    // Query 1: Products with stock, costs, prices, groups, brands
    const mainQuery = `
      SELECT
        p.codigo,
        p.descricao,
        g.nome AS grupo,
        sg.descricao AS subgrupo,
        pm.descricao AS marca,
        COALESCE(SUM(ps.estoque), 0) AS quantidade,
        COALESCE(pc.custo_medio, 0) AS valor_unitario,
        COALESCE(SUM(ps.estoque), 0) * COALESCE(pc.custo_medio, 0) AS valor_total,
        pc.ult_compra AS data_ultima_compra,
        COALESCE(tp.preco, 0) AS preco_tabela,
        tp.promocao AS valor_promocao,
        tp.valid_prom AS data_fim_promocao,
        tp.inicio_prom AS data_inicio_promocao
      FROM mesquita_publico.cad_prod p
        INNER JOIN mesquita_publico.cad_pgru g ON p.grupo = g.codigo
        INNER JOIN mesquita_publico.subgrupos sg ON p.subgrupo = sg.codigo AND p.grupo = sg.cod_grupo
        LEFT JOIN mesquita_publico.cad_pmar pm ON p.marca = pm.codigo
        LEFT JOIN mesquita_estoque.prod_setor ps ON ps.produto = p.codigo AND ps.estoque > 0
        LEFT JOIN mesquita_publico.prod_custos pc ON pc.produto = p.codigo
        LEFT JOIN mesquita_publico.prod_tabprecos tp ON tp.produto = p.codigo
      WHERE p.tipo IN ('1','7','8') AND p.ativo = 's'
      GROUP BY p.codigo, p.descricao, g.nome, sg.descricao, pm.descricao,
               pc.custo_medio, pc.ult_compra, tp.preco, tp.promocao,
               tp.valid_prom, tp.inicio_prom
    `;

    const mainRows = await mysqlConn.query(mainQuery);

    // Query 2: Last sale date per product
    const lastSaleQuery = `
      SELECT
        pro.produto AS codigo,
        MAX(orca.data_baixa) AS data_ultima_venda
      FROM mesquita_vendas.pro_orca pro
        INNER JOIN mesquita_vendas.cad_orca orca ON pro.orcamento = orca.codigo
      WHERE orca.tipo_os = 0
        AND orca.situacao IN ('F', 'B')
        AND orca.data_baixa IS NOT NULL
        AND orca.data_baixa != '0000-00-00'
      GROUP BY pro.produto
    `;

    let lastSaleMap = new Map<string, string>();
    try {
      const saleRows = await mysqlConn.query(lastSaleQuery);
      for (const row of saleRows) {
        const dt = formatMySQLDate(row.data_ultima_venda);
        if (dt) lastSaleMap.set(String(row.codigo), dt);
      }
    } catch (e) {
      console.warn("Could not fetch last sale dates:", e);
    }

    // Query 3: Commission rules per product
    const comissQuery = `
      SELECT
        i.cod_item AS codigo,
        r.descricao AS nome_comissao,
        r.comissao
      FROM mesquita_vendas.regras_comis r
        INNER JOIN mesquita_vendas.itens_regra_comis i ON r.codigo = i.regra
      WHERE r.aplic_prod = 'E' AND r.subaplic_prod = 'P' AND i.tipo = 'P'
    `;

    let comissMap = new Map<string, { nome: string; valor: number }>();
    try {
      const comissRows = await mysqlConn.query(comissQuery);
      for (const row of comissRows) {
        comissMap.set(String(row.codigo), {
          nome: String(row.nome_comissao || ""),
          valor: Number(row.comissao) || 0,
        });
      }
    } catch (e) {
      console.warn("Could not fetch commission rules:", e);
    }

    await mysqlConn.close();

    // Build snapshot
    const snapshotId = crypto.randomUUID();
    const nowISO = new Date().toISOString();

    const produtosMap = new Map<string, {
      codigo: string;
      descricao: string;
      grupo: string;
      subgrupo: string;
      marca: string;
    }>();

    interface AggRow {
      quantidade: number;
      valorUnit: number;
      valorTotal: number;
      dataUltimaCompra: string | null;
      dataUltimaVenda: string | null;
      precoTabela: number;
      valorPromocao: number | null;
      dataFimPromocao: string | null;
      nomeComissao: string;
      comissao: number;
    }

    const aggMap = new Map<string, AggRow>();

    for (const row of mainRows) {
      const codigo = String(row.codigo);
      const quantidade = Number(row.quantidade) || 0;
      const valorUnit = Number(row.valor_unitario) || 0;
      const valorTotal = Number(row.valor_total) || 0;
      const dataUltimaCompra = formatMySQLDate(row.data_ultima_compra);
      const precoTabela = Number(row.preco_tabela) || 0;
      const promoRaw = Number(row.valor_promocao) || 0;
      const valorPromocao = promoRaw > 0 ? promoRaw : null;
      const dataFimPromocao = formatMySQLDate(row.data_fim_promocao);

      if (!produtosMap.has(codigo)) {
        produtosMap.set(codigo, {
          codigo,
          descricao: String(row.descricao || ""),
          grupo: String(row.grupo || ""),
          subgrupo: String(row.subgrupo || ""),
          marca: String(row.marca || ""),
        });
      }

      const comiss = comissMap.get(codigo);
      const dataUltimaVenda = lastSaleMap.get(codigo) || null;

      const prev = aggMap.get(codigo);
      if (prev) {
        if (quantidade > prev.quantidade) prev.quantidade = quantidade;
        if (valorTotal > prev.valorTotal) prev.valorTotal = valorTotal;
        if (precoTabela > prev.precoTabela) prev.precoTabela = precoTabela;
        if (valorPromocao && (!prev.valorPromocao || valorPromocao > prev.valorPromocao)) {
          prev.valorPromocao = valorPromocao;
        }
        if (dataFimPromocao && (!prev.dataFimPromocao || dataFimPromocao > prev.dataFimPromocao)) {
          prev.dataFimPromocao = dataFimPromocao;
        }
        if (dataUltimaCompra && (!prev.dataUltimaCompra || dataUltimaCompra > prev.dataUltimaCompra)) {
          prev.dataUltimaCompra = dataUltimaCompra;
        }
      } else {
        aggMap.set(codigo, {
          quantidade,
          valorUnit,
          valorTotal,
          dataUltimaCompra,
          dataUltimaVenda,
          precoTabela,
          valorPromocao,
          dataFimPromocao,
          nomeComissao: comiss?.nome || "",
          comissao: comiss?.valor || 0,
        });
      }
    }

    // Build arrays for Supabase insert
    const produtoRows = Array.from(produtosMap.values()).map((p) => ({
      id: crypto.randomUUID(),
      codigo: p.codigo,
      descricao: p.descricao,
      grupo: p.grupo,
      subgrupo: p.subgrupo,
      marca: p.marca,
      estoque_minimo: 0,
      data_criacao: nowISO,
    }));

    let totalValorEstoque = 0;
    const produtoSnapshotRows: any[] = [];

    // We need the actual produto IDs after upsert, so we'll insert produtos first,
    // then fetch IDs
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supa = createClient(supabaseUrl, supabaseKey);

    // Upsert produtos in batches
    for (let i = 0; i < produtoRows.length; i += 500) {
      const batch = produtoRows.slice(i, i + 500);
      const { error } = await supa.from("produtos").upsert(batch, { onConflict: "codigo" });
      if (error) throw new Error(`Erro ao inserir produtos: ${error.message}`);
    }

    // Fetch all produto IDs
    const codigoToId = new Map<string, string>();
    let pgFrom = 0;
    let pgMore = true;
    while (pgMore) {
      const { data } = await supa.from("produtos").select("id, codigo").range(pgFrom, pgFrom + 999);
      const rows2 = data || [];
      for (const r of rows2) codigoToId.set(r.codigo, r.id);
      pgMore = rows2.length === 1000;
      pgFrom += 1000;
    }

    // Build produto snapshots
    for (const [codigo, agg] of aggMap) {
      const produtoId = codigoToId.get(codigo);
      if (!produtoId) continue;

      const diasSemVenda = calcDias(agg.dataUltimaVenda, refDate);
      const diasSemCompra = calcDias(agg.dataUltimaCompra, refDate);

      let percentualDesconto: number | null = null;
      if (agg.valorPromocao && agg.precoTabela > 0) {
        percentualDesconto = Math.round(((agg.precoTabela - agg.valorPromocao) / agg.precoTabela) * 10000) / 100;
      }

      totalValorEstoque += agg.valorTotal;

      produtoSnapshotRows.push({
        id: crypto.randomUUID(),
        snapshot_id: snapshotId,
        produto_id: produtoId,
        quantidade: agg.quantidade,
        valor_unitario: agg.valorUnit,
        valor_total: agg.valorTotal,
        data_ultima_venda: agg.dataUltimaVenda,
        data_ultima_compra: agg.dataUltimaCompra,
        dias_sem_venda: diasSemVenda,
        dias_sem_compra: diasSemCompra,
        categoria_estoque: getCategoriaEstoque(diasSemVenda >= 0 ? diasSemVenda : diasSemCompra),
        nome_comissao: agg.nomeComissao,
        comissao: agg.comissao,
        preco_tabela: agg.precoTabela,
        valor_promocao: agg.valorPromocao,
        percentual_desconto: percentualDesconto,
        data_fim_promocao: agg.dataFimPromocao,
        valor_venda_total: 0,
      });
    }

    // Insert snapshot
    const { error: snapErr } = await supa.from("estoque_snapshots").insert({
      id: snapshotId,
      data_importacao: refDate.toISOString(),
      nome_arquivo: `Sync ERP - ${refDate.toISOString().split("T")[0]}`,
      usuario: "Sync ERP",
      data_criacao: nowISO,
      total_produtos: produtoSnapshotRows.length,
      valor_total: totalValorEstoque,
    });
    if (snapErr) throw new Error(`Erro ao criar snapshot: ${snapErr.message}`);

    // Insert produto snapshots in batches
    for (let i = 0; i < produtoSnapshotRows.length; i += 500) {
      const batch = produtoSnapshotRows.slice(i, i + 500);
      const { error } = await supa.from("estoque_produto_snapshots").insert(batch);
      if (error) throw new Error(`Erro ao inserir produto snapshots: ${error.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        snapshot_id: snapshotId,
        total_produtos: produtoSnapshotRows.length,
        valor_total: totalValorEstoque,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("sync-erp error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
