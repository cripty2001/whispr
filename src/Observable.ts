import { safeClone } from "./utils";
/**
 * A listener function that can be subscribed to an observable.
 * It receives the current value of the observable and can return a string, void, or a Promise of either.
 * If it returns "STOP", the listener will be unsubscribed.
 */
export type ObservableListener<T> = (data: T) => string | void | Promise<string | void>;

/**
 * Internal class for handling the observable logic.
 */
export class Observable<T> {
    /**
     * The list of listeners subscribed to this observable.
     */
    private listeners: ObservableListener<T>[] = [];

    /** The current value held by the observable. */
    private _data: T;

    /**
     * Creates a new observable with the given initial value.
     * 
     * @param initialVdataalue The initial value of the observable.
     */
    public constructor(data: T) {
        this._data = safeClone(data);
    }

    /**
     * @returns The current value of the observable. 
     * If allowed and supported, the value is returned as a deep clone.
     */
    public get value(): T {
        return safeClone(this._data);
    }

    /**
     * Listerers are notified immediately, but they are not awaited. 
     * 
     * @param data The updater function. When possible, it will receive a cloned value
     * @returns The result of the update operation, which is always true.
     */
    public set(data: T): true {
        this._data = safeClone(data);

        // We don't need to await the listeners
        this.listeners.forEach((listener) => {
            this.notify(listener)
        });

        return true;
    }

    /**
     * Subscribes a listener to the observable. See the note on the Readme for details about the semantics of the listener.
     * @param cb The callback function to be called when the observable is updated. It receives the current value of the observable.
     * @param immediate By default, the listener is notified immediately with the current value. If set to false, it will be nmotified only on future updates.
     * 
     * @returns A function that can be called to unsubscribe the listener from the observable.
     */
    public subscribe(cb: ObservableListener<T>, immediate: boolean = true): () => void {
        this.listeners.push(cb);

        if (immediate) {
            this.notify(cb);
        }

        return () => {
            this.unsubscribe(cb);
        }
    }

    /** Unsubscribes a listener from the observable. */
    private unsubscribe(cb: ObservableListener<T>): void {
        this.listeners = this.listeners.filter((listener) => listener !== cb);
    }

    /**
     * Notifies the given listener with the current value of the observable, handling the promise resolution and the STOP signal.
     * 
     * @param cb The callback to notify with the current value.
     */
    private notify(listener: ObservableListener<T>): void {
        // Listeners may be async, but we want to keep the sync semantics of the observable.
        // Notifications are conceptually asyncronous, by the way. They run on the fire-and-forget principle.
        (async () => {
            try {
                const _result = listener(this._data)
                const result = _result instanceof Promise ? await _result : _result;
                if (result === "STOP") {
                    this.unsubscribe(listener);
                }
            }
            catch (e) {
                // Logging error and continuing to avoid amplifying the error
                console.warn("Whispr listener threw an error:", e);
            }
        })();
    }

    /**
     * Cloning an Observable is meaningless, if you need to use the same listeners you can use the same instance, else the clone will not be a propely valid clone as having different listeners.
     * If you need a new Observable with the same data and no listeners, just use `new Observable(curr.value)` to create it.
     */
    public skipSafeClone: boolean = true;
}