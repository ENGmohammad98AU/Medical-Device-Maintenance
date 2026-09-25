import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Grid,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  InputAdornment,
  IconButton,
} from '@mui/material';
import {
  Person as PersonIcon,
  Lock as LockIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  MedicalServices as MedicalServicesIcon,
  Engineering as EngineeringIcon,
  Science as ScienceIcon,
  LocalHospital as LocalHospitalIcon,
  AdminPanelSettings as AdminPanelSettingsIcon,
} from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';
import { authService } from '../services/auth';
import { LoginRequest, RegisterRequest, UserRole } from '../types/auth';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

const roleIcons: Record<string, React.ReactNode> = {
  [UserRole.ADMINISTRATOR]: <AdminPanelSettingsIcon fontSize="large" />,
  [UserRole.BIOMEDICAL_ENGINEER]: <EngineeringIcon fontSize="large" />,
  [UserRole.MEDICAL_TECHNICIAN]: <ScienceIcon fontSize="large" />,
  [UserRole.DOCTOR]: <LocalHospitalIcon fontSize="large" />,
  [UserRole.NURSE]: <MedicalServicesIcon fontSize="large" />,
};

const roleLabels: Record<string, { ar: string; en: string }> = {
  [UserRole.ADMINISTRATOR]: { ar: 'مدير النظام', en: 'Administrator' },
  [UserRole.BIOMEDICAL_ENGINEER]: { ar: 'مهندس طبي حيوي', en: 'Biomedical Engineer' },
  [UserRole.MEDICAL_TECHNICIAN]: { ar: 'فني طبي', en: 'Medical Technician' },
  [UserRole.DOCTOR]: { ar: 'طبيب', en: 'Doctor' },
  [UserRole.NURSE]: { ar: 'ممرض', en: 'Nurse' },
};

