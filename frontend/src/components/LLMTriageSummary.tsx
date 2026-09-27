import { Alert, Box, Chip, Typography } from '@mui/material';
import { categoryLabels, localErrorText, type LocalError } from '../llm/localModelContract';

export interface TriageMetadata {
  classification_source?: string;
  routing_target?: string;
  fault_category?: string | null;
  safety_guards?: string[];
  llm?: {
    status: 'disabled' | 'unavailable' | 'success' | 'refused' | 'invalid_response' | 'error';
    model?: string | null;
    requested_model?: string | null;
    provider?: string | null;
    error_code?: string | null;
    client_reported?: boolean;
    reused_result?: boolean;
  };
}

const destinations: Record<string, string> = {
  BIOMEDICAL_ENGINEERING: 'Biomedical engineering',
  CLINICAL_TEAM: 'Clinical team',
  MANUFACTURER_SUPPORT: 'Manufacturer support via the responsible engineer',
  TECHNICAL_SUPPORT: 'Technical support',
  REQUEST_CLARIFICATION: 'Clarify the report',
};

export default function LLMTriageSummary({ result }: { result: TriageMetadata }) {
  const source = result.classification_source;
  const used = source === 'LLM_WITH_RULE_GUARDS';
  const local = source === 'BROWSER_LLM_CATEGORY_WITH_RULE_GUARDS';
  const abstained = source === 'REVIEW_REQUIRED';
  const unavailable = result.llm && !['disabled', 'success'].includes(result.llm.status);
  return <Box dir="ltr" lang="en" sx={{ mb: 2, textAlign: 'left' }}>
    <Chip color={used || local ? 'primary' : 'default'} sx={{ mb: 1 }} label={
      local ? 'Category: local model; severity: server rules' : used ? 'Classification: LLM with safety rules' : abstained ? 'Classification: clarification and review required' : 'Classification: reference rules'
    } />
    {(used || local || abstained) && result.llm?.model && <Typography variant="body2" sx={{ mb: 1, overflowWrap: 'anywhere' }}>Model: {result.llm.model}</Typography>}
    {local && result.fault_category && <Typography variant="body2" sx={{mb: 1}}>Proposed fault category: {categoryLabels[result.fault_category] || result.fault_category}</Typography>}
    {result.llm?.reused_result && <Typography variant="body2" sx={{mb: 1}}>The result was reused for the same report and context in this session. The server checked the references again.</Typography>}
    {result.llm?.client_reported && result.llm.status === 'success' && <Typography variant="caption" component="p" sx={{mb: 1}}>Browser-reported result: server checks validate its structure and context, not proof of model execution or factual accuracy.</Typography>}
    {unavailable && <Alert severity="warning" sx={{ mb: 1 }}>
      {result.llm?.error_code === 'browser_prompt_mismatch'
        ? 'The report-processing version changed. Refresh the page, prepare the model, and analyze again. '
        : result.llm?.provider === 'browser-local'
        ? `${localErrorText[result.llm.error_code as LocalError] || 'No valid local result is available for this report.'} `
        : result.llm?.error_code === 'rate_limit'
        ? 'The model provider reached its temporary usage limit. Try again later. '
        : 'The language model was unavailable for this report. '}
      The current result uses rules and requires specialist review.
    </Alert>}
    {abstained && <Alert severity="info" sx={{ mb: 1 }}>The model did not produce an acceptable classification. Please clarify the symptoms and request specialist review.</Alert>}
    {!!result.safety_guards?.length && <Typography variant="body2" sx={{ mb: 1 }}>Review priority was raised or preserved by the safety rules.</Typography>}
    {result.routing_target && <Typography variant="body2"><strong>Proposed review destination:</strong> {destinations[result.routing_target] || 'Specialist review'}</Typography>}
    <Typography variant="caption" color="text.secondary">Classification is preliminary. Routing and final actions require specialist review.</Typography>
  </Box>;
}
