export default class Input{
    public mouseX:number = 0;
    public mouseY: number = 0;

    constructor(canvas:HTMLCanvasElement){
        canvas.addEventListener("mousemove",(event) => {
            const rect = canvas.getBoundingClientRect();

            this.mouseX = event.clientX - rect.left;
            this.mouseY = event.clientY - rect.top;
        });
    }
}