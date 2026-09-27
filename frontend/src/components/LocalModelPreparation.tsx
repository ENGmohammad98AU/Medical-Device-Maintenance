import { Alert, Box, Button, Typography } from '@mui/material';
import type { useLocalModel } from '../hooks/useLocalModel';
import { localErrorText } from '../llm/localModelContract';

export default function LocalModelPreparation({model, disabled = false}: {
  model: ReturnType<typeof useLocalModel>; disabled?: boolean;
}) {
  return <Box sx={{my: 2}}>
    <Button variant="outlined" onClick={() => void model.prepare()}
      disabled={disabled || model.preparing || model.ready}>تجهيز النموذج مسبقًا</Button>
    <Typography variant="body2" sx={{mt: 1}}>{model.ready
      ? 'النموذج جاهز. يبقى مجهزًا عند التنقل بين صفحات الصيانة وتقارير الأعطال.'
      : 'جهّز النموذج قبل التحليل. التنزيل والتهيئة الأولى قد يستغرقان دقائق؛ بعدها تبدأ مهلة التحليل من دون إعادة التجهيز لكل بلاغ.'}</Typography>
    {model.preparation?.status === 'error' && <Alert severity="warning" sx={{mt: 1}}>
      {localErrorText[model.preparation.error_code || 'load_failed']}</Alert>}
  </Box>;
}