const demoCredentials = [
  { username: 'admin', password: 'admin123', role: 'Administrator' },
  { username: 'engineer', password: 'engineer123', role: 'Biomedical Engineer' },
  { username: 'technician', password: 'technician123', role: 'Medical Technician' },
  { username: 'doctor', password: 'doctor123', role: 'Doctor' },
  { username: 'nurse', password: 'nurse123', role: 'Nurse' },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, authError, isInitializing } = useAuth();
  const [tabValue, setTabValue] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.BIOMEDICAL_ENGINEER);

  const [loginData, setLoginData] = useState<LoginRequest>({
    username: '',
    password: '',
  });

  const [registerData, setRegisterData] = useState<RegisterRequest>({
    email: '',
    username: '',
    password: '',
    full_name: '',
    phone: '',
    department: '',
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await login(loginData);
      navigate('/dashboard');
    } catch (err: any) {
      if (import.meta.env.DEV) console.error('Login failed:', err.response?.status || err.message);
      setError(err.response?.data?.detail || err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await authService.register(registerData);
      await login({
        username: registerData.username,
        password: registerData.password,
      });
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container component="main" maxWidth="lg" sx={{ minHeight: '100vh', backgroundColor: '#ffffff', py: 4 }}>
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper
          elevation={3}
          sx={{
            p: 4,
            width: '100%',
            borderRadius: 3,
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 45%, #bfdbfe 100%)',
            boxShadow: '0 20px 45px rgba(37, 99, 235, 0.15)',
            border: '1px solid rgba(59,130,246,0.2)',
          }}
        >
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <MedicalServicesIcon sx={{ fontSize: 64, color: '#1d4ed8', mb: 2 }} />
            <Typography component="h1" variant="h4" sx={{ color: '#0f172a', fontWeight: 'bold' }}>
              BioMed AI Assistant
            </Typography>
            <Typography variant="subtitle1" sx={{ color: '#334155', mt: 1 }}>
              نظام صيانة الأجهزة الطبية الذكي
            </Typography>
            <Button onClick={() => navigate('/local-model')} sx={{mt: 2}}>تجربة النموذج المجاني دون تسجيل دخول</Button>
          </Box>

          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
            <Tabs
              value={tabValue}
              onChange={(_, newValue) => setTabValue(newValue)}
              centered
              sx={{
                '& .MuiTab-root': { color: '#334155' },
                '& .Mui-selected': { color: '#1d4ed8' },
                '& .MuiTabs-indicator': { backgroundColor: '#1d4ed8' },
              }}
            >
              <Tab label="تسجيل الدخول / Login" />
              <Tab label="التسجيل / Register" />
            </Tabs>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {!error && authError && <Alert severity="warning" sx={{mb: 2}}>{authError}</Alert>}
          {isInitializing && <Alert severity="info" sx={{mb: 2}}>جارٍ التحقق من جلسة الدخول…</Alert>}

          <TabPanel value={tabValue} index={0}>
            <Box component="form" onSubmit={handleLogin} sx={{ mt: 1 }}>
              <TextField
                margin="normal"
                required
                fullWidth
                id="username"
                label="اسم المستخدم / Username"
                name="username"
                autoComplete="username"
                autoFocus
                value={loginData.username}
                onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonIcon />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: 'rgba(11, 22, 40, 0.7)',
                    borderRadius: 2,
                    '& fieldset': { borderColor: 'rgba(147, 197, 253, 0.8)' },
                    '&:hover fieldset': { borderColor: '#bfdbfe' },
                    '&.Mui-focused fieldset': { borderColor: '#93c5fd' },
                  },
                  '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.8)' },
                  '& .MuiInputBase-input': { color: 'white' },
                }}
              />
              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label="كلمة المرور / Password"
                type={showPassword ? 'text' : 'password'}
                id="password"
                autoComplete="current-password"
                value={loginData.password}
                onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        sx={{ color: 'rgba(255,255,255,0.7)' }}
                      >
                        {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: 'rgba(11, 22, 40, 0.7)',
                    borderRadius: 2,
                    '& fieldset': { borderColor: 'rgba(147, 197, 253, 0.8)' },
                    '&:hover fieldset': { borderColor: '#bfdbfe' },
                    '&.Mui-focused fieldset': { borderColor: '#93c5fd' },
                  },
                  '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.8)' },
                  '& .MuiInputBase-input': { color: 'white' },
                }}
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{
                  mt: 3,
                  mb: 2,
                  py: 1.5,
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: 'white',
                  boxShadow: '0 12px 24px rgba(37, 99, 235, 0.35)',
                  '&:hover': { background: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)' },
                }}
                disabled={loading || isInitializing}
              >
                {loading ? <CircularProgress size={24} /> : 'تسجيل الدخول / Login'}
              </Button>

              <Box sx={{ mt: 2, mb: 2, p: 2, borderRadius: 2, backgroundColor: 'rgba(15, 23, 42, 0.68)', border: '1px solid rgba(147,197,253,0.65)' }}>
                <Typography variant="subtitle2" sx={{ color: 'white', textAlign: 'center', mb: 1, fontWeight: 700 }}>
                  اسماء المستخدمين وكلمات المرور / Demo Credentials
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, color: 'white' }}>
                  {demoCredentials.map((account) => (
                    <Box key={account.username} sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.78rem', flexWrap: 'wrap' }}>
                      <span><b>{account.username}</b></span>
                      <span>:</span>
                      <span>{account.password}</span>
                      <span>—</span>
                      <span>{account.role}</span>
                    </Box>
                  ))}
                </Box>
              </Box>

              <Box sx={{ mt: 4, mb: 2 }}>
                <Typography variant="subtitle2" sx={{ color: '#0f172a', textAlign: 'center', mb: 2 }}>
                  أنواع المستخدمين / User Types
                </Typography>
                <Grid container spacing={2}>
                  {Object.entries(roleIcons).map(([role, icon]) => (
                    <Grid item xs={2.4} key={role}>
                      <Paper
                        elevation={2}
                        sx={{
                          p: 2,
                          textAlign: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.3s',
                          background: selectedRole === role ? 'rgba(59,130,246,0.35)' : 'rgba(15,23,42,0.28)',
                          border: '1px solid rgba(147,197,253,0.35)',
                          '&:hover': { background: 'rgba(96,165,250,0.22)' },
                        }}
                        onClick={() => setSelectedRole(role as UserRole)}
                      >
                        <Box sx={{ color: 'white', mb: 1 }}>{icon}</Box>
                        <Typography variant="caption" sx={{ color: 'white', display: 'block', fontSize: '0.7rem' }}>
                          {roleLabels[role]?.ar}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', display: 'block', fontSize: '0.6rem' }}>
                          {roleLabels[role]?.en}
                        </Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            </Box>
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <Box component="form" onSubmit={handleRegister} sx={{ mt: 1 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    margin="normal"
                    required
                    fullWidth
                    label="الاسم الكامل / Full Name"
                    value={registerData.full_name}
                    onChange={(e) => setRegisterData({ ...registerData, full_name: e.target.value })}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        backgroundColor: 'rgba(11, 22, 40, 0.7)',
                        borderRadius: 2,
                        '& fieldset': { borderColor: 'rgba(147, 197, 253, 0.8)' },
                        '&:hover fieldset': { borderColor: '#bfdbfe' },
                        '&.Mui-focused fieldset': { borderColor: '#93c5fd' },
                      },
                      '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.8)' },
                      '& .MuiInputBase-input': { color: 'white' },
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    margin="normal"
                    required
                    fullWidth
                    label="البريد الإلكتروني / Email"
                    type="email"
                    value={registerData.email}
                    onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        backgroundColor: 'rgba(11, 22, 40, 0.7)',
                        borderRadius: 2,
                        '& fieldset': { borderColor: 'rgba(147, 197, 253, 0.8)' },
                        '&:hover fieldset': { borderColor: '#bfdbfe' },
                        '&.Mui-focused fieldset': { borderColor: '#93c5fd' },
                      },
                      '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.8)' },
                      '& .MuiInputBase-input': { color: 'white' },
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    margin="normal"
                    required
                    fullWidth
                    label="اسم المستخدم / Username"
                    value={registerData.username}
                    onChange={(e) => setRegisterData({ ...registerData, username: e.target.value })}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        backgroundColor: 'rgba(11, 22, 40, 0.7)',
                        borderRadius: 2,
                        '& fieldset': { borderColor: 'rgba(147, 197, 253, 0.8)' },
                        '&:hover fieldset': { borderColor: '#bfdbfe' },
                        '&.Mui-focused fieldset': { borderColor: '#93c5fd' },
                      },
                      '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.8)' },
                      '& .MuiInputBase-input': { color: 'white' },
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    margin="normal"
                    required
                    fullWidth
                    label="كلمة المرور / Password"
                    type="password"
                    value={registerData.password}
                    onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        backgroundColor: 'rgba(11, 22, 40, 0.7)',
                        borderRadius: 2,
                        '& fieldset': { borderColor: 'rgba(147, 197, 253, 0.8)' },
                        '&:hover fieldset': { borderColor: '#bfdbfe' },
                        '&.Mui-focused fieldset': { borderColor: '#93c5fd' },
                      },
                      '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.8)' },
                      '& .MuiInputBase-input': { color: 'white' },
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    margin="normal"
                    fullWidth
                    label="رقم الهاتف / Phone"
                    value={registerData.phone}
                    onChange={(e) => setRegisterData({ ...registerData, phone: e.target.value })}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        backgroundColor: 'rgba(11, 22, 40, 0.7)',
                        borderRadius: 2,
                        '& fieldset': { borderColor: 'rgba(147, 197, 253, 0.8)' },
                        '&:hover fieldset': { borderColor: '#bfdbfe' },
                        '&.Mui-focused fieldset': { borderColor: '#93c5fd' },
                      },
                      '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.8)' },
                      '& .MuiInputBase-input': { color: 'white' },
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    margin="normal"
                    fullWidth
                    label="القسم / Department"
                    value={registerData.department}
                    onChange={(e) => setRegisterData({ ...registerData, department: e.target.value })}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        backgroundColor: 'rgba(11, 22, 40, 0.7)',
                        borderRadius: 2,
                        '& fieldset': { borderColor: 'rgba(147, 197, 253, 0.8)' },
                        '&:hover fieldset': { borderColor: '#bfdbfe' },
                        '&.Mui-focused fieldset': { borderColor: '#93c5fd' },
                      },
                      '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.8)' },
                      '& .MuiInputBase-input': { color: 'white' },
                    }}
                  />
                </Grid>
              </Grid>
              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{
                  mt: 3,
                  mb: 2,
                  py: 1.5,
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: 'white',
                  boxShadow: '0 12px 24px rgba(37, 99, 235, 0.35)',
                  '&:hover': { background: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)' },
                }}
                disabled={loading || isInitializing}
              >
                {loading ? <CircularProgress size={24} /> : 'التسجيل / Register'}
              </Button>
            </Box>
          </TabPanel>
        </Paper>

      </Box>
    </Container>
  );
}
