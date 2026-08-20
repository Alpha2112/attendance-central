export function buildKafkaDeviceKey(
  organizationId: string | number,
  deviceId: string | number,
  tenantId?: string | number,
): string {
  if (tenantId) {
    return `${tenantId}:${organizationId}:${deviceId}`;
  }
  return `${organizationId}:${deviceId}`;
}

export function buildKafkaEmployeeKey(
  organizationId: string | number,
  employeeId: string,
  tenantId?: string | number,
): string {
  if (tenantId) {
    return `${tenantId}:${organizationId}:${employeeId}`;
  }
  return `${organizationId}:${employeeId}`;
}
