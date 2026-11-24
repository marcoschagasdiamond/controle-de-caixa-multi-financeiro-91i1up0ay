import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * remover-usuario — apaga o login de um convidado que ainda não tem
 * nenhum financeiro marcado (nenhuma linha em equipe_membros).
 * Body: { userId: string }
 * Validações:
 *  - chamador autenticado (token do usuário logado);
 *  - o alvo foi convidado pelo chamador (raw_user_meta_data.invited_by);
 *  - o alvo não tem NENHUM vínculo em equipe_membros (nenhuma empresa marcada).
 * Apaga via Admin API (service_role).
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

    const { userId } = await req.json()
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Informe o userId do convidado.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!SERVICE_ROLE) {
      return new Response(
        JSON.stringify({ error: 'Chave de serviço não configurada no backend.' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      )
    }
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // O alvo precisa ser convidado do chamador e não ter nenhum acesso.
    const { data: alvo, error: alvoErr } = await supabaseAdmin.auth.admin.getUserById(
      String(userId),
    )
    if (alvoErr || !alvo.user) {
      return new Response(JSON.stringify({ error: 'Usuário não encontrado.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }
    if (alvo.user.user_metadata?.invited_by !== user.id) {
      return new Response(JSON.stringify({ error: 'Este usuário não foi convidado por você.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }
    if (alvo.user.user_metadata?.invited_by === user.id && alvo.user.id === user.id) {
      return new Response(JSON.stringify({ error: 'Não é possível remover a si mesmo.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }
    const { data: vinculos } = await supabaseAdmin
      .from('equipe_membros')
      .select('id')
      .eq('member_user_id', String(userId))
      .limit(1)
    if (vinculos && vinculos.length > 0) {
      return new Response(
        JSON.stringify({
          error:
            'Este convidado já tem empresas marcadas. Remova os acessos pela listagem da Equipe.',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      )
    }

    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(String(userId))
    if (delErr) {
      return new Response(JSON.stringify({ error: delErr.message ?? 'Erro ao remover.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message ?? 'Erro inesperado.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
