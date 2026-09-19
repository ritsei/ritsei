import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { AuthorizationService } from "../../authorization/mod.ts"
import { Principal } from "../../auth/mod.ts"
import { FinancialMajorAmount, uuidv7 } from "../../../foundation/mod.ts"
import { SalesCapabilities } from "./capabilities.ts"
import { SalesOrderConfirmedEvent, SalesOrderConfirmedEventPayload } from "./events.ts"
import { MessagingService } from "../../messaging/mod.ts"
import {
  CancelConfirmedOrderInput,
  ConfirmOrderInput,
  CreateCustomerInput,
  CreateOrderInput,
  CreateQuotationInput,
  GetConfirmedOrderTotalInput,
  GetCustomerInput,
  GetOrderInput,
  GetQuotationInput,
  ListCustomersInput,
  ListOrdersInput,
  ListQuotationsInput,
  SalesService,
} from "./contract.ts"
import {
  CustomerNotFound,
  QuotationNotFound,
  SalesOrderConfirmationIdempotencyConflict,
  SalesOrderInvalidState,
  SalesOrderNotFound,
} from "./errors.ts"
import type { SalesStore } from "./store.ts"

export const makeSalesServiceFromStore = <R>(storeEffect: Effect.Effect<SalesStore, never, R>) =>
  Effect.gen(function* () {
    const store = yield* storeEffect
    const authorization = yield* AuthorizationService
    const messaging = yield* MessagingService
    const authorize = (
      input: { principal: Schema.Schema.Type<typeof Principal>; tenantId: string },
      capability: string,
    ) =>
      authorization.authorize({ principal: input.principal, tenantId: input.tenantId, capability })
    const listCustomers = Effect.fn("SalesService.listCustomers")(function* (input: unknown) {
      const decoded = yield* Schema.decodeUnknownEffect(ListCustomersInput)(input)
      yield* authorize(decoded, SalesCapabilities.customerRead)
      return yield* store.listCustomers(decoded)
    })
    const getCustomer = Effect.fn("SalesService.getCustomer")(function* (input: unknown) {
      const decoded = yield* Schema.decodeUnknownEffect(GetCustomerInput)(input)
      yield* authorize(decoded, SalesCapabilities.customerRead)
      const customer = yield* store.getCustomer(decoded)
      if (customer === undefined) {
        return yield* Effect.fail(
          new CustomerNotFound({ tenantId: decoded.tenantId, customerId: decoded.customerId }),
        )
      }
      return customer
    })
    const listQuotations = Effect.fn("SalesService.listQuotations")(function* (input: unknown) {
      const decoded = yield* Schema.decodeUnknownEffect(ListQuotationsInput)(input)
      yield* authorize(decoded, SalesCapabilities.quotationRead)
      return yield* store.listQuotations(decoded)
    })
    const getQuotation = Effect.fn("SalesService.getQuotation")(function* (input: unknown) {
      const decoded = yield* Schema.decodeUnknownEffect(GetQuotationInput)(input)
      yield* authorize(decoded, SalesCapabilities.quotationRead)
      const quotation = yield* store.getQuotation(decoded)
      if (quotation === undefined) {
        return yield* Effect.fail(
          new QuotationNotFound({ tenantId: decoded.tenantId, quotationId: decoded.quotationId }),
        )
      }
      return quotation
    })
    const listOrders = Effect.fn("SalesService.listOrders")(function* (input: unknown) {
      const decoded = yield* Schema.decodeUnknownEffect(ListOrdersInput)(input)
      yield* authorize(decoded, SalesCapabilities.orderRead)
      return yield* store.listOrders(decoded)
    })
    const getOrder = Effect.fn("SalesService.getOrder")(function* (input: unknown) {
      const decoded = yield* Schema.decodeUnknownEffect(GetOrderInput)(input)
      yield* authorize(decoded, SalesCapabilities.orderRead)
      const order = yield* store.getOrder(decoded)
      if (order === undefined) {
        return yield* Effect.fail(
          new SalesOrderNotFound({ tenantId: decoded.tenantId, orderId: decoded.orderId }),
        )
      }
      return order
    })
    const createCustomer = Effect.fn("SalesService.createCustomer")(function* (input: unknown) {
      const decoded = yield* Schema.decodeUnknownEffect(CreateCustomerInput)(input)
      yield* authorize(decoded, SalesCapabilities.customerCreate)
      return yield* store.createCustomer(decoded)
    })
    const createQuotation = Effect.fn("SalesService.createQuotation")(function* (input: unknown) {
      const decoded = yield* Schema.decodeUnknownEffect(CreateQuotationInput)(input)
      yield* authorize(decoded, SalesCapabilities.quotationCreate)
      return yield* store.createQuotation(decoded)
    })
    const createOrder = Effect.fn("SalesService.createOrder")(function* (input: unknown) {
      const decoded = yield* Schema.decodeUnknownEffect(CreateOrderInput)(input)
      yield* authorize(decoded, SalesCapabilities.orderCreate)
      const order = yield* store.createOrder(decoded)
      yield* Schema.decodeUnknownEffect(FinancialMajorAmount)(order.total)
      return order
    })
    const confirmOrder = Effect.fn("SalesService.confirmOrder")(function* (input: unknown) {
      const decoded = yield* Schema.decodeUnknownEffect(ConfirmOrderInput)(input)
      yield* authorize(decoded, SalesCapabilities.orderConfirm)
      const normalized = {
        ...decoded,
        commandId: decoded.commandId.trim(),
        correlationId: decoded.correlationId.trim(),
        causationId: decoded.causationId?.trim() ?? null,
        idempotencyKey: decoded.idempotencyKey.trim(),
      }
      const mutation = yield* store.confirmOrder(
        normalized,
        (order) =>
          Schema.decodeUnknownEffect(SalesOrderConfirmedEventPayload)({
            orderId: order.id,
            total: order.total,
          }).pipe(Effect.flatMap((payload) =>
            messaging.append({
              eventId: uuidv7(),
              eventType: SalesOrderConfirmedEvent.id,
              eventVersion: SalesOrderConfirmedEvent.version,
              tenantId: normalized.tenantId,
              aggregateType: SalesOrderConfirmedEvent.aggregateType,
              aggregateId: order.id,
              commandId: normalized.commandId,
              correlationId: normalized.correlationId,
              causationId: normalized.causationId,
              idempotencyKey: normalized.idempotencyKey,
              actorPrincipalId: normalized.principal.userAccountId,
              occurredAt: order.confirmedAt!,
              payload,
            })
          )),
      )
      if (mutation._tag === "not-found") {
        return yield* Effect.fail(
          new SalesOrderNotFound({ tenantId: decoded.tenantId, orderId: decoded.orderId }),
        )
      }
      if (mutation._tag === "idempotency-conflict") {
        return yield* Effect.fail(
          new SalesOrderConfirmationIdempotencyConflict({
            tenantId: normalized.tenantId,
            orderId: normalized.orderId,
            idempotencyKey: normalized.idempotencyKey,
          }),
        )
      }
      if (mutation._tag === "invalid-state") {
        return yield* Effect.fail(
          new SalesOrderInvalidState({
            tenantId: decoded.tenantId,
            orderId: decoded.orderId,
            status: mutation.status,
          }),
        )
      }
      return mutation.order
    })
    const cancelConfirmedOrder = Effect.fn("SalesService.cancelConfirmedOrder")(
      function* (input: unknown) {
        const decoded = yield* Schema.decodeUnknownEffect(CancelConfirmedOrderInput)(input)
        yield* authorize(decoded, SalesCapabilities.orderCancel)
        const result = yield* store.cancelConfirmedOrder(decoded)
        if ("_tag" in result && result._tag === "not-found") {
          return yield* Effect.fail(
            new SalesOrderNotFound({ tenantId: decoded.tenantId, orderId: decoded.orderId }),
          )
        }
        if ("_tag" in result && result._tag === "invalid-state") {
          return yield* Effect.fail(
            new SalesOrderInvalidState({
              tenantId: decoded.tenantId,
              orderId: decoded.orderId,
              status: result.status,
            }),
          )
        }
        return result
      },
    )
    const getConfirmedOrderTotal = Effect.fn("SalesService.getConfirmedOrderTotal")(
      function* (input: unknown) {
        const decoded = yield* Schema.decodeUnknownEffect(GetConfirmedOrderTotalInput)(input)
        yield* authorize(decoded, SalesCapabilities.orderRead)
        const result = yield* store.getConfirmedOrderTotal(decoded)
        if (result._tag === "not-found") {
          return yield* Effect.fail(
            new SalesOrderNotFound({ tenantId: decoded.tenantId, orderId: decoded.orderId }),
          )
        }
        if (result.status !== "confirmed" || result.confirmedAt === null) {
          return yield* Effect.fail(
            new SalesOrderInvalidState({
              tenantId: decoded.tenantId,
              orderId: decoded.orderId,
              status: result.status,
            }),
          )
        }
        return result.total
      },
    )
    return {
      listCustomers,
      getCustomer,
      listQuotations,
      getQuotation,
      listOrders,
      getOrder,
      createCustomer,
      createQuotation,
      createOrder,
      confirmOrder,
      cancelConfirmedOrder,
      getConfirmedOrderTotal,
    } satisfies SalesService
  })
