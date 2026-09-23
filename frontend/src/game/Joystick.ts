import { CANVAS_WIDTH, CANVAS_HEIGHT } from "./constants";
import { JUMP_RELEASE_FRAME_MIN, JUMP_RELEASE_FRAME_MAX } from "../entities/Bowler";

export default class Joystick {
    public centerX: number = CANVAS_WIDTH - 220;
    public centerY: number = CANVAS_HEIGHT - 150;
    public baseRadius: number = 100;
    public outerBufferRadius: number = 105; // 1.15 * baseRadius (Outer Release Circle)
    public knobRadius: number = 10;

    public isActive: boolean = false;
    public knobX: number = 0;
    public knobY: number = 0;

    public angleRad: number = 0;
    public distanceRatio: number = 0; // 0 to 1

    public isPointerDown: boolean = false;
    public releaseIndicatorAngleRad: number | null = null;

    public setReleaseIndicator(angleRad: number): void {
        this.releaseIndicatorAngleRad = angleRad;
    }

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

    // public updatePosition(canvasWidth: number, canvasHeight: number): void {
    //     this.centerX = canvasWidth - 200;  
    //     this.centerY = canvasHeight - 150;        
    // }

    public setSyncedKnobPos(smoothAngleRad: number, smoothRadiusRatio: number): void {
        this.knobX = this.centerX + Math.cos(smoothAngleRad) * (smoothRadiusRatio * this.baseRadius);
        this.knobY = this.centerY + Math.sin(smoothAngleRad) * (smoothRadiusRatio * this.baseRadius);
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
            this.mouseTrailPoints = [{ x: screenX, y: screenY }];
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
    public onJoystickMove?: (screenX: number, screenY: number) => void;


    public lastRawMouseScreenX: number = 0;
    public lastRawMouseScreenY: number = 0;
    public prevRawMouseScreenX: number = 0;
    public prevRawMouseScreenY: number = 0;

    // Last mouse position recorded while inside Inner Circle R1
    public lastInsideInnerMouseX: number = 0;
    public lastInsideInnerMouseY: number = 0;

    // 🖤 Mouse Drag Black Trailing System
    public mouseTrailPoints: Array<{ x: number; y: number }> = [];

    private processMove(clientX: number, clientY: number): void {
        const canvas = document.querySelector('canvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const screenX = (clientX - rect.left) * scaleX;
        const screenY = (clientY - rect.top) * scaleY;

        const distFromCenter = Math.hypot(screenX - this.centerX, screenY - this.centerY);
        if (distFromCenter <= this.baseRadius) {
            this.lastInsideInnerMouseX = screenX;
            this.lastInsideInnerMouseY = screenY;
        }

        this.prevRawMouseScreenX = this.lastRawMouseScreenX > 0 ? this.lastRawMouseScreenX : screenX;
        this.prevRawMouseScreenY = this.lastRawMouseScreenY > 0 ? this.lastRawMouseScreenY : screenY;
        this.lastRawMouseScreenX = screenX;
        this.lastRawMouseScreenY = screenY;

        if (this.isPointerDown) {
            this.mouseTrailPoints.push({ x: screenX, y: screenY });
            if (this.mouseTrailPoints.length > 25) {
                this.mouseTrailPoints.shift();
            }
        }

        this.updateKnobPosition(screenX, screenY);

        if (this.onJoystickMove) {
            this.onJoystickMove(screenX, screenY);
        }
    }

    private getCircleIntersection(
        p1X: number, p1Y: number,
        p2X: number, p2Y: number,
        radius: number
    ): { x: number; y: number } | null {
        const dx = p2X - p1X;
        const dy = p2Y - p1Y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 0.0001) return null;

        const fx = p1X - this.centerX;
        const fy = p1Y - this.centerY;

        const a = lenSq;
        const b = 2 * (fx * dx + fy * dy);
        const c = (fx * fx + fy * fy) - radius * radius;

        const discriminant = b * b - 4 * a * c;
        if (discriminant < 0) return null;

        const t = (-b + Math.sqrt(discriminant)) / (2 * a);
        return { x: p1X + t * dx, y: p1Y + t * dy };
    }

    public checkLineCircleFlick(
        prevX: number, prevY: number,
        currX: number, currY: number,
        rInner: number, rOuter: number
    ): { triggered: boolean; releaseAngleRad: number; flickSpeed: number } {
        const distCurr = Math.hypot(currX - this.centerX, currY - this.centerY);

        if (distCurr >= rOuter && this.lastInsideInnerMouseX > 0 && this.lastInsideInnerMouseY > 0) {
            const innerX = this.lastInsideInnerMouseX;
            const innerY = this.lastInsideInnerMouseY;

            const flickDx = currX - innerX;
            const flickDy = currY - innerY;

            const flickAngleRad = Math.atan2(flickDy, flickDx);
            const flickSpeed = Math.hypot(flickDx, flickDy);

            // Reset recorded inner mouse position after release trigger
            this.lastInsideInnerMouseX = 0;
            this.lastInsideInnerMouseY = 0;

            return { triggered: true, releaseAngleRad: flickAngleRad, flickSpeed };
        }

        return { triggered: false, releaseAngleRad: 0, flickSpeed: 0 };
    }

    private handlePointerUp(e: PointerEvent): void {
        this.isPointerDown = false;
        this.isActive = false;
        this.mouseTrailPoints = [];
    }

    private handleMouseUp(e: MouseEvent): void {
        this.isPointerDown = false;
        this.isActive = false;
        this.mouseTrailPoints = [];
    }

    public updateKnobPosition(screenX: number, screenY: number): void {
        const dx = screenX - this.centerX;
        const dy = screenY - this.centerY;
        const dist = Math.hypot(dx, dy);

        // Record last position inside inner circle for both local drag & remote UDP stream
        if (dist <= this.baseRadius) {
            this.lastInsideInnerMouseX = screenX;
            this.lastInsideInnerMouseY = screenY;
        }

        this.angleRad = Math.atan2(dy, dx);

        const clampedDist = Math.min(dist, this.baseRadius);
        this.distanceRatio = clampedDist / this.baseRadius;

        this.knobX = this.centerX + Math.cos(this.angleRad) * clampedDist;
        this.knobY = this.centerY + Math.sin(this.angleRad) * clampedDist;
    }

    public draw(ctx: CanvasRenderingContext2D): void {
        ctx.save();

        // Soft Transparent Inner Base Ring (R1)
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, this.baseRadius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(15, 23, 42, 0.22)"; // Soft transparent dark background
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.isActive ? "rgba(56, 189, 248, 0.65)" : "rgba(255, 255, 255, 0.22)";
        ctx.stroke();

        // 🛡️ Outer Release Buffer Circle (R2 = 1.15 * baseRadius)
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, this.outerBufferRadius, 0, Math.PI * 2);
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 4]); // Bold Dashed Ring
        ctx.strokeStyle = this.isActive ? "#f59e0b" : "rgba(245, 158, 11, 0.90)"; // Bold Dark Amber Gold
        ctx.stroke();
        ctx.setLineDash([]); // Reset line dash

        // 🎯 RELEASE ZONE Arc Sector Rendering (Calculated from JUMP_RELEASE_FRAME_MIN and MAX)
        const radius = this.baseRadius;
        const minDegFromSix = JUMP_RELEASE_FRAME_MIN - 360.0; // e.g. 500 - 360 = 140°
        const maxDegFromSix = JUMP_RELEASE_FRAME_MAX - 360.0; // e.g. 590 - 360 = 230°

        // Canvas angles relative to 6 o'clock (90°) rotating anti-clockwise (subtracting degrees)
        const startCanvasAngleRad = ((90.0 - minDegFromSix) * Math.PI) / 180.0; // e.g. -50° (top-right)
        const endCanvasAngleRad = ((90.0 - maxDegFromSix) * Math.PI) / 180.0;   // e.g. -140° (top-left)

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(this.centerX, this.centerY);
        ctx.arc(this.centerX, this.centerY, radius, startCanvasAngleRad, endCanvasAngleRad, true);
        ctx.closePath();

        // Light Green Translucent Fill
        ctx.fillStyle = "rgba(34, 197, 94, 0.28)"; // Soft emerald green
        ctx.fill();

        // Emerald Green Border Line
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 2.0;
        ctx.stroke();

        // RELEASE ZONE Text Label inside arc sector
        const midCanvasAngleRad = (startCanvasAngleRad + endCanvasAngleRad) / 2.0;
        const labelR = radius * 0.65;
        const labelX = this.centerX + Math.cos(midCanvasAngleRad) * labelR;
        const labelY = this.centerY + Math.sin(midCanvasAngleRad) * labelR;

        ctx.font = "bold 11px system-ui, sans-serif";
        ctx.fillStyle = "rgba(134, 239, 172, 0.95)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("RELEASE ZONE", labelX, labelY);
        ctx.restore();

        // 🕒 4-Clock Position Dashed Crosshair Lines (Clean, no text)
        ctx.save();
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);

        // 6 o'clock (Bottom)
        ctx.strokeStyle = "rgba(34, 197, 94, 0.5)"; // Green
        ctx.beginPath();
        ctx.moveTo(this.centerX, this.centerY);
        ctx.lineTo(this.centerX, this.centerY + radius);
        ctx.stroke();

        // 9 o'clock (Left)
        ctx.strokeStyle = "rgba(234, 179, 8, 0.5)"; // Yellow
        ctx.beginPath();
        ctx.moveTo(this.centerX, this.centerY);
        ctx.lineTo(this.centerX - radius, this.centerY);
        ctx.stroke();

        // 12 o'clock (Top)
        ctx.strokeStyle = "rgba(239, 68, 68, 0.5)"; // Red
        ctx.beginPath();
        ctx.moveTo(this.centerX, this.centerY);
        ctx.lineTo(this.centerX, this.centerY - radius);
        ctx.stroke();

        // 3 o'clock (Right)
        ctx.strokeStyle = "rgba(6, 182, 212, 0.5)"; // Cyan
        ctx.beginPath();
        ctx.moveTo(this.centerX, this.centerY);
        ctx.lineTo(this.centerX + radius, this.centerY);
        ctx.stroke();

        ctx.restore();

        // 🎯 Ball Release Indicator Line & Marker inside Green RELEASE ZONE
        if (this.releaseIndicatorAngleRad !== null) {
            ctx.save();
            const relX = this.centerX + Math.cos(this.releaseIndicatorAngleRad) * radius;
            const relY = this.centerY + Math.sin(this.releaseIndicatorAngleRad) * radius;

            // Bright Amber/Gold Indicator Line from center through green arc
            ctx.beginPath();
            ctx.moveTo(this.centerX, this.centerY);
            ctx.lineTo(relX, relY);
            ctx.strokeStyle = "#fbbf24"; // Bright amber/gold
            ctx.lineWidth = 3.0;
            ctx.shadowColor = "#f59e0b";
            ctx.shadowBlur = 8;
            ctx.stroke();

            // Glowing release point dot marker at the edge
            ctx.beginPath();
            ctx.arc(relX, relY, 6, 0, Math.PI * 2);
            ctx.fillStyle = "#ef4444"; // Bright red center
            ctx.fill();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2.0;
            ctx.stroke();

            ctx.restore();
        }

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

        // 🖤 BLACK MOUSE TRAILING RIBBON AND DOTS
        if (this.mouseTrailPoints.length > 1) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(this.mouseTrailPoints[0].x, this.mouseTrailPoints[0].y);
            for (let i = 1; i < this.mouseTrailPoints.length; i++) {
                ctx.lineTo(this.mouseTrailPoints[i].x, this.mouseTrailPoints[i].y);
            }
            ctx.strokeStyle = "rgba(15, 23, 42, 0.85)";
            ctx.lineWidth = 3.5;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.stroke();

            // Render trailing dots along mouse drag path
            for (let i = 0; i < this.mouseTrailPoints.length; i++) {
                const pt = this.mouseTrailPoints[i];
                const progress = (i + 1) / this.mouseTrailPoints.length;
                const dotRadius = 2.5 + progress * 3.5;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, dotRadius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(0, 0, 0, ${0.3 + progress * 0.7})`;
                ctx.fill();
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 * progress})`;
                ctx.lineWidth = 1.0;
                ctx.stroke();
            }
            ctx.restore();
        }

        // Label Text above joystick
        ctx.font = "bold 12px system-ui, sans-serif";
        ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
        ctx.textAlign = "center";
        ctx.fillText("BOWLING ARM JOYSTICK", this.centerX, this.centerY - this.baseRadius - 10);

        ctx.restore();
    }

    public reset(): void {
        this.isPointerDown = false;
        this.isActive = false;
        this.angleRad = Math.PI;
        this.distanceRatio = 0;
        this.knobX = this.centerX;
        this.knobY = this.centerY;
        this.releaseIndicatorAngleRad = null;
    }
}
