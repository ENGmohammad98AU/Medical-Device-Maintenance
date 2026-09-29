import { Box, Button, LinearProgress, Typography } from '@mui/material';
import {useEffect, useState} from 'react';
import type { LocalProgress } from '../llm/localModelContract';

export default function LocalModelProgress({progress, cancel, cancelLabel = 'إلغاء'}: {
  progress: LocalProgress; cancel: () => void; cancelLabel?: string;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer);}, []);
  const phase = progress.task === 'classification' ? 'تعليمات تصنيف البلاغ'
    : progress.task === 'reference_selection' ? 'تعليمات اختيار المرجع'
    : progress.task === 'scope' ? 'تعليمات التحقق من نطاق الطلب' : 'تعليمات توليد الإجابة';
  const determinate = ['loading', 'restoring', 'saving'].includes(progress.stage) && progress.percent !== undefined;
  const seconds = (start: number) => Math.max(0, Math.floor((now - start) / 1000));
  return <Box role="status" aria-live="polite" sx={{my: 2}}>
    <Typography variant="body2" sx={{mb: 1}}>{progress.stage === 'running'
      ? progress.task === 'analysis' ? 'النموذج يصنّف البلاغ ويختار المرجع بالتزامن…'
        : progress.task === 'generation' ? 'النموذج يولّد مسودة إرشادات قصيرة من وصف العطل…' : progress.task === 'reference_selection' ? 'النموذج يتحقق من نطاق الطلب ويختار المرجع المناسب…' : 'النموذج يصنّف الوصف على جهازك…'
      : progress.stage === 'warming' ? `تجهيز ${phase}…`
      : progress.stage === 'initializing' ? 'فتح أوزان النموذج وتهيئة محرك التشغيل…'
      : progress.stage === 'restoring' ? progress.preparation_source === 'stored' ? 'استعادة التجهيز المحفوظ على هذا المتصفح…' : 'تنزيل حالة التجهيز الجاهزة والتحقق منها…'
      : progress.stage === 'saving' ? 'حفظ التجهيز لتسريع فتح النموذج لاحقًا…'
      : `تحميل أوزان النموذج${progress.percent === undefined ? '…' : `: ${Math.floor(progress.percent)}%`}`}</Typography>
    <LinearProgress variant={determinate ? 'determinate' : 'indeterminate'} value={progress.percent} />
    {determinate && progress.stage !== 'loading' && <Typography variant="caption">{Math.floor(progress.percent!)}%</Typography>}
    {progress.stage_started_at !== undefined && <Typography variant="body2" aria-live="off">
      زمن المرحلة: {seconds(progress.stage_started_at)} ثانية
      {progress.operation_started_at !== undefined && ` — إجمالي الانتظار: ${seconds(progress.operation_started_at)} ثانية`}
    </Typography>}
    {progress.compute_backend && <Typography variant="body2">{progress.compute_backend === 'webgpu'
      ? progress.backend_ready ? 'اكتملت تهيئة النموذج بمسار كرت الشاشة.' : 'جارٍ محاولة تهيئة النموذج باستخدام كرت الشاشة…'
      : 'مسار التشغيل: المعالج المركزي؛ السرعة تعتمد على إمكانات جهازك.'}</Typography>}
    {progress.cpu_fallback && <Typography variant="body2">{progress.cpu_fallback_reason === 'inference_failed'
      ? 'تعذر إكمال التحليل بكرت الشاشة؛ انتقل التشغيل إلى المعالج المركزي.'
      : 'تعذرت تهيئة النموذج بكرت الشاشة؛ انتقل التشغيل إلى المعالج المركزي.'}</Typography>}
    {progress.preparation_fallback && <Typography variant="body2">{progress.preparation_fallback === 'slow_network'
      ? 'الاتصال لا يناسب تنزيل التجهيز الجاهز؛ يجري حسابه على جهازك وحفظه إن أمكن.'
      : 'تعذرت استعادة التجهيز المتوافق؛ يجري حسابه على جهازك وحفظه إن أمكن.'}</Typography>}
    <Typography variant="caption">{progress.stage === 'running'
      ? 'مهلة التصنيف واختيار المرجع أو التوليد لا تتجاوز 45 ثانية. يمكنك المتابعة بالمراجع عند تعذر اكتمال النموذج.'
      : 'هذه مرحلة تجهيز منفصلة عن تحليل البلاغ؛ قد تستغرق دقائق بحسب الاتصال والجهاز. يمكنك إلغاؤها في أي وقت.'}</Typography>
    {progress.storage_mode === 'temporary' && <Typography variant="body2" sx={{mt: 1}}>تشغيل مؤقت دون حفظ أوزان النموذج في التخزين الدائم للموقع. قد يلزم تنزيلها مجددًا بعد إغلاق الصفحة.</Typography>}
    <Button onClick={cancel} sx={{mt: 1}}>{cancelLabel}</Button>
  </Box>;
}
