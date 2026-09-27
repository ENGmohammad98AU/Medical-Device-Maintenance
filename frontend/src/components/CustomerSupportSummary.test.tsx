import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import CustomerSupportSummary from './CustomerSupportSummary';

describe('support outcome', () => {
  it('shows the actual clarification questions when no reference is available', () => {
    const html = renderToStaticMarkup(<CustomerSupportSummary referenceFound={false} support={{
      status: 'NO_REFERENCE', reference_status: 'NO_MATCHING_REFERENCE',
      message: 'لا يوجد مرجع مطابق لجهاز Philips MX800', questions: ['هل الإنذار صادر عن وحدة X2/X3؟'],
    }} />);
    expect(html).toContain('Philips MX800');
    expect(html).toContain('X2/X3');
    expect(html).toContain('المعلومات المطلوبة');
    expect(html).not.toContain('المرجع المقترح:');
  });
  it('retains the selected source and tolerates older response shapes', () => {
    const html = renderToStaticMarkup(<CustomerSupportSummary referenceFound support={{
      status: 'SELECTED', message: 'اختير المرجع', selected_reference_id: 'BB-PS-002',
    }} />);
    expect(html).toContain('BB-PS-002');
    expect(html).not.toContain('المعلومات المطلوبة');
  });
});
