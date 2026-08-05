import { BAT_CENTER_OF_MASS_RATIO ,GRAVITY} from "../game/constants";

export default class Bat{
    
    private armLength = 120;
    private batLength = 150;
    private handOffsetAngle = 20;
    private handAngle = 0;
    private shoulderAngle = 0;
    private shoulderAngularVelocity = 0;
    private shoulderAngularAcceleration = 0;
    private wristAngle = 0;
    private wristAngularVelocity = 0;
    private wristAngularAcceleration = 0;
    private gravityTorque = 0;


    private shoulder = {
        x:500,
        y:350,
    };

    private hand = {
        x:500,
        y:350 + this.armLength,
    };

    private centerOfMass = {
        x: 0,
        y: 0,
    };

    private k = {
        x: 0,
        y: 0,
    };

    private mouse = {
        x: 0,
        y: 0,
    };

   update(mouseX: number, mouseY: number): void {

        this.updateMouse(mouseX, mouseY);

        this.updateAngles();

        this.updateHandPosition();

        this.updateCenterOfMass();

        this.calculateGravityTorque();
    }
    private updateMouse(mouseX: number, mouseY: number): void {

        this.mouse.x = mouseX;
        this.mouse.y = mouseY;
    }
    private updateAngles(): void {

        const dx = this.mouse.x - this.shoulder.x;
        const dy = this.mouse.y - this.shoulder.y;

        const targetAngle = Math.atan2(dy, dx);

        // Temporary
        this.shoulderAngle = targetAngle;

        this.wristAngle =
            this.shoulderAngle -
            this.handOffsetAngle * Math.PI / 180;

        const batOffset = 80 * Math.PI / 180;

        this.handAngle =
            this.wristAngle +
            batOffset;
    }
    private updateHandPosition(): void {

        this.hand.x =
            this.shoulder.x +
            this.armLength *
            Math.cos(this.wristAngle);

        this.hand.y =
            this.shoulder.y +
            this.armLength *
            Math.sin(this.wristAngle);
    }
    private updateCenterOfMass(): void {

        const comDistance =
            this.batLength *
            BAT_CENTER_OF_MASS_RATIO;

        this.centerOfMass.x =
            this.hand.x +
            Math.cos(this.handAngle) * comDistance;

        this.centerOfMass.y =
            this.hand.y +
            Math.sin(this.handAngle) * comDistance;
    }
    private calculateGravityTorque(): void {

        const comDistance =
            this.batLength *
            BAT_CENTER_OF_MASS_RATIO;

        const gravityAngle =
            this.handAngle -
            Math.PI / 2;

        this.gravityTorque =
            comDistance *
            GRAVITY *
            Math.sin(gravityAngle);
    }
    draw(ctx: CanvasRenderingContext2D) {


        this.drawBat(ctx);
        this.drawDebug(ctx);

    }
    private drawBat(ctx: CanvasRenderingContext2D) {

        const batBottomX = this.hand.x + this.batLength * Math.cos(this.handAngle);
        const batBottomY = this.hand.y + this.batLength * Math.sin(this.handAngle);

        //shoudler to hand
        ctx.beginPath();
        ctx.moveTo(this.shoulder.x,this.shoulder.y);
        ctx.lineTo(this.hand.x,this.hand.y);
        ctx.lineWidth = 3;
        ctx.strokeStyle = "yellow";
        ctx.stroke();

        //hand to bat
        ctx.beginPath();
        ctx.moveTo(this.hand.x,this.hand.y);
        ctx.lineTo(batBottomX, batBottomY);
        ctx.lineWidth = 8;
        ctx.strokeStyle = "white";
        ctx.stroke();
    }
    private drawDebug(ctx: CanvasRenderingContext2D) {
        //shoulder debug circle

        ctx.beginPath();
        ctx.arc(this.shoulder.x,this.shoulder.y,5,0,Math.PI*2);
        ctx.fillStyle = "red";
        ctx.fill();

        //hand debug circle
        ctx.beginPath();
        ctx.arc(this.hand.x,this.hand.y,5,0,Math.PI*2);
        ctx.fillStyle = "blue";
        ctx.fill();

        // Debug Line Mouse → Shoulder
        ctx.beginPath();
        ctx.moveTo(this.mouse.x,this.mouse.y);
        ctx.lineTo(this.shoulder.x,this.shoulder.y);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "red";
        ctx.stroke();
    
        // Mouse Debug Circle

        ctx.beginPath();
        ctx.arc(this.mouse.x,this.mouse.y,5,0,Math.PI * 2);
        ctx.fillStyle = "red";
        ctx.fill();

        // K Debug Circle
        ctx.beginPath();
        ctx.arc(this.k.x,this.k.y,5,0,Math.PI * 2);
        ctx.fillStyle = "lime";
        ctx.fill();

        // Center of Mass Debug Circle
        ctx.beginPath();
        ctx.arc(this.centerOfMass.x,this.centerOfMass.y,5,0,Math.PI * 2);
        ctx.fillStyle = "magenta";
        ctx.fill();
    }


}