import { Cause, Effect } from "effect";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Atom from "effect/reactivity/Atom";
import * as AtomRegistry from "effect/reactivity/AtomRegistry";
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  Show,
  Switch,
  untrack,
  useContext,
} from "solid-js";
import type { JSX } from "@solidjs/web";
import {
  CardDeclinedError,
  type CartItem,
  type Charge,
  chargeCard,
  createOrder,
  fetchOrders,
  type Order,
  type Package,
  refundCharge,
  releaseReservation,
  type Reservation,
  reserveInventory,
  SearchConfigLive,
  searchPackages,
} from "./api";

// @effect/atom-solid@4.0.0 still imports Solid 1-only APIs. This tiny
// Solid 2 bridge keeps the same RegistryProvider/useAtom surface over Atom's
// public registry until the official binding has a Solid 2 peer-compatible release.
const RegistryContext = createContext<AtomRegistry.AtomRegistry>();

function useRegistry() {
  const registry = useContext(RegistryContext);
  if (!registry) {
    throw new Error("Atom components must be rendered inside RegistryProvider");
  }
  return registry;
}

function useAtomValue<A>(atom: () => Atom.Atom<A>): () => A {
  const registry = useRegistry();
  const current = createMemo(atom);
  const [value, setValue] = createSignal<A>(
    untrack(() => registry.get(current())) as any,
  );

  createEffect(
    () => current(),
    (currentAtom) =>
      registry.subscribe(currentAtom, (next) => setValue(() => next), {
        immediate: true,
      }),
  );

  return value as () => A;
}

function useAtom<R, W>(atom: () => Atom.Writable<R, W>) {
  const registry = useRegistry();
  const current = createMemo(atom);
  const value = useAtomValue(current);
  return [value, (next: W) => registry.set(current(), next)] as const;
}

function RegistryProvider(props: { children: JSX.Element }) {
  const registry = AtomRegistry.make();
  onCleanup(() => registry.dispose());
  return <RegistryContext value={registry}>{props.children}</RegistryContext>;
}

function formatDownloads(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return Math.round(n / 1_000) + "k";
  return String(n);
}

