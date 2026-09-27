import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LLMTriageSummary from './LLMTriageSummary';

describe('LLM classification provenance', () => {
  it('distinguishes local category inference from server severity', () => {
    const html = renderToStaticMarkup(<LLMTriageSummary result={{
      classification_source: 'BROWSER_LLM_CATEGORY_WITH_RULE_GUARDS', fault_category: 'POWER',
      llm: {status: 'success', provider: 'browser-local', model: 'Qwen3', client_reported: true},
    }} />);
    expect(html).toContain('severity: server rules');
    expect(html).toContain('Power and battery');
    expect(html).toContain('Browser-reported result');
  });
  it('shows a genuine LLM result and proposed review destination', () => {
    const html = renderToStaticMarkup(<LLMTriageSummary result={{
      classification_source: 'LLM_WITH_RULE_GUARDS', routing_target: 'MANUFACTURER_SUPPORT',
      llm: { status: 'success', model: 'test-model' },
    }} />);
    expect(html).toContain('LLM with safety rules');
    expect(html).toContain('test-model');
    expect(html).toContain('Manufacturer support');
    expect(html).toContain('Proposed review destination');
  });
  it('does not label fallback results as model outputs', () => {
    const html = renderToStaticMarkup(<LLMTriageSummary result={{ classification_source: 'RULES', llm: { status: 'error' } }} />);
    expect(html).toContain('The language model was unavailable');
    expect(html).toContain('Classification: reference rules');
    expect(html).not.toContain('Classification: LLM');
  });
  it('shows abstention without claiming a successful classification', () => {
    const html = renderToStaticMarkup(<LLMTriageSummary result={{ classification_source: 'REVIEW_REQUIRED', llm: { status: 'success' } }} />);
    expect(html).toContain('Please clarify the symptoms');
    expect(html).not.toContain('Classification: LLM');
  });
  it('explains quota exhaustion and labels the fallback as rules', () => {
    const html = renderToStaticMarkup(<LLMTriageSummary result={{
      classification_source: 'RULES', llm: { status: 'error', provider: 'groq', error_code: 'rate_limit' },
    }} />);
    expect(html).toContain('temporary usage limit');
    expect(html).toContain('Classification: reference rules');
    expect(html).not.toContain('Classification: LLM');
  });
});
