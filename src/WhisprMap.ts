import { Whispr } from "./Whispr";
import { Whispr_I } from "./Whispr_I";

type WhisprMapData<K extends string | number, V> = Map<K, Whispr<V>>;

export interface WhisprMapMutations<K extends string | number, V> {
    set(key: K, value: Whispr<V>, force?: boolean): void;
    delete(key: K): void;
}

export class WhisprMap<K extends string | number, V> implements Whispr_I<Map<K, V>> {
    private data: Whispr<WhisprMapData<K, V>>;
    private mappedData: Whispr<Map<K, V>>;

    private setData: (data: WhisprMapData<K, V>) => boolean;
    private setMapped: (data: Map<K, V>) => boolean;

    public get value(): Map<K, V> {
        return this.mappedData.value;
    }

    public subscribe(
        listener: (data: Map<K, V>) => void,
        immediate: boolean = true
    ): () => void {
        return this.mappedData.subscribe(listener, immediate);
    }

    public wait<R extends unknown>(cb: (data: Map<K, V>) => R | null | undefined): Promise<R> {
        return this.mappedData.wait(cb);
    }

    public load(): Promise<NonNullable<Map<K, V>>> {
        return this.mappedData.load();
    }

    private constructor() {
        // Creating the main map observable
        const [data, setData] = Whispr.create<WhisprMapData<K, V>>(
            new Map<K, Whispr<V>>());
        this.data = data;
        this.setData = setData;

        // Creating mapped data observable
        const [mappedData, setMapped] = Whispr.create<Map<K, V>>(
            new Map<K, V>());
        this.mappedData = mappedData;
        this.setMapped = setMapped;

        // Subscribing to changes in the map data
        this.data.subscribe(() => {
            this.refresh();
        });
    }

    public static create<K extends string | number, V>(): [WhisprMap<K, V>, WhisprMapMutations<K, V>] {
        const data = new WhisprMap<K, V>();
        const mutations: WhisprMapMutations<K, V> = {
            set: (key: K, value: Whispr<V>, force?: boolean) => data.set(key, value, force),
            delete: (key: K) => data.delete(key),
        };
        return [data, mutations];
    }

    private set(key: K, value: Whispr<V>, force: boolean = false): void {
        // Checking if the key already exists
        if (this.data.value.has(key) && !force)
            throw new Error(`Key ${key} already exists in the WhisprMap.`);

        // Adding the item to the map
        const tmp = this.data.value;
        tmp.set(key, value);
        this.setData(tmp);

        // Subscribing for changes (no need for unsubscribe logic, we are not creating loops, and the handler will be garbage collected when the item is removed from the map)
        value.subscribe(() => {
            this.refresh();
        })
    }

    /**
     * This will silently ignore errors if the key does not exist in the map.
     * @param key The key of the item to delete from the map.
     */
    private delete(key: K): void {
        const tmp = this.data.value;

        if (!tmp.has(key)) return;
        tmp.delete(key);

        this.setData(tmp);
    }

    private refresh() {
        const toReturn = new Map<K, V>();
        for (const [key, item] of this.data.value.entries()) {
            toReturn.set(key, item.value);
        }
        this.setMapped(toReturn);
    }

    public skipSafeClone: boolean = true;
}