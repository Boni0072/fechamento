import { db, ref, onValue, push, set, update, remove, query, orderByChild, equalTo } from './firebase';

// ==================== EMPRESAS ====================
export const criarEmpresa = async (userId, empresa) => {
  try {
    console.log("DATABASE: Tentando criar empresa para o usuário:", userId);
    console.log("DATABASE: Dados da empresa:", empresa);

    const empresaData = {
      ...empresa,
      ownerId: userId,
      criadoEm: Date.now()
    };
    
    console.log("DATABASE: Objeto completo da empresa a ser salvo:", empresaData);

    const empresaRef = await push(ref(db, 'empresas'), empresaData);
    console.log("DATABASE: Empresa criada com sucesso. ID:", empresaRef.key);

    const membroData = {
      role: 'owner',
      addedAt: Date.now()
    };

    console.log(`DATABASE: Adicionando usuário como membro em membros/${empresaRef.key}/${userId}`);
    console.log("DATABASE: Dados do membro:", membroData);

    await set(ref(db, `membros/${empresaRef.key}/${userId}`), membroData);
    console.log("DATABASE: Membro adicionado com sucesso.");
    
    return empresaRef.key;
  } catch (error) {
    console.error("DATABASE: Erro detalhado ao criar empresa:", error);
    // Lança o erro novamente para que a UI possa capturá-lo e exibir uma mensagem.
    throw new Error(`Falha ao criar empresa no banco de dados: ${error.message}`);
  }
};

export const getEmpresas = (userId, callback) => {
  // Cria uma query para buscar empresas onde o ownerId é igual ao userId do usuário logado.
  const empresasQuery = query(ref(db, 'empresas'), orderByChild('ownerId'), equalTo(userId));
  
  // Executa a query
  return onValue(empresasQuery, (snapshot) => {
    const empresas = [];
    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        const empresa = child.val();
        empresas.push({ id: child.key, ...empresa });
      });
    }
    // Não é mais necessário filtrar no cliente, o banco de dados já fez isso.
    callback(empresas);
  });
};

// ==================== PERÍODOS ====================
export const criarPeriodo = async (empresaId, periodo) => {
  const periodoRef = await push(ref(db, `periodos/${empresaId}`), {
    ...periodo,
    status: 'aberto',
    criadoEm: Date.now()
  });
  return periodoRef.key;
};

export const getPeriodos = (empresaId, callback) => {
  return onValue(ref(db, `periodos/${empresaId}`), (snapshot) => {
    const periodos = [];
    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        periodos.push({ id: child.key, ...child.val() });
      });
    }
    callback(periodos);
  });
};

export const atualizarPeriodo = (empresaId, periodoId, dados) => {
  return update(ref(db, `periodos/${empresaId}/${periodoId}`), dados);
};

// ==================== ÁREAS ====================
export const criarArea = async (empresaId, area) => {
  const areaRef = await push(ref(db, `areas/${empresaId}`), {
    ...area,
    criadoEm: Date.now()
  });
  return areaRef.key;
};

export const getAreas = (empresaId, callback) => {
  return onValue(ref(db, `areas/${empresaId}`), (snapshot) => {
    const areas = [];
    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        areas.push({ id: child.key, ...child.val() });
      });
    }
    callback(areas);
  });
};

export const deletarArea = (empresaId, areaId) => {
  return remove(ref(db, `areas/${empresaId}/${areaId}`));
};

// ==================== RESPONSÁVEIS ====================
export const criarResponsavel = async (empresaId, responsavel) => {
  const respRef = await push(ref(db, `responsaveis/${empresaId}`), {
    ...responsavel,
    criadoEm: Date.now()
  });
  return respRef.key;
};

export const getResponsaveis = (empresaId, callback) => {
  return onValue(ref(db, `responsaveis/${empresaId}`), (snapshot) => {
    const responsaveis = [];
    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        responsaveis.push({ id: child.key, ...child.val() });
      });
    }
    callback(responsaveis);
  });
};

