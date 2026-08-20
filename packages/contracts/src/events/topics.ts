export const KAFKA_TOPICS = {
  ATTENDANCE_RAW: 'attendance.raw.v1',
  ATTENDANCE_NORMALIZED: 'attendance.normalized.v1',
  ATTENDANCE_NORMALIZATION_FAILED: 'attendance.normalization-failed.v1',
  DEVICE_STATUS: 'device.status.v1',
  DEVICE_COMMAND: 'device.command.v1',
  DEVICE_COMMAND_RESULT: 'device.command-result.v1',
  SYNC_REQUESTED: 'sync.requested.v1',
  SYNC_COMPLETED: 'sync.completed.v1',
  SYNC_FAILED: 'sync.failed.v1',
  INTEGRATION_DELIVERY: 'integration.delivery.v1',
  INTEGRATION_DELIVERY_FAILED: 'integration.delivery-failed.v1',
  DEAD_LETTER_QUEUE: 'attendance.dlq.v1',
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];
