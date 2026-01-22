import { useState } from 'react';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, LogIn } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // ====== CONFIGURAÇÃO DAS LOGOS FLUTUANTES ======
  // Para adicionar ou remover logos, edite o array abaixo
  // id: identificador único
  // duration: duração da animação em segundos
  // size: tamanho da logo em pixels (ex: 150, 200, 250, 300)
  const floatingLogos = [
    { id: 1, duration: 15, size: 50 },
    { id: 2, duration: 18, size: 50 },
    { id: 3, duration: 20, size: 50 },
    { id: 4, duration: 22, size: 50 },
    { id: 5, duration: 17, size: 50 },
    
    
    // Adicione mais logos aqui se quiser:
    // { id: 6, duration: 19, size: 50 },
    // { id: 7, duration: 16, size: 50 },
  ];
  // ===============================================

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const auth = getAuth();
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/');
    } catch (err) {
      console.error(err);
      let msg = 'Erro ao fazer login.';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        msg = 'Email ou senha incorretos.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Muitas tentativas. Tente novamente mais tarde.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center bg-slate-900">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 w-full h-full">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 animate-gradient-xy"></div>
        
        {/* Logos batendo nas bordas - geradas dinamicamente */}
        {floatingLogos.map((logo) => (
          <div key={logo.id} className={`logo-bounce-${logo.id}`}>
            <img 
              src="/Secontaf1.png"
              alt="Logo Secontaf"
              onError={(e) => console.log(`Erro ao carregar imagem ${logo.id}`)}
              onLoad={() => console.log(`Imagem ${logo.id} carregada com sucesso`)}
            />
          </div>
        ))}
        
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-600 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-blob"></div>
        <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-blue-600 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-[-20%] left-[20%] w-96 h-96 bg-pink-600 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>
      </div>

      {/* Login Card */}
      <div className="relative z-10 bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4 animate-fadeIn">
        <div className="text-center mb-8">
          {/* Logo principal no card */}
          <div className="w-20 h-20 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg animate-float overflow-hidden">
            <img 
              src="/Secontaf1.png"
              alt="Secontaf" 
              className="w-16 h-16 object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Bem-vindo</h1>
          <p className="text-blue-200">Sistema de Fechamento Contábil </p>
         
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 p-3 rounded-lg mb-6 text-sm backdrop-blur-sm animate-shake">
            {error}
          </div>
        )}

        {/* Email/Password Form */}
        <form onSubmit={handleEmailLogin} className="space-y-4 mb-6">
          <div className="relative group">
            <Mail className="absolute left-3 top-3 w-5 h-5 text-blue-300 group-focus-within:text-blue-400 transition-colors" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email corporativo"
              className="w-full bg-slate-800/50 border border-slate-600 text-white placeholder-slate-400 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>
          
          <div className="relative group">
            <Lock className="absolute left-3 top-3 w-5 h-5 text-blue-300 group-focus-within:text-blue-400 transition-colors" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha"
              className="w-full bg-slate-800/50 border border-slate-600 text-white placeholder-slate-400 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Entrar</span>
                <LogIn className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Link Secontaf abaixo do botão */}
        <div className="text-center">
          <a 
            href="https://secontaf.com.br" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-lg font-bold text-blue-300 hover:text-blue-400 transition-col'ors inline-block hover:underline"
          >
            secontaf.com.br
          </a>
          <p className="text-blue-200 text-sm mt-1"></p>
        </div>
      </div>
      

      {/* Custom Animations Styles */}
      <style>{`
        /* Logos flutuantes - GRANDES E VISÍVEIS */
        ${floatingLogos.map(logo => `
        .logo-bounce-${logo.id} {
          position: absolute;
          pointer-events: none;
          z-index: 1;
          animation: bounce-diagonal-${logo.id} ${logo.duration}s linear infinite;
        }
        
        .logo-bounce-${logo.id} img {
          width: ${logo.size}px !important;
          height: ${logo.size}px !important;
          object-fit: contain;
          filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.5));
          opacity: 0.85;
        }
        `).join('\n')}
      
        /* Animações estilo DVD screensaver - batendo nas bordas */
        @keyframes bounce-diagonal-1 {
          0% { 
            top: 0%; 
            left: 0%; 
            transform: translate(0, 0);
          }
          25% { 
            top: calc(80% - 250px); 
            left: calc(70% - 250px); 
            transform: translate(0, 0) rotate(90deg);
          }
          50% { 
            top: 0%; 
            left: calc(100% - 250px); 
            transform: translate(0, 0) rotate(180deg);
          }
          75% { 
            top: calc(70% - 250px); 
            left: 0%; 
            transform: translate(0, 0) rotate(270deg);
          }
          100% { 
            top: 0%; 
            left: 0%; 
            transform: translate(0, 0) rotate(360deg);
          }
        }
        
        @keyframes bounce-diagonal-2 {
          0% { 
            top: calc(100% - 250px); 
            left: calc(100% - 250px); 
            transform: translate(0, 0);
          }
          25% { 
            top: 0%; 
            left: calc(30% - 250px); 
            transform: translate(0, 0) rotate(90deg);
          }
          50% { 
            top: calc(80% - 250px); 
            left: 0%; 
            transform: translate(0, 0) rotate(180deg);
          }
          75% { 
            top: 0%; 
            left: calc(70% - 250px); 
            transform: translate(0, 0) rotate(270deg);
          }
          100% { 
            top: calc(100% - 250px); 
            left: calc(100% - 250px); 
            transform: translate(0, 0) rotate(360deg);
          }
        }
        
        @keyframes bounce-diagonal-3 {
          0% { 
            top: calc(50% - 125px); 
            left: calc(100% - 250px); 
            transform: translate(0, 0);
          }
          25% { 
            top: 0%; 
            left: calc(50% - 125px); 
            transform: translate(0, 0) rotate(90deg);
          }
          50% { 
            top: calc(50% - 125px); 
            left: 0%; 
            transform: translate(0, 0) rotate(180deg);
          }
          75% { 
            top: calc(100% - 250px); 
            left: calc(50% - 125px); 
            transform: translate(0, 0) rotate(270deg);
          }
          100% { 
            top: calc(50% - 125px); 
            left: calc(100% - 250px); 
            transform: translate(0, 0) rotate(360deg);
          }
        }
        
        @keyframes bounce-diagonal-4 {
          0% { 
            top: calc(30% - 125px); 
            left: 0%; 
            transform: translate(0, 0);
          }
          25% { 
            top: calc(100% - 250px); 
            left: calc(80% - 250px); 
            transform: translate(0, 0) rotate(90deg);
          }
          50% { 
            top: 0%; 
            left: calc(20% - 125px); 
            transform: translate(0, 0) rotate(180deg);
          }
          75% { 
            top: calc(60% - 250px); 
            left: calc(100% - 250px); 
            transform: translate(0, 0) rotate(270deg);
          }
          100% { 
            top: calc(30% - 125px); 
            left: 0%; 
            transform: translate(0, 0) rotate(360deg);
          }
        }
        
        @keyframes bounce-diagonal-5 {
          0% { 
            top: calc(80% - 250px); 
            left: calc(50% - 125px); 
            transform: translate(0, 0);
          }
          25% { 
            top: calc(20% - 125px); 
            left: calc(100% - 250px); 
            transform: translate(0, 0) rotate(90deg);
          }
          50% { 
            top: calc(100% - 250px); 
            left: calc(10% - 125px); 
            transform: translate(0, 0) rotate(180deg);
          }
          75% { 
            top: 0%; 
            left: calc(80% - 125px); 
            transform: translate(0, 0) rotate(270deg);
          }
          100% { 
            top: calc(80% - 250px); 
            left: calc(50% - 125px); 
            transform: translate(0, 0) rotate(360deg);
          }
        }
        
        @keyframes bounce-diagonal-6 {
          0% { 
            top: calc(40% - 125px); 
            left: calc(80% - 250px); 
            transform: translate(0, 0);
          }
          25% { 
            top: calc(90% - 250px); 
            left: calc(20% - 125px); 
            transform: translate(0, 0) rotate(90deg);
          }
          50% { 
            top: calc(10% - 125px); 
            left: calc(100% - 250px); 
            transform: translate(0, 0) rotate(180deg);
          }
          75% { 
            top: calc(100% - 250px); 
            left: calc(60% - 125px); 
            transform: translate(0, 0) rotate(270deg);
          }
          100% { 
            top: calc(40% - 125px); 
            left: calc(80% - 250px); 
            transform: translate(0, 0) rotate(360deg);
          }
        }
        
        @keyframes bounce-diagonal-7 {
          0% { 
            top: 0%; 
            left: calc(60% - 125px); 
            transform: translate(0, 0);
          }
          25% { 
            top: calc(70% - 250px); 
            left: calc(100% - 250px); 
            transform: translate(0, 0) rotate(90deg);
          }
          50% { 
            top: calc(100% - 250px); 
            left: calc(40% - 125px); 
            transform: translate(0, 0) rotate(180deg);
          }
          75% { 
            top: calc(30% - 125px); 
            left: 0%; 
            transform: translate(0, 0) rotate(270deg);
          }
          100% { 
            top: 0%; 
            left: calc(60% - 125px); 
            transform: translate(0, 0) rotate(360deg);
          }
        }
        
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        @keyframes gradient-xy {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient-xy {
          background-size: 200% 200%;
          animation: gradient-xy 15s ease infinite;
        }
      `}</style>
    </div>
  );
}