import { MainThread } from "./MainThread.js";
import { WorkerThread as WorkerThreadClass } from "./WorkerThread.js";
import { isMainThread } from "node:worker_threads";

const WorkerThreadExport = (isMainThread ? WorkerThreadClass : new WorkerThreadClass()) as unknown as WorkerThreadClass;

export { MainThread, WorkerThreadExport as WorkerThread };
export * from "./Thread.js";