export const deletarResponsavel = (empresaId, responsavelId) => {
  return remove(ref(db, `responsaveis/${empresaId}/${responsavelId}`));
};

// ==================== ETAPAS ====================
export const criarEtapa = async (empresaId, periodoId, etapa) => {
  const etapaRef = await push(ref(db, `tenants/${empresaId}/periodos/${periodoId}/etapas`), {
    ...etapa,
    status: calcularStatus(etapa.dataPrevista, etapa.dataReal),
    criadoEm: Date.now(),
    atualizadoEm: Date.now()
  });
  return etapaRef.key;
};

export const getEtapas = (empresaId, periodoId, callback) => {
  return onValue(ref(db, `tenants/${empresaId}/periodos/${periodoId}/etapas`), (snapshot) => {
    const etapas = [];
    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        const etapa = child.val();
        etapas.push({ 
          id: child.key, 
          ...etapa,
          status: calcularStatus(etapa.dataPrevista, etapa.dataReal)
        });
      });
    }
    // Ordenar por ordem
    etapas.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    callback(etapas);
  });
};

export const atualizarEtapa = async (empresaId, periodoId, etapaId, dados, userId, userName) => {
  const novosDados = {
    ...dados,
    status: calcularStatus(dados.dataPrevista, dados.dataReal),
    atualizadoEm: Date.now()
  };
  
  await update(ref(db, `tenants/${empresaId}/periodos/${periodoId}/etapas/${etapaId}`), novosDados);
  
  // Registrar no histórico
  await registrarHistorico(empresaId, {
    etapaId,
    periodoId,
    userId,
    userName,
    acao: 'atualizacao',
    dados: novosDados,
    timestamp: Date.now()
  });
};

export const deletarEtapa = (empresaId, periodoId, etapaId) => {
  return remove(ref(db, `tenants/${empresaId}/periodos/${periodoId}/etapas/${etapaId}`));
};

export const importarEtapas = async (empresaId, periodoId, etapas) => {
  const promises = etapas.map((etapa, index) => {
    return criarEtapa(empresaId, periodoId, {
      ...etapa,
      ordem: index + 1
    });
  });
  return Promise.all(promises);
};

// ==================== HISTÓRICO ====================
export const registrarHistorico = async (empresaId, registro) => {
  const histRef = await push(ref(db, `historico/${empresaId}`), registro);
  return histRef.key;
};

export const getHistorico = (empresaId, callback) => {
  return onValue(ref(db, `historico/${empresaId}`), (snapshot) => {
    const historico = [];
    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        historico.push({ id: child.key, ...child.val() });
      });
    }
    // Ordenar por timestamp decrescente
    historico.sort((a, b) => b.timestamp - a.timestamp);
    callback(historico);
  });
};

// ==================== TEMPLATES ====================
export const criarTemplate = async (empresaId, template) => {
  const templateRef = await push(ref(db, `templates/${empresaId}`), {
    ...template,
    criadoEm: Date.now()
  });
  return templateRef.key;
};

export const getTemplates = (empresaId, callback) => {
  return onValue(ref(db, `templates/${empresaId}`), (snapshot) => {
    const templates = [];
    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        templates.push({ id: child.key, ...child.val() });
      });
    }
    callback(templates);
  });
};

export const deletarTemplate = (empresaId, templateId) => {
  return remove(ref(db, `templates/${empresaId}/${templateId}`));
};

// ==================== USUÁRIOS ====================
export const criarUsuario = (uid, dados) => {
  return set(ref(db, `usuarios/${uid}`), {
    ...dados,
    criadoEm: Date.now()
  });
};

export const getUsuarios = (callback) => {
  return onValue(ref(db, 'usuarios'), (snapshot) => {
    const usuarios = [];
    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        usuarios.push({ uid: child.key, ...child.val() });
      });
    }
    callback(usuarios);
  });
};

