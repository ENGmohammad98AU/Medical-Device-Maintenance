import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Grid,
  IconButton,
  Typography,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Analytics as AnalyticsIcon } from '@mui/icons-material';
import api from '../services/auth';

interface DashboardStats {
  critical_reports_today: number;
  open_reports: number;
  resolved_reports: number;
  out_of_service_devices: number;
  total_devices: number;
  ai_confidence: number;
  average_response_time_minutes: number;
}

interface DepartmentStat {
  department: string;
  count: number;
}

interface FaultyDevice {
  id: number;
  name: string;
  model: string;
  department: string;
  fault_count: number;
}

const statCards: { key: keyof DashboardStats; title: string; color: string; suffix?: string }[] = [
  { key: 'critical_reports_today', title: 'بلاغات حرجة اليوم / Critical Today', color: '#d32f2f' },
  { key: 'open_reports', title: 'بلاغات مفتوحة / Open Reports', color: '#ed6c02' },
  { key: 'resolved_reports', title: 'بلاغات محلولة / Resolved Reports', color: '#2e7d32' },
  { key: 'total_devices', title: 'إجمالي الأجهزة / Total Devices', color: '#1976d2' },
  { key: 'out_of_service_devices', title: 'أجهزة خارج الخدمة / Out of Service', color: '#7b1fa2' },
  { key: 'ai_confidence', title: 'ثقة الذكاء الاصطناعي / AI Confidence', color: '#00838f', suffix: '%' },
  { key: 'average_response_time_minutes', title: 'متوسط الاستجابة / Avg Response', color: '#455a64', suffix: ' min' },
];

export default function StatisticsPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [departments, setDepartments] = useState<DepartmentStat[]>([]);
  const [faultyDevices, setFaultyDevices] = useState<FaultyDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadStatistics = async () => {
      try {
        const [statsResponse, departmentsResponse, devicesResponse] = await Promise.all([
          api.get<DashboardStats>('/api/dashboard/stats'),
          api.get<DepartmentStat[]>('/api/dashboard/faults-by-department'),
          api.get<FaultyDevice[]>('/api/dashboard/most-faulty-devices?limit=5'),
        ]);
        setStats(statsResponse.data);
        setDepartments(departmentsResponse.data);
        setFaultyDevices(devicesResponse.data);
      } catch (requestError: any) {
        setError(requestError.response?.data?.detail || 'تعذر تحميل الإحصائيات / Failed to load statistics');
      } finally {
        setLoading(false);
      }
    };

    loadStatistics();
  }, []);

  return (
    <Container maxWidth="lg">
      <Box sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <IconButton onClick={() => navigate('/dashboard')} aria-label="Back to dashboard">
            <ArrowBackIcon />
          </IconButton>
          <AnalyticsIcon sx={{ color: '#ed6c02', fontSize: 36 }} />
          <Box>
            <Typography variant="h4" component="h1">الإحصائيات</Typography>
            <Typography variant="subtitle1" color="text.secondary">Statistics</Typography>
          </Box>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
        {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>}

        {!loading && stats && (
          <>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              {statCards.map((card) => (
                <Grid item xs={12} sm={6} md={4} key={card.key}>
                  <Card sx={{ height: '100%', borderTop: `4px solid ${card.color}` }}>
                    <CardContent>
                      <Typography variant="body2" color="text.secondary">{card.title}</Typography>
                      <Typography variant="h4" sx={{ color: card.color, mt: 1 }}>
                        {stats[card.key]}{card.suffix || ''}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>

            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>البلاغات حسب القسم / Faults by Department</Typography>
                    {departments.length === 0 && <Typography color="text.secondary">لا توجد بيانات حالياً / No data yet</Typography>}
                    {departments.map((item) => (
                      <Box key={item.department} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid #eee' }}>
                        <Typography>{item.department || 'غير محدد'}</Typography>
                        <Typography fontWeight="bold">{item.count}</Typography>
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>الأجهزة الأكثر أعطالاً / Most Faulty Devices</Typography>
                    {faultyDevices.length === 0 && <Typography color="text.secondary">لا توجد بيانات حالياً / No data yet</Typography>}
                    {faultyDevices.map((device) => (
                      <Box key={device.id} sx={{ py: 1, borderBottom: '1px solid #eee' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography>{device.name}</Typography>
                          <Typography fontWeight="bold">{device.fault_count}</Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">{device.model} - {device.department}</Typography>
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </>
        )}
      </Box>
    </Container>
  );
}
