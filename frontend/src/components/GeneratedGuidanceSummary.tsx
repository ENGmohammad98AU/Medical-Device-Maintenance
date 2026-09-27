import { Alert, Box, Link, Typography } from '@mui/material';

export interface GeneratedGuidance {
  status: 'DRAFT' | 'BLOCKED' | 'UNAVAILABLE'; text: string; message: string;
  latency_ms?: number;
  evidence_status?: 'REFERENCE_PROVIDED' | 'NO_MATCHING_REFERENCE';
  sources?: {reference_id: string; source: string; reference_url: string; reference_page: string}[];
}

export default function GeneratedGuidanceSummary({guidance}: {guidance?: GeneratedGuidance | null}) {
  if (!guidance) return null;
  return <Box dir="ltr" lang="en" sx={{my: 2, textAlign: 'left'}} data-testid="generated-guidance">
    <Typography variant="h6" gutterBottom>AI-generated answer</Typography>
    <Alert severity={guidance.status === 'DRAFT' ? 'info' : 'warning'}>{guidance.message}</Alert>
    {guidance.status === 'DRAFT' && <>
      <Typography sx={{mt: 2, whiteSpace: 'pre-line'}}>{guidance.text}</Typography>
      {guidance.sources?.map(source => <Typography variant="body2" key={source.reference_id} sx={{mt: 1}}>
        Source supplied to the model: <Link href={source.reference_url} target="_blank" rel="noopener noreferrer">{source.source}</Link>
        {source.reference_page ? `, page ${source.reference_page}` : ''} ({source.reference_id})
      </Typography>)}
    </>}
  </Box>;
}
