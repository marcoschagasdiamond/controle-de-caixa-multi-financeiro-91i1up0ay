import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/hooks/use-auth'
import { Toaster } from '@/components/ui/toaster'
import Layout from '@/components/Layout'
import Index from '@/pages/Index'
import Onboarding from '@/pages/Onboarding'
import LancamentosPage from '@/pages/Lancamentos'
import ConciliacaoPage from '@/pages/Conciliacao'
import FluxoCaixaPage from '@/pages/FluxoCaixa'
import BudgetPage from '@/pages/Budget'
import NecessidadeCaixaPage from '@/pages/NecessidadeCaixa'
import MutuosPage from '@/pages/Mutuos'
import FechamentoPage from '@/pages/Fechamento'
import ConfiguracoesPage from '@/pages/Configuracoes'
import NotFound from '@/pages/NotFound'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Index /> },
      { path: 'onboarding', element: <Onboarding /> },
      { path: 'lancamentos', element: <LancamentosPage /> },
      { path: 'conciliacao', element: <ConciliacaoPage /> },
      { path: 'fluxo-caixa', element: <FluxoCaixaPage /> },
      { path: 'budget', element: <BudgetPage /> },
      { path: 'necessidade-caixa', element: <NecessidadeCaixaPage /> },
      { path: 'mutuos', element: <MutuosPage /> },
      { path: 'fechamento', element: <FechamentoPage /> },
      { path: 'configuracoes', element: <ConfiguracoesPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster />
    </AuthProvider>
  )
}
