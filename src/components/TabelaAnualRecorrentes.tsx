// Tabela anual: 12 meses (jan–dez) do ano corrente, com despesas e receitas
// recorrentes (mensal contínua ou parcelada) previstas mês a mês, com totais.
// Usa a MESMA regra de ocorrência do Fluxo de Caixa (recorrenteOcorreEm, em
// src/lib/recorrentes.ts) e respeita a segregação por financeiro.

import { useMemo } from 'react'
import { Financeiro, Lancamento, LancamentoRecorrente } from '@/types/financeiro'
import { formatCurrency } from '@/lib/formatters'
import { recorrenteOcorreEm } from '@/lib/recorrentes'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CalendarClock, Pencil, Trash2 } from 'lucide-react'

// Uma linha da projeção sabe se é recorrente por ter id "r-<uuid>"
const ehLinhaRecorrente = (id: string) => id.startsWith('r-')
const idRecorrenteDaLinha = (id: string) => id.slice(2)

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

  // Mesma amostragem das células da tabela (dia 15 de cada mês): diz se o
  // recorrente aparece em algum mês do ano dado.
  const ocorreEmAlgumMesDoAno = (r: LancamentoRecorrente, ano: number) =>
    Array.from({ length: 12 }, (_, m) => `${ano}-${String(m + 1).padStart(2, '0')}-15`).some(
      (dataISO) => recorrenteOcorreEm(dataISO, r.dia_mes, r.data_inicial, r.total_parcelas),
    )

  // Ano do título: o ano corrente, exceto quando os recorrentes visíveis ainda
  // não têm ocorrência nele (ex.: só começam em 2027) — nesse caso usa o
  // primeiro ano futuro com ocorrência, para o título acompanhar o conteúdo.
  const ano = useMemo(() => {
    const ativos = recorrentesVisiveis.filter((r) => r.ativo)
    if (ativos.some((r) => ocorreEmAlgumMesDoAno(r, anoBase))) return anoBase
    for (let a = anoBase + 1; a <= anoBase + 10; a++) {
      if (ativos.some((r) => ocorreEmAlgumMesDoAno(r, a))) return a
    }
    return anoBase
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorrentesVisiveis, anoBase])

  // Linhas de recorrentes/parcelados: valor previsto em cada um dos 12 meses.
  const linhasRecorrentes = useMemo(() => {
    return recorrentesVisiveis
      .filter((r) => r.ativo)
      .map((r) => {
        const fin = financeiros.find((f) => f.id === r.financeiro_id)
        const parcelado = !!r.total_parcelas && r.total_parcelas > 0
        const rotulo = parcelado
          ? `${r.descricao} — ${r.total_parcelas}×`
          : `${r.descricao} — mensal`
        const valores = Array.from({ length: 12 }, (_, m) => {
          const dataISO = `${ano}-${String(m + 1).padStart(2, '0')}-15`
          return recorrenteOcorreEm(dataISO, r.dia_mes, r.data_inicial, r.total_parcelas)
            ? Math.abs(Number(r.valor))
            : 0
        })
        return { id: `r-${r.id}`, desc: rotulo, fin: fin ? fin.nome : '—', tipo: r.tipo, valores }
      })
      .sort((a, b) => a.desc.localeCompare(b.desc))
  }, [recorrentesVisiveis, financeiros, ano])

  // Linhas de lançamentos avulsos do ano (dão contexto; a regra do recorrente é separada).
  const linhasAvulsos = useMemo(() => {
    return lancamentosVisiveis
      .filter((l) => l.data.startsWith(String(ano)))
      .map((l) => {
        const fin = financeiros.find((f) => f.id === l.financeiro_id)
        const valores = Array.from({ length: 12 }, (_, m) => {
          return l.data.startsWith(`${ano}-${String(m + 1).padStart(2, '0')}`)
            ? Math.abs(Number(l.valor))
            : 0
        })
        return {
          id: `l-${l.id}`,
          desc: l.descricao || '(sem descrição)',
          fin: fin ? fin.nome : '—',
          tipo: l.tipo,
          valores,
        }
      })
      .sort((a, b) => a.desc.localeCompare(b.desc))
  }, [lancamentos, financeiros, ano])

  const linhas = useMemo(
    () => [...linhasRecorrentes, ...linhasAvulsos],
    [linhasRecorrentes, linhasAvulsos],
  )

  // Recorrente original por id de linha "r-<id>" — para as ações editar/excluir
  const recorrentePorLinha = useMemo(() => {
    const mapa = new Map<string, LancamentoRecorrente>()
    recorrentes.forEach((r) => mapa.set(`r-${r.id}`, r))
    return mapa
  }, [recorrentesVisiveis])

  const totaisMes = useMemo(() => {
    const despesas = Array.from({ length: 12 }, () => 0)
    const receitas = Array.from({ length: 12 }, () => 0)
    for (const l of linhasRecorrentes) {
      const alvo = l.tipo === 'credito' ? receitas : despesas
      l.valores.forEach((v, m) => {
        alvo[m] += v
      })
    }
    return { despesas, receitas }
  }, [linhasRecorrentes])

  const totalAnoDespesas = totaisMes.despesas.reduce((a, b) => a + b, 0)
  const totalAnoReceitas = totaisMes.receitas.reduce((a, b) => a + b, 0)

  // Nome do financeiro do Passo 1, para a mensagem de estado vazio
  const nomeFinFiltro = financeiros.find((f) => f.id === financeiroIdFiltro)?.nome

  if (linhasRecorrentes.length === 0) {
    return (
      <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
        <CardHeader className="pb-4 border-b border-[#232B36]">
          <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-[#00D68F]" />
            Projeção Anual de Recorrentes ({ano})
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
            Projeção Anual de Recorrentes ({ano})
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
                const recorrente = ehLinhaRecorrente(l.id)
                  ? recorrentePorLinha.get(l.id)
                  : undefined
                return (
                  <tr key={l.id} className="hover:bg-[#1A222D]/50 transition-colors">
                    <td className="py-2.5 px-4 sticky left-0 bg-[#141A22]">
                      <div className="font-medium text-white text-xs">{l.desc}</div>
                      <div className="text-[10px] text-gray-500 flex items-center gap-1.5">
                        <span>{l.fin}</span>
                        <span
                          className={l.tipo === 'credito' ? 'text-[#00D68F]' : 'text-[#FF5C5C]'}
                        >
                          · {l.tipo === 'credito' ? 'receita' : 'despesa'}
                        </span>
                      </div>
                    </td>
                    {l.valores.map((v, m) => (
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
                        {v === 0 ? '—' : formatCurrency(v).replace('R$', '').trim()}
                      </td>
                    ))}
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
