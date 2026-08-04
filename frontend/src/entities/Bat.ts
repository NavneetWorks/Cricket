export default class Bat{
    bat_length = 150;
    x_start = 500;
    
    top = {
        x:this.x_start,
        y:400,
    }

    bottom = {
        x:this.x_start,
        y:400 + this.bat_length,
    }

    draw(ctx:CanvasRenderingContext2D){
        ctx.beginPath();
        ctx.moveTo(this.top.x,this.top.y);
        ctx.lineTo(this.bottom.x,this.bottom.y);
        ctx.lineWidth = 8;
        ctx.strokeStyle = "white";
        ctx.stroke();
    }
}