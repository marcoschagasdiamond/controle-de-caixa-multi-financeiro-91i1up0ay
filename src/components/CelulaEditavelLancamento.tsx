import React, { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

type CampoEditavel =
  | 'descricao'
  | 'valor'
  | 'data'
  | 'data_vencimento'
  | 'contraparte'
  | 'documento'
  | 'observacao'

interface Props {
  /** id do lançamento — usado no aria-label (nome acessível distinto por linha) */
  rotuloLancamento: string
  campo: CampoEditavel
  /** rótulo humano do campo, para o nome acessível ("Editar valor de ...") */
  nomeCampo: string
  valorExibido: React.ReactNode
  valorBruto: string
  /** 'texto' = input de texto; 'valor' = número decimal com vírgula; 'data' = date */
  tipo: 'texto' | 'valor' | 'data'
  placeholder?: string
  className?: string
  onSalvar: (valor: string) => Promise<void>
}

/**
 * Célula de lançamento editável inline: clique no conteúdo e vira input;
 * Enter (ou blur) confirma, Escape cancela. Salva direto no banco via onSalvar
 * (updateLancamento parcial) e devolve o erro à célula se falhar.
 */
export default function CelulaEditavelLancamento({
  rotuloLancamento,
  campo,
  nomeCampo,
  valorExibido,
  valorBruto,
  tipo,
  placeholder,
  className,
  onSalvar,
}: Props) {
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState(valorBruto)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Guarda síncrona contra duplo envio (Enter + blur na mesma edição)
  const salvandoRef = useRef(false)

  useEffect(() => {
    if (editando) inputRef.current?.focus()
  }, [editando])

  const iniciar = () => {
    setRascunho(valorBruto)
    setErro(null)
    setEditando(true)
  }

  const cancelar = () => {
    setEditando(false)
    setErro(null)
    setRascunho(valorBruto)
  }

  const confirmar = async () => {
    const novo = rascunho.trim()
    const original = valorBruto.trim()
    if (novo === original) {
      setEditando(false)
      setErro(null)
      return
    }
    if (tipo === 'valor') {
      const v = parseFloat(novo.replace(',', '.'))
      if (isNaN(v) || v <= 0) {
        setErro('Informe um valor positivo válido.')
        return
      }
    }
    if (tipo === 'data' && campo !== 'data_vencimento' && !novo) {
      setErro('A data é obrigatória.')
      return
    }
    if (campo === 'descricao' && !novo) {
      setErro('A descrição é obrigatória.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      salvandoRef.current = true
      await onSalvar(tipo === 'valor' ? String(parseFloat(novo.replace(',', '.'))) : novo)
      setEditando(false)
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível salvar.')
    } finally {
      salvandoRef.current = false
      setSalvando(false)
    }
  }

  if (editando) {
    return (
      <div className="flex flex-col gap-1 min-w-[6rem]">
        <input
          ref={inputRef}
          type={tipo === 'data' ? 'date' : 'text'}
          inputMode={tipo === 'valor' ? 'decimal' : undefined}
          autoComplete="off"
          aria-label={`${nomeCampo} de ${rotuloLancamento}`}
          value={rascunho}
          disabled={salvando}
          onChange={(e) => setRascunho(e.target.value)}
          onBlur={() => {
            if (!salvandoRef.current) void confirmar()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void confirmar()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cancelar()
            }
          }}
          className={cn(
            'rounded-md border bg-[#0B0F14] px-2 py-1 text-xs text-white',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D68F] focus-visible:border-[#00D68F]',
            erro ? 'border-[#FF5C5C]' : 'border-[#00D68F]/60',
            tipo === 'data' && 'font-mono',
          )}
        />
        {erro && (
          <span role="alert" className="text-[10px] text-[#FF5C5C] font-medium leading-tight">
            {erro}
          </span>
        )}
        {salvando && (
          <span role="status" className="text-[10px] text-gray-400 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> Salvando…
          </span>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={iniciar}
      title={`Clique para editar ${nomeCampo.toLowerCase()}`}
      className={cn(
        'rounded text-left w-full transition-colors hover:bg-[#1E2633] hover:text-white',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D68F]',
        'cursor-text px-1 -mx-1',
        className,
      )}
    >
      {valorExibido}
    </button>
  )
}
