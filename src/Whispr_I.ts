import { ObservableListener } from "./Observable";

/**
 * A listener function for a Whispr observable.
 * Called whenever the observable is updated.
 * 
 * Returning "STOP" (or a Promise resolving to "STOP") unsubscribes the listener.
 * If safe cloning is enabled, the data is deeply cloned before being passed to the callback.
 */
export type WhisprListener<T> = ObservableListener<T>

export interface Whispr_I<T> {
    /**
     * @returns The current value of the observable. 
     * If allowed and supported, the value is returned as a deep clone.
     */
    get value(): T;

    /**
     * Subscribes to the observable.
     *
     * By default, the callback is called immediately with the current value upon subscription.
     * Set `immediate` to `false` to receive updates only on subsequent changes.
     * 
     * If cloning is enabled and supported, the data is defensively cloned before being passed in.
     * 
     * The callback may be called multiple times even with the same value, so it should be idempotent.
     *
     * @param cb Callback invoked when the observable is updated.
     *           Return "STOP" to unsubscribe automatically.
     * @param immediate If true, the callback is called immediately with the current value. If false, it will only be called on future updates.
     * @returns An unsubscribe function.
     */
    subscribe(cb: WhisprListener<T>, immediate: boolean): () => void;

    /**
     * Waits for the observable to emit a value matching a specific condition.
     *
     * The callback runs on every update. Returning a non-null/undefined value resolves the promise.
     * The subscription is automatically removed once resolved.
     *
     * @param cb Function that tests each emitted value.
     * @returns A promise resolving to the first non-null result returned by `cb`.
     */
    wait<R extends any>(
        cb: (data: T) => R | null | undefined
    ): Promise<R>;

    /**
     * Waits for the observable to emit a non-null, non-undefined value.
     *
     * Shorthand for `wait(data => data)`.
     *
     * @returns A promise resolving to the first defined value emitted.
     */
    load(): Promise<NonNullable<T>>;
}
