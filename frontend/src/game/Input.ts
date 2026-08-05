import CricketQueue from "../utils/CircularQueue";

export interface MouseSample {
    x: number;
    y: number;
    time: number;
}

export default class Input{
    public mouseX:number = 0;
    public mouseY: number = 0;
    private readonly MAX_HISTORY = 1000;

    private history = new CricketQueue<MouseSample>(this.MAX_HISTORY);

    constructor(canvas:HTMLCanvasElement){
        canvas.addEventListener("mousemove",(event) => {

            this.mouseX = event.offsetX;
            this.mouseY = event.offsetY;

            this.history.enqueue({
                x: this.mouseX,
                y: this.mouseY,
                time: performance.now(),
            });
        });
    }

   getHistory(): CricketQueue<MouseSample> {
        return this.history;
    }
}