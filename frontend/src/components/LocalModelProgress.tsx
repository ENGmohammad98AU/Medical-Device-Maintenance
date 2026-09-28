import { Box, Button, LinearProgress, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import type { LocalProgress } from '../llm/localModelContract';

export default function LocalModelProgress({progress, cancel, cancelLabel = 'إلغاء'}: {
  progress: LocalProgress; cancel: () => void; cancelLabel?: string;
}) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const phase = progress.budget_phase || (progress.stage === 'running' ? 'inference'
    : progress.stage === 'loading' ? 'download' : 'preparation');
  return <Box role="status" aria-live="polite" sx={{my: 2}}>
    <Typography variant="body2" sx={{mb: 1}}>{progress.stage === 'running'
      ? progress.task === 'generation' ? 'النموذج يولّد مسودة إرشادات قصيرة من وصف العطل…' : progress.task === 'reference_selection' ? 'النموذج يتحقق من نطاق الطلب ويختار المرجع المناسب…' : 'النموذج يصنّف الوصف على جهازك…'
      : progress.stage === 'warming' ? 'تهيئة النموذج مسبقًا لتسريع البلاغات التالية…'
      : progress.stage === 'initializing' ? 'فتح النموذج في الذاكرة وتجهيز محرك التشغيل…'
      : `تنزيل ملفات النموذج أو قراءتها من التخزين${progress.percent === undefined ? '…' : `: ${Math.floor(progress.percent)}%`}`}</Typography>
    <LinearProgress variant={progress.stage === 'loading' && progress.percent !== undefined ? 'determinate' : 'indeterminate'} value={progress.percent} />
    {progress.compute_backend && <Typography variant="body2">{progress.compute_backend === 'webgpu'
      ? 'التسريع باستخدام كرت الشاشة مفعّل.' : 'يعمل النموذج على المعالج المركزي؛ السرعة تعتمد على إمكانات جهازك.'}</Typography>}
    {progress.cpu_fallback && <Typography variant="body2">تعذر تشغيل النموذج بكرت الشاشة؛ تستخدم هذه المحاولة المعالج المركزي.</Typography>}
    {progress.started_at !== undefined && <Typography variant="body2">
      الوقت المنقضي: {Math.max(0, Math.floor((now - progress.started_at) / 1000))} ثانية.
      {progress.deadline_at !== undefined && ` المتبقي قبل إيقاف المحاولة: ${Math.max(0, Math.ceil((progress.deadline_at - now) / 1000))} ثانية.`}
    </Typography>}
    <Typography variant="caption">{phase === 'inference'
      ? 'مهلة التصنيف واختيار المرجع أو التوليد لا تتجاوز 45 ثانية. يمكنك المتابعة بالمراجع عند تعذر اكتمال النموذج.'
      : phase === 'download' ? 'مهلة تنزيل الملفات أو فتح التخزين حتى 15 دقيقة. يمكنك الإلغاء في أي وقت.'
      : 'التجهيز بعد توفر الملف محدود بدقيقتين، ويشمل تهيئة النموذج وأي إعادة محاولة على المعالج المركزي.'}</Typography>
    {progress.storage_mode === 'temporary' && <Typography variant="body2" sx={{mt: 1}}>تشغيل مؤقت دون حفظ أوزان النموذج في التخزين الدائم للموقع. قد يلزم تنزيلها مجددًا بعد إغلاق الصفحة.</Typography>}
    <Button onClick={cancel} sx={{mt: 1}}>{cancelLabel}</Button>
  </Box>;
}
