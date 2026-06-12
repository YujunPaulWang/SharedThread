import { SharedPrimitive, type SharedPrimitiveStatic } from "./SharedPrimitive.js";
import { SharedHeap } from "./SharedHeap.js";
import { TypeRegistry } from "./TypeRegistry.js";

export type bool = boolean & { __brand: "bool" };

/**
 * Validates a value to ensure it is a strict boolean.
 * @param value - The value to validate and cast.
 * @returns The validated boolean.
 * @throws {TypeError} If the value is not a boolean.
 */
export function Bool(value: boolean): bool {
    if (typeof value !== "boolean") {
        throw new TypeError("cannot cast value to bool");
    }
    return value as bool;
}

export class SharedBool extends SharedPrimitive<bool> {
    static readonly byteSize: number = 1;

    /**
     * Allocates space on the shared heap and initializes a new SharedBool instance with a value.
     * @param heap - The shared heap instance where memory will be allocated.
     * @param v - The initial boolean value to store.
     * @returns A new instance of SharedBool pointing to the allocated memory.
     */
    static fromData(heap: SharedHeap, v: bool): SharedBool {
        let addr = heap.allocate(SharedBool.byteSize, SharedBool.typeID);
        let obj = new SharedBool(heap, addr);
        obj.value = v;
        
        return obj;
    }

    /**
     * Sets the boolean value at the allocated heap address as a 1-bit integer flag.
     * @param v - The boolean value to write.
     */
    set value(v: bool) {
        this._heap.view.setUint8(this._addr, Bool(v) ? 1 : 0);
    }

    /**
     * Gets the boolean value from the allocated heap address.
     * @returns The stored boolean value.
     */
    get value(): bool {
        return (this._heap.view.getUint8(this._addr) !== 0) as bool;
    }
}
SharedBool satisfies SharedPrimitiveStatic<bool>;

TypeRegistry.registerType(SharedBool);
