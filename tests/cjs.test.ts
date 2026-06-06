import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// Set up a standard Node.js require function
const requireCjs = createRequire(import.meta.url);
const { MainThread, WorkerThread, SharedArray, SharedHeap, SharedInt32, SharedPointer } = requireCjs('../dist/index.cjs');

describe("CJS Bundle", () => {
    it("should import all the correct classes", () => {

        expect(MainThread).toBeDefined();
        expect(WorkerThread).toBeDefined();


        expect(SharedArray).toBeDefined();
        expect(SharedHeap).toBeDefined();
        expect(SharedPointer).toBeDefined();
        expect(SharedInt32).toBeDefined();
    });
});