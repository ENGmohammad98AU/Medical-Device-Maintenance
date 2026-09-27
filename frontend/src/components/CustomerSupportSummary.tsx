import { Alert, Box, Typography } from '@mui/material';
import { localErrorText, type LocalError } from '../llm/localModelContract';

export interface CustomerSupportMetadata {
  status: string; message: string; questions?: string[];
  reference_status?: string; selected_reference_id?: string;
  result?: {error_code?: string};
}

export default function CustomerSupportSummary({support, referenceFound}: {
  support: CustomerSupportMetadata; referenceFound: boolean;
}) {
  return <Box sx={{mb: 2}}>
    <Alert severity={support.status === 'SELECTED' ? 'success' : 'info'}>{support.message}</Alert>
    {support.result?.error_code && <Typography sx={{mt: 1}}>
      {localErrorText[support.result.error_code as LocalError] || 'تعذر إكمال اختيار المرجع محليًا.'}
    </Typography>}
    {!referenceFound && support.reference_status !== 'NO_MATCHING_REFERENCE' && support.status === 'FALLBACK'
      && <Typography sx={{mt: 1}}>لا يوجد مرجع مطابق حاليًا. أضف رمز الإنذار ووصف الأعراض، أو اطلب مراجعة مهندس الأجهزة الطبية.</Typography>}
    {!!support.questions?.length && <Box sx={{mt: 2}}>
      <Typography variant="subtitle2">المعلومات المطلوبة لاستكمال التحليل:</Typography>
      <Box component="ul" sx={{my: 1, paddingInlineStart: 3}}>
        {support.questions.map(question => <li key={question}>{question}</li>)}
      </Box>
    </Box>}
    {support.selected_reference_id && <Typography variant="body2" sx={{mt: 1}}>
      المرجع المقترح: {support.selected_reference_id} — يحتاج اعتماد المختص.
    </Typography>}
  </Box>;
}
