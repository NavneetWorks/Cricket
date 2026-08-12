type Vec2 = { x: number; y: number };

export default class BowlingArea {
    public x: number = 1450;
    public y: number = 400;
    public width: number = 280;
    public height: number = 280;

    /**
     * Dynamic rest center calculated from current bounding box
     */
    public get restCenter(): Vec2 {
        return {
            x: this.x + this.width / 2,
            y: this.y + this.height / 2
        };
    }

    constructor() {}

    public isMouseInside(mouseX: number, mouseY: number): boolean {
        return (
            mouseX >= this.x &&
            mouseX <= this.x + this.width &&
            mouseY >= this.y &&
            mouseY <= this.y + this.height
        );
    }

    public update(dt: number, mouseX: number, mouseY: number): void {
        // Future mouse windup & sudden stop physics update
    }

    public draw(ctx: CanvasRenderingContext2D): void {
        ctx.save();

        const boxX = this.x;
        const boxY = this.y;
        const boxW = this.width;
        const boxH = this.height;
        const center = this.restCenter;

        // 1. Semi-transparent dark slate background card
        ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
        ctx.fillRect(boxX, boxY, boxW, boxH);

        // 2. Cyan glowing outer border
        ctx.strokeStyle = "#0ea5e9";
        ctx.lineWidth = 2.5;
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        // 3. Inner dashed target box (scaled proportionally)
        ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
        ctx.lineWidth = 1.0;
        ctx.setLineDash([6, 6]);
        const innerMarginX = 15;
        const innerMarginTop = 38;
        const innerMarginBottom = 30;
        ctx.strokeRect(
            boxX + innerMarginX,
            boxY + innerMarginTop,
            boxW - innerMarginX * 2,
            boxH - innerMarginTop - innerMarginBottom
        );
        ctx.setLineDash([]);

        // 4. Header label ("SQUARE BOWLING AREA")
        ctx.font = "bold 13px sans-serif";
        ctx.fillStyle = "#38bdf8"; // Bright cyan
        ctx.textAlign = "center";
        ctx.fillText("SQUARE BOWLING AREA", center.x, boxY + 24);

        // 5. Instruction Subtext (scaled to fit box width)
        ctx.font = "10px sans-serif";
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        ctx.fillText("SWING MOUSE IN ARC & WHIP STOP TO RELEASE", center.x, boxY + boxH - 10);

        // 6. Rest Ball Target Marker (Exact Center of Bowling Square)
        ctx.strokeStyle = "rgba(250, 204, 21, 0.6)"; // Amber target circle
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(center.x, center.y, 20, 0, 2 * Math.PI);
        ctx.stroke();

        ctx.restore();
    }
}
