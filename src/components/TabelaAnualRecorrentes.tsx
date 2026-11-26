// Tabela anual: 12 meses (jan–dez) do ano selecionado, com despesas e receitas
// recorrentes (mensal contínua ou parcelada) e as PARCELAS de lançamentos
// parcelados previstas mês a mês, com totais. Usa a MESMA regra de ocorrência do
// Fluxo de Caixa (recorrenteOcorreEm, em src/lib/recorrentes.ts) e respeita a
// segregação por financeiro (Passo 1). Parcelados aparecem em UMA linha só,
// com o valor de cada parcela na coluna do mês do vencimento e o número
// da parcela (3/10) em letra pequena dentro da célula.

import { useEffect, useMemo, useState } from 'react'
import { Financeiro, Lancamento, LancamentoRecorrente } from '@/types/financeiro'
import { formatCurrency } from '@/lib/formatters'
import { numeroParcela, recorrenteOcorreEm } from '@/lib/recorrentes'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CalendarClock, Pencil, Trash2 } from 'lucide-react'

// Vencimento de um recorrente em um mês: dia_mes limitado ao último dia do mês
// (31 → 28/30, igual a recorrenteOcorreEm).
function diaEfetivoNoMes(ano: number, mes0: number, diaMes: number): number {
  const ultimoDia = new Date(ano, mes0 + 1, 0).getDate()
  return Math.min(Math.max(diaMes || 1, 1), ultimoDia)
}

// Linhas da projeção: toda linha usa o id "r-<uuid>" do recorrente de origem
// (necessário para as ações editar/excluir) — mensal ou parcelado, uma linha
// por programação.
const ehLinhaRecorrente = (id: string) => id.startsWith('r-')

// Último ano em que o recorrente gera ocorrência — para o seletor de anos incluir
// anos futuros com parcelas. Mensal contínua: data_inicial + 5 (folga, mesma do
// Painel). Parcelado: data_inicial + ⌊(total_parcelas−1)/12⌋ meses.
function anoDaUltimaOcorrencia(r: LancamentoRecorrente): number | null {
  const aIni = Number(r.data_inicial?.slice(0, 4))
  if (!Number.isFinite(aIni) || aIni <= 1900) return null
  if (r.total_parcelas && r.total_parcelas > 0) {
    return aIni + Math.floor((r.total_parcelas - 1) / 12)
  }
  return r.ativo ? aIni + 5 : aIni
}

// Seletor de ano do título: mesma lista de anos do Painel (atual −5 a +5,
// estendida pelos dados). Options com bg/texto explícitos para não herdar o
// fundo escuro do card em selects nativos (contraste corrigido na v0.0.40).
interface SeletorAnoProps {
  ano: number
  anosDisponiveis: number[]
  onChange: (ano: number) => void
}

function SeletorAno({ ano, anosDisponiveis, onChange }: SeletorAnoProps) {
  return (
    <select
      aria-label="Ano da projeção"
      value={ano}
      onChange={(e) => onChange(Number(e.target.value))}
      className="ml-1 h-8 px-2 rounded-md bg-[#0B0F14] border border-[#232B36] text-white text-sm font-semibold cursor-pointer"
    >
      {anosDisponiveis.map((a) => (
        <option key={a} value={a} className="bg-[#0B0F14] text-white">
          {a}
        </option>
      ))}
    </select>
  )
}

const MESES = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const

// Forma da linha da projeção: uma linha por programação (recorrente mensal ou
// parcelamento). Em linhas de parcelado, parcelasNumeros[m] guarda o N da
// parcela que vence no mês m (ex.: 3 de 10) para exibir na célula.
interface LinhaProjecao {
  id: string
  desc: string
  fin: string
  tipo: 'credito' | 'debito'
  valores: number[]
  parcelado: boolean
  parcelasNumeros?: (number | null)[]
  parcelaTotal?: number // M de "N/M" (só nas linhas de parcelado)
}

interface Props {
  recorrentes: LancamentoRecorrente[]
  lancamentos: Lancamento[]
  financeiros: Financeiro[]
  // Passo 1 da página de Lançamentos: quando um financeiro está selecionado,
  // a projeção mostra SOMENTE os recorrentes/lançamentos dele; quando vazio
  // (modo "todas as empresas"), mantém o comportamento anterior.
  financeiroIdFiltro?: string | null
  podeGerenciar: (r: LancamentoRecorrente) => boolean
  onEditar: (r: LancamentoRecorrente) => void
  onExcluir: (r: LancamentoRecorrente) => void
}

