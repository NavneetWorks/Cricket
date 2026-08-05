interface MouseSample {
    x: number;
    y: number;
    time: number;
}

export default class Input{
    public mouseX:number = 0;
    public mouseY: number = 0;

    private history: MouseSample[] = [];

    private readonly MAX_HISTORY = 1000;





    constructor(canvas:HTMLCanvasElement){
        canvas.addEventListener("mousemove",(event) => {

            this.mouseX = event.offsetX;
            this.mouseY = event.offsetY;

            this.history.push({
                x:this.mouseX,
                y:this.mouseY,
                time: performance.now(),
            })
            if (this.history.length > this.MAX_HISTORY) {
                this.history.shift();
            }
        });
    }
}