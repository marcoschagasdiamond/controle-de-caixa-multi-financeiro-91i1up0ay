import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/formatters'
import {
  ClassificacaoFinanceiro,
  FinanceiroOrganizacaoService,
  Organizacao,
  OrganizacaoUsuario,
} from '@/services/organizacao'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Building2, Loader2, Mail, ShieldCheck, UserPlus } from 'lucide-react'

interface FinanceiroResumo {
  id: string
  nome: string
  organizacao_id: string | null
  classificacao: ClassificacaoFinanceiro | null
}

function nomeTipo(tipo: 'empresa' | 'escritorio' | null): string {
  if (tipo === 'escritorio') return 'Escritório contábil'
  if (tipo === 'empresa') return 'Empresa'
  return 'Não definido'
}

export function AbaOrganizacao() {
  const { user } = useAuth()
  const { toast } = useToast()

  const [carregando, setCarregando] = useState(true)
  const [organizacoes, setOrganizacoes] = useState<Organizacao[]>([])
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [usuarios, setUsuarios] = useState<OrganizacaoUsuario[]>([])
  const [financeiros, setFinanceiros] = useState<FinanceiroResumo[]>([])
  const [salvando, setSalvando] = useState(false)

  // Dados em edição da organização selecionada
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<'empresa' | 'escritorio'>('empresa')

  // Convite de usuário
  const [emailConvite, setEmailConvite] = useState('')
  const [convidando, setConvidando] = useState(false)

  const organizacao = useMemo(
    () => organizacoes.find((o) => o.id === selecionada) ?? null,
    [organizacoes, selecionada],
  )

  const carregar = useCallback(async () => {
    if (!user) return
    setCarregando(true)
    try {
      const orgs = await FinanceiroOrganizacaoService.listarMinhasOrganizacoes()
      setOrganizacoes(orgs)

      const atual = orgs.find((o) => o.id === selecionada) ?? orgs[0] ?? null
      if (atual) {
        setSelecionada(atual.id)
        setNome(atual.nome)
        setTipo(atual.tipo ?? 'empresa')
        setUsuarios(await FinanceiroOrganizacaoService.listarUsuarios(atual.id))
      } else {
        setUsuarios([])
      }
    } catch {
      toast({
        title: 'Erro ao carregar a organização',
        description: 'Verifique sua conexão e tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [user, selecionada, toast])

  useEffect(() => {
    if (!user) return
    let vivo = true
    async function carregarFinanceiros() {
      const { data, error } = await supabase
        .from('financeiros')
        .select('id, nome, organizacao_id, classificacao')
        .order('nome')
      if (!vivo) return
      if (error) {
        toast({
          title: 'Erro ao carregar empresas',
          description: error.message,
          variant: 'destructive',
        })
        return
      }
      setFinanceiros((data ?? []) as FinanceiroResumo[])
    }
    carregarFinanceiros()
    return () => {
      vivo = false
    }
  }, [user, toast])

  useEffect(() => {
    document.title = 'Organização | Configurações'
  }, [])

  const financeirosDaOrg = useMemo(
    () => financeiros.filter((f) => f.organizacao_id === selecionada),
    [financeiros, selecionada],
  )

  const financeirosSemOrg = useMemo(
    () => financeiros.filter((f) => !f.organizacao_id),
    [financeiros],
  )

  const eAdmin = useMemo(() => {
    if (!user || !organizacao) return false
    return (
      organizacao.criada_por === user.id ||
      usuarios.some((u) => u.user_id === user.id && u.papel === 'admin')
    )
  }, [user, organizacao, usuarios])

  async function salvarOrganizacao() {
    if (!organizacao) return
    if (!nome.trim()) {
      toast({ title: 'Informe o nome da organização.', variant: 'destructive' })
      return
    }
    setSalvando(true)
    try {
      await FinanceiroOrganizacaoService.atualizarOrganizacao(organizacao.id, {
        nome: nome.trim(),
        tipo,
      })
      toast({ title: 'Organização atualizada!' })
      await carregar()
    } catch {
      toast({
        title: 'Erro ao salvar a organização',
        description: 'Verifique se você tem permissão de admin e tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  async function convidarUsuario() {
    if (!organizacao) return
    const email = emailConvite.trim().toLowerCase()
    if (!email) return
    setConvidando(true)
    try {
      const userId = await FinanceiroOrganizacaoService.buscarUsuarioPorEmail(email)
      if (!userId) {
        toast({
          title: 'Usuário não encontrado',
          description:
            'Peça para a pessoa criar a conta primeiro, depois vincule pelo e-mail aqui.',
          variant: 'destructive',
        })
        return
      }
      await FinanceiroOrganizacaoService.adicionarUsuario(organizacao.id, userId, 'membro')
      toast({ title: 'Usuário vinculado como membro!' })
      setEmailConvite('')
      await carregar()
    } catch {
      toast({
        title: 'Erro ao vincular usuário',
        description: 'Ele já pode estar vinculado à organização.',
        variant: 'destructive',
      })
    } finally {
      setConvidando(false)
    }
  }

  async function mudarPapel(usuario: OrganizacaoUsuario, papel: OrganizacaoUsuario['papel']) {
    if (!organizacao || usuario.papel === papel) return
    try {
      await FinanceiroOrganizacaoService.alterarPapel({
        organizacaoId: organizacao.id,
        userId: usuario.user_id,
        papel,
      })
      toast({ title: `Papel de ${usuario.email} alterado para ${papel}.` })
      await carregar()
    } catch {
      toast({ title: 'Erro ao alterar o papel.', variant: 'destructive' })
    }
  }

  async function removerUsuario(usuario: OrganizacaoUsuario) {
    if (!organizacao) return
    try {
      await FinanceiroOrganizacaoService.removerUsuario(organizacao.id, usuario.user_id)
      toast({ title: `${usuario.email} removido da organização.` })
      await carregar()
    } catch {
      toast({ title: 'Erro ao remover o vínculo.', variant: 'destructive' })
    }
  }

  async function classificarFinanceiro(id: string, valor: ClassificacaoFinanceiro) {
    try {
      await FinanceiroOrganizacaoService.definirClassificacao(id, valor)
      setFinanceiros((atual) =>
        atual.map((f) => (f.id === id ? { ...f, classificacao: valor } : f)),
      )
    } catch {
      toast({ title: 'Erro ao classificar a empresa.', variant: 'destructive' })
    }
  }

  async function vincularFinanceiro(financeiroId: string, organizacaoId: string | null) {
    try {
      const { error } = await supabase
        .from('financeiros')
        .update({ organizacao_id: organizacaoId })
        .eq('id', financeiroId)
      if (error) throw error
      setFinanceiros((atual) =>
        atual.map((f) => (f.id === financeiroId ? { ...f, organizacao_id: organizacaoId } : f)),
      )
    } catch {
      toast({ title: 'Erro ao mover a empresa para a organização.', variant: 'destructive' })
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-16" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-[#00D68F]" aria-hidden="true" />
        <span className="sr-only">Carregando organização…</span>
      </div>
    )
  }

  if (!organizacao) {
    return (
      <Card className="border-[#1F2937] bg-[#141A22]">
        <CardHeader>
          <CardTitle className="text-white">Organização</CardTitle>
          <CardDescription className="text-[#8B98A9]">
            Você ainda não faz parte de nenhuma organização.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-[#8B98A9]">
          <p>Ao criar a primeira empresa, uma organização é criada automaticamente para você.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="border-[#1F2937] bg-[#141A22]">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-white">
              <Building2 className="h-5 w-5 text-[#00D68F]" aria-hidden="true" />
              Dados da organização
            </CardTitle>
            <Badge variant="outline" className="border-[#00D68F]/40 text-[#00D68F]">
              {nomeTipo(organizacao.tipo)}
            </Badge>
          </div>
          <CardDescription className="text-[#8B98A9]">
            A organização agrupa suas empresas — no escritório contábil, cada empresa é um cliente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {eAdmin ? (
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (!salvando) void salvarOrganizacao()
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="org-nome" className="text-[#C7D0DC]">
                  Nome da organização <span aria-hidden="true">*</span>
                </Label>
                <Input
                  id="org-nome"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="border-[#2A3542] bg-[#0B0F14] text-white"
                  autoComplete="organization"
                />
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm text-[#C7D0DC]">Tipo de organização</legend>
                <RadioGroup
                  value={tipo}
                  onValueChange={(v) => setTipo(v as 'empresa' | 'escritorio')}
                  className="flex gap-4 pt-1"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="empresa" id="tipo-empresa" />
                    <Label htmlFor="tipo-empresa" className="font-normal text-white">
                      Empresa
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="escritorio" id="tipo-escritorio" />
                    <Label htmlFor="tipo-escritorio" className="font-normal text-white">
                      Escritório contábil
                    </Label>
                  </div>
                </RadioGroup>
              </fieldset>
              <div className="md:col-span-2">
                <Button
                  type="submit"
                  disabled={salvando}
                  className="bg-[#00D68F] text-[#0B0F14] hover:bg-[#00C180]"
                >
                  {salvando ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      Salvando…
                    </>
                  ) : (
                    'Salvar alterações'
                  )}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-1 text-[#C7D0DC]">
              <p className="text-lg font-medium text-white">{organizacao.nome}</p>
              <p className="text-sm text-[#8B98A9]">{nomeTipo(organizacao.tipo)}</p>
              <p className="text-sm text-[#8B98A9]">
                Apenas administradores podem editar os dados da organização.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {organizacoes.length > 1 && (
        <div className="flex items-center gap-3">
          <Label htmlFor="org-selecao" className="text-[#C7D0DC]">
            Organização
          </Label>
          <Select value={selecionada ?? ''} onValueChange={setSelecionada}>
            <SelectTrigger
              id="org-selecao"
              className="w-64 border-[#2A3542] bg-[#0B0F14] text-white"
            >
              <SelectValue placeholder="Escolha…" />
            </SelectTrigger>
            <SelectContent className="border-[#2A3542] bg-[#141A22] text-white">
              {organizacoes.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Card className="border-[#1F2937] bg-[#141A22]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <ShieldCheck className="h-5 w-5 text-[#00D68F]" aria-hidden="true" />
            Usuários da organização
          </CardTitle>
          <CardDescription className="text-[#8B98A9]">
            Admins gerenciam a organização; membros acompanham os financeiros liberados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {eAdmin && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (!convidando) void convidarUsuario()
              }}
            >
              <div className="min-w-56 flex-1 space-y-2">
                <Label htmlFor="org-email" className="text-[#C7D0DC]">
                  Vincular usuário por e-mail
                </Label>
                <Input
                  id="org-email"
                  type="email"
                  autoComplete="email"
                  spellCheck={false}
                  required
                  placeholder="pessoa@exemplo.com"
                  value={emailConvite}
                  onChange={(e) => setEmailConvite(e.target.value)}
                  className="border-[#2A3542] bg-[#0B0F14] text-white"
                />
              </div>
              <Button
                type="submit"
                disabled={convidando}
                className="bg-[#00D68F] text-[#0B0F14] hover:bg-[#00C180]"
              >
                {convidando ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                )}
                <span className="ml-2">Vincular</span>
              </Button>
            </form>
          )}

          {usuarios.length === 0 ? (
            <p className="text-sm text-[#8B98A9]" role="status">
              Nenhum usuário vinculado.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1F2937]">
                    <TableHead className="text-[#8B98A9]">Usuário</TableHead>
                    <TableHead className="text-[#8B98A9]">Papel</TableHead>
                    {eAdmin && <TableHead className="text-[#8B98A9]">Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuarios.map((u) => (
                    <TableRow key={u.user_id} className="border-[#1F2937]">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-[#8B98A9]" aria-hidden="true" />
                          <div>
                            <p className="text-sm font-medium text-white">
                              {u.nome?.trim() || u.email}
                            </p>
                            <p className="text-xs text-[#8B98A9]">{u.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            u.papel === 'admin'
                              ? 'border-[#00D68F]/40 text-[#00D68F]'
                              : 'border-[#2A3542] text-[#8B98A9]'
                          }
                        >
                          {u.papel === 'admin' ? 'Admin' : 'Membro'}
                        </Badge>
                      </TableCell>
                      {eAdmin && (
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {u.papel === 'admin' ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="border-[#2A3542] text-[#C7D0DC]"
                                onClick={() => void mudarPapel(u, 'membro')}
                              >
                                Rebaixar a membro
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="border-[#2A3542] text-[#C7D0DC]"
                                onClick={() => void mudarPapel(u, 'admin')}
                              >
                                Promover a admin
                              </Button>
                            )}
                            {u.user_id !== user?.id && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="border-[#FF5C5C]/40 text-[#FF5C5C]"
                                onClick={() => void removerUsuario(u)}
                              >
                                Remover
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-[#1F2937] bg-[#141A22]">
        <CardHeader>
          <CardTitle className="text-white">Empresas da organização</CardTitle>
          <CardDescription className="text-[#8B98A9]">
            {organizacao.tipo === 'escritorio'
              ? 'Marque como “empresa de cliente” as empresas que pertencem aos seus clientes.'
              : 'Classifique cada empresa como própria ou de cliente.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {financeirosDaOrg.length === 0 ? (
            <p className="text-sm text-[#8B98A9]" role="status">
              Nenhuma empresa vinculada a esta organização.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1F2937]">
                    <TableHead className="text-[#8B98A9]">Empresa</TableHead>
                    <TableHead className="text-[#8B98A9]">Classificação</TableHead>
                    {eAdmin && <TableHead className="text-[#8B98A9]">Marcar como</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {financeirosDaOrg.map((f) => (
                    <TableRow key={f.id} className="border-[#1F2937]">
                      <TableCell className="font-medium text-white">{f.nome}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            f.classificacao === 'cliente'
                              ? 'border-[#FFB020]/40 text-[#FFB020]'
                              : 'border-[#00D68F]/40 text-[#00D68F]'
                          }
                        >
                          {f.classificacao === 'cliente' ? 'Empresa de cliente' : 'Própria'}
                        </Badge>
                      </TableCell>
                      {eAdmin && (
                        <TableCell>
                          <Select
                            value={f.classificacao ?? 'propria'}
                            onValueChange={(v) =>
                              void classificarFinanceiro(f.id, v as ClassificacaoFinanceiro)
                            }
                          >
                            <SelectTrigger
                              className="w-48 border-[#2A3542] bg-[#0B0F14] text-white"
                              aria-label={`Classificação de ${f.nome}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="border-[#2A3542] bg-[#141A22] text-white">
                              <SelectItem value="propria">Própria</SelectItem>
                              <SelectItem value="cliente">Empresa de cliente</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {eAdmin && financeirosSemOrg.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-[#C7D0DC]">Empresas sem organização</p>
              <p className="text-xs text-[#8B98A9]">
                Mova-as para esta organização para gerenciá-las junto.
              </p>
              <ul role="list" className="space-y-2">
                {financeirosSemOrg.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-white">{f.nome}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-[#2A3542] text-[#C7D0DC]"
                      onClick={() => void vincularFinanceiro(f.id, organizacao.id)}
                    >
                      Vincular a {organizacao.nome}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {!eAdmin && (
        <p className="text-xs text-[#8B98A9]">
          Você é membro da organização: visualize os dados, sem poder editar.
        </p>
      )}
    </div>
  )
}
