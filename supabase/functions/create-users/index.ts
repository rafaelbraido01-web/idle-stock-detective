import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const users = [
    { email: "marcos@syma.com.br", password: "Uvxz100%!m", allowed_pages: null },
    { email: "marisa@syma.com.br", password: "Uvxz100%!", allowed_pages: null },
    { email: "marketing@syma.com.br", password: "Uvxz100%!m", allowed_pages: null },
    { email: "compras@syma.com.br", password: "Uvxz100%!c", allowed_pages: ["promocoes", "preco-mercado"] },
  ];

  const results = [];

  for (const u of users) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    });

    if (error) {
      results.push({ email: u.email, error: error.message });
      continue;
    }

    if (u.allowed_pages && data.user) {
      const { error: insertErr } = await supabaseAdmin
        .from("user_allowed_pages")
        .insert({ user_id: data.user.id, allowed_pages: u.allowed_pages });

      if (insertErr) {
        results.push({ email: u.email, created: true, permissions_error: insertErr.message });
        continue;
      }
    }

    results.push({ email: u.email, created: true });
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
