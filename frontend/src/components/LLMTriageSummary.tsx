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
  BIOMEDICAL_ENGINEERING: 'الهندسة الطبية',
  CLINICAL_TEAM: 'الفريق السريري',
  MANUFACTURER_SUPPORT: 'دعم الشركة المصنّعة عبر المهندس المسؤول',
  TECHNICAL_SUPPORT: 'الدعم الفني',
  REQUEST_CLARIFICATION: 'استكمال وصف البلاغ',
};

export default function LLMTriageSummary({ result }: { result: TriageMetadata }) {
  const source = result.classification_source;
  const used = source === 'LLM_WITH_RULE_GUARDS';
  const local = source === 'BROWSER_LLM_CATEGORY_WITH_RULE_GUARDS';
  const abstained = source === 'REVIEW_REQUIRED';
  const unavailable = result.llm && !['disabled', 'success'].includes(result.llm.status);
  return <Box sx={{ mb: 2 }}>
    <Chip color={used || local ? 'primary' : 'default'} sx={{ mb: 1 }} label={
      local ? 'فئة العطل: نموذج محلي — الخطورة: قواعد الخادم' : used ? 'التصنيف: نموذج لغوي مع قواعد السلامة' : abstained ? 'التصنيف: يحتاج توضيحًا ومراجعة' : 'التصنيف: القواعد المرجعية'
    } />
    {(used || local || abstained) && result.llm?.model && <Typography variant="body2" sx={{ mb: 1, overflowWrap: 'anywhere' }}>النموذج: {result.llm.model}</Typography>}
    {local && result.fault_category && <Typography variant="body2" sx={{mb: 1}}>فئة العطل المقترحة: {categoryLabels[result.fault_category] || result.fault_category}</Typography>}
    {result.llm?.reused_result && <Typography variant="body2" sx={{mb: 1}}>أُعيد استخدام نتيجة النموذج لنفس الوصف والسياق خلال هذه الجلسة، مع إعادة تحقق الخادم من المراجع.</Typography>}
    {result.llm?.client_reported && result.llm.status === 'success' && <Typography variant="caption" component="p" sx={{mb: 1}}>نتيجة أرسلها المتصفح؛ يتحقق الخادم من بنيتها وسياقها، ولا يثبت ذلك تنفيذ النموذج أو صحة اقتراحه.</Typography>}
    {unavailable && <Alert severity="warning" sx={{ mb: 1 }}>
      {result.llm?.provider === 'browser-local'
        ? `${localErrorText[result.llm.error_code as LocalError] || 'لم تتوفر نتيجة محلية صالحة لهذا البلاغ.'} `
        : result.llm?.error_code === 'rate_limit'
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
