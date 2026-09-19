import { describe, expect, it } from 'vitest';
import { filterFaultReports } from './faultReportFilters';

const devices = [
  {
    id: 1,
    name: 'Hamilton C6 Ventilator',
    manufacturer: 'Hamilton Medical',
    model: 'C6',
    serial_number: 'VENT-001',
    status: 'operational',
  },
  {
    id: 2,
    name: 'Philips MX800 Monitor',
    manufacturer: 'Philips',
    model: 'MX800',
    serial_number: 'MON-002',
    status: 'maintenance_required',
  },
];

const reports = [
  {
    id: 10,
    device_id: 1,
    alarm_code: 'O2-LOW',
    error_message: 'Low oxygen supply',
    description: 'Oxygen inlet pressure is low',
    severity: 'critical',
    status: 'open',
  },
  {
    id: 11,
    device_id: 2,
    alarm_code: 'LEAD-OFF',
    error_message: 'ECG lead disconnected',
    description: 'Check the patient cable',
    severity: 'medium',
    status: 'resolved',
  },
];

const emptyFilters = {
  query: '',
  deviceId: '',
  deviceStatus: '',
  severity: '',
  reportStatus: '',
};

describe('filterFaultReports', () => {
  it('matches API enum values regardless of case', () => {
    expect(filterFaultReports(reports, devices, {
      ...emptyFilters,
      severity: 'CRITICAL',
      reportStatus: 'OPEN',
    })).toEqual([reports[0]]);
  });

  it('searches device identity and fault text', () => {
    expect(filterFaultReports(reports, devices, {
      ...emptyFilters,
      query: 'Hamilton oxygen',
    })).toEqual([reports[0]]);

    expect(filterFaultReports(reports, devices, {
      ...emptyFilters,
      query: 'MON-002 lead',
    })).toEqual([reports[1]]);
  });

  it('filters independently by device and device status', () => {
    expect(filterFaultReports(reports, devices, {
      ...emptyFilters,
      deviceId: '2',
      deviceStatus: 'MAINTENANCE_REQUIRED',
    })).toEqual([reports[1]]);
  });

  it('returns all reports again after filters are cleared', () => {
    expect(filterFaultReports(reports, devices, emptyFilters)).toEqual(reports);
  });
});
