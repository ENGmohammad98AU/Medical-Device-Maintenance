import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { categoryToken, serializeInput } from './localModelContract';

describe('local model boundary', () => {
  it('rejects arbitrary output and unsupported category codes', () => {
    for (const value of ['', 'A extra instructions', 'POWER', 'toString', '<script>']) {
      expect(() => categoryToken(value)).toThrow('invalid_output');
    }
  });
  it('binds the result to the complete input including patient context', () => {
    const input = {report_text: '  بطارية لا تشحن  ', device_type: 'VENTILATOR', patient_connected: false};
    expect(serializeInput(input)).toBe('{"report_text":"بطارية لا تشحن","device_type":"VENTILATOR","patient_connected":false}');
    const hash = (text: string) => createHash('sha256').update(text).digest('hex');
    expect(hash(serializeInput(input))).not.toBe(hash(serializeInput({...input, patient_connected: true})));
  });
});
