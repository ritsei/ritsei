export { SalesCapabilities } from "./src/capabilities.ts"
export {
  SalesConfirmOrderAction,
  SalesOrderConfirmedEvent,
  SalesOrderConfirmedEventPayload,
  SalesTypedActionCatalog,
  SalesTypedEventCatalog,
} from "./src/catalog.ts"
export {
  CancelConfirmedOrderInput,
  ConfirmOrderInput,
  CreateCustomerInput,
  CreateOrderInput,
  CreateQuotationInput,
  Customer,
  GetConfirmedOrderTotalInput,
  GetCustomerInput,
  GetOrderInput,
  GetQuotationInput,
  ListCustomersInput,
  ListOrdersInput,
  ListQuotationsInput,
  Quotation,
  QuotationStatus,
  SalesOrder,
  SalesOrderLine,
  SalesOrderStatus,
  SalesService,
} from "./src/contract.ts"
export {
  CustomerAlreadyExists,
  CustomerNotFound,
  QuotationCustomerMismatch,
  QuotationNotFound,
  SalesOrderConfirmationIdempotencyConflict,
  SalesOrderInvalidState,
  SalesOrderNotFound,
} from "./src/errors.ts"
export { makeSalesService, makeSalesTestLayer, SalesLive } from "./src/layers.ts"
export type {
  Customer as CustomerType,
  Quotation as QuotationType,
  QuotationStatus as QuotationStatusType,
  SalesOrder as SalesOrderType,
  SalesOrderLine as SalesOrderLineType,
  SalesOrderStatus as SalesOrderStatusType,
  SalesService as SalesServiceShape,
} from "./src/contract.ts"
