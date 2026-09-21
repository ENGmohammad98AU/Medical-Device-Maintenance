import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container,
  FormControlLabel, Grid, IconButton, MenuItem, Step, StepLabel, Stepper,
  Switch, TextField, Typography,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, CheckCircle as CheckCircleIcon, Psychology as PsychologyIcon, Security as SecurityIcon } from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';
import api from '../services/auth';
import LLMTriageSummary, { TriageMetadata } from '../components/LLMTriageSummary';
import { useLocalModel } from '../hooks/useLocalModel';
import { localModelConfig } from '../llm/localModelContract';
import LocalModelProgress from '../components/LocalModelProgress';

interface Device { id: number; name: string; type: string; manufacturer: string; model: string; serial_number: string; department: string; location?: string; }
interface AnalysisResult extends TriageMetadata {
  audit_log_id: string; severity: string; fault_level: string; is_emergency: boolean; safety_impact: string;
  extracted_entities: Record<string, Array<{ value: string }>>; rag_response: string; rag_sources: string[];
  rag_confidence: number; warning_message?: string; escalation_required: boolean; recommended_action: string;
  reference_found: boolean;
  troubleshooting_steps: string[]; safety_precautions: string[]; calibration_procedures: string[];
  error_code_meaning?: string | null;
  device: string; matched_fault: string; meaning: string; possible_causes: string;
  immediate_safety_action: string; recommended_solution: string; verification_before_return_to_service: string;
  source: string; reference_url: string; reference_page: string; match_confidence: number; match_status: string;
}

const steps = ['وصف البلاغ والسياق', 'التحليل والتحقق', 'مراجعة المختص'];

