import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: accept either Supabase JWT (frontend via SDK) or x-sync-secret header (n8n)
  const secretKey = req.headers.get("x-sync-secret");
  const expectedSecret = Deno.env.get("SYNC_ERP_SECRET");
  const authHeader = req.headers.get("authorization");
  const hasValidSecret = secretKey && expectedSecret && secretKey === expectedSecret;
  const hasJWT = authHeader?.startsWith("Bearer ");

  if (!hasValidSecret && !hasJWT) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();

    // --- TRIGGER MODE: frontend sends { action: "trigger" } to proxy the webhook to n8n ---
    if (body?.action === "trigger") {
      const n8nUrl = "https://n8n.syma.com.br/webhook/Solicitação_data_Lovable_estoque";
      const n8nRes = await fetch(n8nUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_sync: body.data_sync || new Date().toISOString() }),
      });
      return new Response(
        JSON.stringify({ status: "ok", message: "Trigger enviado ao n8n", n8n_status: n8nRes.status }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- IMPORT MODE: n8n sends the full payload ---
    // Accept [{ status, resumo, dados/produtos }] or { resumo, dados/produtos }
    const wrapper = Array.isArray(body) ? body[0] : body;
    const resumo = wrapper?.resumo || {};
    const rows = wrapper?.dados || wrapper?.produtos || [];

    // DEBUG: Log first row keys and sample data
    if (rows.length > 0) {
      console.log("DEBUG KEYS:", JSON.stringify(Object.keys(rows[0])));
      console.log("DEBUG SAMPLE:", JSON.stringify(rows[0]));
    }
    console.log("DEBUG RESUMO:", JSON.stringify(resumo));

    if (!rows.length) {
      return new Response(
        JSON.stringify({ status: "ok", message: "Nenhum produto recebido.", total: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date();
    const dataExecucao = resumo.data_execucao ? new Date(resumo.data_execucao) : now;
    const importDateISO = dataExecucao.toISOString();

    // 1. Upsert produtos — map field names from ERP format
    const produtosMap = new Map<string, any>();
    for (const row of rows) {
      // Support both formats: codigo field or produto (name) as identifier
      const codigo = String(row.codigo || row.code || row.produto || "").trim();
      if (!codigo) continue;
      if (!produtosMap.has(codigo)) {
        produtosMap.set(codigo, {
          codigo,
          descricao: String(row.descricao || row.description || row.produto || "").trim(),
          grupo: String(row.grupo || row.group || "").trim(),
          subgrupo: String(row.subgrupo || "").trim(),
          marca: String(row.marca || row.brand || "").trim(),
          estoque_minimo: 0,
        });
      }
    }

    const produtoRows = Array.from(produtosMap.values());
    for (let i = 0; i < produtoRows.length; i += 500) {
      const batch = produtoRows.slice(i, i + 500);
      const { error } = await supabase.from("produtos").upsert(batch, { onConflict: "codigo" });
      if (error) throw new Error(`Erro ao inserir produtos: ${error.message}`);
    }

    // 2. Fetch all produto IDs
    const codigoToId = new Map<string, string>();
    let pgFrom = 0;
    let pgMore = true;
    while (pgMore) {
      const { data: pData } = await supabase.from("produtos").select("id, codigo").range(pgFrom, pgFrom + 999);
      const r = pData || [];
      for (const p of r) codigoToId.set(p.codigo, p.id);
      pgMore = r.length === 1000;
      pgFrom += 1000;
    }

    // 3. Build snapshot
    const snapshotId = crypto.randomUUID();
    let totalValorEstoque = 0;
    const snapshotRows: any[] = [];

    for (const row of rows) {
      const codigo = String(row.codigo || row.code || row.produto || "").trim();
      const produtoId = codigoToId.get(codigo);
      if (!produtoId) continue;

      // Map ERP fields: estoque→quantidade, valor_estoque→valor_total, preco_venda→preco_tabela
      const quantidade = Number(row.quantidade || row.quantity || row.estoque || 0);
      const valorUnit = Number(row.valor_unitario || row.unit_value || 0);
      const valorTotal = Number(row.valor_total || row.total_value || row.valor_estoque || quantidade * valorUnit);
      const dataUltimaVenda = row.data_ultima_venda || row.last_sale_date || null;
      const dataUltimaCompra = row.data_ultima_compra || row.last_purchase_date || null;
      const diasSemVenda = calcDias(dataUltimaVenda, dataExecucao);
      const diasSemCompra = calcDias(dataUltimaCompra, dataExecucao);
      const precoTabela = Number(row.preco_tabela || row.list_price || row.preco_venda || 0);
      const promoRaw = Number(row.valor_promocao || row.promocao || 0);
      const valorPromocao = promoRaw > 0 ? promoRaw : null;
      const dataFimPromocao = row.data_fim_promocao || null;

      let percentualDesconto: number | null = null;
      if (valorPromocao && precoTabela > 0) {
        percentualDesconto = Math.round(((precoTabela - valorPromocao) / precoTabela) * 10000) / 100;
      }

      totalValorEstoque += valorTotal;

      snapshotRows.push({
        snapshot_id: snapshotId,
        produto_id: produtoId,
        quantidade,
        valor_unitario: valorUnit || (quantidade > 0 ? valorTotal / quantidade : 0),
        valor_total: valorTotal,
        data_ultima_venda: dataUltimaVenda,
        data_ultima_compra: dataUltimaCompra,
        dias_sem_venda: diasSemVenda,
        dias_sem_compra: diasSemCompra,
        categoria_estoque: getCategoriaEstoque(diasSemVenda >= 0 ? diasSemVenda : diasSemCompra),
        nome_comissao: String(row.nome_comissao || ""),
        comissao: Number(row.comissao || 0),
        preco_tabela: precoTabela,
        valor_promocao: valorPromocao,
        percentual_desconto: percentualDesconto,
        data_fim_promocao: dataFimPromocao,
        valor_venda_total: 0,
      });
    }

    // 4. Insert snapshot header
    const { error: snapErr } = await supabase.from("estoque_snapshots").insert({
      id: snapshotId,
      data_importacao: importDateISO,
      nome_arquivo: `Sync ERP - ${importDateISO.split("T")[0]}`,
      usuario: "Sync ERP",
      data_criacao: importDateISO,
      total_produtos: snapshotRows.length,
      valor_total: totalValorEstoque,
    });
    if (snapErr) throw new Error(`Erro ao criar snapshot: ${snapErr.message}`);

    // 5. Insert produto snapshots in batches
    for (let i = 0; i < snapshotRows.length; i += 500) {
      const batch = snapshotRows.slice(i, i + 500);
      const { error } = await supabase.from("estoque_produto_snapshots").insert(batch);
      if (error) throw new Error(`Erro ao inserir snapshots: ${error.message}`);
    }

    console.log(`Sync ERP: ${snapshotRows.length} produtos importados, snapshot ${snapshotId}`);

    return new Response(
      JSON.stringify({
        status: "ok",
        snapshot_id: snapshotId,
        total_produtos: snapshotRows.length,
        valor_total: totalValorEstoque,
        data_importacao: importDateISO,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("sync-erp-webhook error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Erro ao processar importação" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
