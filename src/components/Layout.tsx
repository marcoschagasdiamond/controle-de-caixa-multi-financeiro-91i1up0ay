import React, { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { FinanceiroService } from '@/services/financeiro'
import { Financeiro } from '@/types/financeiro'
import {
  LayoutDashboard,
  ArrowLeftRight,
  CheckCheck,
  TrendingUp,
  PieChart,
  ShieldAlert,
  FileText,
  Settings,
  LogOut,
  Building2,
  User,
  ShieldCheck,
  Menu,
  X,
  PlusCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AuthModal } from '@/components/AuthModal'

export default function Layout() {
  const { user, signOut, loading: authLoading } = useAuth()
  const [financeiros, setFinanceiros] = useState<Financeiro[]>([])
  const [loadingFin, setLoadingFin] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()

  const loadFinanceiros = async () => {
    if (!user) return
    try {
      setLoadingFin(true)
      const data = await FinanceiroService.getFinanceiros()
      setFinanceiros(data)
    } catch (err) {
      console.error('Erro ao carregar financeiros no layout:', err)
    } finally {
      setLoadingFin(false)
    }
  }

  useEffect(() => {
    if (user) {
      loadFinanceiros()
    }
  }, [user])

  // Se não estiver logado, exibe tela de login/cadastro
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center text-white">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#00D68F]" />
      </div>
    )
  }

  if (!user) {
    return <AuthModal />
  }

  const navLinks = [
    { to: '/', label: 'Painel', icon: LayoutDashboard },
    { to: '/lancamentos', label: 'Lançamentos', icon: ArrowLeftRight },
    { to: '/conciliacao', label: 'Conciliação', icon: CheckCheck },
    { to: '/fluxo-caixa', label: 'Fluxo de Caixa', icon: TrendingUp },
    { to: '/budget', label: 'Budget', icon: PieChart },
    { to: '/necessidade-caixa', label: 'Necessidade de Caixa', icon: ShieldAlert },
    { to: '/mutuos', label: 'Mútuos', icon: Building2 },
    { to: '/fechamento', label: 'Fechamento', icon: FileText },
    { to: '/configuracoes', label: 'Configurações', icon: Settings },
  ]

  return (
    <div className="min-h-screen md:h-screen md:overflow-hidden bg-[#0B0F14] text-[#F1F5F9] flex flex-col md:flex-row antialiased">
      {/* Top bar mobile */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-[#141A22] border-b border-[#232B36] sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#00D68F]/10 border border-[#00D68F]/30 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-[#00D68F]" />
          </div>
          <span className="font-bold text-sm tracking-wide text-white">Multi-Financeiro</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-gray-300 hover:text-white hover:bg-[#1E2633]"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </header>

      {/* Sidebar Desktop e Mobile */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-[#141A22] border-r border-[#232B36] flex flex-col transform transition-transform duration-200 ease-in-out md:static md:inset-auto md:h-screen md:translate-x-0 md:sticky md:top-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className="p-5 border-b border-[#232B36] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#00D68F]/10 border border-[#00D68F]/40 flex items-center justify-center shadow-sm">
              <ShieldCheck className="w-5 h-5 text-[#00D68F]" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-white tracking-tight leading-none">
                Multi-Financeiro
              </h2>
              <span className="text-[10px] text-gray-400 font-medium tracking-wide uppercase">
                Segregação Patrimonial
              </span>
            </div>
          </div>
        </div>

        {/* Financial entities quick list / badge */}
        <div className="px-4 py-3 border-b border-[#232B36]/60 bg-[#0E131A]/60">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Entidades ({financeiros.length})
            </span>
            <button
              onClick={() => {
                setSidebarOpen(false)
                navigate('/configuracoes?tab=financeiros&novo=true')
              }}
              title="Cadastrar Financeiro"
              className="text-gray-400 hover:text-[#00D68F] transition-colors p-0.5 cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
            </button>
          </div>
          {loadingFin ? (
            <div className="text-xs text-gray-500 py-1">Carregando...</div>
          ) : financeiros.length === 0 ? (
            <div className="text-xs text-amber-400/90 py-1 flex items-center gap-1.5">
              <span>Nenhum cadastrado</span>
              <button
                onClick={() => {
                  setSidebarOpen(false)
                  navigate('/onboarding')
                }}
                className="underline text-[#00D68F] hover:text-[#00B97A]"
              >
                Iniciar
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {financeiros.map((fin) => (
                <Badge
                  key={fin.id}
                  variant="outline"
                  className="text-[10px] py-0 px-2 font-medium flex items-center gap-1 border"
                  style={{
                    borderColor: fin.cor ? `${fin.cor}66` : '#232B36',
                    backgroundColor: fin.cor ? `${fin.cor}18` : '#141A22',
                    color: fin.cor || '#F1F5F9',
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: fin.cor || '#00D68F' }}
                  />
                  {fin.nome}
                  <span className="text-[9px] opacity-70">({fin.tipo})</span>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Navegação principal */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navLinks.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-[#00D68F]/15 text-[#00D68F] border border-[#00D68F]/30 shadow-sm'
                      : 'text-gray-400 hover:text-white hover:bg-[#1A222D]'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        {/* Rodapé com Usuário & Logout */}
        <div className="p-3 border-t border-[#232B36] bg-[#0E131A]/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-7 h-7 rounded-full bg-[#1E2633] border border-[#2B3545] flex items-center justify-center shrink-0">
                <User className="w-3.5 h-3.5 text-gray-300" />
              </div>
              <div className="truncate text-left">
                <p className="text-xs font-medium text-white truncate max-w-[120px]">
                  {user.email?.split('@')[0]}
                </p>
                <p className="text-[10px] text-gray-400 truncate max-w-[120px]">{user.email}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => signOut()}
              title="Sair do sistema"
              className="text-gray-400 hover:text-[#FF5C5C] hover:bg-[#FF5C5C]/10 h-8 w-8 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Overlay para mobile quando sidebar aberta */}
      {sidebarOpen && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Fechar menu lateral"
          onClick={() => setSidebarOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') setSidebarOpen(false)
          }}
          className="fixed inset-0 bg-black/60 z-20 md:hidden backdrop-blur-xs"
        />
      )}

      {/* Conteúdo Principal */}
      <main className="flex-1 min-w-0 overflow-y-auto md:h-screen">
        <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
          <Outlet context={{ reloadFinanceiros: loadFinanceiros }} />
        </div>
      </main>
    </div>
  )
}
