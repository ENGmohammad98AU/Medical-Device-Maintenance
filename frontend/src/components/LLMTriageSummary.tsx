import { Alert, Box, Chip, Typography } from '@mui/material';

export interface TriageMetadata {
  classification_source?: string;
  routing_target?: string;
  safety_guards?: string[];
  llm?: {
    status: 'disabled' | 'unavailable' | 'success' | 'refused' | 'invalid_response' | 'error';
    model?: string | null;
    requested_model?: string | null;
    provider?: string | null;
    error_code?: string | null;
  };
}

const destinations: Record<string, string> = {
  BIOMEDICAL_ENGINEERING: 'الهندسة الطبية',
  CLINICAL_TEAM: 'الفريق السريري',
  MANUFACTURER_SUPPORT: 'دعم الشركة المصنّعة عبر المهندس المسؤول',
  TECHNICAL_SUPPORT: 'الدعم الفني',
  REQUEST_CLARIFICATION: 'استكمال وصف البلاغ',
};

export default function LLMTriageSummary({ result }: { result: TriageMetadata }) {
  const source = result.classification_source;
  const used = source === 'LLM_WITH_RULE_GUARDS';
  const abstained = source === 'REVIEW_REQUIRED';
  const unavailable = result.llm && !['disabled', 'success'].includes(result.llm.status);
  return <Box sx={{ mb: 2 }}>
    <Chip color={used ? 'primary' : 'default'} sx={{ mb: 1 }} label={
      used ? 'التصنيف: نموذج لغوي مع قواعد السلامة' : abstained ? 'التصنيف: يحتاج توضيحًا ومراجعة' : 'التصنيف: القواعد المرجعية'
    } />
    {used && result.llm?.model && <Typography variant="body2" sx={{ mb: 1 }}>النموذج: {result.llm.model}</Typography>}
    {unavailable && <Alert severity="warning" sx={{ mb: 1 }}>
      {result.llm?.error_code === 'rate_limit'
        ? 'بلغ مزوّد النموذج حد الاستخدام المتاح مؤقتًا. يمكنك المحاولة لاحقًا. '
        : 'تعذر استخدام النموذج اللغوي لهذا البلاغ. '}
      تعتمد النتيجة الحالية على القواعد وتتطلب مراجعة المختص.
    </Alert>}
    {abstained && <Alert severity="info" sx={{ mb: 1 }}>لم ينتج النموذج تصنيفًا قابلًا للاعتماد. يرجى توضيح الأعراض ومراجعة المختص.</Alert>}
    {!!result.safety_guards?.length && <Typography variant="body2" sx={{ mb: 1 }}>رُفعت أولوية المراجعة أو حُفظت وفق قواعد السلامة.</Typography>}
    {result.routing_target && <Typography variant="body2"><strong>جهة المراجعة المقترحة:</strong> {destinations[result.routing_target] || 'مراجعة المختص'}</Typography>}
    <Typography variant="caption" color="text.secondary">التصنيف أولي؛ يعتمد قرار الإسناد والإجراء النهائي على مراجعة المختص.</Typography>
  </Box>;
}
