import { SharedPrimitive, type SharedPrimitiveStatic } from "./SharedPrimitive.js";
import { SharedHeap } from "./SharedHeap.js";
import { TypeRegistry } from "./TypeRegistry.js";

export type char = string & { __brand: "char" };

/**
 * Validates a string to ensure it represents a single 16-bit character code unit.
 * @param value - The string to validate and cast.
 * @returns The validated single-character string.
 * @throws {RangeError} If the string is empty or contains more than one UTF-16 code unit.
 */
export function Char(value: string): char {
    if (typeof value !== "string" || value.length !== 1) {
        throw new RangeError("cannot cast value to char (must be a single UTF-16 code unit)");
    }
    return value as char;
}

export class SharedChar extends SharedPrimitive<char> {
    static readonly byteSize: number = 2;

    /**
     * Allocates space on the shared heap and initializes a new SharedChar instance with a value.
     * @param heap - The shared heap instance where memory will be allocated.
     * @param v - The initial character value to store.
     * @returns A new instance of SharedChar pointing to the allocated memory.
     */
    static fromData(heap: SharedHeap, v: char): SharedChar {
        let addr = heap.allocate(SharedChar.byteSize, SharedChar.typeID);
        let obj = new SharedChar(heap, addr);
        obj.value = v;
        
        return obj;
    }

    /**
     * Sets the character value at the allocated heap address by converting it to a 16-bit unsigned integer.
     * @param v - The character value to write.
     */
    set value(v: char) {
        this._heap.view.setUint16(this._addr, Char(v).charCodeAt(0));
    }

    /**
     * Gets the character value from the allocated heap address by converting the 16-bit integer back to a string.
     * @returns The stored single-character string.
     */
    get value(): char {
        return String.fromCharCode(this._heap.view.getUint16(this._addr)) as char;
    }
}
SharedChar satisfies SharedPrimitiveStatic<char>;

TypeRegistry.registerType(SharedChar);
