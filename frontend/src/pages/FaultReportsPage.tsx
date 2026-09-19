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
  Clear as ClearIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  ArrowBack as ArrowBackIcon,
  Psychology as PsychologyIcon,
} from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';
import api from '../services/auth';
import { filterFaultReports, normalizeEnumValue } from '../utils/faultReportFilters';

interface FaultReport {
  id: number;
  device_id: number;
  device_name?: string;
  alarm_code?: string | null;
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

interface DeviceSummary {
  id: number;
  name: string;
  manufacturer: string;
  model: string;
  serial_number: string;
  status: string;
}

const severityLevels = ['low', 'medium', 'high', 'critical'];
const reportStatusLevels = ['open', 'in_progress', 'resolved', 'escalated', 'rejected'];
const deviceStatusLevels = [
  'operational',
  'maintenance_required',
  'under_maintenance',
  'out_of_service',
  'retired',
];

const severityColors: Record<string, string> = {
  low: '#4caf50',
  medium: '#ff9800',
  high: '#f44336',
  critical: '#d32f2f',
};

const statusColors: Record<string, string> = {
  open: '#f44336',
  in_progress: '#ff9800',
  resolved: '#4caf50',
  escalated: '#9c27b0',
  rejected: '#9e9e9e',
};

const formatEnumLabel = (value: string) => value.replace(/_/g, ' ').toUpperCase();

export default function FaultReportsPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [reports, setReports] = useState<FaultReport[]>([]);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<FaultReport | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDevice, setFilterDevice] = useState('');
  const [filterDeviceStatus, setFilterDeviceStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
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
  }, [isAuthenticated, navigate]);

  const fetchReports = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/fault-reports/?skip=0&limit=1000');
      setReports(response.data);
      setLoading(false);
    } catch (err: any) {
      setError('Failed to fetch fault reports');
      setLoading(false);
    }
  };

  const fetchDevices = async () => {
    try {
      const response = await api.get('/api/devices/?limit=1000');
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

  const filteredReports = filterFaultReports(reports, devices, {
    query: searchQuery,
    deviceId: filterDevice,
    deviceStatus: filterDeviceStatus,
    severity: filterSeverity,
    reportStatus: filterStatus,
  });

  const deviceById = new Map(devices.map((device) => [device.id, device]));
  const hasActiveFilters = Boolean(
    searchQuery || filterDevice || filterDeviceStatus || filterSeverity || filterStatus,
  );

  const clearFilters = () => {
    setSearchQuery('');
    setFilterDevice('');
    setFilterDeviceStatus('');
    setFilterSeverity('');
    setFilterStatus('');
  };

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

        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            label="ابحث باسم الجهاز أو العطل / Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ minWidth: 280, flexGrow: 1 }}
          />
          <FormControl sx={{ minWidth: 210 }}>
            <InputLabel>الجهاز / Device</InputLabel>
            <Select
              value={filterDevice}
              label="الجهاز / Device"
              onChange={(e) => setFilterDevice(e.target.value)}
            >
              <MenuItem value="">الكل / All</MenuItem>
              {devices.map((device) => (
                <MenuItem key={device.id} value={device.id.toString()}>
                  {device.name} - {device.serial_number}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl sx={{ minWidth: 190 }}>
            <InputLabel>حالة الجهاز / Device Status</InputLabel>
            <Select
              value={filterDeviceStatus}
              label="حالة الجهاز / Device Status"
              onChange={(e) => setFilterDeviceStatus(e.target.value)}
            >
              <MenuItem value="">الكل / All</MenuItem>
              {deviceStatusLevels.map((level) => (
                <MenuItem key={level} value={level}>
                  {formatEnumLabel(level)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl sx={{ minWidth: 150 }}>
            <InputLabel>خطورة العطل / Severity</InputLabel>
            <Select
              value={filterSeverity}
              label="خطورة العطل / Severity"
              onChange={(e) => setFilterSeverity(e.target.value)}
            >
              <MenuItem value="">الكل / All</MenuItem>
              {severityLevels.map((level) => (
                <MenuItem key={level} value={level}>
                  {formatEnumLabel(level)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl sx={{ minWidth: 180 }}>
            <InputLabel>حالة التقرير / Report Status</InputLabel>
            <Select
              value={filterStatus}
              label="حالة التقرير / Report Status"
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <MenuItem value="">الكل / All</MenuItem>
              {reportStatusLevels.map((level) => (
                <MenuItem key={level} value={level}>
                  {formatEnumLabel(level)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {hasActiveFilters && (
            <Button startIcon={<ClearIcon />} onClick={clearFilters}>
              مسح الفلاتر / Clear
            </Button>
          )}
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
        ) : filteredReports.length === 0 ? (
            <Alert severity="info">
              لا توجد تقارير مطابقة لمعايير البحث. يمكنك مسح الفلاتر لإظهار جميع البيانات.
            </Alert>
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
                      <WarningIcon sx={{ fontSize: 40, color: severityColors[normalizeEnumValue(report.severity)] }} />
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Chip
                          label={formatEnumLabel(report.severity)}
                          sx={{
                            backgroundColor: severityColors[normalizeEnumValue(report.severity)],
                            color: 'white',
                            fontSize: '0.75rem',
                          }}
                        />
                        <Chip
                          label={formatEnumLabel(report.status)}
                          sx={{
                            backgroundColor: statusColors[normalizeEnumValue(report.status)],
                            color: 'white',
                            fontSize: '0.75rem',
                          }}
                        />
                      </Box>
                    </Box>
                    <Typography variant="h6" component="div" gutterBottom noWrap>
                      {report.device_name || deviceById.get(report.device_id)?.name || `Device #${report.device_id}`}
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
                    {normalizeEnumValue(report.status) === 'open' && (
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
                        backgroundColor: severityColors[normalizeEnumValue(aiAnalysis.severity)],
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
