# Sistema de Acompanhamento do Fechamento Contábil

Sistema completo para gestão e acompanhamento do fechamento contábil mensal, com fluxograma visual interativo, dashboard de indicadores e relatórios gerenciais.

## Tecnologias wew

- **Frontend**: React 18 + Vite + Tailwind CSS
- **Backend/Database**: Firebase (Authentication + Realtime Database)
- **Bibliotecas**: Lucide Icons, date-fns, xlsx

## Instalação

### 1. Instalar dependências

```bash
pnpm install
```

### 2. Executar em desenvolvimento

```bash
pnpm dev
```

O sistema estará disponível em `http://localhost:5173`

### 3. Build para produção

```bash
pnpm build
```

## Configuração do Firebase

O projeto já está configurado com as credenciais do Firebase. Se precisar usar seu próprio projeto Firebase:

1. Acesse o [Firebase Console](https://console.firebase.google.com/)
2. Crie um novo projeto
3. Ative **Authentication** (Email/Senha e Google)
4. Ative **Realtime Database**
5. Atualize as credenciais em `src/services/firebase.js`

### Regras do Realtime Database

Configure as seguintes regras no Firebase Console:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    },
    "empresas": {
      "$empresaId": {
        ".read": "root.child('empresas').child($empresaId).child('membros').child(auth.uid).exists()",
        ".write": "root.child('empresas').child($empresaId).child('membros').child(auth.uid).exists()"
      }
    }
  }
}
```

## Funcionalidades

### Dashboard
- Indicadores de progresso (% concluído, atrasadas, tempo médio de atraso)
- Timeline visual do fechamento (D+0 a D+10)
- Barras de progresso por status

### Fluxograma Visual
- Visualização interativa das etapas
- Cores dinâmicas por status:
  - 🟢 Verde: Concluído no prazo
  - 🔵 Azul: Em andamento
  - 🟡 Amarelo: Pendente
  - 🟠 Laranja: Concluído com atraso
  - 🔴 Vermelho: Atrasado
- Clique para ver detalhes e concluir etapas

### Gestão de Etapas
- CRUD completo de etapas
- Filtros por área, responsável e status
- Cálculo automático de status baseado em datas

### Cadastros
- Períodos de fechamento (mês/ano)
- Áreas (Contábil, Fiscal, Controladoria, etc.)
- Responsáveis
- Templates de etapas

### Relatórios
- Relatório final do fechamento
- Etapas atrasadas
- Por área
- Ranking de responsáveis
- Exportação CSV

### Notificações
- Alertas de etapas próximas do prazo
- Alertas de etapas atrasadas
- Configurações de notificação

### Importação em Massa
- Upload de planilha Excel
- Preview dos dados
- Validação automática
- Template para download

### Multi-Tenancy
- Múltiplas empresas por usuário
- Isolamento completo de dados
- Seletor de empresa

## Estrutura do Projeto

```
src/
├── components/       # Componentes reutilizáveis
│   ├── Layout.jsx
│   └── Sidebar.jsx
├── contexts/         # Contextos React
│   └── AuthContext.jsx
├── pages/            # Páginas da aplicação
│   ├── Dashboard.jsx
│   ├── Fluxograma.jsx
│   ├── Etapas.jsx
│   ├── Empresas.jsx
│   ├── Relatorios.jsx
│   ├── Notificacoes.jsx
│   ├── Importacao.jsx
│   └── Login.jsx
├── services/         # Serviços
│   ├── firebase.js   # Configuração Firebase
│   └── database.js   # Funções de banco de dados
├── App.jsx           # Rotas da aplicação
├── main.jsx          # Entry point
└── index.css         # Estilos globais
```

## Licença

MIT
