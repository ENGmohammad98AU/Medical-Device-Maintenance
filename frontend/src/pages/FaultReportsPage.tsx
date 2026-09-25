import React, { useState, useEffect, useRef } from 'react';
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
import api, { authService, isAuthenticationError } from '../services/auth';
import { filterFaultReports, normalizeEnumValue } from '../utils/faultReportFilters';
import { useLocalModel } from '../hooks/useLocalModel';
import { localModelConfig } from '../llm/localModelContract';
import type { SupportContext } from '../llm/supportModelContract';
import LocalModelProgress from '../components/LocalModelProgress';
import LLMTriageSummary from '../components/LLMTriageSummary';

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
  type: string;
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
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [decisionSaved, setDecisionSaved] = useState(false);
  const localModel = useLocalModel();
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
    setAiAnalysis(null); setDecisionSaved(false);
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
    if (analyzing) return;
    setDialogOpen(false);
    setEditingReport(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (analyzing) return;
    if (!formData.device_id || !formData.error_message.trim()) {
      setError('Please select a device and enter an error message');
      return;
    }

    setAnalyzing(true);
    try {
      const submitData = {
        ...formData,
        device_id: parseInt(formData.device_id),
        description: formData.error_message.trim(),
      };

      if (editingReport) {
        await api.put(`/api/fault-reports/${editingReport.id}`, submitData);
      } else {
        await api.post('/api/fault-reports/', submitData);
      }
      setDialogOpen(false);
      setEditingReport(null);
      fetchReports();
    } catch (err: any) {
      setError(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'تعذر حفظ البلاغ؛ تحقق من الوصف وحالة الطلب.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAnalyze = async (useLlm = true) => {
    if (analyzing) return;
    if (!formData.device_id || formData.error_message.trim().length < 10) {
      setError('اختر الجهاز وأدخل وصفًا فنيًا لا يقل عن 10 محارف');
      return;
    }
    const selectedDevice = devices.find((device) => device.id === parseInt(formData.device_id));
    if (!selectedDevice) {
      setError('تعذر تحديد الجهاز');
      return;
    }

    setAnalyzing(true);
    setAnalysisStage('تجهيز البلاغ…');
    setError('');
    try {
      // Validate with the server before downloading/running the local model.
      await authService.getCurrentUser();
      if (!mounted.current) return;
      let linkedReportId = editingReport?.id;
      if (!linkedReportId) {
        const created = await api.post('/api/fault-reports/', {
          device_id: selectedDevice.id,
          error_message: formData.error_message.trim(),
          description: formData.error_message.trim(),
          severity: 'medium',
        });
        linkedReportId = created.data.id;
        setEditingReport(created.data);
      } else if (editingReport && editingReport.device_id !== selectedDevice.id) {
        const updated = await api.put(`/api/fault-reports/${linkedReportId}`, {
          device_id: selectedDevice.id,
          error_message: formData.error_message.trim(),
          description: formData.error_message.trim(),
        });
        setEditingReport(updated.data);
      }
      if (!mounted.current) return;

      const supportRequest = {
        device_id: selectedDevice.id,
        report_id: linkedReportId,
        fault: '',
        description: formData.error_message.trim(),
        customer_expertise: 'INTERMEDIATE',
        patient_connected: false,
      };
      let support_context: SupportContext | undefined;
      if (useLlm) {
        setAnalysisStage('تجهيز المراجع…');
        try {
          support_context = (await api.post('/api/intelligent-support/prepare-support', supportRequest, { timeout: 90000 })).data;
        } catch (error) {
          if (isAuthenticationError(error)) throw error;
          support_context = undefined;
        }
      }
      if (!mounted.current) return;

      const browser_llm = useLlm ? await localModel.run({
        report_text: supportRequest.description,
        device_type: selectedDevice.type.toUpperCase().replace(/[- ]/g, '_'),
        patient_connected: false,
        support_context,
      }) : { status: 'disabled' as const, revision: localModelConfig.revision, latency_ms: 0 };
      if (!mounted.current) return;
      setAnalysisStage('التحقق من المراجع وحفظ التحليل…');

      const response = await api.post('/api/fault-reports/analyze', {
        device_id: selectedDevice.id,
        report_id: linkedReportId,
        alarm_code: '',
        error_message: formData.error_message.trim(),
        browser_llm: browser_llm || { status: 'disabled', revision: localModelConfig.revision, latency_ms: 0 },
      }, { timeout: 90000 });
      setAiAnalysis(response.data);
      setDecisionSaved(false);
      setAiDialogOpen(true);
      await fetchReports();
    } catch (err: any) {
      setError(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'تعذر تحليل البلاغ بالنموذج المحلي؛ تحقق من طول الوصف وأعد المحاولة.');
    } finally {
      if (mounted.current) { setAnalyzing(false); setAnalysisStage(null); }
    }
  };

  const handleResolve = async (id: number) => {
    const action = window.prompt('اكتب الإجراء الذي تم تنفيذه فعليًا:');
    if (!action?.trim()) return;
    const verification = window.prompt('اكتب نتيجة التحقق بعد تنفيذ الإجراء:');
    if (!verification?.trim()) return;
    const resolved = window.confirm('هل تم حل العطل والتحقق من نجاح الحل؟ اضغط موافق للحل، أو إلغاء لإبقائه قيد المتابعة.');
    try {
      await api.post(`/api/fault-reports/${id}/verify-resolution`, {
        action_taken: action.trim(),
        verification_result: verification.trim(),
        outcome: resolved ? 'RESOLVED' : 'FOLLOW_UP',
      });
      fetchReports();
    } catch (err: any) {
      setError(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'يجب اعتماد قرار المختص وإدخال إجراء ونتيجة تحقق من 3 محارف على الأقل');
    }
  };

  const handleReopen = async (report: FaultReport) => {
    const reason = window.prompt('ما سبب إعادة فتح البلاغ؟');
    if (!reason?.trim()) return;
    try {
      await api.post(`/api/fault-reports/${report.id}/reopen`, { reason: reason.trim() });
      await fetchReports();
      handleOpenDialog({ ...report, status: 'in_progress', resolved_at: null });
    } catch (err: any) {
      setError(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'تعذر إعادة فتح البلاغ؛ أدخل سببًا واضحًا.');
    }
  };

  const approveAnalysis = async () => {
    if (!aiAnalysis?.audit_log_id) return;
    try {
      await api.post(`/api/intelligent-support/audit-logs/${aiAnalysis.audit_log_id}/decision`, null, {
        params: { decision: 'APPROVED', comments: 'Approved from fault report analysis view' },
      });
      setDecisionSaved(true);
    } catch (err: any) {
      setError(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'تعذر حفظ قرار المختص');
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
              disabled={analyzing}
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
                    {['open', 'in_progress'].includes(normalizeEnumValue(report.status)) && (
                      <Button size="small" color="success" onClick={() => handleResolve(report.id)} startIcon={<CheckCircleIcon />}>
                        حل / Resolve
                      </Button>
                    )}
                    {normalizeEnumValue(report.status) === 'resolved' && (
                      <Button size="small" onClick={() => handleReopen(report)}>إعادة الفتح والمتابعة</Button>
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
                    disabled={analyzing}
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
                    disabled={analyzing}
                    inputProps={{ maxLength: 4000 }}
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
                onClick={() => handleAnalyze(true)}
                disabled={analyzing}
                sx={{ mt: 2 }}
                fullWidth
              >
                تحليل بالنموذج اللغوي المحلي / Local LLM Analysis
              </Button>
              <Button type="button" variant="contained" onClick={() => handleAnalyze(false)} disabled={analyzing} sx={{mt: 1}} fullWidth>
                تحليل سريع بالمراجع
              </Button>
              <Typography variant="caption" component="p" sx={{mt: 1}}>
                التحليل السريع يستخدم المراجع وقواعد السلامة. تحليل النموذج يضيف تصنيفًا لغويًا واختيارًا للمرجع وقد يستغرق وقتًا أطول عند التشغيل الأول.
              </Typography>
              {localModel.progress ? <LocalModelProgress progress={localModel.progress} cancel={localModel.cancel} cancelLabel="متابعة بالمراجع دون انتظار النموذج" />
                : analysisStage && <Typography role="status" sx={{mt: 2}}>{analysisStage}</Typography>}
              {error && <Alert severity="error" sx={{mt: 2}}>{error}</Alert>}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button disabled={analyzing} onClick={handleCloseDialog}>إلغاء / Cancel</Button>
            <Button disabled={analyzing} onClick={handleSubmit} variant="contained">
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
                <LLMTriageSummary result={aiAnalysis} />
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" gutterBottom>
                      الجهاز / Device:
                    </Typography>
                    <Typography variant="body1">{aiAnalysis.device}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" gutterBottom>
                      العطل المرجعي / Matched Fault:
                    </Typography>
                    <Typography variant="body1">{aiAnalysis.matched_fault || 'لم يُعتمد مرجع مطابق'}</Typography>
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
                      درجة المطابقة المرجعية / Reference Match:
                    </Typography>
                    <Typography variant="body1">{aiAnalysis.reference_found ? `${(aiAnalysis.match_confidence * 100).toFixed(1)}%` : 'لا توجد مطابقة معتمدة'}</Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" gutterBottom>
                      السبب المحتمل / Possible Cause:
                    </Typography>
                    <Typography variant="body1">{aiAnalysis.possible_causes || aiAnalysis.customer_support?.message || 'لم يتوفر سبب مرجعي مناسب'}</Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" gutterBottom>
                      إجراء السلامة الأولي / Immediate Safety Action:
                    </Typography>
                    <Typography variant="body1">{aiAnalysis.immediate_safety_action || aiAnalysis.warning_message || 'تجب مراجعة المختص قبل تنفيذ أي إجراء'}</Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" gutterBottom>
                      التوصية / Recommendation:
                    </Typography>
                    <Typography variant="body1">{aiAnalysis.recommended_solution || aiAnalysis.recommended_action}</Typography>
                  </Grid>
                  {!!aiAnalysis.troubleshooting_steps?.length && <Grid item xs={12}>
                    <Typography variant="subtitle2">خطوات الفحص المرجعية:</Typography>
                    <Box component="ol" sx={{pl: 3}}>{aiAnalysis.troubleshooting_steps.map((step: string, idx: number) => <li key={idx}>{step}</li>)}</Box>
                  </Grid>}
                  {aiAnalysis.verification_before_return_to_service && <Grid item xs={12}>
                    <Typography variant="subtitle2">التحقق قبل إعادة الجهاز إلى الخدمة:</Typography>
                    <Typography>{aiAnalysis.verification_before_return_to_service}</Typography>
                  </Grid>}
                  {aiAnalysis.source && (
                    <Grid item xs={12}>
                      <Typography variant="subtitle2" gutterBottom>
                        المراجع / References:
                      </Typography>
                      <Typography variant="body2">{aiAnalysis.source}</Typography>
                      {aiAnalysis.reference_page && <Typography variant="body2">الصفحة: {aiAnalysis.reference_page}</Typography>}
                    </Grid>
                  )}
                </Grid>
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            {aiAnalysis?.workflow?.fault_report_id && !decisionSaved && (
              <Button color="success" variant="contained" onClick={approveAnalysis}>
                اعتماد التوصية كمختص
              </Button>
            )}
            {decisionSaved && <Chip color="success" label="تم حفظ قرار المختص" />}
            <Button onClick={() => setAiDialogOpen(false)}>إغلاق / Close</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Container>
  );
}
