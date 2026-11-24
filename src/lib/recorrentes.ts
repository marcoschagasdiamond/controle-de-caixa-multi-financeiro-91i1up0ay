// Regra de ocorrência dos lançamentos recorrentes mensais.
// Uma ocorrência cai no dia `diaMes` de cada mês, a partir de `dataInicial` (YYYY-MM-DD).
// Em meses mais curtos (ex.: dia 31 em fevereiro), usa o último dia do mês.

export function recorrenteOcorreEm(dataISO: string, diaMes: number, dataInicial: string): boolean {
  if (dataISO < dataInicial) return false
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  const ultimoDiaDoMes = new Date(ano, mes, 0).getDate()
  const diaEfetivo = Math.min(Number(diaMes), ultimoDiaDoMes)
  return dia === diaEfetivo
}
