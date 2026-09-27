import { Alert, Box, Typography } from '@mui/material';

export interface GeneratedGuidance {
  status: 'DRAFT' | 'BLOCKED' | 'UNAVAILABLE'; text: string; message: string;
  latency_ms?: number;
}

export default function GeneratedGuidanceSummary({guidance}: {guidance?: GeneratedGuidance | null}) {
  if (!guidance) return null;
  return <Box sx={{my: 2}} data-testid="generated-guidance">
    <Typography variant="h6" gutterBottom>إرشادات مولّدة بالنموذج</Typography>
    <Alert severity={guidance.status === 'DRAFT' ? 'info' : 'warning'}>{guidance.message}</Alert>
    {guidance.status === 'DRAFT' && <Typography sx={{mt: 2, whiteSpace: 'pre-line'}}>{guidance.text}</Typography>}
  </Box>;
}
