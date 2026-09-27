import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import GeneratedGuidanceSummary from './GeneratedGuidanceSummary';

describe('English generated answer and evidence', () => {
  it('renders the answer left to right with server-provided source attribution', () => {
    const html = renderToStaticMarkup(<GeneratedGuidanceSummary guidance={{
      status: 'DRAFT', text: 'The cause is unconfirmed. Inspect the visible wheel.',
      message: 'Specialist review is required.', evidence_status: 'REFERENCE_PROVIDED',
      sources: [{reference_id: 'REF-1', source: 'Manufacturer manual', reference_page: '12',
        reference_url: 'https://example.test/manual.pdf'}],
    }} />);
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('lang="en"');
    expect(html).toContain('https://example.test/manual.pdf');
    expect(html).toContain('page 12');
    expect(html).toContain('REF-1');
    expect(html).not.toMatch(/[\u0600-\u06ff]/u);
  });

  it('does not render rejected text as an answer', () => {
    const html = renderToStaticMarkup(<GeneratedGuidanceSummary guidance={{
      status: 'BLOCKED', text: 'Unacceptable text', message: 'Specialist review is required.',
    }} />);
    expect(html).not.toContain('Unacceptable text');
    expect(html).toContain('Specialist review is required.');
  });
});
