import React, { useState, useEffect } from 'react';
import GerenciarUsuarios from './GerenciarUsuarios.jsx';
import { usePermissao } from '../hooks/usePermissao';
import { Navigate } from 'react-router-dom';

const Usuarios = () => {
  const { loading, autorizado, user } = usePermissao('usuarios');

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500">Carregando permissões...</p>
      </div>
    );
  }

  if (!autorizado) {
    if (!user) {
      return <Navigate to="/login" replace />;
    }
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-slate-500">Acesso não autorizado.</p>
      </div>
    );
  }

  return (
    <GerenciarUsuarios />
  );
};

export default Usuarios;
