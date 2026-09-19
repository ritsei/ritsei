import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import {
  CreateUserAccountInput,
  UpdateUserAccountInput,
  UserAccount,
  userAccountRoutes,
} from "../../shared/contracts/generated/identity.ts"
import {
  decodeInput,
  decodeResponse,
  mutationRequest,
  RequestFailure,
  requestJson,
  responseMatches,
  routeWithId,
} from "../../shared/api.ts"

const AccountList = Schema.Array(UserAccount).check(Schema.isMaxLength(200))
const AccountId = Schema.String.check(Schema.isUUID())

export const listAccounts = Effect.fn("Frontend.Identity.listAccounts")(
  function* () {
    const body = yield* requestJson(userAccountRoutes.list)
    return yield* decodeResponse(AccountList, body)
  },
)

export const getAccount = Effect.fn("Frontend.Identity.getAccount")(
  function* (id: unknown) {
    const decodedId = yield* decodeInput(AccountId, id)
    const body = yield* requestJson(
      routeWithId(userAccountRoutes.get, decodedId),
    )
    const account = yield* decodeResponse(UserAccount, body)
    if (!responseMatches(account, { id: decodedId })) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return account
  },
)

export const createAccount = Effect.fn("Frontend.Identity.createAccount")(
  function* (input: unknown) {
    const decoded = yield* decodeInput(CreateUserAccountInput, input)
    const body = yield* mutationRequest(userAccountRoutes.create, "POST", decoded)
    return yield* decodeResponse(UserAccount, body, "unknown-outcome")
  },
)

export const updateAccount = Effect.fn("Frontend.Identity.updateAccount")(
  function* (input: unknown) {
    const decoded = yield* decodeInput(UpdateUserAccountInput, input)
    const body = yield* requestJson(
      routeWithId(userAccountRoutes.update, decoded.id),
      "PATCH",
      { email: decoded.email },
    )
    const account = yield* decodeResponse(UserAccount, body, "unknown-outcome")
    if (!responseMatches(account, { id: decoded.id })) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return account
  },
)
