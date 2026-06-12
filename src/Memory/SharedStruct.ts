import type { SharedHeap } from "./SharedHeap.js";
import { SharedPointer } from "./SharedPointer.js";
import { SharedPrimitive, type SharedPrimitiveClass } from "./SharedPrimitive.js";
import { SharedReference, type SharedReferenceClass, type SharedReferenceStatic } from "./SharedReference.js";
import type { SharedType, SharedTypeClass } from "./SharedType.js";

export type VariableDeclaration = {
    type: SharedPrimitiveClass<any>
    param?: any,
} | {
    type: SharedReferenceClass,
    param: any,
};

export class SharedStruct extends SharedReference {
    /**
     * Allocates memory on the shared heap and creates an instantiated struct populated with initial data.
     * @param heap - The shared heap instance where memory will be allocated.
     * @param param - Initialization parameters or nested objects to imprint onto the struct fields.
     * @returns A new instance of the specific SharedStruct subclass pointing to the allocated space.
     */
    static fromData<T extends SharedStruct>(
        this: (new (heap: SharedHeap, addr: number) => T) & SharedReferenceStatic, heap: SharedHeap, param: any
    ): T {
        let addr = heap.allocate(this.byteSize, this.typeID);
        let obj = new this(heap, addr);
        obj.imprint(param);
        return obj;
    }

    public static readonly properties: Record<string, VariableDeclaration>;

    protected _byteSize: number = 0;

    protected properties: Record<string, SharedType> = {};

    /**
     * Creates an instance of SharedStruct, mapping layout offsets and proxying properties.
     * @param heap - The shared heap instance managing memory layouts.
     * @param addr - The base address of this struct instance on the shared heap.
     */
    constructor(heap: SharedHeap, addr: number) {
        super(heap, addr);

        const prop = (this.constructor as typeof SharedStruct).properties;
        for (let key in prop) {
            let dataDeclaration: VariableDeclaration = prop[key] as VariableDeclaration;
            let dataType = dataDeclaration.type as SharedTypeClass; // Fixed type resolution
            let params: any = dataDeclaration.param;
            let data: SharedType;
            let propSize: number;

            if (SharedPrimitive.isPrototypeOf(dataType)) {
                dataType = dataType as unknown as SharedPrimitiveClass<any>;
                if(dataType == SharedPointer){
                    data = new SharedPointer(heap, addr + this._byteSize, params.type);
                    propSize = SharedPointer.byteSize;
                }else{
                    data = new dataType(heap, addr + this._byteSize);
                    if (params !== undefined) (data as SharedPrimitive<any>).value = params;
                    propSize = dataType.byteSize;
                }
            } else if ("type" in dataDeclaration && "param" in dataDeclaration) {
                data = (dataDeclaration.type as SharedReferenceClass).fromData(heap, dataDeclaration.param);

                let p = new SharedPointer(heap, addr + this._byteSize, dataDeclaration.type);
                propSize = SharedPointer.byteSize;
                p.value = data.addr;
                data = p;
            } else { throw new Error("invalid declaration"); }
            this._byteSize += propSize;
            this.properties[key] = data;
        }

        queueMicrotask(() => {
            Object.preventExtensions(this);
        });

        return new Proxy(this, {
            get(target: SharedStruct, prop: any, receiver: any) {
                if (prop in target.properties) {
                    let v = target.properties[prop];
                    return v;
                }

                return Reflect.get(target, prop, receiver);
            }
        });
    }

    /**
     * Recursively writes property values from a plain object into the corresponding shared property slots.
     * @param obj - The dictionary containing fields matching the struct properties.
     */
    imprint(obj?: Record<string, any>): void {
        if (obj == undefined) return;
        for (let key in obj) {
            if (key in this.properties) {
                let ref: SharedType = this.properties[key] as SharedType;
                if (ref instanceof SharedStruct) {
                    ref.imprint(obj[key]);
                } else if (ref instanceof SharedPrimitive) {
                    (ref as SharedPrimitive<any>).value = obj[key];
                }
            }
        }
    }

    /**
     * Computes the memory size required for the struct layout class declaration.
     * @returns The total number of bytes needed for instances of this constructor.
     */
    static get byteSize(): number {
        let size = 0;
        let properties = this.properties;
        for (let key in properties) {
            let declaration: VariableDeclaration = properties[key] as VariableDeclaration;
            let dataType = declaration.type;
            if (SharedPrimitive.isPrototypeOf(dataType)) {
                size += (dataType as unknown as SharedPrimitiveClass<any>).byteSize;
            } else {
                size += SharedPointer.byteSize;
            }
        }
        return size;
    }

    /**
     * Computes the calculated layout byte size for the current struct instance constructor.
     * @returns The active byte size limit for this struct configuration.
     */
    get byteSize(): number {
        let size = 0;
        let properties = (this.constructor as typeof SharedStruct).properties;
        for (let key in properties) {
            let declaration: VariableDeclaration = properties[key] as VariableDeclaration;
            let dataType = declaration.type;
            if (SharedPrimitive.isPrototypeOf(dataType)) {
                size += (dataType as unknown as SharedPrimitiveClass<any>).byteSize;
            } else {
                size += SharedPointer.byteSize;
            }
        }
        return size;
    }
}
