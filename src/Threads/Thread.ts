import { EventEmitter } from "node:events";
import type { SharedType } from "../Memory/SharedType.js";
import type { SharedHeap } from "../Memory/SharedHeap.js";

//standard message
interface WorkerMessageData {
    tag: "message",
    label: string,
    data: any,
}

//accepts a SharedArrayBuffer with a corresponding id
interface WorkerMessageSync {
    tag: "sync",
    name: string,
    buffer: SharedArrayBuffer,
    heapID: number,
    listHead: number,
    rebound: boolean,
}

//allocate a type on heapID at addr
interface WorkerMessageAllocate {
    tag: "allocate",
    dataType: SharedType,
    heapID: number,
    addr: number,
    rebound: boolean,
}


export type WorkerMessage = WorkerMessageData | WorkerMessageSync | WorkerMessageAllocate;

export type ThreadEvent = {
    internalmessage: [WorkerMessage],
    message: [data: any, label: string];
    sync: [name: string, buffer: SharedArrayBuffer, heapID: number, listHead: number, rebound: boolean];
    allocate: [dataType: SharedType, heapID: number, addr: number];
    error: [err: Error];
    messageerror: [err: Error];
    online: [];
    exit: [exitCode: number];
}

export interface ThreadStatic {
    sendToThread(threadId: number, data: any, label: string | null): void;

    transferToThread(threadId: number, data: any, transferList: Transferable[], label: string | null): void;
}


export interface Thread extends EventEmitter<ThreadEvent> {
    send(data: any, label: string | null): void;

    sendWithTransfer(data: any, transferList: Transferable[], label: string | null): void;

    request(data: any, label: string | null): Promise<any>;

    listenOnce(cb: Function, label: string | null): void;

    listenAll(cb: Function, label: string | null): void;

    respondOnce(cb: Function, label: string | null): void;

    respondAll(cb: Function, label: string | null): void;

    addHeap(heap: SharedHeap | SharedArrayBuffer, name: string): Promise<void>;

    syncHeap(name: string): Promise<SharedHeap>;
}
