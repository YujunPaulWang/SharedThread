import { EventEmitter } from "node:events";
import { type Thread, type ThreadStatic, type ThreadEvent, type WorkerMessage } from "./Thread.js";
import { SharedHeap } from "../Memory/SharedHeap.js";

import os from "node:os";
import { Worker, postMessageToThread, threadId, threadName, type Transferable, type WorkerOptions } from "node:worker_threads";


export { type Transferable } from "node:worker_threads";


interface ThreadConfig {
    transient?: boolean,
    logLevel?: 0 | 1 | 2,
    timeout?: number | undefined,
    useTypescript?: boolean,

    //see https://nodejs.org/api/worker_threads.html#new-workerfilename-options
    workerOptions?: WorkerOptions,
    /*  argv?: any[],
        env?: any,
        eval?: boolean,
        execArgv?: boolean,
        stdin?: boolean,
        stdout?: boolean,
        stderr?: boolean,
        workerData?: any,
        trackUnmanagedFds?: boolean,
        transferList?: Transferable[],
        resourceLimits?: ResourceLimits,
            maxOldGenerationSizeMb?: number;
            maxYoungGenerationSizeMb?: number;
            codeRangeSizeMb?: number;
            stackSizeMb?: number;
        maxOldGenerationSizeMb?: number,
        maxYoungGenerationSizeMb?: number,
        codeRangeSizeMb?: number,
        stackSizeMb?: number,
        name?: string,*/
}


export class MainThread extends EventEmitter<ThreadEvent> implements Thread {

    public static get optimalThreads(): number {
        return os.availableParallelism();
    }

    private worker: Worker;

    private config: ThreadConfig;

    private active: boolean = false;

    constructor(path: string | Function, config: ThreadConfig = {}) {
        super();

        //setup config
        this.config = { ...config };
        this.config.workerOptions ??= {};
        this.config.workerOptions.workerData = {
            config: {
                timeout: this.config.timeout,
                logLevel: this.config.logLevel,
            },
            default: this.config.workerOptions.workerData
        }
        if(this.config.useTypescript){
            if(this.config.workerOptions.execArgv){
                this.config.workerOptions.execArgv.push("--import");
                this.config.workerOptions.execArgv.push("tsx");
            }else{
                this.config.workerOptions.execArgv = [...process.execArgv, '--import', 'tsx']
            }
        }

        //insert extra data into workerData
        this.config.workerOptions.workerData = {
            orig: this.config.workerOptions.workerData,
            //extra data here for syncing
        }

        //spawn worker
        if (path instanceof Function) {
            path = path.toString();
            this.config.workerOptions.eval = true;
        }
        this.worker = new Worker(path, this.config.workerOptions);

        //set up event handlers
        this.worker.on("message", (msg: WorkerMessage) => {
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

            if (this.config.transient) {
                this.worker.terminate();
            }
        });

        this.worker.on("error", (err: Error) => {
            let caught: boolean = this.emit("error", err);

            if (!caught) {
                this.err(err);
            }
        });

        this.worker.on("messageerror", (err: Error) => {
            let caught: boolean = this.emit("messageerror", err);

            if (!caught) {
                this.err(err);
            }
        });

        this.worker.on("online", () => {
            this.emit("online");
            this.active = true;
        });

        this.worker.on("exit", (exitCode: number) => {
            this.active = false;
            this.emit("exit", exitCode);
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

    public async ready(): Promise<void> {
        if (this.active) return;

        return new Promise<void>((res) => {
            this.worker.once("online", () => {
                res();
            });
        });
    }

    public terminate(): Promise<number> {
        if (!this.active) this.err("cannot terminate worker(worker is not active)");

        this.active = false;
        return this.worker.terminate();
    }

    public send(data: any, label: string | null = null): void {
        if (!data) return;
        if (!this.active) this.err("cannot send message(worker is not active)");

        this.worker.postMessage({
            tag: "message",
            label,
            data,
        });
    }

    public sendWithTransfer(data: any, transferList: Transferable[], label: string | null = null): void {
        if (!data) return;
        if (!this.active) this.err("cannot transfer message(worker is not active)");

        this.worker.postMessage({
            tag: "message",
            label,
            data,
        }, transferList);
    }

    public async request(data: any, label: string | null = null): Promise<any> {
        if (!data) return;
        if (!this.active) this.err("cannot send message(worker is not active)");

        this.worker.postMessage({
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

        this.worker.postMessage({
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

            if (this.config.timeout) setTimeout(() => { rej(new Error("failed to synchronise heap in time")) }, this.config.timeout);
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

            setTimeout(() => { rej(new Error("failed to synchronise heap in time")) }, this.config.timeout);
        });
    }

    // private log(level: number, msg: string): void{
    //     ///////TODO
    //     if(level >= (this.config.logLevel ?? 0)){
    //         console.log(`${new Date().toTimeString()} - ${threadName}(${threadId}) - ${msg}`);
    //     }
    // }
    private err(msg: string | Error): void {
        ///TODO
        throw new Error(`${new Date().toTimeString()} - ${threadName}(${threadId}) - ${msg}`);
    }

    public get isActive(): boolean {
        return this.active;
    }

    //functions that pass through the call
    public ref(): void {
        this.worker.ref();
    }
    public unref(): void {
        this.worker.unref();
    }

    // worker.cpuUsage([prev])
    // worker.getHeapSnapshot([options])
    // worker.getHeapStatistics()
    // worker.performance
    // worker.stderr
    // worker.stdin
    // worker.stdout
}
MainThread satisfies ThreadStatic;

export default MainThread;