function AtomTypeahead() {
  const [query, setQuery] = createSignal("");
  const searchAtom = Atom.fn<string>()(
    (value) => searchPackages(value).pipe(Effect.provide(SearchConfigLive)),
    { concurrent: false },
  );
  const [searchResult, runSearch] = useAtom(() => searchAtom);

  const pending = () => {
    const result = searchResult();
    return result.waiting || AsyncResult.isInitial(result);
  };
  const failure = () => {
    const result = searchResult();
    return AsyncResult.isFailure(result)
      ? Cause.squash(result.cause)
      : undefined;
  };
  const results = () =>
    AsyncResult.getOrElse(searchResult(), () => [] as Package[]);

  return (
    <section class="panel">
      <header>
        <h2>Typeahead search</h2>
        <p>
          The same search Effect runs through{" "}
          <code>Atom.fn</code>. Writes update one registry atom;
          <code>concurrent: false</code> interrupts the previous request.
        </p>
      </header>
      <input
        id="atom-package-search"
        name="package-search"
        type="search"
        aria-label="Search packages"
        placeholder="Search packages… (try typing “solid” quickly)"
        value={query()}
        onInput={(e) => {
          const value = e.currentTarget.value;
          const normalized = value.trim();
          setQuery(value);
          runSearch(normalized || Atom.Reset);
        }}
        autofocus
      />
      <Show when={query().trim()}>
        {(q) => (
          <Switch>
            <Match when={failure()}>
              {(error) => (
                <div class="error-box">
                  <p>Search gave up after retries: {String(error())}</p>
                  <button onClick={() => runSearch(q().trim())}>
                    Try again
                  </button>
                </div>
              )}
            </Match>
            <Match when={AsyncResult.isInitial(searchResult())}>
              <p class="loading">Searching…</p>
            </Match>
            <Match when={true}>
              <div class={{ results: true, stale: pending() }}>
                <Show
                  when={results().length > 0}
                  fallback={<p class="empty">No packages match “{q()}”.</p>}
                >
                  <ul>
                    <For each={results()}>
                      {(pkg) => (
                        <li>
                          <div>
                            <span class="pkg-name">{pkg.name}</span>
                            <span class="pkg-desc">{pkg.description}</span>
                          </div>
                          <span class="pkg-downloads">
                            {formatDownloads(pkg.downloads)}/wk
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>
            </Match>
          </Switch>
        )}
      </Show>
    </section>
  );
}

type Phase = "idle" | "reserving" | "charging" | "finalizing";

type Notice = {
  kind: "success" | "error" | "info";
  text: string;
};

type CheckoutArgs = {
  items: CartItem[];
  decline: boolean;
};

const STEPS: { phase: Phase; label: string }[] = [
  { phase: "reserving", label: "Reserve inventory" },
  { phase: "charging", label: "Charge card" },
  { phase: "finalizing", label: "Create order" },
];

const INITIAL_CART: CartItem[] = [
  {
    id: "sku_signal",
    name: "Signal (fine-grained)",
    price: 19.99,
    quantity: 1,
  },
  { id: "sku_fiber", name: "Fiber (interruptible)", price: 24.5, quantity: 2 },
  { id: "sku_boundary", name: "Boundary (loading)", price: 9.75, quantity: 1 },
];

function AtomCheckout() {
  const cartAtom = Atom.make(INITIAL_CART.map((item) => ({ ...item })));
  const phaseAtom = Atom.make<Phase>("idle");
  const noticeAtom = Atom.make<Notice | null>(null);
  const declineCardAtom = Atom.make(false);
  const ordersAtom = Atom.make(Effect.promise(() => fetchOrders()));

  const checkoutAtom = Atom.fn<CheckoutArgs>()((args, get) => {
    let reservation: Reservation | undefined;
    let charge: Charge | undefined;
    const amount = args.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    const compensate = () =>
      Effect.gen(function* () {
        if (charge) yield* refundCharge(charge);
        if (reservation) yield* releaseReservation(reservation);
      });

    const setNotice = (notice: Notice) =>
      Effect.sync(() => {
        get.registry.set(phaseAtom, "idle");
        get.registry.set(noticeAtom, notice);
      });

    const workflow = Effect.gen(function* () {
      yield* Effect.sync(() => {
        get.registry.set(noticeAtom, null);
        get.registry.set(phaseAtom, "reserving");
      });
      reservation = yield* reserveInventory(args.items);
      yield* Effect.sync(() => get.registry.set(phaseAtom, "charging"));
      charge = yield* chargeCard(amount, args.decline);
      yield* Effect.sync(() => get.registry.set(phaseAtom, "finalizing"));
      const order = yield* createOrder(args.items, reservation, charge);
      yield* Effect.sync(() => {
        get.registry.set(phaseAtom, "idle");
        get.registry.set(noticeAtom, {
          kind: "success",
          text: `Order ${order.id} confirmed — $${order.total.toFixed(2)}`,
        });
        get.registry.refresh(ordersAtom);
      });
      return order;
    });

    return workflow.pipe(
      Effect.catchIf(
        (error): error is CardDeclinedError =>
          error instanceof CardDeclinedError,
        (error) =>
          compensate().pipe(
            Effect.andThen(
              setNotice({
                kind: "error",
                text: `Card declined for $${
                  error.amount.toFixed(2)
                } — refunds/releases applied, cart untouched`,
              }),
            ),
            Effect.andThen(Effect.fail(error)),
          ),
      ),
      Effect.onInterrupt(() =>
        compensate().pipe(
          Effect.andThen(
            setNotice({
              kind: "info",
              text: "Checkout cancelled — compensations ran, cart untouched",
            }),
          ),
        )
      ),
    );
  }, { concurrent: false });

  const [cart, setCart] = useAtom(() => cartAtom);
  const [phase] = useAtom(() => phaseAtom);
  const [notice] = useAtom(() => noticeAtom);
  const [declineCard, setDeclineCard] = useAtom(() => declineCardAtom);
  const ordersResult = useAtomValue(() => ordersAtom);
  const [, runCheckout] = useAtom(() => checkoutAtom);

  const total = () =>
    cart().reduce((sum, item) => sum + item.price * item.quantity, 0);
  const inFlight = () => phase() !== "idle";
  const orders = () =>
    AsyncResult.getOrElse(ordersResult(), () => [] as Order[]);
  const ordersLoading = () => {
    const result = ordersResult();
    return result.waiting || AsyncResult.isInitial(result);
  };
  const stepState = (step: Phase) => {
    const order: Phase[] = ["reserving", "charging", "finalizing"];
    const current = order.indexOf(phase());
    const target = order.indexOf(step);
    if (current === -1) return "";
    return target < current ? "done" : target === current ? "active" : "";
  };

  return (
    <section class="panel">
      <header>
        <h2>Checkout saga</h2>
        <p>
          <code>Atom.fn</code>{" "}
          owns the cancellable workflow. State writes happen through the
          registry, while Effect handles typed decline and interruption
          compensation.
        </p>
      </header>

      <div class="cart">
        <For each={cart()}>
          {(item, i) => (
            <div class="cart-row">
              <span class="cart-name">{item.name}</span>
              <span class="qty">
                <button
                  disabled={inFlight() || item.quantity <= 1}
                  onClick={() =>
                    setCart(
                      cart().map((current, index) =>
                        index === i()
                          ? { ...current, quantity: current.quantity - 1 }
                          : current
                      ),
                    )}
                >
                  −
                </button>
                {item.quantity}
                <button
                  disabled={inFlight()}
                  onClick={() =>
                    setCart(
                      cart().map((current, index) =>
                        index === i()
                          ? { ...current, quantity: current.quantity + 1 }
                          : current
                      ),
                    )}
                >
                  +
                </button>
              </span>
              <span class="cart-price">
                ${(item.price * item.quantity).toFixed(2)}
              </span>
            </div>
          )}
        </For>
        <div class="cart-row total">
          <span class="cart-name">Total</span>
          <span class="cart-price">${total().toFixed(2)}</span>
        </div>
      </div>

      <div class="checkout-controls">
        <label class="decline-toggle">
          <input
            id="atom-decline-card"
            name="decline-card"
            type="checkbox"
            checked={declineCard()}
            onInput={(e) => setDeclineCard(e.currentTarget.checked)}
          />
          Simulate card decline (typed <code>CardDeclinedError</code>)
        </label>
        <Show
          when={inFlight()}
          fallback={
            <button
              class="primary"
              onClick={() =>
                runCheckout({
                  items: cart().map((item) => ({ ...item })),
                  decline: declineCard(),
                })}
            >
              Place order — ${total().toFixed(2)}
            </button>
          }
        >
          <button class="danger" onClick={() => runCheckout(Atom.Interrupt)}>
            Cancel checkout
          </button>
        </Show>
      </div>

      <ol class="steps">
        <For each={STEPS}>
          {(step) => (
            <li
              class={{
                done: stepState(step.phase) === "done",
                active: stepState(step.phase) === "active",
              }}
            >
              {step.label}
            </li>
          )}
        </For>
      </ol>

      <Show when={notice()}>
        {(current) => <p class={`notice ${current().kind}`}>{current().text}
        </p>}
      </Show>

      <h3>Your orders</h3>
      <Show
        when={!ordersLoading()}
        fallback={<p class="loading">Loading orders…</p>}
      >
        <Show
          when={orders().length > 0}
          fallback={<p class="empty">No orders yet.</p>}
        >
          <ul class="orders">
            <For each={orders()}>
              {(order) => (
                <li>
                  <span class="pkg-name">{order.id}</span>
                  <span class="pkg-desc">
                    {order.items.length}{" "}
                    line{order.items.length === 1 ? "" : "s"} · placed{" "}
                    {order.placedAt}
                  </span>
                  <span class="cart-price">${order.total.toFixed(2)}</span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </section>
  );
}

export function AtomDemos() {
  return (
    <RegistryProvider>
      <div class="atom-demos">
        <section class="comparison-note">
          <strong>Registry comparison</strong>
          <span>
            These are the same two flows using Effect Atom primitives. The
            released
            <code>@effect/atom-solid</code>{" "}
            adapter is still Solid 1-only, so this Solid 2 tab uses the
            equivalent bridge above.
          </span>
        </section>
        <AtomTypeahead />
        <AtomCheckout />
      </div>
    </RegistryProvider>
  );
}
