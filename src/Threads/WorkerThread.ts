import { EventEmitter } from "node:events";
import { type Thread, type ThreadEvent, type ThreadStatic, type WorkerMessage } from "./Thread.js";
import { SharedHeap } from "../Memory/SharedHeap.js";

import { parentPort, threadName, threadId, type Transferable, MessagePort, postMessageToThread, workerData } from "node:worker_threads";

interface ThreadConfig {
    logLevel?: 0 | 1 | 2,
    timeout?: number | undefined,
}

export class WorkerThread extends EventEmitter<ThreadEvent> implements Thread {
    private port: MessagePort;

    private config : ThreadConfig = workerData.config;
    private _workerData : any = workerData.workerData; 

    constructor() {
        super();

        if (parentPort == null) throw new Error("cannot find parent port");
        this.port = parentPort;

        //set up event handlers
        this.port.on("message", (msg: WorkerMessage) => {
            this.emit("internalmessage", msg);
            switch (msg.tag) {
                case "message":
                    this.emit("message", msg.data, msg.label);
                    //todo
                    break;
                case "sync":
                    this.emit("sync", msg.name, msg.buffer, msg.heapID, msg.listHead, msg.rebound);
                    //todo
                    break;
                case "allocate":
                    this.emit("allocate", msg.dataType, msg.heapID, msg.addr);
                    //todo
                    break;
            }
        });

        this.port.on("messageerror", (err: Error) => {
            let caught: boolean = this.emit("messageerror", err);

            if (!caught) {
                this.err(err);
            }
        });
    }
    public static sendToThread(threadId: number, data: any, label: string | null = null): void {
        if (!data) return;

        postMessageToThread(threadId, {
            tag: "message",
            label,
            data,
        });
    }

    public static transferToThread(threadId: number, data: any, transferList: Transferable[], label: string | null = null): void {
        if (!data) return;

        postMessageToThread(threadId, {
            tag: "message",
            label,
            data,
        }, transferList);
    }

    public send(data: any, label: string | null = null): void {
        if (!data) return;

        this.port.postMessage({
            tag: "message",
            label,
            data,
        });
    }

    public sendWithTransfer(data: any, transferList: Transferable[], label: string | null = null): void {
        if (!data) return;

        this.port.postMessage({
            tag: "message",
            label,
            data,
        }, transferList);
    }

    public async request(data: any, label: string | null = null): Promise<any> {
        if (!data) return;

        this.port.postMessage({
            tag: "message",
            label,
            data,
        });

        return new Promise<void>((res, rej) => {
            const handler = (data: any, label2: string) => {
                if (label == label2) {
                    res(data);
                    this.off("message", handler);
                }
            }
            this.on("message", handler);

            if (this.config.timeout) setTimeout(() => { rej(new Error("failed to receive response")) }, this.config.timeout);
        });
    }

    public listenOnce(cb: Function, label: string | null = null): void {
        const handler = (data: any, label2: string) => {
            if (label == label2) {
                cb(data);
                this.off("message", handler);
            }
        }
        this.on("message", handler);
    }

    public listenAll(cb: Function, label: string | null = null): void {
        this.on("message", (data: any, label2: string) => {
            if (label == label2) {
                cb(data);
            }
        });
    }

    public respondOnce(cb: Function, label: string | null = null): void {
        const handler = (data: any, label2: string) => {
            if (label == label2) {
                this.send(cb(data), label);
                this.off("message", handler);
            }
        }
        this.on("message", handler);
    }

    public respondAll(cb: Function, label: string | null = null): void {
        this.on("message", (data: any, label2: string) => {
            if (label == label2) {
                this.send(cb(data), label);
            }
        });
    }

    public async addHeap(heap: SharedHeap | SharedArrayBuffer, name: string): Promise<void> {
        if (heap instanceof SharedArrayBuffer) {
            heap = new SharedHeap(heap);
        }
        let buffer = heap.buffer;

        this.port.postMessage({
            tag: "sync",
            name,
            buffer,
            heapID: heap.heapID,
            listHead: heap.listHead,
            rebound: false,
        });

        return new Promise<void>((res, rej) => {
            const handler = (name2: string, buffer: SharedArrayBuffer, heapID: number, listHead: number, rebound: boolean) => {
                if (rebound && name == name2 && buffer == heap.buffer && heapID == heap.heapID && listHead == heap.listHead) {
                    res();
                    this.off("sync", handler);
                }
            }
            this.on("sync", handler);

            setTimeout(() => { rej(new Error("failed to synchronise heap in time")) }, 100);
        });
    }

    public async syncHeap(name: string): Promise<SharedHeap> {
        return new Promise<SharedHeap>((res, rej) => {
            const handler = (name2: string, buffer: SharedArrayBuffer, heapID: number, listHead: number, rebound: boolean) => {
                if (!rebound && name == name2) {
                    let heap: SharedHeap = new SharedHeap(buffer, heapID, listHead);
                    res(heap);
                    this.off("sync", handler);
                }
            }
            this.on("sync", handler);

            setTimeout(() => { rej(new Error("failed to synchronise heap in time")) }, 100);
        });
    }

    public get workerData(){
        return this._workerData;
    }

    private err(msg: string | Error) {
        ///TODO
        throw new Error(`${new Date().toTimeString()} - ${threadName}(${threadId}) - ${msg}`);
    }
}
WorkerThread satisfies ThreadStatic;