export const getUsuario = (uid, callback) => {
  return onValue(ref(db, `usuarios/${uid}`), (snapshot) => {
    callback(snapshot.val());
  });
};

export const atualizarUsuario = (uid, dados) => {
  return update(ref(db, `usuarios/${uid}`), {
    ...dados,
    atualizadoEm: Date.now()
  });
};

export const deletarUsuario = (uid) => {
  return remove(ref(db, `usuarios/${uid}`));
};


// ==================== HELPERS ====================
export const calcularStatus = (dataPrevista, dataReal) => {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  
  const prevista = dataPrevista ? new Date(dataPrevista) : null;
  if (prevista) prevista.setHours(0, 0, 0, 0);
  
  const real = dataReal ? new Date(dataReal) : null;
  if (real) real.setHours(0, 0, 0, 0);
  
  if (real) {
    // Concluído
    if (prevista && real > prevista) {
      return 'concluido_atraso'; // Laranja
    }
    return 'concluido'; // Verde
  }
  
  if (!prevista) {
    return 'pendente'; // Amarelo
  }
  
  if (hoje > prevista) {
    return 'atrasado'; // Vermelho
  }
  
  if (hoje.getTime() === prevista.getTime()) {
    return 'em_andamento'; // Azul
  }
  
  return 'pendente'; // Amarelo
};

export const getStatusColor = (status) => {
  const colors = {
    'concluido': 'bg-green-500',
    'em_andamento': 'bg-blue-500',
    'pendente': 'bg-yellow-500',
    'concluido_atraso': 'bg-orange-500',
    'atrasado': 'bg-red-500'
  };
  return colors[status] || 'bg-gray-500';
};

export const getStatusLabel = (status) => {
  const labels = {
    'concluido': 'Concluído',
    'em_andamento': 'Em Andamento',
    'pendente': 'Pendente',
    'concluido_atraso': 'Concluído c/ Atraso',
    'atrasado': 'Atrasado'
  };
  return labels[status] || status;
};

// Calcular indicadores do dashboard
export const calcularIndicadores = (etapas) => {
  const total = etapas.length;
  if (total === 0) {
    return {
      total: 0,
      concluidas: 0,
      emAndamento: 0,
      pendentes: 0,
      atrasadas: 0,
      concluidasComAtraso: 0,
      percentualConcluido: 0,
      percentualAtrasado: 0,
      tempoMedioAtraso: 0
    };
  }
  
  const concluidas = etapas.filter(e => e.status === 'concluido').length;
  const emAndamento = etapas.filter(e => e.status === 'em_andamento').length;
  const pendentes = etapas.filter(e => e.status === 'pendente').length;
  const atrasadas = etapas.filter(e => e.status === 'atrasado').length;
  const concluidasComAtraso = etapas.filter(e => e.status === 'concluido_atraso').length;
  
  // Calcular tempo médio de atraso
  let totalDiasAtraso = 0;
  let countAtrasos = 0;
  
  etapas.forEach(etapa => {
    if (etapa.status === 'concluido_atraso' && etapa.dataPrevista && etapa.dataReal) {
      const prevista = new Date(etapa.dataPrevista);
      const real = new Date(etapa.dataReal);
      const diasAtraso = Math.ceil((real - prevista) / (1000 * 60 * 60 * 24));
      if (diasAtraso > 0) {
        totalDiasAtraso += diasAtraso;
        countAtrasos++;
      }
    }
  });
  
  return {
    total,
    concluidas,
    emAndamento,
    pendentes,
    atrasadas,
    concluidasComAtraso,
    percentualConcluido: Math.round(((concluidas + concluidasComAtraso) / total) * 100),
    percentualAtrasado: Math.round((atrasadas / total) * 100),
    tempoMedioAtraso: countAtrasos > 0 ? Math.round(totalDiasAtraso / countAtrasos) : 0
  };
};
