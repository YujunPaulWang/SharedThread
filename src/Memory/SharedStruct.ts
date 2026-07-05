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

export interface SharedStruct{
    [index: string]: any;
}

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

        let pos = addr;
        const prop = (this as unknown as typeof SharedStruct).properties;
        for (let key in prop) {
            let dataDeclaration: VariableDeclaration = prop[key] as VariableDeclaration;
            let dataType = dataDeclaration.type as SharedTypeClass;
            let param2: any = dataDeclaration.param;

            if(SharedPrimitive.isPrototypeOf(dataType)){
                if(dataType == SharedPointer){
                    let tmp = new SharedPointer(heap, pos, param2?.type);
                    if(param2?.addr != undefined)tmp.value = param2.addr;
                }else{
                    let tmp = new dataType(heap, pos);
                    if(param2 != undefined)(tmp as SharedPrimitive<any>).value = param2;
                }
                pos += dataType.byteSize;
            } else if (SharedReference.isPrototypeOf(dataType)) {
                let tmp = dataType.fromData(heap, param2);
                let p = new SharedPointer(heap, pos, dataType);
                p.value = tmp.addr;
                pos += SharedPointer.byteSize;
            } else { throw new Error("invalid declaration"); }
        }

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
        let pos = this._addr;
        for(let key in prop){
            if(key in this){
                console.warn("class properties cannot overlap with declared properties");
            }
            let dataDeclaration: VariableDeclaration = prop[key] as VariableDeclaration;
            let dataType = dataDeclaration.type as SharedTypeClass;

            if(SharedPrimitive.isPrototypeOf(dataType)){
                if(dataType == SharedPointer){
                    this.properties[key] = new SharedPointer(this._heap, pos, dataDeclaration.param.type);
                }else{
                    this.properties[key] = new dataType(this._heap, pos);
                }
                pos += dataType.byteSize;
            }else if(SharedReference.isPrototypeOf(dataType)){
                let tmp = new SharedPointer(this._heap, pos, dataType);
                this.properties[key] = tmp;
                tmp.value = tmp.value;
                pos+= SharedPointer.byteSize;
            } else { throw new Error("invalid declaration"); }
        }

        queueMicrotask(() => {
            Object.preventExtensions(this);
        });

        return new Proxy(this, {
            get(target: SharedStruct, prop: string, receiver: any) {
                if (typeof prop == "symbol") return Reflect.get(target, prop, receiver);
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
                if (ref instanceof SharedPointer) {
                    ref.deref.imprint(obj[key]);
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
