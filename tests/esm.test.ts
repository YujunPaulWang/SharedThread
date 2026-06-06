import { describe, it, expect } from 'vitest';
import { MainThread, WorkerThread, SharedArray, SharedHeap, SharedInt32, SharedPointer } from '../dist/index.js';

describe("ESM Bundle", () => {
    it("should import all the correct classes", () => {

        expect(MainThread).toBeDefined();
        expect(WorkerThread).toBeDefined();


        expect(SharedArray).toBeDefined();
        expect(SharedHeap).toBeDefined();
        expect(SharedPointer).toBeDefined();
        expect(SharedInt32).toBeDefined();
    });
});