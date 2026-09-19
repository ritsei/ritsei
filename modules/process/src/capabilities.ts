export const ProcessCapabilities = {
  orderConfirmationRecover: "process.order_confirmation.recover",
  orderConfirmationManualRecovery: "process.order_confirmation.manual_recovery",
  catalogRead: "process.catalog.read",
  definitionValidate: "process.definition.validate",
  monitorRead: "process.monitor.read",
  inboxRead: "process.inbox.read",
  historyRead: "process.history.read",
  runtimeRetry: "process.runtime.retry",
  runtimeCompensate: "process.runtime.compensate",
  runtimeManualRecovery: "process.runtime.manual_recovery",
} as const
