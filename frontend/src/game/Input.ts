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
    public dpiScale: number = 0.60; // 60% Base Dynamic DPI

    private prevRawX: number | null = null;
    private prevRawY: number | null = null;

    private swingMomentum: number = 0;
    private prevMoveAngle: number | null = null;

    private history = new CricketQueue<MouseSample>(this.MAX_HISTORY);

    constructor(canvas: HTMLCanvasElement) {
        const updatePointer = (event: MouseEvent | PointerEvent) => {
            this.isMouseActive = true;

            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            let moveX = 0;
            let moveY = 0;

            if (document.pointerLockElement === canvas) {
                // Unlimited Pointer Lock delta movement (never gets stuck at screen edges!)
                moveX = (event.movementX || 0) * scaleX;
                moveY = (event.movementY || 0) * scaleY;
            } else {
                // Unlocked Mode Fallback
                const targetRawX = (event.clientX - rect.left) * scaleX;
                const targetRawY = (event.clientY - rect.top) * scaleY;

                if (this.prevRawX === null || this.prevRawY === null) {
                    this.prevRawX = targetRawX;
                    this.prevRawY = targetRawY;
                } else {
                    moveX = targetRawX - this.prevRawX;
                    moveY = targetRawY - this.prevRawY;
                    this.prevRawX = targetRawX;
                    this.prevRawY = targetRawY;
                }
            }

            const moveDist = Math.hypot(moveX, moveY);

            // 1. Calculate Backswing Stored Potential Energy (Height above baseline Y ~ 450)
            const shoulderYBaseline = 450;
            const batLiftHeight = Math.max(0, shoulderYBaseline - this.mouseY);
            const storedPE = Math.min(1.0, batLiftHeight / 220);

            // 2. Driven Pendulum Momentum State (Hand Force maintains high 0.70 DPI as long as mouse moves fast)
            if (moveDist > 1.2) { // Active fast mouse movement (Powered Swing)
                if (moveY > 0.5 && storedPE > 0) {
                    // Downswing Gravity Boost (PE -> KE Conversion)
                    this.swingMomentum = Math.min(1.0, this.swingMomentum + 0.25);
                } else {
                    // Follow-Through / Active Swing: Hand Force maintains momentum!
                    this.swingMomentum = Math.min(1.0, this.swingMomentum + 0.10);
                }
            } else if (moveDist < 0.5) {
                // Deceleration Phase: Mouse slow / stopped -> Momentum decays back to heavy rest
                this.swingMomentum = Math.max(0, this.swingMomentum - 0.15);
            }

            // 3. Dynamic DPI (Range: 0.30 Heavy Rest -> 0.50 Base -> 0.70 Fast Active Swing)
            let dynamicDPI = 0.30; // Rest / Heavy Minimum DPI
            
            if (moveDist > 0.5) {
                // Base 0.50 + Momentum scaling up to 0.70
                dynamicDPI = 0.50 + (this.swingMomentum * 0.20); // 0.50 -> 0.70
            }

            // Left-Click Hold = 100% Unlocked Power Mode
            const activeDPI = this.isMouseDown ? 1.0 : dynamicDPI;

            // Apply calculated dynamic DPI to mouse displacement
            this.mouseX += moveX * activeDPI;
            this.mouseY += moveY * activeDPI;

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