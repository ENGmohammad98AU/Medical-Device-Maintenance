import { Alert, Box, Button, Typography } from '@mui/material';
import type { useLocalModel } from '../hooks/useLocalModel';
import { localErrorText } from '../llm/localModelContract';

export default function LocalModelPreparation({model, disabled = false}: {
  model: ReturnType<typeof useLocalModel>; disabled?: boolean;
}) {
  return <Box sx={{my: 2}}>
    <Button variant="outlined" onClick={() => void model.prepare()}
      disabled={disabled || model.preparing || model.ready}>تجهيز اختياري للنموذج</Button>
    <Typography variant="body2" sx={{mt: 1}}>{model.ready
      ? 'النموذج جاهز. يبقى مجهزًا عند التنقل بين صفحات الصيانة وتقارير الأعطال.'
      : 'التجهيز المسبق اختياري. النظام يبحث في المراجع أولًا، ولا يحتاج Qwen إلا عندما تتطلب المراجع اختيارًا دلاليًا. التجهيز الآن يختصر زمن تلك الحالات لاحقًا.'}</Typography>
    {model.preparation?.status === 'error' && <Alert severity="warning" sx={{mt: 1}}>
      {localErrorText[model.preparation.error_code || 'load_failed']}</Alert>}
  </Box>;
}
