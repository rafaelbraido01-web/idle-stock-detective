import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const body = await req.json();
    const payload = {
      codigo: body.codigo ?? null,
      produto: body.produto ?? null,
      marca: body.marca ?? null,
      preco_mercado: body.preco_mercado ?? null,
      fonte: body.fonte ?? null,
      link: body.link ?? null,
      observacao: body.observacao ?? null,
      updated_at: body.updated_at || new Date().toISOString(),
    };

    const n8nUrls = [
      "https://n8n.syma.com.br/webhook/Atualizacao_preco_mercado",
      "https://n8n.syma.com.br/webhook-test/Atualizacao_preco_mercado",
    ];

    const results = await Promise.allSettled(
      n8nUrls.map((url) =>
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      ),
    );

    const statuses = results.map((r) =>
      r.status === "fulfilled" ? r.value.status : `error: ${r.reason}`,
    );

    return new Response(
      JSON.stringify({ status: "ok", n8n_statuses: statuses }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("notify-market-price-update error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Erro ao notificar n8n" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
