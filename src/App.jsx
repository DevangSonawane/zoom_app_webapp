import { useMemo } from 'react';
import AdminPage from './components/AdminPage';
import AuthCallback from './components/AuthCallback';

function App() {
  const path = useMemo(() => window.location.pathname, []);

  if (path === '/auth-callback') {
    return <AuthCallback />;
  }

  return <AdminPage />;
}

export default App;
