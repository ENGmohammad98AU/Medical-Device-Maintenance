import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Grid,
  Paper,
  Button,
  Card,
  CardContent,
  CardActions,
} from '@mui/material';
import {
  MedicalServices as MedicalServicesIcon,
  Warning as WarningIcon,
  Build as BuildIcon,
  Analytics as AnalyticsIcon,
  Logout as LogoutIcon,
} from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';

const rolePermissions: Record<string, { path: string; title: string; subtitle: string; icon: React.ReactNode; color: string }[]> = {
  administrator: [
    { path: '/devices', title: 'الأجهزة الطبية', subtitle: 'Medical Devices', icon: <MedicalServicesIcon sx={{ fontSize: 40 }} />, color: '#1976d2' },
    { path: '/fault-reports', title: 'تقارير الأعطال', subtitle: 'Fault Reports', icon: <WarningIcon sx={{ fontSize: 40 }} />, color: '#dc004e' },
    { path: '/maintenance', title: 'الصيانة', subtitle: 'Maintenance', icon: <BuildIcon sx={{ fontSize: 40 }} />, color: '#2e7d32' },
    { path: '/statistics', title: 'الإحصائيات', subtitle: 'Statistics', icon: <AnalyticsIcon sx={{ fontSize: 40 }} />, color: '#ed6c02' },
  ],
  biomedical_engineer: [
    { path: '/devices', title: 'الأجهزة الطبية', subtitle: 'Medical Devices', icon: <MedicalServicesIcon sx={{ fontSize: 40 }} />, color: '#1976d2' },
    { path: '/fault-reports', title: 'تقارير الأعطال', subtitle: 'Fault Reports', icon: <WarningIcon sx={{ fontSize: 40 }} />, color: '#dc004e' },
    { path: '/maintenance', title: 'الصيانة', subtitle: 'Maintenance', icon: <BuildIcon sx={{ fontSize: 40 }} />, color: '#2e7d32' },
    { path: '/statistics', title: 'الإحصائيات', subtitle: 'Statistics', icon: <AnalyticsIcon sx={{ fontSize: 40 }} />, color: '#ed6c02' },
  ],
  medical_technician: [
    { path: '/devices', title: 'الأجهزة الطبية', subtitle: 'Medical Devices', icon: <MedicalServicesIcon sx={{ fontSize: 40 }} />, color: '#1976d2' },
    { path: '/fault-reports', title: 'تقارير الأعطال', subtitle: 'Fault Reports', icon: <WarningIcon sx={{ fontSize: 40 }} />, color: '#dc004e' },
    { path: '/maintenance', title: 'الصيانة', subtitle: 'Maintenance', icon: <BuildIcon sx={{ fontSize: 40 }} />, color: '#2e7d32' },
  ],
  doctor: [
    { path: '/fault-reports', title: 'تقارير الأعطال', subtitle: 'Fault Reports', icon: <WarningIcon sx={{ fontSize: 40 }} />, color: '#dc004e' },
    { path: '/devices', title: 'الأجهزة الطبية', subtitle: 'Medical Devices', icon: <MedicalServicesIcon sx={{ fontSize: 40 }} />, color: '#1976d2' },
  ],
  nurse: [
    { path: '/devices', title: 'الأجهزة الطبية', subtitle: 'Medical Devices', icon: <MedicalServicesIcon sx={{ fontSize: 40 }} />, color: '#1976d2' },
    { path: '/fault-reports', title: 'تقارير الأعطال', subtitle: 'Fault Reports', icon: <WarningIcon sx={{ fontSize: 40 }} />, color: '#dc004e' },
  ],
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const roleLabel = user?.role?.replace('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'User';
  const dashboardCards = user?.role ? rolePermissions[user.role] || [] : [];

  return (
    <Container maxWidth="lg" sx={{ minHeight: '100vh', backgroundColor: '#ffffff', py: 4 }}>
      <Box sx={{ mt: 2, mb: 4, color: '#0f172a' }}>
        <Grid container justifyContent="space-between" alignItems="center" spacing={2}>
          <Grid item>
            <Typography variant="h4" component="h1" gutterBottom sx={{ color: '#0f172a' }}>
              لوحة التحكم
            </Typography>
            <Typography variant="subtitle1" sx={{ color: '#334155' }}>
              Dashboard - {roleLabel}
            </Typography>
          </Grid>
          <Grid item>
            <Button
              variant="contained"
              startIcon={<LogoutIcon />}
              onClick={handleLogout}
              sx={{ py: 1.5, background: 'linear-gradient(135deg, #e53935 0%, #c62828 100%)', color: 'white' }}
            >
              تسجيل الخروج / Logout
            </Button>
          </Grid>
        </Grid>

        <Paper sx={{ p: 3, mt: 3, mb: 3, background: '#f8fafc', color: '#0f172a', border: '1px solid #e2e8f0' }}>
          <Typography variant="h6" gutterBottom sx={{ color: '#0f172a' }}>
            معلومات المستخدم / User Information
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" sx={{ color: '#0f172a' }}>
                الاسم / Name: {user?.full_name}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" sx={{ color: '#0f172a' }}>
                البريد الإلكتروني / Email: {user?.email}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" sx={{ color: '#0f172a' }}>
                الدور / Role: {roleLabel}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" sx={{ color: '#0f172a' }}>
                القسم / Department: {user?.department || 'N/A'}
              </Typography>
            </Grid>
          </Grid>
        </Paper>

        <Grid container spacing={3} sx={{ mt: 2 }}>
          {dashboardCards.map((card, index) => (
            <Grid item xs={12} sm={6} md={3} key={`${card.path}-${index}`}>
              <Card
                sx={{
                  height: '100%',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  background: '#ffffff',
                  color: '#0f172a',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.06)',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                  },
                }}
                onClick={() => navigate(card.path)}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                    <Box sx={{ color: card.color }}>{card.icon}</Box>
                  </Box>
                  <Typography variant="h6" component="div" align="center" gutterBottom sx={{ color: '#0f172a' }}>
                    {card.title}
                  </Typography>
                  <Typography variant="body2" align="center" sx={{ color: '#475569' }}>
                    {card.subtitle}
                  </Typography>
                </CardContent>
                <CardActions sx={{ justifyContent: 'center' }}>
                  <Button size="small" sx={{ color: card.color }}>
                    عرض / View
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    </Container>
  );
}
