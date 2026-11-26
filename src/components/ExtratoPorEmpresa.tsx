import { GrupoEmpresa, rotuloStatus, rotuloTipo } from '@/lib/relatorioPessoa'
import { formatCurrency, formatDateBR } from '@/lib/formatters'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface Props {
  grupos: GrupoEmpresa[]
}

// Visão "Por Empresa" do Extrato por Favorecido: uma seção por financeiro, com subtotais no cabeçalho
export function ExtratoPorEmpresa({ grupos }: Props) {
  if (grupos.length === 0) {
    return (
      <div className="bg-[#141A22] border border-[#232B36] rounded-xl p-10 text-center text-sm text-gray-500">
        Nenhum lançamento encontrado para esta busca e filtros.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {grupos.map((g) => (
        <Card key={g.financeiroId} className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
          <CardHeader className="pb-3 border-b border-[#232B36] space-y-1">
            <CardTitle className="text-base font-bold">{g.empresa}</CardTitle>
            <p className="text-xs text-gray-400 font-mono">
              <span className="text-[#FF5C5C]">
                Total pago {formatCurrency(g.totais.totalPago)}
              </span>
              <span className="mx-2" aria-hidden="true">
                ·
              </span>
              <span className="text-[#00D68F]">
                Total recebido {formatCurrency(g.totais.totalRecebido)}
              </span>
              <span className="mx-2" aria-hidden="true">
                ·
              </span>
              <span className="text-gray-300">
                {g.totais.quantidade} lançamento(s)
                {g.totais.previstos > 0 && ` (${g.totais.previstos} previsto(s) fora do total)`}
              </span>
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableCaption className="sr-only">Lançamentos de {g.empresa}</TableCaption>
                <TableHeader>
                  <TableRow className="border-[#232B36] hover:bg-transparent">
                    <TableHead className="text-gray-400">Data</TableHead>
                    <TableHead className="text-right text-gray-400">Valor</TableHead>
                    <TableHead className="text-gray-400">Descrição</TableHead>
                    <TableHead className="text-gray-400">Conta bancária</TableHead>
                    <TableHead className="text-gray-400">Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-[#232B36]">
                  {g.linhas.map((l) => (
                    <TableRow key={l.id} className="border-[#232B36] hover:bg-[#1A222D]/40">
                      <TableCell className="text-xs font-mono text-gray-300 whitespace-nowrap">
                        {formatDateBR(l.data)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-xs font-semibold whitespace-nowrap ${
                          l.tipo === 'debito' ? 'text-[#FF5C5C]' : 'text-[#00D68F]'
                        }`}
                      >
                        {formatCurrency(l.valor)}
                      </TableCell>
                      <TableCell className="text-sm text-white">
                        {l.descricao}
                        {l.status === 'previsto' && (
                          <Badge variant="outline" className="ml-2 text-[9px] py-0 px-1.5">
                            Previsto
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-300">{l.conta}</TableCell>
                      <TableCell className="text-xs text-gray-400">
                        {rotuloTipo(l.tipo)}
                        <span className="sr-only"> ({rotuloStatus(l.status)})</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
