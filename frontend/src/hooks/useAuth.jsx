import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [household, setHousehold] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    api.me()
      .then(data => {
        setUser({ id: data.id, email: data.email, role: data.role });
        setHousehold({ id: data.household_id, name: data.household_name });
      })
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const data = await api.login({ email, password });
    localStorage.setItem('token', data.token);
    setUser(data.user);
    setHousehold(data.household);
  };

  const register = async (householdName, email, password) => {
    const data = await api.register({ householdName, email, password });
    localStorage.setItem('token', data.token);
    setUser(data.user);
    setHousehold(data.household);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setHousehold(null);
  };

  return (
    <AuthContext.Provider value={{ user, household, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
