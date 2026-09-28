import { Alert, Box, Button, Typography } from '@mui/material';
import type { useLocalModel } from '../hooks/useLocalModel';
import { localResultError } from '../llm/localModelContract';

export default function LocalModelPreparation({model, disabled = false}: {
  model: ReturnType<typeof useLocalModel>; disabled?: boolean;
}) {
  return <Box sx={{my: 2}}>
    <Button variant="outlined" onClick={() => void model.prepare()}
      disabled={disabled || model.preparing || model.ready}>تجهيز النموذج مسبقًا</Button>
    <Typography variant="body2" sx={{mt: 1}}>{model.ready
      ? 'النموذج جاهز. يبقى مجهزًا عند التنقل بين صفحات الصيانة وتقارير الأعطال.'
      : 'جهّز النموذج قبل التحليل. تنزيل الملف الأول يعتمد على سرعة الاتصال؛ بعد توفره تستغرق محاولة التهيئة حتى دقيقتين، والتحليل بعدها حتى 45 ثانية.'}</Typography>
    {model.preparation?.status === 'success' && model.preparation.preparation_ms !== undefined && <Typography variant="caption">
      مدة التجهيز الأخير: {(model.preparation.preparation_ms / 1000).toFixed(1)} ثانية، بما فيها تحميل الملفات.
    </Typography>}
    {model.preparation?.status === 'error' && <Alert severity="warning" sx={{mt: 1}} data-testid="model-preparation-error">
      {localResultError(model.preparation)}</Alert>}
  </Box>;
}