export default function TabelaAnualRecorrentes({
  recorrentes,
  lancamentos,
  financeiros,
  financeiroIdFiltro,
  podeGerenciar,
  onEditar,
  onExcluir,
}: Props) {
  const anoBase = useMemo(() => new Date().getFullYear(), [])

  // Ano exibido pela tabela (estado da tela, default: ano atual). O auto-ajuste
  // antigo do título foi substituído pelo seletor: o usuário escolhe o ano.
  const [anoSelecionado, setAnoSelecionado] = useState<number>(anoBase)

  // Segregação patrimonial da projeção: filtra pelo financeiro selecionado.
  const recorrentesVisiveis = useMemo(
    () =>
      financeiroIdFiltro
        ? recorrentes.filter((r) => r.financeiro_id === financeiroIdFiltro)
        : recorrentes,
    [recorrentes, financeiroIdFiltro],
  )
  const lancamentosVisiveis = useMemo(
    () =>
      financeiroIdFiltro
        ? lancamentos.filter((l) => l.financeiro_id === financeiroIdFiltro)
        : lancamentos,
    [lancamentos, financeiroIdFiltro],
  )

  // Lista de anos do seletor: base atual ±5, estendida pelos anos presentes nos
  // lançamentos e pelo último ano com ocorrência de cada recorrente (parcelados
  // incluídos — se houver parcela em um ano fora da lista, ele entra).
  const anosDisponiveis = useMemo(() => {
    let min = anoBase - 5
    let max = anoBase + 5
    const expandir = (a: number) => {
      if (Number.isFinite(a) && a > 1900) {
        if (a < min) min = a
        if (a > max) max = a
      }
    }
    for (const l of lancamentosVisiveis) expandir(Number(l.data.slice(0, 4)))
    for (const r of recorrentesVisiveis) {
      expandir(Number(r.data_inicial.slice(0, 4)))
      const fimUltimaParcela = anoDaUltimaOcorrencia(r)
      if (fimUltimaParcela) expandir(fimUltimaParcela)
    }
    const arr: number[] = []
    for (let a = min; a <= max; a++) arr.push(a)
    return arr
  }, [anoBase, lancamentosVisiveis, recorrentesVisiveis])

  const ano = anoSelecionado
  // Mantém o seletor coerente se a lista de anos mudar (ex.: recorrente excluído)
  useEffect(() => {
    if (!anosDisponiveis.includes(anoSelecionado)) setAnoSelecionado(anoBase)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anosDisponiveis])

  // Linhas da projeção:
  //  • recorrente mensal contínua → 1 linha (valor nos meses em que ocorre)
  //  • PARCELADO                  → UMA linha só, rotulada "<descrição> —
  //    parcelado Nx": o valor de cada parcela do ano cai na coluna do mês do
  //    seu vencimento e o número da parcela (3/10) aparece dentro da célula.
  //    A 1ª parcela realizada já existe como lançamento e não é repetida aqui.
  //    Ano sem nenhuma parcela → linha não aparece (Total Ano seria 0).
  const linhas = useMemo<LinhaProjecao[]>(() => {
    const saida: LinhaProjecao[] = []

    for (const r of recorrentesVisiveis) {
      if (!r.ativo) continue
      const fin = financeiros.find((f) => f.id === r.financeiro_id)
      const nomeFin = fin ? fin.nome : '—'
      const parcelado = !!r.total_parcelas && r.total_parcelas > 0

      if (parcelado) {
        // Todas as parcelas do ano agrupadas em uma linha, cada valor no mês
        // do seu vencimento
        const valores = Array.from({ length: 12 }, () => 0)
        const parcelasNumeros = Array.from({ length: 12 }, (): number | null => null)
        for (let m = 0; m < 12; m++) {
          const dia = diaEfetivoNoMes(ano, m, r.dia_mes)
          const dataISO = `${ano}-${String(m + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
          if (!recorrenteOcorreEm(dataISO, r.dia_mes, r.data_inicial, r.total_parcelas)) continue
          const nParcela = numeroParcela(dataISO, r.data_inicial)
          if (nParcela === null) continue
          valores[m] = Math.abs(Number(r.valor))
          parcelasNumeros[m] = nParcela
        }
        if (!valores.some((v) => v !== 0)) continue
        saida.push({
          id: `r-${r.id}`,
          desc: `${r.descricao} — parcelado ${r.total_parcelas}×`,
          fin: nomeFin,
          tipo: r.tipo,
          valores,
          parcelado: true,
          parcelasNumeros,
          parcelaTotal: r.total_parcelas,
        })
        continue
      }

      // Mensal contínua: 1 linha com o valor em cada mês de ocorrência
      const valores = Array.from({ length: 12 }, (_, m) => {
        const dataISO = `${ano}-${String(m + 1).padStart(2, '0')}-15`
        return recorrenteOcorreEm(dataISO, r.dia_mes, r.data_inicial, r.total_parcelas)
          ? Math.abs(Number(r.valor))
          : 0
      })
      saida.push({
        id: `r-${r.id}`,
        desc: `${r.descricao} — mensal`,
        fin: nomeFin,
        tipo: r.tipo,
        valores,
        parcelado: false,
      })
    }

    return saida.sort((a, b) => a.desc.localeCompare(b.desc))
  }, [recorrentesVisiveis, lancamentosVisiveis, financeiros, ano])

  // Recorrente original por id de linha — para as ações editar/excluir. Toda
  // linha ("r-<uuid>", mensal ou parcelado) aponta para o recorrente de origem,
  // então editar/excluir operam sobre a programação.
  const recorrentePorLinha = useMemo(() => {
    const mapa = new Map<string, LancamentoRecorrente>()
    recorrentes.forEach((r) => mapa.set(`r-${r.id}`, r))
    return mapa
  }, [recorrentes])

  const totaisMes = useMemo(() => {
    const despesas = Array.from({ length: 12 }, () => 0)
    const receitas = Array.from({ length: 12 }, () => 0)
    for (const l of linhas) {
      const alvo = l.tipo === 'credito' ? receitas : despesas
      l.valores.forEach((v, m) => {
        alvo[m] += v
      })
    }
    return { despesas, receitas }
  }, [linhas])

  const totalAnoDespesas = totaisMes.despesas.reduce((a, b) => a + b, 0)
  const totalAnoReceitas = totaisMes.receitas.reduce((a, b) => a + b, 0)

  // Nome do financeiro do Passo 1, para a mensagem de estado vazio
  const nomeFinFiltro = financeiros.find((f) => f.id === financeiroIdFiltro)?.nome

  if (linhas.length === 0) {
    return (
      <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
        <CardHeader className="pb-4 border-b border-[#232B36]">
          <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-[#00D68F]" />
            Projeção Anual de Recorrentes
            <SeletorAno ano={ano} anosDisponiveis={anosDisponiveis} onChange={setAnoSelecionado} />
          </CardTitle>
        </CardHeader>
        <CardContent className="py-10 text-center text-sm text-gray-500">
          {financeiroIdFiltro ? (
            <>
              Nenhum lançamento recorrente ou parcelado ativo para{' '}
              <span className="font-semibold text-gray-300">{nomeFinFiltro || 'esta empresa'}</span>{' '}
              em {ano}.
              <br />
              Selecione outro financeiro no Passo 1 ou crie um recorrente com “Mensal contínua” ou
              “Parcelado em N parcelas” no formulário acima.
            </>
          ) : (
            <>
              Nenhum lançamento recorrente ou parcelado ativo para o ano de {ano}.
              <br />
              Crie um com “Mensal contínua” ou “Parcelado em N parcelas” no formulário acima.
            </>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
      <CardHeader className="pb-4 border-b border-[#232B36]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-[#00D68F]" />
            Projeção Anual de Recorrentes
            <SeletorAno ano={ano} anosDisponiveis={anosDisponiveis} onChange={setAnoSelecionado} />
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className="bg-[#FF5C5C]/15 text-[#FF5C5C] border border-[#FF5C5C]/40 text-[10px]">
              Despesas {formatCurrency(totalAnoDespesas)}
            </Badge>
            <Badge className="bg-[#00D68F]/15 text-[#00D68F] border border-[#00D68F]/40 text-[10px]">
              Receitas {formatCurrency(totalAnoReceitas)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-[#0B0F14] border-b border-[#232B36] text-xs text-gray-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-2.5 px-4 sticky left-0 bg-[#0B0F14] min-w-[220px]" scope="col">
                  Recorrente / Parcelado
                </th>
                {MESES.map((m) => (
                  <th key={m} className="py-2.5 px-2 text-center" scope="col">
                    {m}
                  </th>
                ))}
                <th className="py-2.5 px-4 text-right" scope="col">
                  Total Ano
                </th>
                <th className="py-2.5 px-3 text-center" scope="col">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232B36]">
              {linhas.map((l) => {
                const totalLinha = l.valores.reduce((a, b) => a + b, 0)
                const recorrente = recorrentePorLinha.get(l.id)
                return (
                  <tr key={l.id} className="hover:bg-[#1A222D]/50 transition-colors">
                    <td className="py-2.5 px-4 sticky left-0 bg-[#141A22]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-white text-xs">{l.desc}</span>
                        {l.parcelado && (
                          <Badge className="bg-[#7C5CFF]/15 text-[#7C5CFF] border border-[#7C5CFF]/40 text-[9px] uppercase tracking-wide">
                            Parcelado
                          </Badge>
                        )}
                      </div>
                      {l.parcelado && l.parcelaTotal ? (
                        <div className="text-[10px] text-[#7C5CFF]/80">
                          {l.parcelasNumeros?.filter(Boolean).length || 0} de {l.parcelaTotal}{' '}
                          parcela{l.parcelaTotal > 1 ? 's' : ''} neste ano
                        </div>
                      ) : null}
                      <div className="text-[10px] text-gray-500 flex items-center gap-1.5">
                        <span>{l.fin}</span>
                        <span
                          className={l.tipo === 'credito' ? 'text-[#00D68F]' : 'text-[#FF5C5C]'}
                        >
                          · {l.tipo === 'credito' ? 'receita' : 'despesa'}
                        </span>
                      </div>
                    </td>
                    {l.valores.map((v, m) => {
                      const nParcela = l.parcelasNumeros?.[m] ?? null
                      return (
                        <td
                          key={m}
                          className={`py-2.5 px-2 text-center font-mono text-[11px] whitespace-nowrap ${
                            v === 0
                              ? 'text-gray-700'
                              : l.tipo === 'credito'
                                ? 'text-[#00D68F]'
                                : 'text-[#FF5C5C]'
                          }`}
                        >
                          {v === 0 ? (
                            '—'
                          ) : (
                            <>
                              {formatCurrency(v).replace('R$', '').trim()}
                              {nParcela !== null && (
                                <span className="block font-sans text-[9px] leading-tight text-gray-400">
                                  {nParcela}/{l.parcelaTotal}
                                </span>
                              )}
                            </>
                          )}
                        </td>
                      )
                    })}
                    <td
                      className={`py-2.5 px-4 text-right font-mono text-xs font-bold whitespace-nowrap ${
                        l.tipo === 'credito' ? 'text-[#00D68F]' : 'text-[#FF5C5C]'
                      }`}
                    >
                      {formatCurrency(totalLinha)}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      {recorrente && podeGerenciar(recorrente) ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onEditar(recorrente)}
                            title="Editar recorrente"
                            aria-label={`Editar recorrente ${l.desc}`}
                            className="p-1.5 text-gray-500 hover:text-[#00D68F] hover:bg-[#00D68F]/10 rounded transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onExcluir(recorrente)}
                            title="Excluir recorrente"
                            aria-label={`Excluir recorrente ${l.desc}`}
                            className="p-1.5 text-gray-500 hover:text-[#FF5C5C] hover:bg-[#FF5C5C]/10 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-700 text-xs" title="Sem permissão para alterar">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-[#0B0F14] border-t-2 border-[#232B36] text-xs font-bold">
              <tr>
                <td className="py-2.5 px-4 sticky left-0 bg-[#0B0F14] text-gray-300">
                  Despesas recorrentes do mês
                </td>
                {totaisMes.despesas.map((v, m) => (
                  <td
                    key={m}
                    className="py-2.5 px-2 text-center font-mono text-[11px] text-[#FF5C5C] whitespace-nowrap"
                  >
                    {v === 0 ? '—' : formatCurrency(v).replace('R$', '').trim()}
                  </td>
                ))}
                <td className="py-2.5 px-4 text-right font-mono text-[#FF5C5C]">
                  {formatCurrency(totalAnoDespesas)}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 sticky left-0 bg-[#0B0F14] text-gray-300">
                  Receitas recorrentes do mês
                </td>
                {totaisMes.receitas.map((v, m) => (
                  <td
                    key={m}
                    className="py-2.5 px-2 text-center font-mono text-[11px] text-[#00D68F] whitespace-nowrap"
                  >
                    {v === 0 ? '—' : formatCurrency(v).replace('R$', '').trim()}
                  </td>
                ))}
                <td className="py-2.5 px-4 text-right font-mono text-[#00D68F]">
                  {formatCurrency(totalAnoReceitas)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
