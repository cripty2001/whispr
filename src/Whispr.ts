import { Observable } from "./Observable";
import { Whispr_I, WhisprListener } from "./Whispr_I";

export type WhisprSetter<T> = (data: T) => boolean

/**
 * Reactive observable container for safely managing and subscribing to state.
 * 
 * Provides automatic memory cleanup, cloning-based safety (opt-out), and reactive composition.
 */
export class Whispr<T extends any> implements Whispr_I<T> {
    /**
     * Static strong reference to From's input. Some of the intermediate values in the chain might go out of scope, but if the end of the chain is in scope, we want to keep everything alive.
     */
    private static strongRefs: Map<string, Whispr<any>[]> = new Map();

    /**
     * Finalization registry to handle cleanup of dead observables.
     * It will help call the onDie even if there is nothing trying to deref the value itself. (a failed deref will always trigger onDie regardless of the behaviour of this registry)
     */
    private static finalizationRegistry = new FinalizationRegistry((onDie: () => void) => {
        onDie();
    });

    /**
     * Reference to the class containing the observable logic.
     * This data is never cloned, and it must be cloned outside it.
     */
    private data: Observable<T>;

    /**
     * Internal constructor. Use `Whispr.create(...)` instead.
     */
    private constructor(data: T) {
        this.data = new Observable<T>(data);
    }

    /**
     * @see {@link Whispr_I.value}
     */
    public get value(): T {
        return this.data.value
    }

    /**
     * Shortcut for Whispr.from when the source data is only the current whispr
     * @param cb 
     */
    public transform<R>(transformer: (data: T) => R): Whispr<R> {
        return Whispr.from({ self: this }, ({ self }) => transformer(self));
    }

    /**
     * Creates a new observable instance.
     * 
     * Note: A "dead" observable cannot be revived. Once unreferenced, it is cleaned up.
     * Observables remain "alive" as long as at least one strong reference to the returned `data` exists.
     * The `onDie` callback may be invoked multiple times and should be idempotent.
     * 
     * @param data Initial value for the observable.
     * @param onDie Optional callback invoked when the observable is no longer strongly referenced.
     * 
     * @returns A tuple containing:
     *           - The created observable.
     *           - A setter function to update the observable's value. Returns false if the observable is dead.
     */
    public static create<T extends any>(
        data: T,
        onDie: () => void = () => { },
    ): [Whispr<T>, WhisprSetter<T>] {
        const observable = new Whispr(data);

        this.finalizationRegistry.register(observable, onDie);
        const ref = new WeakRef<Whispr<T>>(observable);     // Prevent circular strong reference

        return [
            observable,
            (data: T): boolean => {
                return ref.deref()?.data.set(data) ?? false
            }
        ];
    }

    /**
     * Creates a computed observable derived from one or more input observables.
     *
     * @param input A dictionary of source observables.
     * @param cb A function to compute the derived value from the inputs.
     *           Input data may be cloned if allowed.
     * @returns A readonly observable representing the computed value.
     */
    public static from<
        I extends Record<string, any>,
        T extends any
    >(
        input: { [K in keyof I]: Whispr_I<I[K]> },
        cb: (
            data: { [K in keyof I]: I[K] }
        ) => T,
        onDie: () => void = () => { }
    ): Whispr<T> {
        // Initing strong refs
        const key = getRandomId();
        this.strongRefs.set(key, Object.values(input));

        // Helper function to parse input and process cb
        const getValue = () => {
            // Mapping inputs
            const data = Object.fromEntries(
                Object.entries(input).map(([key, value]) => [key, value.value])
            ) as { [K in keyof I]: I[K] };

            // Running cb and computing value
            return cb(data);
        };

        // List of unsubscribers. They will be called when the computed observable is detected as dead to speed up the cleanup process without waiting for the unsubscribe triggered by the update method.
        const unsubscribeCbs: (() => void)[] = [];

        // The memory will be managed by the Whispr itself, no need for additional management here
        const [data, set] = Whispr.create(
            getValue(),
            () => {
                // Unsubscribing from all inputs
                unsubscribeCbs.forEach((unsubscribe) => unsubscribe());

                // Cleaning strong refs
                this.strongRefs.delete(key);

                // Calling onDie callback
                onDie();
            }
        );

        // Subscribing to all inputs
        Object.values(input).forEach((observable) => {
            // Subscribing to observable
            const unsubscribe = observable.subscribe(() => {
                set(getValue()); // We are already listening to the onDie, no need to repeat the unsibscribe logic here. We will ignore the returned value.
            });

            // Pushing unsubscribe function to the list
            unsubscribeCbs.push(unsubscribe);
        });

        // Returning real observable
        return data;
    }

    /**
     * Consolidate a series of Whisprs into a single Whispr containing an object of their values.
     * This is an handy shorthand for `Whispr.from(...)`. where you don't need to transform the data, but just consolidate them under a single Whispr
     * 
     * @param input A dictionary of source observables.
     * @param onDie Optional callback invoked when the observable is no longer strongly referenced.
     * 
     * @returns A readonly observable representing the consolidated values.
     */
    public static consolidate<
        I extends Record<string, any>,
    >(
        input: { [K in keyof I]: Whispr_I<I[K]> },
        onDie: () => void = () => { }
    ): Whispr<{ [K in keyof I]: I[K] }> {
        return this.from(input, (data) => data, onDie);
    }

    /**
     * @see {@link Whispr_I.subscribe}
     */
    public subscribe(cb: WhisprListener<T>, immediate: boolean = true): () => void {
        return this.data.subscribe(cb, immediate);
    }

    /**
     * @see {@link Whispr_I.wait}
     */
    public wait<R extends any>(
        cb: (data: T) => R | null | undefined
    ): Promise<R> {
        return new Promise<R>((resolve) => {
            this.subscribe((data) => {
                if (!data) return;
                const result: R | null | undefined = cb(data);
                if (result === null || result === undefined) return;

                resolve(result);

                return "STOP"; // Unsubscribe after resolving
            });
        });
    }

    /**
     * @see {@link Whispr_I.load}
     */
    public load(): Promise<NonNullable<T>> {
        return this.wait((data) => data) as Promise<NonNullable<T>>;
    }

    /**
     * Cloning a Whispr is meaningless, if you need to use the same listeners you can use the same instance, else the clone will not be a propely valid clone as having different listeners.
     * If you need a new Whispr with the same data and no listeners, just use `Whispr.create(curr.value)` to create it.
     */
    public skipSafeClone: boolean = true;
}


function getRandomId(length: number = 20, alphabeth = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"): string {
    let result = "";
    const charactersLength = alphabeth.length;
    for (let i = 0; i < length; i++) {
        result += alphabeth.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}