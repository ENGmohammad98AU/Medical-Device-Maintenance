import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LLMTriageSummary from './LLMTriageSummary';

describe('LLM classification provenance', () => {
  it('shows a genuine LLM result and proposed review destination', () => {
    const html = renderToStaticMarkup(<LLMTriageSummary result={{
      classification_source: 'LLM_WITH_RULE_GUARDS', routing_target: 'MANUFACTURER_SUPPORT',
      llm: { status: 'success', model: 'test-model' },
    }} />);
    expect(html).toContain('نموذج لغوي مع قواعد السلامة');
    expect(html).toContain('test-model');
    expect(html).toContain('دعم الشركة المصنّعة');
    expect(html).toContain('جهة المراجعة المقترحة');
  });
  it('does not label fallback results as model outputs', () => {
    const html = renderToStaticMarkup(<LLMTriageSummary result={{ classification_source: 'RULES', llm: { status: 'error' } }} />);
    expect(html).toContain('تعذر استخدام النموذج');
    expect(html).toContain('التصنيف: القواعد المرجعية');
    expect(html).not.toContain('التصنيف: نموذج لغوي');
  });
  it('shows abstention without claiming a successful classification', () => {
    const html = renderToStaticMarkup(<LLMTriageSummary result={{ classification_source: 'REVIEW_REQUIRED', llm: { status: 'success' } }} />);
    expect(html).toContain('يرجى توضيح الأعراض');
    expect(html).not.toContain('التصنيف: نموذج لغوي');
  });
});
