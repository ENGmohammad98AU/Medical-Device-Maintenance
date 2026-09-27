import {describe, expect, it} from 'vitest';
import {normalizeReportText} from './reportText.js';
import {localModelConfig, serializeInput} from './localModelContract';

describe('report normalization', () => {
  it('corrects known spelling while preserving codes, negation and the audited input', () => {
    const report = 'BATTARY LOW; no oxigen alarm; E42_BATERY';
    expect(normalizeReportText(report, localModelConfig.report_spelling))
      .toBe('battery LOW; no oxygen alarm; E42_BATERY');
    expect(serializeInput({report_text: report, device_type: 'PATIENT_MONITOR', patient_connected: false}))
      .toContain('BATTARY LOW');
  });
  it('leaves unrecognized words and ambiguous reports intact', () => {
    expect(normalizeReportText('شيء غريب E1234', localModelConfig.report_spelling)).toBe('شيء غريب E1234');
  });
});
