import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import AccountsPage from './pages/AccountsPage';
import IncomePage from './pages/IncomePage';
import BillsPage from './pages/BillsPage';
import CardsPage from './pages/CardsPage';
import ScenarioPage from './pages/ScenarioPage';
import HouseholdPage from './pages/HouseholdPage';
import HelpPage from './pages/HelpPage';
import OnboardingPage from './pages/OnboardingPage';
import NotificationsPage from './pages/NotificationsPage';
import Layout from './components/Layout';

function PrivateRoute({ children }) {
  const { user, household, loading } = useAuth();
  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  // Redirect new households to onboarding before they see the dashboard
  if (household && household.onboardingComplete === false) {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/" replace /> : children;
}

function OnboardingRoute({ children }) {
  const { user, household, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  // If already onboarded, send to dashboard
  if (household?.onboardingComplete === true) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route path="/onboarding" element={<OnboardingRoute><OnboardingPage /></OnboardingRoute>} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<DashboardPage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="income" element={<IncomePage />} />
            <Route path="bills" element={<BillsPage />} />
            <Route path="cards" element={<CardsPage />} />
            <Route path="scenario" element={<ScenarioPage />} />
            <Route path="household" element={<HouseholdPage />} />
            <Route path="help" element={<HelpPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
