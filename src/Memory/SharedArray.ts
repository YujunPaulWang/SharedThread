import { SharedReference, type SharedReferenceStatic } from "./SharedReference.js";
import { SharedType, type SharedTypeClass } from "./SharedType.js";
import { SharedHeap } from "./SharedHeap.js";
import { SharedPointer } from "./SharedPointer.js";
import { SharedPrimitive, type SharedPrimitiveClass } from "./SharedPrimitive.js";
import { TypeRegistry } from "./TypeRegistry.js";
import { SharedUint32 } from "./SharedUint32.js";
import type { VariableDeclaration } from "./SharedStruct.js";

interface ArrayDefinition {
    type: SharedTypeClass,
    length: number,
    array?: any[],
}

export interface SharedArray<T extends SharedType> {
    [index: number]: T;
}

export class SharedArray<T extends SharedType> extends SharedReference {

    public static readonly isArr: boolean = true;

    public static readonly properties: Record<string, VariableDeclaration> = {
        length: { type: SharedUint32 },
    }

    /**
     * Overload for initializing a SharedReference wrapper from generic data.
     * 
     * @template U The expected return reference type.
     * @param heap The shared heap instantiation target.
     * @param v Generic input payload.
     * @returns A fresh reference instance.
     */
    static fromData<U extends SharedReference>(heap: SharedHeap, v: any): U;

    /**
     * Allocates memory on the heap and creates a SharedArray from an array definition.
     * Populates initial values if provided in the definition payload.
     * 
     * @template U The expected return reference type.
     * @this The constructor context bound to a SharedReference class type.
     * @param heap The target shared heap layout.
     * @param v Configuration detailing item layout, element type, length, and optional initial array values.
     * @returns A newly allocated SharedArray instance.
     */
    static fromData<U extends SharedReference>(
        this: (new (heap: SharedHeap, addr: number) => U) & SharedReferenceStatic,
        heap: SharedHeap,
        v: ArrayDefinition
    ): SharedArray<any> {
        let length = v.length ?? v.array?.length;
        if(!Number.isInteger(length) || length <= 0) throw new Error("cannot create array of invalid length");
        let type = v.type;
        if (type.prototype instanceof SharedPrimitive) {
            type = type as SharedPrimitiveClass<any>;
        } else {
            type = SharedPointer;
        }
        let elementSize = type.byteSize;
        let totalSize = 4 + elementSize * length;
        let addr = heap.allocate(totalSize, type.typeID, false, true);
        heap.view.setUint32(addr, length);

        let obj = new this(heap, addr) as any;

        if (v.array) {
            for (let i = 0; i < Math.min(length, v.array.length); i++) {
                obj.elements[i].value = v.array[i];
            }
        }

        return obj;
    }

    public static autoValue = false;
    public static autoDeref = false;

    public autoValue: boolean = SharedArray.autoValue;
    public autoDeref: boolean = SharedArray.autoDeref;

    protected readonly _heldType: SharedTypeClass;
    protected readonly _elementType: SharedTypeClass;
    protected readonly _elementSize: number;
    protected readonly _byteSize: number;
    protected readonly _length: number;

    protected readonly elements: T[] = [];


    /**
     * Instantiates a new SharedArray view.
     * Wraps the instance in a Proxy to trap standard integer indexing for reads/writes.
     * 
     * @param heap The heap memory container context.
     * @param addr The base address pointer inside shared memory.
     */
    constructor(heap: SharedHeap, addr: number) {
        super(heap, addr);

        this._elementType = TypeRegistry.getTypeByIndex(heap.getTypeIDAt(addr));
        this._heldType = heap.getPtrAt(addr) ? SharedPointer : this._elementType;
        this._elementSize = (this._heldType as SharedPrimitiveClass<T>).byteSize;
        this._length = heap.view.getUint32(addr);
        this._byteSize = 4 + this._elementSize * this._length;

        let offset = 4;
        for (let i = 0; i < this._length; i++, offset += this._elementSize) {
            this.elements.push(new this._heldType(heap, addr + offset) as unknown as T);
        }


        return new Proxy(this, {
            get(target: SharedArray<T>, prop: string | Symbol, receiver: typeof Proxy) {
                if (typeof prop == "symbol") return Reflect.get(target, prop, receiver);
                let n = Number(prop);
                if (!Number.isNaN(n) && Number.isInteger(n) && n >= 0 && n < target._length) {
                    if (target.elements[n] != undefined) {
                        let v = target.elements[n];
                        if (target.autoDeref && v instanceof SharedPointer) {
                            if (target.autoValue && v.deref instanceof SharedPrimitive && !(v.deref instanceof SharedPointer)) {
                                return v.deref.value
                            } else {
                                return v.deref;
                            }
                        } else if (target.autoValue && v instanceof SharedPrimitive && !(v instanceof SharedPointer)) {
                            return v.value;
                        }
                        return v;
                    }
                }

                return Reflect.get(target, prop as string, receiver);
            },
            set(target: SharedArray<T>, prop: string | Symbol, value: any, receiver: typeof Proxy) {
                if (typeof prop == "symbol") return Reflect.set(target, prop, value, receiver);
                let n = Number(prop);
                if (!Number.isNaN(n) && Number.isInteger(n) && n >= 0 && n < target._length) {
                    if (target.elements[n] != undefined) {
                        let obj = target.elements[n];
                        if (target.autoDeref && obj instanceof SharedPointer) {
                            if (target.autoValue && obj.deref instanceof SharedPrimitive && !(obj.deref instanceof SharedPointer)) {
                                obj.deref.value = value;
                                return true;
                            } else {
                                obj.deref = value;
                                return true;
                            }
                        } else if ("value" in obj) {
                            obj.value = value;
                            return true;
                        }
                    }
                }

                return Reflect.set(target, prop as string, value, receiver);
            }
        });
    }

    get addr(): number {
        return this._addr;
    }
    get heap(): SharedHeap {
        return this._heap;
    }
    get heldType(): SharedTypeClass {
        return this._heldType;
    }
    get elementType(): SharedTypeClass {
        return this._elementType;
    }
    get elementSize(): number {
        return this._elementSize;
    }
    static get byteSize(): number {
        throw new Error("cannot precalculate array size");
    };
    get byteSize(): number {
        return this._byteSize;
    }
    get length(): number {
        return this._length;
    }

    /**
     * Creates an iterator that yields elements of the array.
     * 
     * @generator
     */
    *[Symbol.iterator]() {
        let len = this.length;
        for (let i = 0; i < len; i++) {
            yield this[i];
        }
    }
}
SharedArray satisfies SharedReferenceStatic;
