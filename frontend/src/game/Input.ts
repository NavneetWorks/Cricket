import CricketQueue from "../utils/CircularQueue";

export interface MouseSample {
    x: number;
    y: number;
    time: number;
}

export default class Input {
    public mouseX: number = 0;
    public mouseY: number = 0;
    public pressedKeys: Set<string> = new Set();
    private readonly MAX_HISTORY = 1000;

    private history = new CricketQueue<MouseSample>(this.MAX_HISTORY);

    constructor(canvas: HTMLCanvasElement) {
        const updatePointer = (clientX: number, clientY: number) => {
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            this.mouseX = (clientX - rect.left) * scaleX;
            this.mouseY = (clientY - rect.top) * scaleY;

            this.history.enqueue({
                x: this.mouseX,
                y: this.mouseY,
                time: performance.now(),
            });
        };

        // Window-level global listeners for smooth uninterrupted mouse movement
        window.addEventListener("pointermove", (event: PointerEvent) => {
            updatePointer(event.clientX, event.clientY);
        });

        window.addEventListener("mousemove", (event: MouseEvent) => {
            updatePointer(event.clientX, event.clientY);
        });

        // Non-blocking keyboard tracking for all keys
        window.addEventListener("keydown", (event: KeyboardEvent) => {
            this.pressedKeys.add(event.code);
            this.pressedKeys.add(event.key.toLowerCase());

            // Prevent default page scroll for navigation/WASD/Space keys
            if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
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