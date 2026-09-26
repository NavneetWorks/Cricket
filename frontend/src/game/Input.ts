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
    public gameMode: 'BATTING' | 'BOWLING' | 'NEW_BOWLER' | 'DEBUG_13_FRAMES' | 'ANIMATION_PLAY' = 'BATTING';

    private prevRawX: number | null = null;
    private prevRawY: number | null = null;

    private swingMomentum: number = 0;
    private prevMoveAngle: number | null = null;
    public currentDPI: number = 0.40;
    private lastTime: number | null = null;
    private lastMoveTime: number = performance.now();
    private swingDirection: number = 0; // 0 = idle/unset, 1 = RIGHT, -1 = LEFT
    private prevBatAngle: number | null = null;

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

            // 2. Uncapped Time-Based Kinetic DPI Momentum Engine
            let activeDPI = 0.40;
            if (this.gameMode === 'BATTING') {
                const MIN_DPI = 0.20;

                const now = performance.now();
                const dt = Math.min(0.05, (now - (this.lastTime ?? now)) / 1000);
                this.lastTime = now;
                const dt60 = dt * 60;

                const mouseSpeed = Math.hypot(moveX, moveY);
                if (mouseSpeed > 0.3) {
                    this.lastMoveTime = now; // Record timestamp of active movement

                    // 1. Integer Swing Direction State Machine (-1 = LEFT, 1 = RIGHT, 0 = UNSET)
                    const currentDir = (moveX > 0.3) ? 1 : ((moveX < -0.3) ? -1 : 0);
                    if (currentDir !== 0) {
                        // Direction flip check (e.g. -1 -> 1 or 1 -> -1)
                        if (this.swingDirection !== 0 && this.swingDirection !== currentDir) {
                            this.currentDPI = 0.40; // Direct reset to 0.40 on horizontal direction flip!
                        }
                        this.swingDirection = currentDir;
                    }

                    // 2. Track Shoulder-to-Handle Angle Delta (Upward vs Downward)
                    const currentBatAngle = Math.atan2(this.mouseY - 450, this.mouseX - 300) * (180 / Math.PI);
                    const isUpward = (this.prevBatAngle !== null && currentBatAngle < this.prevBatAngle);
                    this.prevBatAngle = currentBatAngle;

                    // --- ACTIVE SWING: DPI ONLY INCREASES (no upper limit cap, 4x gain rate) ---
                    const speedFactor = Math.min(2.5, mouseSpeed * 0.06);
                    const rateIncr = (0.032 + storedPE * 0.060) * speedFactor * dt60;
                    this.currentDPI += rateIncr;

                    // 3. Smooth Damping (30 deg -> 0 deg) ONLY for Upward Movement
                    if (isUpward && currentBatAngle >= 0 && currentBatAngle <= 30) {
                        const dampFactor = currentBatAngle / 30.0; // 1.0 at 30 deg -> 0.0 at 0 deg
                        const targetDamped = MIN_DPI + (this.currentDPI - MIN_DPI) * dampFactor;
                        this.currentDPI = Math.min(this.currentDPI, targetDamped);
                    }
                }

                // Enforce minimum floor (0.20)
                this.currentDPI = Math.max(MIN_DPI, this.currentDPI);
                activeDPI = this.currentDPI;
            } else {
                activeDPI = 0.60; // Static 0.60 DPI for Bowling mode
                this.currentDPI = activeDPI;
            }

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

        const dispatchVirtualClick = () => {
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            const clientX = rect.left + (this.mouseX * (rect.width / canvas.width));
            const clientY = rect.top + (this.mouseY * (rect.height / canvas.height));

            const target = document.elementFromPoint(clientX, clientY);
            if (target && target !== canvas && target instanceof HTMLElement) {
                target.click();
            }
        };

        window.addEventListener("pointerdown", (e: PointerEvent) => {
            if (e.button === 0) {
                this.isMouseDown = true;
                this.isMouseActive = true;
                dispatchVirtualClick();
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

    public update(dtSeconds: number = 1 / 60) {
        if (this.gameMode !== 'BATTING') return;

        const MIN_DPI = 0.20;
        const STANCE_DPI = 0.40;
        const dt60 = dtSeconds * 60;

        const now = performance.now();
        const idleTime = (now - this.lastMoveTime) / 1000;

        // Only decay if hand has truly stopped moving for > 120ms (0.12s)
        if (idleTime > 0.120) {
            this.swingDirection = 0; // Reset direction state on idle
            if (this.currentDPI > STANCE_DPI) {
                // Ultra-gentle decay back to STANCE_DPI (0.40) over ~1.6 seconds (2x slower decay)
                this.currentDPI = STANCE_DPI + (this.currentDPI - STANCE_DPI) * Math.pow(0.985, dt60);
            }
        }

        this.currentDPI = Math.max(MIN_DPI, this.currentDPI);
    }

    getHistory(): CricketQueue<MouseSample> {
        return this.history;
    }
}