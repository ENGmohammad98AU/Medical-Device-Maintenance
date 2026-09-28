import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { categoryToken, serializeInput, serverModelResult, localResultError, localModelConfig } from './localModelContract';

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
  it('keeps local diagnostic and preparation metadata out of the strict API payload', () => {
    const result = {status: 'error' as const, revision: localModelConfig.revision, error_code: 'timeout' as const,
      latency_ms: 120000, preparation_ms: 120000, inference_ms: 0,
      timeout_phase: 'preparation' as const, compute_diagnostic: 'GPU preparation failed: device allocation failed',
      preparation_threads: 4, preparation_version: 'preparation-version'};
    expect(serverModelResult(result)).toEqual({status: 'error', revision: result.revision, error_code: 'timeout',
      latency_ms: 120000, preparation_ms: 120000, inference_ms: 0});
    expect(result.compute_diagnostic).toContain('allocation failed');
  });
  it('does not describe a preparation or download timeout as a 45-second inference timeout', () => {
    const result = {status: 'error' as const, revision: localModelConfig.revision, error_code: 'timeout' as const, latency_ms: 0};
    expect(localResultError({...result, timeout_phase: 'preparation'})).toContain('120 seconds');
    expect(localResultError({...result, timeout_phase: 'download'})).toContain('15 minutes');
    expect(localResultError({...result, timeout_phase: 'inference'})).toContain('45-second');
  });
});
