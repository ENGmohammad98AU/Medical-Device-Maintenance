import { Box, Button, LinearProgress, Typography } from '@mui/material';
import type { LocalProgress } from '../llm/localModelContract';

export default function LocalModelProgress({progress, cancel, cancelLabel = 'إلغاء'}: {
  progress: LocalProgress; cancel: () => void; cancelLabel?: string;
}) {
  return <Box role="status" aria-live="polite" sx={{my: 2}}>
    <Typography variant="body2" sx={{mb: 1}}>{progress.stage === 'running'
      ? progress.task === 'reference_selection' ? 'النموذج يتحقق من نطاق الطلب ويختار المرجع المناسب…' : 'النموذج يصنّف الوصف على جهازك…'
      : `تحميل النموذج وتجهيزه${progress.percent === undefined ? '…' : `: ${Math.floor(progress.percent)}%`}`}</Typography>
    <LinearProgress variant={progress.stage === 'loading' && progress.percent !== undefined ? 'determinate' : 'indeterminate'} value={progress.percent} />
    {progress.compute_backend && <Typography variant="body2">{progress.compute_backend === 'webgpu'
      ? 'التسريع باستخدام كرت الشاشة مفعّل.' : 'يعمل النموذج على المعالج المركزي؛ السرعة تعتمد على إمكانات جهازك.'}</Typography>}
    {progress.cpu_fallback && <Typography variant="body2">تعذر استخدام كرت الشاشة؛ جارٍ إعادة المحاولة على المعالج المركزي.</Typography>}
    <Typography variant="caption">قد يستغرق التحليل عدة دقائق بحسب جهازك. يمكنك إلغاؤه في أي وقت.</Typography>
    {progress.storage_mode === 'temporary' && <Typography variant="body2" sx={{mt: 1}}>تشغيل مؤقت دون حفظ أوزان النموذج في التخزين الدائم للموقع. قد يلزم تنزيلها مجددًا بعد إغلاق الصفحة.</Typography>}
    <Button onClick={cancel} sx={{mt: 1}}>{cancelLabel}</Button>
  </Box>;
}
