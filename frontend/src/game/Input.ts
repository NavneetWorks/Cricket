import CricketQueue from "../utils/CircularQueue";

export interface MouseSample {
    x: number;
    y: number;
    time: number;
}

export default class Input {
    public mouseX: number = 300;
    public mouseY: number = 300;
    public isMouseActive: boolean = true;
    public isMouseDown: boolean = false;
    public pressedKeys: Set<string> = new Set();
    private readonly MAX_HISTORY = 1000;
    public dpiScale: number = 0.60; // 60% Dynamic DPI Speed

    private prevRawX: number | null = null;
    private prevRawY: number | null = null;

    private history = new CricketQueue<MouseSample>(this.MAX_HISTORY);

    constructor(canvas: HTMLCanvasElement) {
        const updatePointer = (event: MouseEvent | PointerEvent) => {
            this.isMouseActive = true;

            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            if (document.pointerLockElement === canvas) {
                // Unlimited Pointer Lock delta movement (never gets stuck at screen edges!)
                const dx = (event.movementX || 0) * scaleX * this.dpiScale;
                const dy = (event.movementY || 0) * scaleY * this.dpiScale;

                this.mouseX += dx;
                this.mouseY += dy;
            } else {
                // Unlocked Mode Fallback
                const targetRawX = (event.clientX - rect.left) * scaleX;
                const targetRawY = (event.clientY - rect.top) * scaleY;

                if (this.prevRawX === null || this.prevRawY === null) {
                    this.prevRawX = targetRawX;
                    this.prevRawY = targetRawY;
                    this.mouseX = targetRawX;
                    this.mouseY = targetRawY;
                } else {
                    const deltaX = (targetRawX - this.prevRawX) * this.dpiScale;
                    const deltaY = (targetRawY - this.prevRawY) * this.dpiScale;

                    this.prevRawX = targetRawX;
                    this.prevRawY = targetRawY;

                    this.mouseX += deltaX;
                    this.mouseY += deltaY;
                }
            }

            // Always clamp virtual cursor inside canvas boundaries
            this.mouseX = Math.max(0, Math.min(canvas.width, this.mouseX));
            this.mouseY = Math.max(0, Math.min(canvas.height, this.mouseY));

            this.history.enqueue({
                x: this.mouseX,
                y: this.mouseY,
                time: performance.now(),
            });
        };

        window.addEventListener("pointerdown", (e: PointerEvent) => {
            if (e.button === 0) {
                this.isMouseDown = true;
                this.isMouseActive = true;
            }
        });
        window.addEventListener("pointerup", (e: PointerEvent) => {
            if (e.button === 0) this.isMouseDown = false;
        });

        // Single move listener to ensure exact 60% DPI speed
        window.addEventListener("pointermove", (event: PointerEvent) => {
            updatePointer(event);
        });

        // Non-blocking keyboard tracking for all keys
        window.addEventListener("keydown", (event: KeyboardEvent) => {
            if (event.code === "Enter" || event.key === "Enter") {
                this.isMouseActive = true;
                if (!document.pointerLockElement) {
                    canvas.requestPointerLock();
                }
            }
            this.pressedKeys.add(event.code);
            this.pressedKeys.add(event.key.toLowerCase());

            // Prevent default page scroll for navigation/WASD/Space/Enter keys
            if (["Space", "Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
                if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) {
                    event.preventDefault();
                }
            }
        });

        window.addEventListener("keyup", (event: KeyboardEvent) => {
            this.pressedKeys.delete(event.code);
            this.pressedKeys.delete(event.key.toLowerCase());
        });
    }

    public isKeyPressed(codeOrKey: string): boolean {
        return this.pressedKeys.has(codeOrKey) || this.pressedKeys.has(codeOrKey.toLowerCase());
    }

    getHistory(): CricketQueue<MouseSample> {
        return this.history;
    }
}