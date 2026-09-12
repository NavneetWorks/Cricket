export default class Joystick {
    public centerX: number = 0;
    public centerY: number = 0;
    public baseRadius: number = 120;
    public knobRadius: number = 20;

    public isActive: boolean = false;
    public knobX: number = 0;
    public knobY: number = 0;

    public angleRad: number = 0;
    public distanceRatio: number = 0; // 0 to 1

    public isPointerDown: boolean = false;

    constructor() {
        // Event listeners for global mouse/touch pointer dragging
        window.addEventListener("pointerdown", (e: PointerEvent) => this.handlePointerDown(e));
        window.addEventListener("pointermove", (e: PointerEvent) => this.handlePointerMove(e));
        window.addEventListener("pointerup", (e: PointerEvent) => this.handlePointerUp(e));
        window.addEventListener("pointercancel", (e: PointerEvent) => this.handlePointerUp(e));

        window.addEventListener("mousedown", (e: MouseEvent) => this.handleMouseDown(e));
        window.addEventListener("mousemove", (e: MouseEvent) => this.handleMouseMove(e));
        window.addEventListener("mouseup", (e: MouseEvent) => this.handleMouseUp(e));
    }

    public updatePosition(canvasWidth: number, canvasHeight: number): void {
        this.centerX = canvasWidth - 200;  
        this.centerY = canvasHeight - 150;        
        if (!this.isPointerDown) {
            this.knobX = this.centerX + Math.cos(this.angleRad) * (this.distanceRatio * this.baseRadius);
            this.knobY = this.centerY + Math.sin(this.angleRad) * (this.distanceRatio * this.baseRadius);
        }
    }

    private handlePointerDown(e: PointerEvent): void {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        this.checkStart(e.clientX, e.clientY);
    }

    private handleMouseDown(e: MouseEvent): void {
        if (e.button !== 0) return;
        this.checkStart(e.clientX, e.clientY);
    }

    private checkStart(clientX: number, clientY: number): void {
        const canvas = document.querySelector('canvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const screenX = (clientX - rect.left) * scaleX;
        const screenY = (clientY - rect.top) * scaleY;

        const dist = Math.hypot(screenX - this.centerX, screenY - this.centerY);
        // Activate if pointer down within 1.6x base radius of joystick center
        if (dist <= this.baseRadius * 1.6) {
            this.isPointerDown = true;
            this.isActive = true;
            this.updateKnobPosition(screenX, screenY);
        }
    }

    private handlePointerMove(e: PointerEvent): void {
        if (!this.isPointerDown) return;
        this.processMove(e.clientX, e.clientY);
    }

    private handleMouseMove(e: MouseEvent): void {
        if (!this.isPointerDown) return;
        this.processMove(e.clientX, e.clientY);
    }

    private processMove(clientX: number, clientY: number): void {
        const canvas = document.querySelector('canvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const screenX = (clientX - rect.left) * scaleX;
        const screenY = (clientY - rect.top) * scaleY;

        this.updateKnobPosition(screenX, screenY);
    }

    private handlePointerUp(e: PointerEvent): void {
        this.isPointerDown = false;
        this.isActive = false;
        // Sticky Joystick: Preserve knob position, distanceRatio, and angleRad on release!
    }

    private handleMouseUp(e: MouseEvent): void {
        this.isPointerDown = false;
        this.isActive = false;
        // Sticky Joystick: Preserve knob position, distanceRatio, and angleRad on release!
    }

    private updateKnobPosition(screenX: number, screenY: number): void {
        const dx = screenX - this.centerX;
        const dy = screenY - this.centerY;
        const dist = Math.hypot(dx, dy);
        this.angleRad = Math.atan2(dy, dx);

        const clampedDist = Math.min(dist, this.baseRadius);
        this.distanceRatio = clampedDist / this.baseRadius;

        this.knobX = this.centerX + Math.cos(this.angleRad) * clampedDist;
        this.knobY = this.centerY + Math.sin(this.angleRad) * clampedDist;
    }

    public draw(ctx: CanvasRenderingContext2D): void {
        ctx.save();

        // Soft Transparent Outer Base Ring
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, this.baseRadius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(15, 23, 42, 0.22)"; // Soft transparent dark background
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.isActive ? "rgba(56, 189, 248, 0.65)" : "rgba(255, 255, 255, 0.22)";
        ctx.stroke();

        // Direction Indicator Line from center to knob
        if (this.isActive && this.distanceRatio > 0.05) {
            ctx.beginPath();
            ctx.moveTo(this.centerX, this.centerY);
            ctx.lineTo(this.knobX, this.knobY);
            ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        // Glassy Semi-Transparent Inner Knob
        ctx.beginPath();
        ctx.arc(this.knobX, this.knobY, this.knobRadius, 0, Math.PI * 2);
        const knobGrad = ctx.createRadialGradient(
            this.knobX - 4, this.knobY - 4, 2,
            this.knobX, this.knobY, this.knobRadius
        );
        if (this.isActive) {
            knobGrad.addColorStop(0, "rgba(125, 211, 252, 0.75)");
            knobGrad.addColorStop(1, "rgba(2, 132, 199, 0.55)");
        } else {
            knobGrad.addColorStop(0, "rgba(255, 255, 255, 0.4)");
            knobGrad.addColorStop(1, "rgba(148, 163, 184, 0.25)");
        }
        ctx.fillStyle = knobGrad;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.stroke();

        // Label Text above joystick
        ctx.font = "bold 12px system-ui, sans-serif";
        ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
        ctx.textAlign = "center";
        ctx.fillText("BOWLING ARM JOYSTICK", this.centerX, this.centerY - this.baseRadius - 10);

        ctx.restore();
    }
}
