import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import CustomerSupportSummary from './CustomerSupportSummary';

describe('support outcome', () => {
  it('shows the actual clarification questions when no reference is available', () => {
    const html = renderToStaticMarkup(<CustomerSupportSummary referenceFound={false} support={{
      status: 'NO_REFERENCE', reference_status: 'NO_MATCHING_REFERENCE',
      message: 'No reference matches Philips MX800', questions: ['Does the alarm come from an X2/X3 module?'],
    }} />);
    expect(html).toContain('Philips MX800');
    expect(html).toContain('X2/X3');
    expect(html).toContain('Details needed');
    expect(html).not.toContain('Selected reference:');
  });
  it('retains the selected source and tolerates older response shapes', () => {
    const html = renderToStaticMarkup(<CustomerSupportSummary referenceFound support={{
      status: 'SELECTED', message: 'Reference selected', selected_reference_id: 'BB-PS-002',
    }} />);
    expect(html).toContain('BB-PS-002');
    expect(html).not.toContain('Details needed');
  });
});