export default function MaintenancePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  const [patientConnected, setPatientConnected] = useState(false);
  const [expertise, setExpertise] = useState('INTERMEDIATE');
  const [activeStep, setActiveStep] = useState(0);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [decision, setDecision] = useState('');
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [useLocal, setUseLocal] = useState(true);
  const localModel = useLocalModel();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return; }
    api.get('/api/devices/?limit=100').then((response) => setDevices(response.data)).catch(() => setError('تعذر تحميل الأجهزة'));
  }, [isAuthenticated, navigate]);

  const selectedDevice = devices.find((device) => device.id === Number(deviceId));

  const runAnalysis = async () => {
    if (!selectedDevice) {
      setError('يرجى اختيار الجهاز'); return;
    }
    if (!description.trim()) {
      setError('يرجى إدخال وصف العطل'); return;
    }
    if (description.trim().length < 10) {
      setError('يرجى إدخال وصف أكثر تفصيلًا للعطل'); return;
    }
    setBusy(true); setError('');
    try {
      const requestData = {
        device_id: selectedDevice.id,
        device_name: selectedDevice.name,
        manufacturer: selectedDevice.manufacturer,
        model: selectedDevice.model,
        // This screen intentionally has one free-text description field. The
        // API uses it as the reference-search query when no separate fault code
        // is supplied.
        fault: '',
        description: description.trim(),
        customer_expertise: expertise,
        device_location: selectedDevice.location || selectedDevice.department,
        patient_connected: patientConnected,
      };
      const browser_llm = useLocal ? await localModel.run({
        report_text: requestData.description, device_type: selectedDevice.type.toUpperCase().replace(/[- ]/g, '_'),
        patient_connected: requestData.patient_connected,
      }) : {status: 'disabled', revision: localModelConfig.revision, latency_ms: 0};
      if (!mounted.current) return;
      const response = await api.post('/api/intelligent-support/analyze-fault', {...requestData, browser_llm}, { timeout: 90000 });
      setAnalysis(response.data); setActiveStep(1);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'تعذر تحليل البلاغ. تحقق من الوصف وأعد المحاولة.');
    }
    finally { setBusy(false); }
  };

  const saveDecision = async () => {
    if (!analysis || !decision) { setError('اختر قرار المختص قبل الحفظ'); return; }
    setBusy(true); setError('');
    try {
      await api.post(`/api/intelligent-support/audit-logs/${analysis.audit_log_id}/decision`, null, { params: { decision, comments: comments || undefined } });
      setSuccess('تم حفظ قرار المختص وسجل التعديلات بنجاح'); setActiveStep(2);
    } catch (err: any) { setError(err.response?.data?.detail || 'تعذر حفظ قرار المختص'); }
    finally { setBusy(false); }
  };

  const reset = () => {
    setAnalysis(null); setDecision(''); setComments(''); setSuccess(''); setActiveStep(0);
    setDeviceId(''); setDescription(''); setPatientConnected(false);
  };

  return <Container maxWidth="lg"><Box sx={{ mt: 4, mb: 5 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
      <IconButton onClick={() => navigate('/dashboard')} aria-label="العودة للوحة التحكم"><ArrowBackIcon /></IconButton>
      <Box><Typography variant="h4" component="h1">مسار الدعم والصيانة</Typography><Typography color="text.secondary">بلاغ موحد من الإدخال إلى مراجعة المختص</Typography></Box>
    </Box>
    <Stepper activeStep={activeStep} sx={{ mb: 4 }}>{steps.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}</Stepper>
    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
    {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

    {!analysis && <Card><CardContent>
      <Typography variant="h6" gutterBottom>1. إدخال البلاغ وبيانات الجهاز</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>تُستخدم البيانات للتحقق من السلامة وتحديد مسار الإحالة المناسب.</Typography>
      <Alert severity="warning" sx={{mb: 2}}>في حالات الخطر الفوري، اتبع إجراءات المنشأة ولا تنتظر التحليل الآلي.</Alert>
      <Grid container spacing={2}>
        <Grid item xs={12}><TextField fullWidth disabled={busy} select label="الجهاز" value={deviceId} onChange={(event) => setDeviceId(Number(event.target.value))} required>{devices.map((device) => <MenuItem key={device.id} value={device.id}>{device.name} | {device.model} | {device.serial_number}</MenuItem>)}</TextField></Grid>
        <Grid item xs={12}><TextField fullWidth disabled={busy} multiline minRows={3} label="وصف العطل" value={description} onChange={(event) => setDescription(event.target.value)} inputProps={{ maxLength: 4000 }} helperText="أدخل وصفًا فنيًا دون أسماء المرضى أو أرقام ملفاتهم أو بيانات الاتصال." required /></Grid>
        <Grid item xs={12} md={6}><TextField fullWidth disabled={busy} select label="خبرة مقدم البلاغ" value={expertise} onChange={(event) => setExpertise(event.target.value)}><MenuItem value="NOVICE">أساسية</MenuItem><MenuItem value="INTERMEDIATE">متوسطة</MenuItem><MenuItem value="ADVANCED">متقدمة</MenuItem><MenuItem value="EXPERT">خبير</MenuItem></TextField></Grid>
        <Grid item xs={12}><FormControlLabel control={<Switch disabled={busy} checked={patientConnected} onChange={(event) => setPatientConnected(event.target.checked)} />} label="المريض متصل بالجهاز حاليًا" /></Grid>
      </Grid>
      <FormControlLabel control={<Switch checked={useLocal} disabled={busy} onChange={(event) => setUseLocal(event.target.checked)} />} label="اقتراح فئة العطل بنموذج محلي مجاني" />
      <Alert severity="info" sx={{mt: 2}}>لا يحتاج النموذج إلى حساب خارجي أو مفتاح API. التنزيل الأول نحو 950 ميغابايت، ثم يعمل على جهازك. تبقى الخطورة وإجراءات الصيانة خاضعة للقواعد والمراجع ومراجعة المختص.</Alert>
      {localModel.progress && <LocalModelProgress progress={localModel.progress} cancel={localModel.cancel} cancelLabel="متابعة بالقواعد دون انتظار النموذج" />}
      <Button variant="contained" onClick={runAnalysis} disabled={busy} startIcon={busy ? <CircularProgress size={18} /> : <PsychologyIcon />} sx={{ mt: 3 }}>التحقق والتحليل</Button>
    </CardContent></Card>}

    {analysis && !analysis.reference_found && <Card><CardContent>
      <Alert severity="info">لا توجد حالياً معلومات مرجعية كافية لتشخيص هذا العطل. يرجى إضافة المرجع الفني الخاص بالجهاز.</Alert>
    </CardContent></Card>}

    {analysis && <>
      <Grid container spacing={3}>
        <Grid item xs={12} md={5}><Card><CardContent>
          <Typography variant="h6" gutterBottom><SecurityIcon sx={{ verticalAlign: 'middle', mr: 1 }} />نتيجة التحقق والتصنيف</Typography>
          <LLMTriageSummary result={analysis} />
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}><Chip label={`الخطورة: ${analysis.severity}`} color={analysis.is_emergency ? 'error' : 'warning'} /><Chip label={`المستوى: ${analysis.fault_level}`} /><Chip label={analysis.escalation_required ? 'يتطلب إحالة' : 'دعم اعتيادي'} color={analysis.escalation_required ? 'error' : 'success'} /></Box>
          <Typography variant="body2" sx={{ mb: 1 }}><strong>الأثر على السلامة:</strong> {analysis.safety_impact}</Typography><Typography variant="body2"><strong>الإجراء المقترح:</strong> {analysis.recommended_action}</Typography>
          {analysis.warning_message && <Alert severity="warning" sx={{ mt: 2 }}>{analysis.warning_message}</Alert>}
          <Typography variant="subtitle2" sx={{ mt: 3 }}>الكيانات الفنية المستخرجة</Typography>
          {Object.entries(analysis.extracted_entities).filter(([key]) => key !== 'confidence_scores').map(([key, values]) => <Typography variant="body2" key={key}>{key}: {values.map((value) => value.value).join('، ') || 'غير محدد'}</Typography>)}
        </CardContent></Card></Grid>
        {analysis.reference_found && <Grid item xs={12} md={7}><Card><CardContent>
          <Typography variant="h6" gutterBottom>الإجابة الفنية ومصادرها</Typography>
          {analysis.matched_fault && <Alert severity="success" sx={{ mb: 2 }}><strong>العطل المرجعي المطابق:</strong> {analysis.matched_fault}</Alert>}
          {analysis.meaning && <Typography sx={{ whiteSpace: 'pre-line' }}><strong>المعنى:</strong> {analysis.meaning}</Typography>}
          {analysis.possible_causes && <Typography sx={{ whiteSpace: 'pre-line', mt: 2 }}><strong>الأسباب المحتملة:</strong> {analysis.possible_causes}</Typography>}
          {analysis.immediate_safety_action && <Alert severity="warning" sx={{ mt: 2 }}><strong>إجراء السلامة الفوري:</strong> {analysis.immediate_safety_action}</Alert>}
          {!analysis.meaning && <Typography sx={{ whiteSpace: 'pre-line' }}>{analysis.rag_response || analysis.error_code_meaning || 'لم يتم العثور على عطل مطابق ضمن الملفات المرجعية المتوفرة. يرجى إضافة وصف أكثر تفصيلاً.'}</Typography>}
          {analysis.error_code_meaning && !analysis.meaning && <Alert severity="info" sx={{ mt: 2 }}><strong>معنى كود الخطأ:</strong> {analysis.error_code_meaning}</Alert>}
          {analysis.troubleshooting_steps.length > 0 && <>
            <Typography variant="subtitle2" sx={{ mt: 3 }}>خطوات استكشاف العطل</Typography>
            {analysis.troubleshooting_steps.map((step, index) => <Typography variant="body2" key={`${step}-${index}`}>{index + 1}. {step}</Typography>)}
          </>}
          {analysis.recommended_solution && <Typography sx={{ whiteSpace: 'pre-line', mt: 3 }}><strong>الحل الموصى به:</strong> {analysis.recommended_solution}</Typography>}
          {analysis.verification_before_return_to_service && <Typography sx={{ whiteSpace: 'pre-line', mt: 2 }}><strong>التحقق قبل إعادة الجهاز للخدمة:</strong> {analysis.verification_before_return_to_service}</Typography>}
          {analysis.safety_precautions.length > 0 && <>
            <Typography variant="subtitle2" sx={{ mt: 3 }}>احتياطات السلامة</Typography>
            {analysis.safety_precautions.map((precaution) => <Typography variant="body2" key={precaution}>• {precaution}</Typography>)}
          </>}
          <Typography variant="subtitle2" sx={{ mt: 3 }}>المصادر المرجعية</Typography>
          {analysis.source && <Typography variant="body2">• {analysis.source}{analysis.reference_page ? ` — الصفحة ${analysis.reference_page}` : ''}</Typography>}
          {analysis.rag_sources.filter((source) => !analysis.source || !source.includes(analysis.source)).map((source) => <Typography variant="body2" key={source}>• {source}</Typography>)}
          {analysis.reference_url && <Button component="a" href={analysis.reference_url} target="_blank" rel="noopener noreferrer" size="small" sx={{ mt: 1 }}>فتح المرجع الأصلي</Button>}
          <Box><Typography variant="caption" color="text.secondary">درجة المطابقة النصية: {Math.round((analysis.match_confidence || analysis.rag_confidence) * 100)}% | الحالة: {analysis.match_status} — لا تمثل دقة النموذج اللغوي.</Typography></Box>
        </CardContent></Card></Grid>}
      </Grid>
      <Card sx={{ mt: 3 }}><CardContent><Typography variant="h6" gutterBottom>3. مراجعة المختص وحفظ القرار</Typography>
        <Grid container spacing={2}><Grid item xs={12} md={5}><TextField fullWidth select label="قرار المختص" value={decision} onChange={(event) => setDecision(event.target.value)}><MenuItem value="APPROVED">اعتماد التوصية</MenuItem><MenuItem value="MODIFIED">اعتماد بعد التعديل</MenuItem><MenuItem value="ESCALATED">إحالة لمختص</MenuItem><MenuItem value="REJECTED">رفض التوصية</MenuItem></TextField></Grid><Grid item xs={12} md={7}><TextField fullWidth label="ملاحظات القرار" value={comments} onChange={(event) => setComments(event.target.value)} /></Grid></Grid>
        <Button variant="contained" onClick={saveDecision} disabled={busy} startIcon={<CheckCircleIcon />} sx={{ mt: 3 }}>حفظ القرار وسجل التعديلات</Button><Button onClick={reset} sx={{ mt: 3, ml: 2 }}>بلاغ جديد</Button>
      </CardContent></Card>
    </>}
  </Box></Container>;
}
