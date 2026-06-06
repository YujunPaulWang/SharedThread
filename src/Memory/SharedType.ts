import { type SharedPrimitive } from "./SharedPrimitive.js";
import { type SharedReference } from "./SharedReference.js";

export type SharedPrimitiveClass = new (...args: any[]) => SharedPrimitive<any>;
export type SharedReferenceClass = new (...args: any[]) => SharedReference;

export type SharedType = SharedPrimitive<any> | SharedReference;
export type SharedTypeClass = new (...args: any[]) => SharedType;