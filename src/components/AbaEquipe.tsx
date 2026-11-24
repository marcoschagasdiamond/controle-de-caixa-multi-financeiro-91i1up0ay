import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { EquipeService } from '@/services/equipe'
import { Financeiro, MembroEquipeView } from '@/types/financeiro'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Users, UserPlus, Loader2, Trash2, ShieldCheck, KeyRound } from 'lucide-react'

const CORES_FIN: Record<string, string> = {}

interface Props {
  financeiros: Financeiro[]
}

export default function AbaEquipe({ financeiros }: Props) {
  const { toast } = useToast()
  const [membros, setMembros] = useState<MembroEquipeView[]>([])
  const [loading, setLoading] = useState(true)
  const [novoEmail, setNovoEmail] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null) // `${member}:${fin}`
  const [meuId, setMeuId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeuId(data.user?.id ?? null))
    carregar()
  }, [])

  const carregar = async () => {
    try {
      setLoading(true)
      setMembros(await EquipeService.getMembros())
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao carregar equipe', description: err.message })
    } finally {
      setLoading(false)
    }
  }

  const gerarSenha = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    let s = ''
    for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)]
    setNovaSenha(s)
  }

  const handleConvidar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!novoEmail.trim() || !novaSenha.trim()) return
    try {
      setSalvando(true)
      const res = await EquipeService.convidarUsuario(novoEmail.trim(), novaSenha)
      if (res.error) throw new Error(res.error)
      toast({
        title: 'Acesso criado com sucesso!',
        description: `${novoEmail.trim()} pode logar com a senha temporária definida. Marque abaixo os financeiros que ele acessa.`,
      })
      setNovoEmail('')
      setNovaSenha('')
      await carregar()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao criar acesso', description: err.message })
    } finally {
      setSalvando(false)
    }
  }

  const handleToggleAcesso = async (
    memberUserId: string,
    financeiroId: string,
    liberado: boolean,
  ) => {
    const chave = `${memberUserId}:${financeiroId}`
    try {
      setToggling(chave)
      await EquipeService.setAcesso(memberUserId, financeiroId, liberado)
      await carregar()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao alterar acesso', description: err.message })
    } finally {
      setToggling(null)
    }
  }

  const handleRemoverMembro = async (m: MembroEquipeView) => {
    const semVinculo = m.financeiros.length === 0
    if (
      !window.confirm(
        semVinculo
          ? `Remover o convidado ${m.email}? O login criado para ele será apagado.`
          : 'Remover este usuário da equipe? Ele perde o acesso a todos os financeiros.',
      )
    )
      return
    try {
      if (semVinculo) {
        await EquipeService.removerConvidado(m.member_user_id)
      } else {
        await EquipeService.removerMembro(m.member_user_id)
      }
      toast({ title: 'Usuário removido da equipe.' })
      await carregar()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao remover', description: err.message })
    }
  }

  return (
    <div className="space-y-6">
      <Card className="bg-[#141A22] border-[#232B36] text-white">
        <CardHeader className="pb-3 border-b border-[#232B36]">
          <CardTitle className="text-base text-white flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-[#00D68F]" />
            Criar Acesso para Novo Usuário da Equipe
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-[#0B0F14] border border-[#00D68F]/30">
            <ShieldCheck className="w-4 h-4 text-[#00D68F] shrink-0" />
            <p className="text-xs text-gray-300">
              <span className="font-semibold text-white">Convite direto:</span> defina um e-mail e
              uma senha temporária (sem envio de e-mail). Depois marque abaixo quais financeiros
              (empresas) o usuário pode acessar — ele verá apenas o que for liberado.
            </p>
          </div>
          <form onSubmit={handleConvidar} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-gray-400">E-mail do Usuário *</Label>
                <Input
                  required
                  type="email"
                  value={novoEmail}
                  onChange={(e) => setNovoEmail(e.target.value)}
                  placeholder="ex: funcionario@empresa.com"
                  className="bg-[#0B0F14] border-[#232B36] text-white h-9 mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-400">Senha Temporária *</Label>
                <div className="flex gap-1 mt-1">
                  <Input
                    required
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    placeholder="mínimo 6 caracteres"
                    className="bg-[#0B0F14] border-[#232B36] text-white h-9 font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={gerarSenha}
                    title="Gerar senha automática"
                    className="border-[#232B36] text-gray-300 hover:text-white h-9 px-2 shrink-0 cursor-pointer"
                  >
                    <KeyRound className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-end justify-end">
                <Button
                  type="submit"
                  disabled={salvando}
                  className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold text-xs h-9 cursor-pointer"
                >
                  {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar Acesso'}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Lista de membros com checkboxes por financeiro */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Usuários da Equipe ({membros.length})
          </h2>
        </div>

        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-[#00D68F]" />
          </div>
        )}

        {!loading && membros.length === 0 && (
          <div className="bg-[#141A22] border border-[#232B36] rounded-xl py-10 text-center text-sm text-gray-500">
            Nenhum usuário da equipe ainda. Crie o primeiro acesso acima.
          </div>
        )}

        {membros.map((m) => (
          <Card key={m.member_user_id} className="bg-[#141A22] border-[#232B36] text-white">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="font-semibold text-sm text-white">
                    {m.email || 'E-mail indisponível'}
                  </span>
                  <p className="text-[11px] text-gray-500 font-mono">{m.member_user_id}</p>
                </div>
                <button
                  onClick={() => handleRemoverMembro(m)}
                  title={
                    m.financeiros.length === 0
                      ? 'Remover convidado (ainda sem empresa marcada)'
                      : 'Remover usuário da equipe'
                  }
                  className="p-1.5 text-gray-500 hover:text-[#FF5C5C] cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[11px] text-gray-400 uppercase font-bold mb-2">
                Financeiros liberados:
              </p>
              <div className="flex flex-wrap gap-2">
                {financeiros.map((f) => {
                  const liberado = m.financeiros.includes(f.id)
                  const chave = `${m.member_user_id}:${f.id}`
                  return (
                    <label
                      key={f.id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs transition-colors ${
                        liberado
                          ? 'border-[#00D68F]/50 bg-[#00D68F]/10 text-white'
                          : 'border-[#232B36] bg-[#0B0F14] text-gray-400 hover:border-[#232B36]/80'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={liberado}
                        disabled={toggling === chave}
                        onChange={(e) =>
                          handleToggleAcesso(m.member_user_id, f.id, e.target.checked)
                        }
                        className="accent-[#00D68F] cursor-pointer"
                      />
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: f.cor || CORES_FIN.default || '#00D68F' }}
                      />
                      <span className="font-medium">{f.nome}</span>
                      {liberado && (
                        <Badge
                          variant="outline"
                          className="text-[9px] border-[#00D68F]/40 text-[#00D68F]"
                        >
                          liberado
                        </Badge>
                      )}
                    </label>
                  )
                })}
                {financeiros.length === 0 && (
                  <span className="text-xs text-gray-500">
                    Cadastre financeiros primeiro para liberar acessos.
                  </span>
                )}
              </div>
              {meuId === m.member_user_id && (
                <p className="text-[11px] text-amber-400 mt-2">
                  Este é o seu próprio usuário (master) — o acesso total é inerente ao dono.
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
