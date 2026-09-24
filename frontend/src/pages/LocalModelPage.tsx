import { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Container, MenuItem, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { useLocalModel } from '../hooks/useLocalModel';
import { categoryLabels, localErrorText, localModelConfig as config, type LocalResult } from '../llm/localModelContract';
import cases from '../llm/smokeCases.json';
import LocalModelProgress from '../components/LocalModelProgress';
import supportCases from '../llm/supportSmokeCases.json';
import { supportModelConfig, type SupportCandidate } from '../llm/supportModelContract';

export default function LocalModelPage() {
  const local = useLocalModel();
  const [selected, setSelected] = useState(0);
  const [result, setResult] = useState<LocalResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('support');
  const examples = mode === 'support' ? supportCases : cases;
  const run = async () => {
    setBusy(true); setResult(null);
    try {
      const support = supportCases[selected];
      setResult(await local.run(mode === 'support' ? {
        report_text: support.report_text, device_type: 'VENTILATOR', patient_connected: false,
        support_context: {version: supportModelConfig.version, input_sha256: '0'.repeat(64),
          report_text: support.report_text, device_name: 'Medical ventilator', candidates: support.candidates as SupportCandidate[]},
      } : cases[selected]));
    } finally { setBusy(false); }
  };
  const category = result?.output_token ? config.categories[result.output_token] : undefined;
  const selectedReference = result?.support?.output_token
    ? supportCases[selected]?.candidates.find((c) => c.label === result.support?.output_token) : undefined;
  return <Container maxWidth="sm" dir="rtl"><Box sx={{py: 5}}>
    <Typography component="h1" variant="h4" gutterBottom>تجربة النموذج المجاني</Typography>
    <Typography sx={{mb: 3}}>تجربة مباشرة دون حساب أو مفتاح API، باستخدام أوصاف اصطناعية فقط.</Typography>
    <Card><CardContent>
      <Typography variant="h6">Qwen3‑1.7B المحلي</Typography>
      <Typography variant="body2" color="text.secondary" sx={{mb: 2}}>يعمل داخل المتصفح. التنزيل الأول نحو 1.1 غيغابايت. يحتاج إلى Chrome أو Edge حديث واتصال جيد وذاكرة متاحة؛ وقد يحتفظ المتصفح بالملفات للاستخدام التالي.</Typography>
      <TextField fullWidth select label="نوع التجربة" value={mode} disabled={busy} sx={{mb: 2}} onChange={(e) => {setMode(e.target.value); setSelected(0); setResult(null);}}>
        <MenuItem value="support">معالجة الطلب واختيار المرجع</MenuItem><MenuItem value="classification">تصنيف العطل فقط</MenuItem>
      </TextField>
      <TextField fullWidth select label="مثال الاختبار" value={selected} disabled={busy} onChange={(e) => {setSelected(Number(e.target.value)); setResult(null);}}>
        {examples.map((c, i) => <MenuItem key={c.name} value={i}>{c.name}</MenuItem>)}
      </TextField>
      <Typography sx={{my: 2}}>{examples[selected].report_text}</Typography>
      {mode === 'support' && <Box sx={{mb: 2}}><Typography variant="subtitle2">مراجع اصطناعية لاختبار الاختيار</Typography>
        {supportCases[selected].candidates.map((c) => <Typography variant="body2" key={c.label}>{c.label}: {c.symptom}</Typography>)}
        {!supportCases[selected].candidates.length && <Typography variant="body2">لا توجد مراجع في هذا المثال.</Typography>}
      </Box>}
      <Button variant="contained" onClick={run} disabled={busy}>تشغيل النموذج مجانًا</Button>
      {local.progress && <LocalModelProgress progress={local.progress} cancel={local.cancel} />}
      {result?.status === 'success' && <Alert severity="success" sx={{mt: 2}}>اكتمل تشغيل النموذج على هذا المتصفح. الفئة المقترحة: {categoryLabels[category!]}.</Alert>}
      {result?.status === 'success' && mode === 'classification' && category !== cases[selected].expected && <Alert severity="warning" sx={{mt: 1}}>اختلفت الفئة عن المتوقع لهذا المثال. نجاح التشغيل لا يثبت صحة التصنيف.</Alert>}
      {result?.support?.status === 'success' && <Alert severity="info" sx={{mt: 1}}>قرار النموذج للطلب: {selectedReference
        ? `المرجع ${selectedReference.label}: ${selectedReference.symptom}`
        : result.support.output_token === 'E' ? 'خارج نطاق الدعم الفني للأجهزة الطبية' : 'تفاصيل إضافية أو مرجع مناسب مطلوب'}.</Alert>}
      {result?.support?.status === 'success' && result.support.output_token !== supportCases[selected].expected && <Alert severity="warning" sx={{mt: 1}}>اختلف اختيار النموذج عن المتوقع لهذا المثال؛ يحتاج الاقتراح إلى مراجعة.</Alert>}
      {result?.support?.status === 'error' && <Alert severity="warning" sx={{mt: 1}}>لم يكتمل اختيار المرجع: {localErrorText[result.support.error_code || 'load_failed']}</Alert>}
      {result?.status === 'error' && <Alert severity="warning" sx={{mt: 2}}>{localErrorText[result.error_code || 'load_failed']}</Alert>}
      {result?.status === 'success' && <Typography variant="body2" sx={{mt: 1}}>المدة بما فيها التجهيز: {(result.latency_ms / 1000).toFixed(1)} ثانية</Typography>}
    </CardContent></Card>
    <Alert severity="info" sx={{my: 2}}>هذه أمثلة تطوير اصطناعية وليست تشخيصًا أو قياسًا للدقة الطبية، ولا تنشئ طلب صيانة. في صفحة الصيانة يتحقق الخادم من الجهاز والمراجع ويُحفظ الاقتراح لمراجعة المختص.</Alert>
    <Typography variant="caption" component="p" dir="ltr" sx={{overflowWrap: 'anywhere'}}>Model: {config.model}<br />Revision: {config.revision}<br />Runtime: {config.runtime}; {config.dtype}</Typography>
    <Button component={Link} to="/login" sx={{mt: 2}}>الدخول إلى نظام الصيانة</Button>
  </Box></Container>;
}
