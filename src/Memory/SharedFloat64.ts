import { SharedPrimitive, type SharedPrimitiveStatic } from "./SharedPrimitive.js";
import { SharedHeap } from "./SharedHeap.js";
import { TypeRegistry } from "./TypeRegistry.js";

export type float64 = number & { __brand: "float64" };

/**
 * Validates a number to ensure it is a valid 64-bit floating-point number.
 * @param value - The number to validate and cast.
 * @returns The validated 64-bit floating-point number.
 * @throws {RangeError} If the value is NaN or Infinity.
 */
export function Float64(value: number): float64 {
    if (!Number.isFinite(value)) {
        throw new RangeError("cannot cast value to float64");
    }
    return value as float64;
}

export class SharedFloat64 extends SharedPrimitive<float64> {
    static readonly byteSize: number = 8;

    /**
     * Allocates space on the shared heap and initializes a new SharedFloat64 instance with a value.
     * @param heap - The shared heap instance where memory will be allocated.
     * @param v - The initial 64-bit floating-point value to store.
     * @returns A new instance of SharedFloat64 pointing to the allocated memory.
     */
    static fromData(heap: SharedHeap, v: float64): SharedFloat64 {
        let addr = heap.allocate(SharedFloat64.byteSize, SharedFloat64.typeID);
        let obj = new SharedFloat64(heap, addr);
        obj.value = v;
        
        return obj;
    }

    /**
     * Sets the 64-bit floating-point value at the allocated heap address.
     * @param v - The 64-bit floating-point value to write.
     */
    set value(v: float64) {
        this._heap.view.setFloat64(this._addr, Float64(v));
    }

    /**
     * Gets the 64-bit floating-point value from the allocated heap address.
     * @returns The stored 64-bit floating-point value.
     */
    get value(): float64 {
        return this._heap.view.getFloat64(this._addr) as float64;
    }
}
SharedFloat64 satisfies SharedPrimitiveStatic<float64>;

TypeRegistry.registerType(SharedFloat64);
