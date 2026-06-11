export class SharedHeap {
    private static heaps: SharedHeap[] = [];

    /**
     * Retrieves an active SharedHeap instance by its unique registry identifier index.
     * 
     * @param i - The unique tracking index matching the desired shared memory workspace.
     * @returns The requested SharedHeap instance mapped to the given ID.
     * @throws {Error} If no registered heap instance context exists at the specified identifier.
     */
    public static getHeapByID(i: number): SharedHeap {
        if (SharedHeap.heaps[i] === undefined) throw new Error(`cannot find heap with heapID`);
        return SharedHeap.heaps[i];
    }


    private readonly _heapID: number;
    private readonly _heapSize: number;
    private readonly _buffer: SharedArrayBuffer;
    private readonly _view: DataView;

    // Bit-Packing Constants for the Lower 32-bit Header
    private static readonly SHIFT_TYPEID = 0;
    private static readonly SHIFT_ARRAY = 23;
    private static readonly SHIFT_PTR = 26;
    private static readonly SHIFT_ALLOC = 29;

    private static readonly MASK_TYPEID = 0x7FFFFF;   // 23 bits
    private static readonly MASK_ARRAY = 0x7;        // 3 bits
    private static readonly MASK_PTR = 0x7;        // 3 bits
    private static readonly MASK_ALLOC = 0x7;        // 3 bits

    /**
     * Initializes a new SharedHeap instance using either an existing SharedArrayBuffer context 
     * or a target layout footprint capacity size in bytes. 
     * When building a brand new buffer, it structures alignment restrictions, initializes the 
     * free list head pointer, and creates an initial comprehensive free node pool entry.
     * 
     * @param b - The raw buffer memory capacity size configuration or a pre-allocated SharedArrayBuffer to inherit.
     * @param heapID - The explicit registry index slot matching this heap instance layout. Defaults to total registered count limit.
     * @throws {Error} If the chosen registration identifier index conflicts with an already allocated shared instance.
     */
    constructor(b: number | SharedArrayBuffer, heapID: number = SharedHeap.heaps.length) {
        if (SharedHeap.heaps[heapID] !== undefined) throw new Error("heap assignment overlap");
        this._heapID = heapID;
        SharedHeap.heaps[this._heapID] = this;

        if (b instanceof SharedArrayBuffer) {
            this._heapSize = b.byteLength;
            this._buffer = b;
            this._view = new DataView(this._buffer);
        } else {
            // Add 4 bytes to accommodate the listHead storing mechanism at the start of SAB
            this._heapSize = ((b + 4) + 3) & ~3;
            this._buffer = new SharedArrayBuffer(this._heapSize);
            this._view = new DataView(this._buffer);

            // Set default listhead value in the buffer
            this.listHead = -1;

            // First chunk header starts at offset 4 now instead of 0
            const initialPayloadSize = this._heapSize - 4 - 8;
            this.writeHeader(4, initialPayloadSize, 0, 0, 0, 0);

            // Set up pointers for the initial giant free node (offset 4)
            // next pointer at 4 + 8, prev pointer at 4 + 12
            this._view.setInt32(12, -1, true);
            this._view.setInt32(16, -1, true);

            this.syncFreeList();
        }
    }


    public get heapID(): number { return this._heapID; }
    public get view(): DataView { return this._view; }
    public get heapSize(): number { return this._heapSize; }
    public get buffer(): SharedArrayBuffer { return this._buffer; }
    
    // Dynamically reads and writes to the beginning of the SharedArrayBuffer
    public get listHead(): number { return this._view.getInt32(0, true); }
    public set listHead(offset: number) { this._view.setInt32(0, offset, true); }

    /**
     * Reads the block size directly from the upper 32-bit word of a chunk's header metadata.
     * 
     * @param offset - The absolute heap memory offset where the targeted chunk header begins.
     * @returns The raw size in bytes assigned to the allocation block's data payload.
     */
    private getHeaderSize(offset: number): number {
        return this._view.getUint32(offset, true);
    }

    /**
     * Unpacks and extracts the allocation state indicator flag from the lower 32-bit word of a chunk's header.
     * 
     * @param offset - The absolute heap memory offset where the targeted chunk header begins.
     * @returns The numerical representation of the block's current allocation status.
     */
    public getHeaderAllocated(offset: number): number {
        const lowerHeader = this._view.getUint32(offset + 4, true);
        return (lowerHeader >>> SharedHeap.SHIFT_ALLOC) & SharedHeap.MASK_ALLOC;
    }


    /**
     * Serializes block characteristics into a dual-word 64-bit chunk header at the specified memory index position.
     * Enforces value ceilings across the bit-packed sub-components.
     * 
     * @param offset - The absolute heap memory offset where the dual-word header will be written.
     * @param size - The total byte payload size constraints assigned to the data chunk.
     * @param alloc - The structural status state flags restricted to a 3-bit ceiling.
     * @param ptr - The reference pointer tracking layer classification marker restricted to a 3-bit ceiling.
     * @param array - The layout format identifier indicator restricted to a 3-bit ceiling.
     * @param typeID - The unique schema registry type code identifier restricted to a 23-bit ceiling.
     * @throws {Error} If any metric falls out of its allowed bitwise structure storage bounds.
     */
    private writeHeader(offset: number, size: number, alloc: number, ptr: number, array: number, typeID: number): void {
        if (typeID < 0 || typeID > SharedHeap.MASK_TYPEID) throw new Error("typeID out of bounds");
        if (size < 0 || size > 0xFFFFFFFF) throw new Error("size exceeds 32-bit limit");
        if (alloc < 0 || alloc > 7 || ptr < 0 || ptr > 7 || array < 0 || array > 7) throw new Error("alloc, ptr, and array must fit in 3 bits (0-7)");

        this._view.setUint32(offset, size, true);

        const lowerHeader = ((alloc & SharedHeap.MASK_ALLOC) << SharedHeap.SHIFT_ALLOC) |
            ((ptr & SharedHeap.MASK_PTR) << SharedHeap.SHIFT_PTR) |
            ((array & SharedHeap.MASK_ARRAY) << SharedHeap.SHIFT_ARRAY) |
            ((typeID & SharedHeap.MASK_TYPEID) << SharedHeap.SHIFT_TYPEID);

        this._view.setUint32(offset + 4, lowerHeader >>> 0, true);
    }

    /**
     * Loops sequentially across active heap boundaries to find unallocated memory nodes and rebuilds the doubly-linked free list layout chain.
     */
    public syncFreeList(): void {
        let current = 4; // Start evaluating past the 4-byte shared head
        this.listHead = -1;
        let lastFree = -1;

        while (current < this._heapSize) {
            const size = this.getHeaderSize(current);
            const allocVal = this.getHeaderAllocated(current);

            if (allocVal === 0) { 
                if (this.listHead === -1) {
                    this.listHead = current;
                }
                if (lastFree !== -1) {
                    this._view.setInt32(lastFree + 8, current, true);
                    this._view.setInt32(current + 12, lastFree, true);
                }
                lastFree = current;
            }
            current += 8 + size;
        }

        if (lastFree !== -1) {
            this._view.setInt32(lastFree + 8, -1, true);
        }
    }


    /**
     * Searches the available free list using a first-fit strategy to allocate a block of memory.
     * Aligns the requested size to 4 bytes, splits the node if enough remaining space exists,
     * updates the packed metadata header, and returns the data pointer address.
     * 
     * @param requestedSize - The payload capacity in bytes required for the allocation.
     * @param typeID - The schema index identifier code assigned to the data type.
     * @param isPtr - Flag indicating if the allocation holds structural pointer references.
     * @param isArray - Flag indicating if the allocation holds a sequential array/list structure.
     * @returns The raw address pointer tracking the start of the newly allocated user data block.
     * @throws {Error} If the requested size is invalid (NaN or non-positive) or if the heap runs out of memory.
     */
    public allocate(requestedSize: number, typeID: number, isPtr: boolean = false, isArray: boolean = false): number {
        if (isNaN(requestedSize)) throw new Error("cannot allocate NaN size");
        if (requestedSize <= 0) throw new Error("cannot allocate negative size");

        const allocValue = 1;
        const ptrValue = isPtr ? 1 : 0;
        const arrayValue = isArray ? 1 : 0;

        const alignedSize = Math.max((requestedSize + 3) & ~3, 4);
        let currentOffset = this.listHead;

        while (currentOffset !== -1) {
            const size = this.getHeaderSize(currentOffset);

            if (size >= alignedSize) {
                const remainingSpace = size - alignedSize - 8;

                if (remainingSpace >= 12) {
                    const nextFreeOffset = currentOffset + 8 + alignedSize;

                    this.replaceFreeNode(currentOffset, nextFreeOffset);

                    this.writeHeader(currentOffset, alignedSize, allocValue, ptrValue, arrayValue, typeID);
                    this.writeHeader(nextFreeOffset, remainingSpace, 0, 0, 0, 0);
                } else {
                    this.removeFreeNode(currentOffset);
                    this.writeHeader(currentOffset, size, allocValue, ptrValue, arrayValue, typeID);
                }

                return currentOffset + 8;
            }
            currentOffset = this._view.getInt32(currentOffset + 8, true);
        }

        throw new Error("heap out of memory");
    }

    /**
     * Relinquishes ownership of an allocated block space back to the shared memory pool.
     * Resets its bit-packed header metrics and prepends the block onto the free list chain.
     * 
     * @param ptr - The absolute user data pointer address targeting the block to release.
     * @throws {Error} If the target pointer address falls outside allowed operational heap boundaries.
     */
    public free(ptr: number): void {
        // Minimum valid data pointer address is now 12 (4 bytes listHead + 8 bytes header)
        if (ptr < 12 || ptr >= this._heapSize) throw new Error("cannot free out of bounds");

        const headerOffset = ptr - 8;
        const size = this.getHeaderSize(headerOffset);

        this.writeHeader(headerOffset, size, 0, 0, 0, 0);
        this.addFreeNodeToFront(headerOffset);
    }

    /**
     * Prepends a targeted block header offset onto the front of the tracking free list registry chain.
     * 
     * @param offset - The absolute baseline block header structural index position.
     */
    private addFreeNodeToFront(offset: number): void {
        const oldHead = this.listHead;
        this.listHead = offset;

        this._view.setInt32(offset + 8, oldHead, true);
        this._view.setInt32(offset + 12, -1, true);

        if (oldHead !== -1) {
            this._view.setInt32(oldHead + 12, offset, true);
        }
    }



    /**
     * Extracts the type schema identifier code mapped inside the block's metadata header.
     * 
     * @param ptr - The data pointer address referencing the allocated block contents.
     * @returns The registered type identifier integer code, or 0 if out of bounds.
     */
    public getTypeIDAt(ptr: number): number {
        if (ptr < 12 || ptr >= this._heapSize) return 0;
        const lowerHeader = this._view.getUint32(ptr - 4, true);
        return (lowerHeader >>> SharedHeap.SHIFT_TYPEID) & SharedHeap.MASK_TYPEID;
    }

    /**
     * Extracts the active allocation state status flag value from the block's metadata header.
     * 
     * @param ptr - The data pointer address referencing the allocated block contents.
     * @returns The numerical assignment tracking indicator value, or 0 if out of bounds.
     */
    public getAllocAt(ptr: number): number {
        if (ptr < 12 || ptr >= this._heapSize) return 0;
        const lowerHeader = this._view.getUint32(ptr - 4, true);
        return (lowerHeader >>> SharedHeap.SHIFT_ALLOC) & SharedHeap.MASK_ALLOC;
    }

    /**
     * Extracts the reference pointer tracking flag configuration from the block's metadata header.
     * 
     * @param ptr - The data pointer address referencing the allocated block contents.
     * @returns The structural pointer reference indicator value, or 0 if out of bounds.
     */
    public getPtrAt(ptr: number): number {
        if (ptr < 12 || ptr >= this._heapSize) return 0;
        const lowerHeader = this._view.getUint32(ptr - 4, true);
        return (lowerHeader >>> SharedHeap.SHIFT_PTR) & SharedHeap.MASK_PTR;
    }

    /**
     * Extracts the sequential array storage layout tracking flag configuration from the block's metadata header.
     * 
     * @param ptr - The data pointer address referencing the allocated block contents.
     * @returns The sequential list layout indicator value, or 0 if out of bounds.
     */
    public getArrayAt(ptr: number): number {
        if (ptr < 12 || ptr >= this._heapSize) return 0;
        const lowerHeader = this._view.getUint32(ptr - 4, true);
        return (lowerHeader >>> SharedHeap.SHIFT_ARRAY) & SharedHeap.MASK_ARRAY;
    }


    /**
     * Unlinks a free node block from the available free allocation list by updating adjacent node references.
     * 
     * @param offset - The absolute baseline block header structural index position to remove.
     */
    private removeFreeNode(offset: number): void {
        const next = this._view.getInt32(offset + 8, true);
        const prev = this._view.getInt32(offset + 12, true);

        if (prev !== -1) this._view.setInt32(prev + 8, next, true);
        else this.listHead = next;

        if (next !== -1) this._view.setInt32(next + 12, prev, true);
    }

    /**
     * Substitutes an existing free node slot with a newly partitioned structural node inside the free list tracking layout.
     * 
     * @param oldOffset - The absolute baseline index location of the node being replaced.
     * @param newOffset - The absolute baseline index location of the new node taking its position.
     */
    private replaceFreeNode(oldOffset: number, newOffset: number): void {
        const next = this._view.getInt32(oldOffset + 8, true);
        const prev = this._view.getInt32(oldOffset + 12, true);

        if (next !== -1) this._view.setInt32(next + 12, newOffset, true);
        if (prev !== -1) this._view.setInt32(prev + 8, newOffset, true);
        else this.listHead = newOffset;

        this._view.setInt32(newOffset + 8, next, true);
        this._view.setInt32(newOffset + 12, prev, true);
    }
}
