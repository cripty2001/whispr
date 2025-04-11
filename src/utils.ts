
/** Deeply clones a value.
 * See the corresponding section on the doc
 */
export function safeClone(value: any): any {
    // Primitive values can be returned as is without problems
    if (
        value === null ||
        value === undefined ||
        typeof value === 'string' ||
        typeof value == 'number' ||
        typeof value === 'bigint' ||
        typeof value === 'symbol' ||
        typeof value === 'boolean'
    )
        return value;

    // Arrays must be remapped safecloning each item
    if (Array.isArray(value)) return value.map((item) => safeClone(item));

    // Cloning Known Specific types
    if (value instanceof Map) {
        const newMap = new Map();
        for (const [k, v] of value.entries()) {
            newMap.set(safeClone(k), safeClone(v));
        }
        return newMap;
    }
    if (value instanceof Set) {
        const newSet = new Set();
        for (const item of value) {
            newSet.add(safeClone(item));
        }
        return newSet;
    }
    if (value instanceof Error) {
        // Create a new Error instance with the same message and stack trace
        const clonedError = new Error(value.message);
        clonedError.stack = value.stack ?? "No Stack Found"; // Copy the stack trace
        return clonedError;
    }
    if (value instanceof Date) {
        return new Date(value.getTime());
    }
    if (value instanceof RegExp) {
        return new RegExp(value.source, value.flags);
    }
    if (value instanceof ArrayBuffer) {
        return value.slice(0); // Create a copy of the ArrayBuffer
    }

    // Function can't obviously be cloned, so we return it as is
    if (typeof value === 'function')
        return value;

    // Detecting clone method
    if (typeof value.clone === 'function')
        return value.clone();

    // Detecting class instance
    if (isLikelyClassInstance(value)) {
        return value;
    }

    // Checking if a generic object
    if (typeof value === "object")
        return Object.fromEntries(
            Object.entries(value).map(([key, value]) => [key, safeClone(value)])
        );

    // Returning as is
    return value;
}


function isLikelyClassInstance(obj: any): boolean {
    if (obj === null || typeof obj !== 'object') return false;

    const proto = Object.getPrototypeOf(obj);
    if (!proto || proto === Object.prototype) return false;

    const ctor = proto.constructor;
    return typeof ctor === 'function' && ctor !== Object;
}