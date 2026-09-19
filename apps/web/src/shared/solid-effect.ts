/**
 * Solid 2 × Effect production bridge.
 *
 * Context path — Effect's `R` channel is carried by a scoped `ManagedRuntime`
 * in Solid Context. `createRuntime` ties the Layer scope to the Solid owner,
 * so service lifetime follows subtree lifetime instead of a global registry.
 *
 * Read path — `runEffect` adapts one Effect to Solid's AsyncIterable protocol.
 * When Solid supersedes or disposes a computation, its iterator is closed;
 * `return()` interrupts the Effect fiber and waits for its finalizers.
 *
 * Action path — `effectAction` runs each yielded Effect as one
 * interruptible Solid action step. Typed failures and interruption are thrown
 * back into the generator so workflow code can perform explicit compensation.
 * This bridge does not replace TanStack Query's server-state ownership or
 * backend authorization and transaction boundaries.
 */
import { Cause, Effect, Exit, Fiber, Layer, ManagedRuntime } from "effect"
import { action, createContext, onCleanup, useContext } from "solid-js"

type SolidEffectRuntime = ManagedRuntime.ManagedRuntime<never, never>

/**
 * The scoped Effect runtime used by the Solid application subtree.
 *
 * The context erases the provider's concrete service set so nested providers
 * can carry different `R` values through one Solid context. `resolveFork`
 * performs that narrow cast only at this integration boundary; callers keep
 * their concrete `Effect<A, E, R>` types.
 */
export const RuntimeContext = createContext<SolidEffectRuntime | null>(null)

/**
 * Raised when an Effect bridge is used outside a runtime provider.
 * This is a composition/configuration error, not a domain failure to recover
 * from at a feature boundary.
 */
export class MissingRuntimeContextError extends Error {
  constructor() {
    super("Solid Effect runtime is not provided by RuntimeContext")
    this.name = "MissingRuntimeContextError"
  }
}

/**
 * Builds a runtime whose Layer scope follows the current Solid owner.
 *
 * Call this during component setup, then pass the returned runtime to
 * `RuntimeContext`. Nested providers share the parent's Effect MemoMap without
 * becoming a global registry; their service overrides still remain subtree-
 * scoped. The runtime is disposed automatically when this owner unmounts.
 */
export function createRuntime<R>(
  layer: Layer.Layer<R>,
): ManagedRuntime.ManagedRuntime<R, never> {
  const parent = useContext(RuntimeContext)
  const runtime = ManagedRuntime.make(
    layer,
    parent ? { memoMap: parent.memoMap } : undefined,
  )
  onCleanup(() => void runtime.dispose())
  return runtime
}

/** Resolve the nearest runtime at the boundary where the Effect is created. */
function resolveRuntime(): SolidEffectRuntime {
  const runtime = useContext(RuntimeContext)
  if (!runtime) throw new MissingRuntimeContextError()
  return runtime
}

/**
 * Capture the provider once for a read or action. A feature must not rebuild
 * the application environment with ad hoc `Effect.provide` calls here.
 */
function resolveFork() {
  const runtime = resolveRuntime()
  return <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    // RuntimeContext intentionally erases the provider's concrete R so nested
    // providers can carry different service sets through one Solid context.
    runtime.runFork(effect as Effect.Effect<A, E, never>)
}

/**
 * Adapts one Effect result to Solid's async-source protocol.
 *
 * A plain `Effect.runPromise` would let Solid discard stale results but could
 * not cancel the underlying work. The AsyncIterable boundary gives Solid a
 * lifecycle hook: supersession/disposal calls `return()`, which interrupts the
 * fiber and waits for its finalizers before the iterator closes.
 */
export function runEffect<A, E, R = never>(
  effect: Effect.Effect<A, E, R>,
): AsyncIterable<A> {
  const fork = resolveFork()
  return {
    [Symbol.asyncIterator]() {
      const fiber = fork(effect)
      // Solid asks for one value from this source. These flags make repeated
      // reads and repeated disposal idempotent.
      let yielded = false
      let closed = false
      const done = { done: true, value: undefined } as const
      return {
        async next(): Promise<IteratorResult<A>> {
          if (yielded || closed) return done
          const exit = await Effect.runPromise(Fiber.await(fiber))
          if (closed) return done
          if (Exit.isSuccess(exit)) {
            yielded = true
            return { done: false, value: exit.value }
          }
          closed = true
          if (Exit.isFailure(exit)) {
            const cause = exit.cause
            if (Exit.hasInterrupts(exit)) return done
            throw Cause.squash(cause)
          }
          return done
        },
        // Solid calls return() when the flight is superseded or its owner is
        // disposed. Awaiting interruption keeps finalizer completion ordered
        // before the source is reported closed.
        async return(): Promise<IteratorResult<A>> {
          if (yielded || closed) return done
          closed = true
          await Effect.runPromise(Fiber.interrupt(fiber))
          return done
        },
      }
    },
  }
}

/**
 * Typed interruption delivered to an Effect action's generator.
 * Catch it when the workflow owns a compensating business command; do not
 * treat it as proof that a server-side commit was rolled back automatically.
 */
export class ActionInterruptedError extends Error {
  constructor() {
    super("Action interrupted")
    this.name = "ActionInterruptedError"
  }
}

// The generator keeps the workflow readable while the bridge owns fiber
// execution. `R` remains the shared service requirement for its yielded steps.
type SagaStep<R> = Effect.Effect<unknown, unknown, R>

export interface EffectAction<Args extends unknown[], A> {
  (...args: Args): Promise<A>
  interrupt(): void
}

/**
 * Runs each yielded Effect as an interruptible Solid action step.
 *
 * The Solid action owns optimistic presentation writes; Effect owns service
 * calls, typed failures, interruption, and resource finalizers. Action generators
 * yield Effects directly so injected failures reach the generator's catch block;
 * `yield*` is reserved for Effect's own generator protocol. Compensation across
 * already-completed steps belongs in the generator's catch block.
 * Use for explicit workflows; TanStack Query remains the owner of shared
 * server-state caching and invalidation.
 */
export function effectAction<Args extends unknown[], A, R = never>(
  genFn: (...args: Args) => Generator<SagaStep<R>, A, never>,
): EffectAction<Args, A> {
  const fork = resolveFork()
  let inFlight: Fiber.Fiber<unknown, unknown> | null = null

  // Solid's action transaction provides the optimistic UI boundary; each
  // yielded Effect below provides the interruptible application step.
  const base = action(function* (...args: Args) {
    const iterator = genFn(...args)
    let step = iterator.next()
    while (!step.done) {
      const fiber = fork(step.value)
      inFlight = fiber
      const exit: Exit.Exit<unknown, unknown> = yield Effect.runPromise(
        Fiber.await(fiber),
      )
      if (inFlight === fiber) inFlight = null
      if (Exit.isSuccess(exit)) {
        step = iterator.next(exit.value as never)
      } else if (Exit.isFailure(exit)) {
        const cause = exit.cause
        if (Exit.hasInterrupts(exit)) {
          step = iterator.throw(new ActionInterruptedError())
        } else {
          step = iterator.throw(Cause.squash(cause))
        }
      }
    }
    return step.value
  })

  // A new invocation supersedes the previous in-flight step instead of
  // allowing two workflow flights to race silently.
  const invoke = (...args: Args) => {
    invoke.interrupt()
    return base(...args)
  }
  invoke.interrupt = () => {
    const fiber = inFlight
    inFlight = null
    if (fiber) void Effect.runPromise(Fiber.interrupt(fiber))
  }
  return invoke
}
