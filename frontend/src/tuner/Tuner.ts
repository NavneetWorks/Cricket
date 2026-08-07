interface ControlPoint {
    angle: number;  // degrees (-180 to 180)
    radius: number; // pixels
}

export class Tuner {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private jsonOutput: HTMLTextAreaElement;
    
    private width = 0;
    private height = 0;
    
    // Fixed reference point (Shoulder Center)
    private center = { x: 500, y: 500 };

    // The 3 arcs
    private arcs: Record<string, ControlPoint[]> = {
        outer: [],
        inner: [],
        com: []
    };

    private activeArc = "outer";
    private draggingIndex: number | null = null;

    constructor(canvas: HTMLCanvasElement, jsonOutput: HTMLTextAreaElement) {
        // Initialize points every 10 degrees
        for (let a = -180; a < 180; a += 10) {
            this.arcs.outer.push({ angle: a, radius: 200 });
            this.arcs.inner.push({ angle: a, radius: 100 });
            this.arcs.com.push({ angle: a, radius: 250 });
        }
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d")!;
        this.jsonOutput = jsonOutput;

        this.resize();
        window.addEventListener("resize", () => this.resize());

        this.setupMouseEvents();
        this.updateJson();
    }

    private resize() {
        this.width = this.canvas.parentElement!.clientWidth;
        this.height = this.canvas.parentElement!.clientHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.center = { x: this.width * 0.4, y: this.height * 0.5 }; // Place slightly left
    }

    public setActiveArc(arc: string) {
        this.activeArc = arc;
        this.draggingIndex = null;
        this.updateJson();
    }

    public addControlPoint() {
        const pts = this.arcs[this.activeArc];
        pts.push({ angle: 45, radius: 150 });
        this.sortPoints();
        this.updateJson();
    }

    private sortPoints() {
        this.arcs[this.activeArc].sort((a, b) => a.angle - b.angle);
    }

    public modifyAllPoints(addRadius: number, multiplyRadius: number) {
        for (let pt of this.arcs[this.activeArc]) {
            let newRadius = (pt.radius + addRadius) * multiplyRadius;
            pt.radius = Math.max(10, Math.round(newRadius));
        }
        this.updateJson();
    }

    private getPointCoords(pt: ControlPoint) {
        const rad = pt.angle * Math.PI / 180;
        return {
            x: this.center.x + Math.cos(rad) * pt.radius,
            y: this.center.y + Math.sin(rad) * pt.radius
        };
    }

    private setupMouseEvents() {
        let isMouseDown = false;

        this.canvas.addEventListener("mousedown", (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const pts = this.arcs[this.activeArc];
            for (let i = 0; i < pts.length; i++) {
                const coord = this.getPointCoords(pts[i]);
                const dist = Math.hypot(coord.x - mouseX, coord.y - mouseY);
                if (dist < 10) { // Handle radius smaller
                    this.draggingIndex = i;
                    isMouseDown = true;
                    break;
                }
            }
        });

        this.canvas.addEventListener("mousemove", (e) => {
            if (!isMouseDown || this.draggingIndex === null) return;

            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const dx = mouseX - this.center.x;
            const dy = mouseY - this.center.y;
            
            const newRadius = Math.max(10, Math.hypot(dx, dy));

            // Only update radius, keep angle fixed
            this.arcs[this.activeArc][this.draggingIndex].radius = Math.round(newRadius);

            this.updateJson();
        });

        const onUp = () => {
            if (isMouseDown) {
                isMouseDown = false;
                this.draggingIndex = null;
                this.sortPoints();
                this.updateJson();
            }
        };

        this.canvas.addEventListener("mouseup", onUp);
        this.canvas.addEventListener("mouseleave", onUp);
    }

    private updateJson() {
        this.jsonOutput.value = JSON.stringify(this.arcs[this.activeArc], null, 2);
    }

    // A helper to interpolate radius for a given angle (-180 to 180)
    private getInterpolatedRadius(pts: ControlPoint[], targetAngle: number): number {
        if (pts.length === 0) return 100;
        if (pts.length === 1) return pts[0].radius;

        // Find the two points that bound the targetAngle
        let p1 = pts[pts.length - 1]; // Assume wrap around initially
        let p2 = pts[0];
        
        for (let i = 0; i < pts.length - 1; i++) {
            if (targetAngle >= pts[i].angle && targetAngle <= pts[i + 1].angle) {
                p1 = pts[i];
                p2 = pts[i + 1];
                break;
            }
        }

        // Handle wrap around across -180/180
        let a1 = p1.angle;
        let a2 = p2.angle;
        if (a1 > a2) {
            if (targetAngle > a1) a2 += 360;
            else a1 -= 360;
        }

        const t = (targetAngle - a1) / (a2 - a1);
        return p1.radius + t * (p2.radius - p1.radius);
    }

    public draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        // Draw Center (Shoulder)
        this.ctx.beginPath();
        this.ctx.arc(this.center.x, this.center.y, 8, 0, Math.PI * 2);
        this.ctx.fillStyle = "#00ff00";
        this.ctx.fill();

        // Draw the full interpolated curve
        const pts = this.arcs[this.activeArc];
        if (pts.length > 1) {
            this.ctx.beginPath();
            for (let a = -180; a <= 180; a += 2) {
                const r = this.getInterpolatedRadius(pts, a);
                const rad = a * Math.PI / 180;
                const x = this.center.x + Math.cos(rad) * r;
                const y = this.center.y + Math.sin(rad) * r;
                
                if (a === -180) this.ctx.moveTo(x, y);
                else this.ctx.lineTo(x, y);
            }
            this.ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
        }

        // Draw Control Points
        for (let i = 0; i < pts.length; i++) {
            const coord = this.getPointCoords(pts[i]);
            
            this.ctx.beginPath();
            this.ctx.arc(coord.x, coord.y, 5, 0, Math.PI * 2); // Smaller dots
            this.ctx.fillStyle = this.draggingIndex === i ? "#ffaa00" : "#ff0000";
            this.ctx.fill();
            this.ctx.strokeStyle = "#fff";
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // Draw line to center
            this.ctx.beginPath();
            this.ctx.moveTo(this.center.x, this.center.y);
            this.ctx.lineTo(coord.x, coord.y);
            this.ctx.strokeStyle = "rgba(255, 0, 0, 0.3)";
            this.ctx.stroke();

            // Text slightly smaller and less intrusive
            this.ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
            this.ctx.font = "10px sans-serif";
            this.ctx.fillText(`${pts[i].angle}°, ${pts[i].radius}`, coord.x + 8, coord.y);
        }
    }
}
