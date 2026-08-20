import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  correlationId: string;
  tenantId?: string;
  organizationId?: string;
  deviceId?: string;
  userId?: string;
}

const contextStorage = new AsyncLocalStorage<RequestContext>();

export const ObservabilityContext = {
  run<R>(context: RequestContext, callback: () => R): R {
    return contextStorage.run(context, callback);
  },

  get(): RequestContext | undefined {
    return contextStorage.getStore();
  },

  getCorrelationId(): string {
    return contextStorage.getStore()?.correlationId || `gen-${Date.now()}`;
  },
};
