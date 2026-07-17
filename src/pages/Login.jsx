import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Building2 } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      await login(email, senha);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Erro ao fazer login');
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--bg)' }}>
        <div className="spinner" style={{ width: '32px', height: '32px' }}></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Left decorative panel */}
      <div className="hidden lg:flex flex-1 flex-col justify-center items-center p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full opacity-[0.08]" style={{ background: 'radial-gradient(circle, var(--accent), transparent)', transform: 'translate(30%, -30%)' }} />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full opacity-[0.05]" style={{ background: 'radial-gradient(circle, var(--info), transparent)', transform: 'translate(-20%, 20%)' }} />
        <div className="relative z-10 max-w-md text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', boxShadow: '0 0 30px var(--accent-glow)' }}>
            <span className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: '#04120e' }}>O</span>
          </div>
          <h1 className="text-3xl font-bold mb-3" style={{ fontFamily: 'var(--font-display)' }}>Fechamento Contábil</h1>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Plataforma de gestão e acompanhamento do fechamento contábil em tempo real.
            Monitore etapas, períodos e indicadores de desempenho da sua equipe.
          </p>
          <div className="flex gap-3 justify-center mt-8">
            <div className="px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <span className="font-bold" style={{ color: 'var(--accent)' }}>72</span> etapas ativas
            </div>
            <div className="px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <span className="font-bold" style={{ color: 'var(--warning)' }}>9</span> períodos
            </div>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Logo on mobile */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))' }}>
              <span className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: '#04120e' }}>O</span>
            </div>
            <div>
              <div className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>Fechamento</div>
              <div className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>Contábil</div>
            </div>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-xl font-bold mb-1" style={{ fontFamily: 'var(--font-display)' }}>Acessar plataforma</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Entre com suas credenciais</p>
          </div>

          {error && (
            <div className="p-3 rounded-lg text-sm mb-4 text-center" style={{ background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid rgba(251,113,105,0.2)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@provedor.com"
                required
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Senha</label>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary w-full mt-2"
            >
              {isLoading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p className="text-xs text-center mt-8" style={{ color: 'var(--text-dim)' }}>
            Ao continuar, você concorda com nossos <a href="#" style={{ color: 'var(--accent)' }}>termos de uso</a>.
          </p>
        </div>
      </div>
    </div>
  );
}