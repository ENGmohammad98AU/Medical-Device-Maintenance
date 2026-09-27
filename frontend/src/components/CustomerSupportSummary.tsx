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
  return <Box dir="ltr" lang="en" sx={{mb: 2, textAlign: 'left'}}>
    <Alert severity={support.status === 'SELECTED' ? 'success' : 'info'}>{support.message}</Alert>
    {support.result?.error_code && <Typography sx={{mt: 1}}>
      {localErrorText[support.result.error_code as LocalError] || 'Local reference selection could not finish.'}
    </Typography>}
    {!referenceFound && support.reference_status !== 'NO_MATCHING_REFERENCE' && support.status === 'FALLBACK'
      && <Typography sx={{mt: 1}}>No matching reference is currently available. Add the alarm code and symptoms, or request review by a biomedical engineer.</Typography>}
    {!!support.questions?.length && <Box sx={{mt: 2}}>
      <Typography variant="subtitle2">Details needed to continue the analysis:</Typography>
      <Box component="ul" sx={{my: 1, paddingInlineStart: 3}}>
        {support.questions.map(question => <li key={question}>{question}</li>)}
      </Box>
    </Box>}
    {support.selected_reference_id && <Typography variant="body2" sx={{mt: 1}}>
      Selected reference: {support.selected_reference_id} — requires specialist review.
    </Typography>}
  </Box>;
}
