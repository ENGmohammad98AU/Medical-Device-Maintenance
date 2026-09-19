export interface FilterableFaultReport {
  device_id: number;
  alarm_code?: string | null;
  error_message: string;
  description?: string | null;
  severity: string;
  status: string;
}

export interface FilterableDevice {
  id: number;
  name: string;
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;
  status?: string | null;
}

export interface FaultReportFilters {
  query: string;
  deviceId: string;
  deviceStatus: string;
  severity: string;
  reportStatus: string;
}

export const normalizeEnumValue = (value?: string | null) =>
  (value || '').trim().toLowerCase();

const normalizeSearchText = (value?: string | number | null) =>
  String(value ?? '').trim().toLowerCase();

export function filterFaultReports<T extends FilterableFaultReport>(
  reports: T[],
  devices: FilterableDevice[],
  filters: FaultReportFilters,
): T[] {
  const deviceById = new Map(devices.map((device) => [device.id, device]));
  const queryTerms = normalizeSearchText(filters.query).split(/\s+/).filter(Boolean);

  return reports.filter((report) => {
    const device = deviceById.get(report.device_id);

    if (filters.deviceId && report.device_id !== Number(filters.deviceId)) return false;
    if (
      filters.deviceStatus
      && normalizeEnumValue(device?.status) !== normalizeEnumValue(filters.deviceStatus)
    ) return false;
    if (
      filters.severity
      && normalizeEnumValue(report.severity) !== normalizeEnumValue(filters.severity)
    ) return false;
    if (
      filters.reportStatus
      && normalizeEnumValue(report.status) !== normalizeEnumValue(filters.reportStatus)
    ) return false;

    if (!queryTerms.length) return true;

    const searchableText = [
      report.error_message,
      report.description,
      report.alarm_code,
      report.severity,
      report.status,
      device?.name,
      device?.manufacturer,
      device?.model,
      device?.serial_number,
      device?.status,
    ].map(normalizeSearchText).join(' ');

    return queryTerms.every((term) => searchableText.includes(term));
  });
}
