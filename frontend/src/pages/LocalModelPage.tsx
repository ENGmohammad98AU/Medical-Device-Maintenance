import { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Container, MenuItem, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { useLocalModel } from '../hooks/useLocalModel';
import { categoryLabels, localErrorText, localModelConfig as config, type LocalResult } from '../llm/localModelContract';
import cases from '../llm/smokeCases.json';
import LocalModelProgress from '../components/LocalModelProgress';

export default function LocalModelPage() {
  const local = useLocalModel();
  const [selected, setSelected] = useState(0);
  const [result, setResult] = useState<LocalResult | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true); setResult(null);
    try { setResult(await local.run(cases[selected])); } finally { setBusy(false); }
  };
  const category = result?.output_token ? config.categories[result.output_token] : undefined;
  return <Container maxWidth="sm" dir="rtl"><Box sx={{py: 5}}>
    <Typography component="h1" variant="h4" gutterBottom>تجربة النموذج المجاني</Typography>
    <Typography sx={{mb: 3}}>تجربة مباشرة دون حساب أو مفتاح API، باستخدام أوصاف اصطناعية فقط.</Typography>
    <Card><CardContent>
      <Typography variant="h6">Qwen3‑0.6B المحلي</Typography>
      <Typography variant="body2" color="text.secondary" sx={{mb: 2}}>يعمل داخل المتصفح. التنزيل الأول نحو 950 ميغابايت. يحتاج إلى اتصال جيد وذاكرة متاحة؛ وقد يحتفظ المتصفح بالملفات للاستخدام التالي.</Typography>
      <TextField fullWidth select label="مثال الاختبار" value={selected} disabled={busy} onChange={(e) => {setSelected(Number(e.target.value)); setResult(null);}}>
        {cases.map((c, i) => <MenuItem key={c.name} value={i}>{c.name}</MenuItem>)}
      </TextField>
      <Typography sx={{my: 2}}>{cases[selected].report_text}</Typography>
      <Button variant="contained" onClick={run} disabled={busy}>تشغيل النموذج مجانًا</Button>
      {local.progress && <LocalModelProgress progress={local.progress} cancel={local.cancel} />}
      {result?.status === 'success' && <Alert severity="success" sx={{mt: 2}}>اكتمل تشغيل النموذج على هذا المتصفح. الفئة المقترحة: {categoryLabels[category!]}.</Alert>}
      {result?.status === 'success' && category !== cases[selected].expected && <Alert severity="warning" sx={{mt: 1}}>اختلفت الفئة عن المتوقع لهذا المثال. نجاح التشغيل لا يثبت صحة التصنيف.</Alert>}
      {result?.status === 'error' && <Alert severity="warning" sx={{mt: 2}}>{localErrorText[result.error_code || 'load_failed']}</Alert>}
      {result?.status === 'success' && <Typography variant="body2" sx={{mt: 1}}>المدة بما فيها التجهيز: {(result.latency_ms / 1000).toFixed(1)} ثانية</Typography>}
    </CardContent></Card>
    <Alert severity="info" sx={{my: 2}}>هذه تجربة تشغيل وليست تشخيصًا أو قياسًا للدقة الطبية. في صفحة الصيانة يراجع الخادم النتيجة وتحدد القواعد والمراجع الخطورة والإجراءات.</Alert>
    <Typography variant="caption" component="p" dir="ltr" sx={{overflowWrap: 'anywhere'}}>Model: {config.model}<br />Revision: {config.revision}<br />Runtime: {config.runtime}; {config.dtype}</Typography>
    <Button component={Link} to="/login" sx={{mt: 2}}>الدخول إلى نظام الصيانة</Button>
  </Box></Container>;
}
