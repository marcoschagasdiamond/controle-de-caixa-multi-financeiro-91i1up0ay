import React, { useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { ShieldCheck, Lock, Mail, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

export const AuthModal: React.FC = () => {
  const { signIn, signUp } = useAuth()
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('marcoschagasdiamond@icloud.com')
  const [password, setPassword] = useState('Skip@Pass123')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)
    setLoading(true)

    try {
      if (isLogin) {
        const { error } = await signIn(email, password)
        if (error) {
          setErrorMessage(error.message || 'Falha ao autenticar. Verifique e-mail e senha.')
        }
      } else {
        const { error } = await signUp(email, password)
        if (error) {
          setErrorMessage(error.message || 'Falha ao criar conta.')
        } else {
          setSuccessMessage('Conta criada com sucesso! Você já pode entrar com suas credenciais.')
          setIsLogin(true)
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Ocorreu um erro inesperado.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#141A22] border border-[#232B36] shadow-xl mb-3">
            <ShieldCheck className="w-8 h-8 text-[#00D68F]" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white font-sans">
            Controle de Caixa Multi-Financeiro
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Segregação patrimonial absoluta entre PF, PJ e empresas
          </p>
        </div>

        <Card className="bg-[#141A22] border-[#232B36] shadow-2xl text-white">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl text-white">
              {isLogin ? 'Entrar no sistema' : 'Criar nova conta'}
            </CardTitle>
            <CardDescription className="text-gray-400">
              {isLogin
                ? 'Informe suas credenciais para gerenciar suas contas segregadas'
                : 'Cadastre sua conta para iniciar com isolamento patrimonial'}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {errorMessage && (
                <Alert className="bg-[#FF5C5C]/10 border-[#FF5C5C]/40 text-[#FF5C5C]">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}
              {successMessage && (
                <Alert className="bg-[#00D68F]/10 border-[#00D68F]/40 text-[#00D68F]">
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  <AlertDescription>{successMessage}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-gray-300 text-xs uppercase tracking-wider font-semibold"
                >
                  E-mail
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="exemplo@empresa.com.br"
                    className="pl-10 bg-[#0B0F14] border-[#232B36] text-white placeholder-gray-600 focus:border-[#00D68F] focus:ring-[#00D68F]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="pass"
                  className="text-gray-300 text-xs uppercase tracking-wider font-semibold"
                >
                  Senha
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    id="pass"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className="pl-10 bg-[#0B0F14] border-[#232B36] text-white placeholder-gray-600 focus:border-[#00D68F] focus:ring-[#00D68F]"
                  />
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3 pt-2">
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-semibold h-11 text-base shadow-lg shadow-[#00D68F]/20 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    {isLogin ? 'Entrar' : 'Cadastrar'}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin)
                  setErrorMessage(null)
                  setSuccessMessage(null)
                }}
                className="text-xs text-gray-400 hover:text-white transition-colors py-1 cursor-pointer"
              >
                {isLogin ? 'Ainda não tem conta? Criar acesso' : 'Já tem uma conta? Fazer login'}
              </button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
