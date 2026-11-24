// Regra de ocorrência dos lançamentos recorrentes mensais e PARCELADOS.
// Uma ocorrência cai no dia `diaMes` de cada mês, a partir de `dataInicial` (YYYY-MM-DD).
// Em meses mais curtos (ex.: dia 31 em fevereiro), usa o último dia do mês.
// Parcelado: quando `totalParcelas` é informado, as ocorrências terminam na N-ésima
// parcela (a própria dataInicial conta como a 1ª); sem ele, é mensal contínua como antes.

// Índice 0-based do mês de uma data ISO (YYYY-MM-DD)
function indiceMes(dataISO: string): number {
  const ano = Number(dataISO.slice(0, 4))
  const mes = Number(dataISO.slice(5, 7))
  return ano * 12 + (mes - 1)
}

// Nº de meses entre dataInicial (inclusive, = parcela 1) e dataISO
export function mesesDesdeInicial(dataISO: string, dataInicial: string): number {
  return indiceMes(dataISO) - indiceMes(dataInicial)
}

export function recorrenteOcorreEm(
  dataISO: string,
  diaMes: number,
  dataInicial: string,
  totalParcelas?: number | null,
): boolean {
  if (dataISO < dataInicial) return false
  if (totalParcelas != null && totalParcelas > 0) {
    const parcela = mesesDesdeInicial(dataISO, dataInicial) + 1
    if (parcela > totalParcelas) return false
  }
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  const ultimoDiaDoMes = new Date(ano, mes, 0).getDate()
  const diaEfetivo = Math.min(Number(diaMes), ultimoDiaDoMes)
  return dia === diaEfetivo
}

// Índice (1-based) da parcela de uma ocorrência em dataISO (parcelado)
export function numeroParcela(dataISO: string, dataInicial: string): number {
  return mesesDesdeInicial(dataISO, dataInicial) + 1
}

// Data ISO (YYYY-MM-DD) da última parcela de um recorrente parcelado
export function dataUltimaParcela(
  diaMes: number,
  dataInicial: string,
  totalParcelas: number,
): string {
  if (totalParcelas <= 1) return dataInicial
  const [ano, mes] = dataInicial.split('-').map(Number)
  // dataInicial é a parcela 1; avança (totalParcelas - 1) meses
  const alvo = new Date(ano, mes - 1 + (totalParcelas - 1), 1)
  const anoAlvo = alvo.getFullYear()
  const mesAlvo = alvo.getMonth()
  const ultimoDia = new Date(anoAlvo, mesAlvo + 1, 0).getDate()
  const dia = Math.min(Number(diaMes), ultimoDia)
  return `${anoAlvo}-${String(mesAlvo + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

// Mês por extenso (pt-BR) de uma data ISO, ex.: "março/2026"
export function mesPorExtenso(dataISO: string): string {
  const MESES = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ]
  return `${MESES[Number(dataISO.slice(5, 7)) - 1]}/${dataISO.slice(0, 4)}`
}

// Aviso de encerramento do parcelamento: quando falta 1 mês ou menos para a última
// parcela, retorna quantas parcelas restam (incluindo a atual) e o mês de encerramento.
// Retorna null quando não é parcelado, já encerrou ou ainda há mais de 1 mês pela frente.
export interface AvisoEncerramento {
  parcelasRestantes: number
  totalParcelas: number
  mesEncerramento: string // "março/2026"
}

export function avisoEncerramento(
  hoje: string,
  diaMes: number,
  dataInicial: string,
  totalParcelas?: number | null,
): AvisoEncerramento | null {
  if (!totalParcelas || totalParcelas <= 0) return null
  const parcelaAtual = mesesDesdeInicial(hoje, dataInicial) + 1
  if (parcelaAtual < 1) return null // ainda não começou
  if (parcelaAtual > totalParcelas) return null // já encerrado
  const parcelasRestantes = totalParcelas - parcelaAtual + 1
  // Avisa quando restam no máximo 2 parcelas (a atual e a última): 1 mês ou menos para encerrar
  if (parcelasRestantes > 2) return null
  return {
    parcelasRestantes,
    totalParcelas,
    mesEncerramento: mesPorExtenso(dataUltimaParcela(diaMes, dataInicial, totalParcelas)),
  }
}
