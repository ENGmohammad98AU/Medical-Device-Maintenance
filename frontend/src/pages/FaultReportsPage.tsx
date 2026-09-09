import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Grid,
  Button,
  Card,
  CardContent,
  CardActions,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Alert,
  CircularProgress,
  Select,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  ArrowBack as ArrowBackIcon,
  Psychology as PsychologyIcon,
} from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';
import api from '../services/auth';

interface FaultReport {
  id: number;
  device_id: number;
  device_name?: string;
  error_message: string;
  description: string;
  severity: string;
  status: string;
  ai_analysis: string | null;
  ai_confidence: number | null;
  engineer_notes: string | null;
  resolved_at: string | null;
  created_at: string;
}

const severityLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const statusLevels = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

const severityColors: Record<string, string> = {
  LOW: '#4caf50',
  MEDIUM: '#ff9800',
  HIGH: '#f44336',
  CRITICAL: '#d32f2f',
};

const statusColors: Record<string, string> = {
  OPEN: '#f44336',
  IN_PROGRESS: '#ff9800',
  RESOLVED: '#4caf50',
  CLOSED: '#9e9e9e',
};

export default function FaultReportsPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [reports, setReports] = useState<FaultReport[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<FaultReport | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [formData, setFormData] = useState({
    device_id: '',
    error_message: '',
  });

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    fetchReports();
    fetchDevices();
  }, [isAuthenticated, navigate, page]);

  const fetchReports = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/api/fault-reports/?skip=${(page - 1) * 10}&limit=10`);
      setReports(response.data);
      setLoading(false);
    } catch (err: any) {
      setError('Failed to fetch fault reports');
      setLoading(false);
    }
  };

  const fetchDevices = async () => {
    try {
      const response = await api.get('/api/devices/?limit=100');
      setDevices(response.data);
    } catch (err: any) {
      console.error('Failed to fetch devices');
    }
  };

  const handleOpenDialog = (report?: FaultReport) => {
    if (report) {
      setEditingReport(report);
      setFormData({
        device_id: report.device_id.toString(),
        error_message: report.error_message,
      });
    } else {
      setEditingReport(null);
      setFormData({
        device_id: '',
        error_message: '',
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingReport(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.device_id || !formData.error_message.trim()) {
      setError('Please select a device and enter an error message');
      return;
    }

    try {
      const submitData = {
        ...formData,
        device_id: parseInt(formData.device_id),
      };

      if (editingReport) {
        await api.put(`/api/fault-reports/${editingReport.id}`, submitData);
      } else {
        await api.post('/api/fault-reports/', submitData);
      }
      handleCloseDialog();
      fetchReports();
    } catch (err: any) {
      setError('Failed to save fault report');
    }
  };

  const handleAnalyze = async () => {
    if (!formData.device_id || !formData.error_message) {
      setError('Please select a device and enter an error message');
      return;
    }
    
    try {
      const response = await api.post('/api/fault-reports/analyze', {
        device_id: parseInt(formData.device_id),
        alarm_code: '',
        error_message: formData.error_message,
      });
      setAiAnalysis(response.data);
      setAiDialogOpen(true);
    } catch (err: any) {
      setError('Failed to analyze fault');
    }
  };

  const handleResolve = async (id: number) => {
    try {
      await api.post(`/api/fault-reports/${id}/resolve`);
      fetchReports();
    } catch (err: any) {
      setError('Failed to resolve fault report');
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this fault report?')) {
      try {
        await api.delete(`/api/fault-reports/${id}`);
        fetchReports();
      } catch (err: any) {
        setError('Failed to delete fault report');
      }
    }
  };

  const filteredReports = reports.filter((report) => {
    if (filterSeverity && report.severity !== filterSeverity) return false;
    if (filterStatus && report.status !== filterStatus) return false;
    return true;
  });

  return (
    <Container maxWidth="xl">
      <Box sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconButton onClick={() => navigate('/dashboard')}>
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h4" component="h1">
              تقارير الأعطال
            </Typography>
            <Typography variant="subtitle1" color="text.secondary">
              Fault Reports
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
            sx={{ background: 'linear-gradient(135deg, #e53935 0%, #c62828 100%)' }}
          >
            إضافة تقرير / Add Report
          </Button>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          <FormControl sx={{ minWidth: 150 }}>
            <InputLabel>Severity</InputLabel>
            <Select
              value={filterSeverity}
              label="Severity"
              onChange={(e) => setFilterSeverity(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {severityLevels.map((level) => (
                <MenuItem key={level} value={level}>
                  {level}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl sx={{ minWidth: 150 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={filterStatus}
              label="Status"
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {statusLevels.map((level) => (
                <MenuItem key={level} value={level}>
                  {level.replace('_', ' ')}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Grid container spacing={3}>
            {filteredReports.map((report) => (
              <Grid item xs={12} sm={6} md={4} key={report.id}>
                <Card
                  sx={{
                    height: '100%',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: 4,
                    },
                  }}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                      <WarningIcon sx={{ fontSize: 40, color: severityColors[report.severity] }} />
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Chip
                          label={report.severity}
                          sx={{
                            backgroundColor: severityColors[report.severity],
                            color: 'white',
                            fontSize: '0.75rem',
                          }}
                        />
                        <Chip
                          label={report.status.replace('_', ' ')}
                          sx={{
                            backgroundColor: statusColors[report.status],
                            color: 'white',
                            fontSize: '0.75rem',
                          }}
                        />
                      </Box>
                    </Box>
                    <Typography variant="h6" component="div" gutterBottom noWrap>
                      {report.device_name || `Device #${report.device_id}`}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom noWrap>
                      {report.error_message}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {new Date(report.created_at).toLocaleString()}
                    </Typography>
                    {report.ai_confidence && (
                      <Box sx={{ mt: 1 }}>
                        <Chip
                          icon={<PsychologyIcon />}
                          label={`AI: ${report.ai_confidence}%`}
                          size="small"
                          sx={{ backgroundColor: '#e53935', color: 'white' }}
                        />
                      </Box>
                    )}
                  </CardContent>
                  <CardActions>
                    <Button size="small" onClick={() => handleOpenDialog(report)} startIcon={<EditIcon />}>
                      تعديل / Edit
                    </Button>
                    {report.status === 'OPEN' && (
                      <Button size="small" color="success" onClick={() => handleResolve(report.id)} startIcon={<CheckCircleIcon />}>
                        حل / Resolve
                      </Button>
                    )}
                    <Button size="small" color="error" onClick={() => handleDelete(report.id)} startIcon={<DeleteIcon />}>
                      حذف / Delete
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}

        <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
          <DialogTitle>
            {editingReport ? 'تعديل تقرير / Edit Report' : 'إضافة تقرير جديد / Add New Report'}
          </DialogTitle>
          <DialogContent>
            <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    select
                    label="الجهاز / Device"
                    value={formData.device_id}
                    onChange={(e) => setFormData({ ...formData, device_id: e.target.value })}
                    required
                    margin="normal"
                  >
                    {devices.map((device) => (
                      <MenuItem key={device.id} value={device.id.toString()}>
                        {device.name} - {device.serial_number}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    label="رسالة الخطأ / Error Message"
                    value={formData.error_message}
                    onChange={(e) => setFormData({ ...formData, error_message: e.target.value })}
                    required
                    margin="normal"
                  />
                </Grid>
              </Grid>
              <Button
                type="button"
                variant="outlined"
                startIcon={<PsychologyIcon />}
                onClick={handleAnalyze}
                sx={{ mt: 2 }}
                fullWidth
              >
                تحليل بالذكاء الاصطناعي / AI Analysis
              </Button>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog}>إلغاء / Cancel</Button>
            <Button onClick={handleSubmit} variant="contained">
              {editingReport ? 'حفظ التعديلات / Save Changes' : 'إضافة / Add'}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={aiDialogOpen} onClose={() => setAiDialogOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <PsychologyIcon sx={{ color: '#e53935' }} />
              تحليل الذكاء الاصطناعي / AI Analysis
            </Box>
          </DialogTitle>
          <DialogContent>
            {aiAnalysis && (
              <Box sx={{ mt: 2 }}>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" gutterBottom>
                      الجهاز / Device:
                    </Typography>
                    <Typography variant="body1">{aiAnalysis.device}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" gutterBottom>
                      الشركة / Manufacturer:
                    </Typography>
                    <Typography variant="body1">{aiAnalysis.manufacturer}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" gutterBottom>
                      الخطورة / Severity:
                    </Typography>
                    <Chip
                      label={aiAnalysis.severity}
                      sx={{
                        backgroundColor: severityColors[aiAnalysis.severity],
                        color: 'white',
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" gutterBottom>
                      الثقة / Confidence:
                    </Typography>
                    <Typography variant="body1">{aiAnalysis.confidence}%</Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" gutterBottom>
                      السبب المحتمل / Possible Cause:
                    </Typography>
                    <Typography variant="body1">{aiAnalysis.possible_cause}</Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" gutterBottom>
                      الفحص الأولي / Initial Inspection:
                    </Typography>
                    <Typography variant="body1">{aiAnalysis.initial_inspection}</Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" gutterBottom>
                      التوصية / Recommendation:
                    </Typography>
                    <Typography variant="body1">{aiAnalysis.escalation_recommendation}</Typography>
                  </Grid>
                  {aiAnalysis.references && (
                    <Grid item xs={12}>
                      <Typography variant="subtitle2" gutterBottom>
                        المراجع / References:
                      </Typography>
                      {aiAnalysis.references.map((ref: string, idx: number) => (
                        <Typography key={idx} variant="body2" sx={{ ml: 2 }}>
                          • {ref}
                        </Typography>
                      ))}
                    </Grid>
                  )}
                </Grid>
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAiDialogOpen(false)}>إغلاق / Close</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Container>
  );
}
