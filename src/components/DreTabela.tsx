// Tabelas do relatório DRE (um bloco = Receitas ou Despesas) com a comparação
// orçado vs realizado por categoria, subtotal de grupo e total do bloco.
// Colunas fixas à direita: Realizado | Orçado | Var. R$ | Var. %.
// No modo Ano completo as 12 colunas mensais continuam só com o realizado
// (a comparação orçamentária é pelo total do ano). Impressão preservada com
// as classes dre-keep/dre-pos/dre-neg do main.css.

import { formatCurrency } from '@/lib/formatters'
import { valorCSV } from '@/lib/csv'
import { CompDRE, calcularComp, classeComp, sinalComp, percentualComp } from '@/lib/dreOrcado'
import type { BlocoDRE } from '@/pages/DRE'

const MESES_CURTOS = [
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

const somaPeriodo = (valores: number[]) => valores.reduce((a, b) => a + b, 0)

// Célula de valor: itálico apagado + asterisco quando tem componente projetado
const CelulaValor = ({
  v,
  temProj,
  exibirProjecao,
}: {
  v: number
  temProj?: boolean
  exibirProjecao: boolean
}) => {
  if (v === 0) return <span className="text-gray-700">—</span>
  const valor = formatCurrency(v).replace('R$', '').trim()
  const proj = Boolean(exibirProjecao && temProj)
  return (
    <span className={proj ? 'italic text-gray-400' : 'text-gray-200'}>
      {valor}
      {proj ? ' *' : ''}
    </span>
  )
}

// Células de orçado + variação de uma linha, já com a cor coerente por tipo
export const CelulasComp = ({
  comp,
  tipo,
}: {
  comp: CompDRE
  tipo: 'receita' | 'despesa'
}) => {
  const cor = classeComp(comp, tipo)
  const sinal = sinalComp(comp, tipo)
  return (
    <>
      <td className="py-2.5 px-3 text-right font-mono text-xs text-gray-300 whitespace-nowrap">
        {comp.orcado === 0 ? <span className="text-gray-600">—</span> : formatCurrency(comp.orcado)}
      </td>
      <td className={`py-2.5 px-3 text-right font-mono text-xs font-semibold whitespace-nowrap ${cor}`}>
        {comp.orcado === 0
          ? '—'
          : `${sinal}R$ ${formatCurrency(Math.abs(comp.variacaoR$)).replace('R$', '').trim()}`}
      </td>
      <td className={`py-2.5 px-4 text-right font-mono text-xs font-semibold whitespace-nowrap ${cor}`}>
        {percentualComp(comp) === '—' ? '—' : `${sinal}${percentualComp(comp).replace('-', '')}`}
      </td>
    </>
  )
}

export default function BlocoTabelaDRE({
  titulo,
  bloco,
  tipo,
  modoAno,
  mesIdx,
  exibirProjecao,
  temBudget,
}: {
  titulo: string
  bloco: BlocoDRE
  tipo: 'receita' | 'despesa'
  modoAno: boolean
  mesIdx: number
  exibirProjecao: boolean // marca células com componente projetado
  temBudget: boolean // existe algum orçado cadastrado no período (mostra as colunas)
}) {
  const totalPeriodo = modoAno ? somaPeriodo(bloco.total) : bloco.total[mesIdx]
  const compTotal = calcularComp(bloco.totalOrcado, bloco.total, modoAno, mesIdx)
  const rotuloColunaComp = modoAno
    ? `Comparação do ano (realizado${exibirProjecao ? ' + projetado' : ''})`
    : 'Comparação do mês'

  return (
    <div className="border border-[#232B36] rounded-xl overflow-hidden">
      <div className="bg-[#0B0F14] border-b border-[#232B36] px-4 py-2.5 flex items-center gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white">{titulo}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-300">
          <thead className="bg-[#0B0F14] border-b border-[#232B36] text-xs text-gray-400 uppercase tracking-wider font-semibold">
            <tr>
              <th className="py-2.5 px-4 min-w-[220px]" scope="col">
                Categoria
              </th>
              {modoAno
                ? MESES_CURTOS.map((m) => (
                    <th key={m} className="py-2.5 px-2 text-center" scope="col">
                      {m}
                    </th>
                  ))
                : null}
              <th className="py-2.5 px-4 text-right" scope="col">
                {modoAno ? 'Total Ano' : 'Realizado'}
              </th>
              {temBudget ? (
                <>
                  <th className="py-2.5 px-3 text-right" scope="col">
                    Orçado
                  </th>
                  <th className="py-2.5 px-3 text-right" scope="col">
                    Var. R$
                  </th>
                  <th className="py-2.5 px-4 text-right" scope="col">
                    Var. %
                  </th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#232B36]">
            {bloco.grupos.length === 0 ? (
              <tr>
                <td colSpan={modoAno ? 14 : 2} className="py-8 text-center text-gray-500 text-sm">
                  Sem movimento realizado de {titulo.toLowerCase()} no período.
                </td>
              </tr>
            ) : (
              bloco.grupos.map((g, gi) => (
                <CategoriaGrupoLinhas
                  key={g.grupo?.id || `sem-${gi}`}
                  grupoDre={g}
                  tipo={tipo}
                  modoAno={modoAno}
                  mesIdx={mesIdx}
                  exibirProjecao={exibirProjecao}
                  temBudget={temBudget}
                />
              ))
            )}
          </tbody>
          <tfoot className="border-t border-[#232B36] bg-[#0B0F14]">
            <tr>
              <td className="py-2.5 px-4 text-sm font-bold text-white" title={rotuloColunaComp}>
                Total de {titulo}
              </td>
              {modoAno &&
                bloco.total.map((v, m) => (
                  <td
                    key={m}
                    className={`py-2.5 px-2 text-center font-mono text-[11px] ${
                      exibirProjecao && bloco.temProjecao[m]
                        ? 'italic text-gray-400'
                        : 'text-white'
                    }`}
                  >
                    {v === 0
                      ? '—'
                      : `${formatCurrency(v).replace('R$', '').trim()}${
                          exibirProjecao && bloco.temProjecao[m] ? ' *' : ''
                        }`}
                  </td>
                ))}
              <td
                className={`py-2.5 px-4 text-right font-mono text-sm font-bold ${
                  tipo === 'receita' ? 'text-[#00D68F]' : 'text-[#FF5C5C]'
                } ${tipo === 'receita' ? 'dre-keep dre-pos' : 'dre-keep dre-neg'}`}
              >
                {formatCurrency(totalPeriodo)}
              </td>
              {temBudget ? <CelulasComp comp={compTotal} tipo={tipo} /> : null}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// Linhas de um grupo do plano de contas: cabeçalho do grupo, linhas de categoria
// e subtotal do grupo (mesmo padrão visual da Projeção Anual de Recorrentes).
function CategoriaGrupoLinhas({
  grupoDre,
  tipo,
  modoAno,
  mesIdx,
  exibirProjecao,
  temBudget,
}: {
  grupoDre: BlocoDRE['grupos'][number]
  tipo: 'receita' | 'despesa'
  modoAno: boolean
  mesIdx: number
  exibirProjecao: boolean
  temBudget: boolean
}) {
  const g = grupoDre
  const compSubtotal = calcularComp(g.subtotalOrcado, g.subtotal, modoAno, mesIdx)
  return (
    <>
      <tr className="bg-[#0B0F14]/60">
        <th
          colSpan={modoAno ? 14 : 2}
          scope="colgroup"
          className="py-2 px-4 text-left text-xs font-bold uppercase tracking-wider text-[#00D68F]/90"
        >
          {g.grupo?.nome || 'Sem grupo'}
        </th>
        {temBudget ? <th colSpan={3} aria-hidden="true" /> : null}
      </tr>
      {g.linhas.map((l) => {
        const comp = calcularComp(l.orcado, l.valores, modoAno, mesIdx)
        return (
          <tr key={l.plano.id} className="hover:bg-[#1A222D]/50 transition-colors">
            <td className="py-2.5 px-4">
              <span className="font-mono text-[11px] text-gray-500 mr-2">{l.plano.codigo}</span>
              <span className="font-medium text-white text-sm">{l.plano.descricao}</span>
            </td>
            {modoAno &&
              l.valores.map((v, m) => (
                <td
                  key={m}
                  className="py-2.5 px-2 text-center font-mono text-[11px] whitespace-nowrap"
                >
                  <CelulaValor v={v} temProj={l.projetado[m]} exibirProjecao={exibirProjecao} />
                </td>
              ))}
            <td className="py-2.5 px-4 text-right font-mono text-xs font-semibold text-white whitespace-nowrap">
              {formatCurrency(modoAno ? somaPeriodo(l.valores) : l.valores[mesIdx])}
            </td>
            {temBudget ? <CelulasComp comp={comp} tipo={tipo} /> : null}
          </tr>
        )
      })}
      <tr className="bg-[#1A222D]/40">
        <td className="py-2 px-4 text-xs font-bold text-gray-300">
          Subtotal {g.grupo?.nome || 'Sem grupo'}
        </td>
        {modoAno &&
          g.subtotal.map((v, m) => (
            <td
              key={m}
              className="py-2 px-2 text-center font-mono text-[11px]"
            >
              <CelulaValor v={v} temProj={g.temProjecaoMes[m]} exibirProjecao={exibirProjecao} />
            </td>
          ))}
        <td className="py-2 px-4 text-right font-mono text-xs font-bold text-white whitespace-nowrap">
          {formatCurrency(modoAno ? somaPeriodo(g.subtotal) : g.subtotal[mesIdx])}
        </td>
        {temBudget ? <CelulasComp comp={compSubtotal} tipo={tipo} /> : null}
      </tr>
    </>
  )
}
