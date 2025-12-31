// No ficheiro src/hooks/useAuth.ts

import { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { supabase } from '../services/supabase';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserAndProfile = async () => {
      const saved = localStorage.getItem('zap_user');
      if (!saved) {
        setLoading(false);
        return;
      }

      const basicUser = JSON.parse(saved);

      // Procura o perfil completo (Role e Empresa) no banco de dados
      const { data: profile, error } = await supabase
        .from('users_profile')
        .select('role, company_id')
        .eq('id', basicUser.id)
        .single();

      if (!error && profile) {
        const fullUser: User = { 
          ...basicUser, 
          role: profile.role as UserRole,
          company_id: profile.company_id 
        };
        setUser(fullUser);
        localStorage.setItem('zap_user', JSON.stringify(fullUser));
      } else {
        setUser(basicUser); // Fallback caso não encontre perfil
      }
      
      setLoading(false);
    };

    fetchUserAndProfile();
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    localStorage.setItem('zap_user', JSON.stringify(userData));
  };

  const logout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('zap_user');
    setUser(null);
  };

  return { user, loading, login, logout };
};