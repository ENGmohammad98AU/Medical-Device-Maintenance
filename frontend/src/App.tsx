import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import DevicesPage from './pages/DevicesPage'
import FaultReportsPage from './pages/FaultReportsPage'
import MaintenancePage from './pages/MaintenancePage'
import StatisticsPage from './pages/StatisticsPage'
import './i18n'

const theme = createTheme({
  direction: 'rtl',
  palette: {
    primary: {
      main: '#d32f2f', // Medical red
      light: '#fefafa',
      dark: '#9a0007',
    },
    secondary: {
      main: '#c62828', // Darker red
      light: '#ff8a80',
      dark: '#8e0000',
    },
    background: {
      default: '#ffffff', // White main background
      paper: '#ffffff',
    },
    error: {
      main: '#d32f2f',
    },
    warning: {
      main: '#ff6f00',
    },
    info: {
      main: '#1976d2',
    },
    success: {
      main: '#388e3c',
    },
  },
})

const pagePermissions: Record<string, string[]> = {
  '/devices': ['administrator', 'biomedical_engineer', 'medical_technician', 'doctor', 'nurse'],
  '/fault-reports': ['administrator', 'biomedical_engineer', 'medical_technician', 'doctor', 'nurse'],
  '/maintenance': ['administrator', 'biomedical_engineer', 'medical_technician'],
  '/statistics': ['administrator', 'biomedical_engineer'],
}

function ProtectedRoute({ children, path }: { children: JSX.Element; path: string }) {
  const { isAuthenticated, user } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (user && pagePermissions[path] && !pagePermissions[path].includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<ProtectedRoute path="/dashboard"><DashboardPage /></ProtectedRoute>} />
            <Route path="/devices" element={<ProtectedRoute path="/devices"><DevicesPage /></ProtectedRoute>} />
            <Route path="/fault-reports" element={<ProtectedRoute path="/fault-reports"><FaultReportsPage /></ProtectedRoute>} />
            <Route path="/maintenance" element={<ProtectedRoute path="/maintenance"><MaintenancePage /></ProtectedRoute>} />
            <Route path="/statistics" element={<ProtectedRoute path="/statistics"><StatisticsPage /></ProtectedRoute>} />
            <Route path="/" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
