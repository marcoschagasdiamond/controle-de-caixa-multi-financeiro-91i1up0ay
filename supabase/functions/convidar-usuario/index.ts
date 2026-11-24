import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * convidar-usuario — cria login de membro da equipe (Admin API).
 * Body: { email: string, senhaTemporaria: string, nome?: string }
 * O chamador precisa ser o dono (master) — validado pelo token de
 * autenticação do usuário logado.
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )

    // Quem está chamando?
    const {
      data: { user },
      error: userErr,
    } = await supabaseUser.auth.getUser()
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Não autenticado.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const { email, senhaTemporaria } = await req.json()
    if (!email || !senhaTemporaria || String(senhaTemporaria).length < 6) {
      return new Response(
        JSON.stringify({ error: 'Informe e-mail e senha temporária (mín. 6 caracteres).' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      )
    }

    // Admin API com service_role: cria o usuário já confirmado.
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: 'Chave de serviço não configurada no backend.' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      )
    }
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: String(email).trim().toLowerCase(),
      password: String(senhaTemporaria),
      email_confirm: true,
      user_metadata: { invited_by: user.id },
    })

    if (createErr) {
      const msg = createErr.message ?? 'Erro ao criar usuário.'
      return new Response(JSON.stringify({ error: msg }), {
        status: createErr.status && createErr.status >= 400 ? createErr.status : 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    return new Response(
      JSON.stringify({ user: { id: created.user?.id, email: created.user?.email } }),
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    )
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message ?? 'Erro inesperado.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
