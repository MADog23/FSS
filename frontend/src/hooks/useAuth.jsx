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
        setHousehold({ id: data.household_id, name: data.household_name, onboardingComplete: data.onboarding_complete });
      })
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const data = await api.login({ email, password });
    localStorage.setItem('token', data.token);
    setUser(data.user);
    setHousehold({ ...data.household, onboardingComplete: data.onboarding_complete });
  };

  const register = async (householdName, email, password) => {
    const data = await api.register({ householdName, email, password });
    localStorage.setItem('token', data.token);
    setUser(data.user);
    // New registrations always start onboarding
    setHousehold({ ...data.household, onboardingComplete: false });
  };

  const completeOnboarding = async () => {
    await api.completeOnboarding();
    setHousehold(h => ({ ...h, onboardingComplete: true }));
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setHousehold(null);
  };

  return (
    <AuthContext.Provider value={{ user, household, loading, login, register, logout, completeOnboarding }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
