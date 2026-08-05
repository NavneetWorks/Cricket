export default class CircularQueue<T>{
    private data:(T|null)[];
    private capacity:number;
    private front = 0;
    private rear = 0;
    private size = 0;

    constructor(capacity:number){
        this.capacity = capacity;
        this.data = new Array(capacity).fill(null);
    }
    isFull():boolean{
        return this.size === this.capacity;
    }
    isEmpty():boolean{
        return this.size === 0;
    }
    getSize():number{
        return this.size;
    }
    enqueue(value:T):boolean{
        if(this.isFull()){
            return false;
        }
        this.data[this.rear] = value;
        this.rear = (this.rear + 1) % this.capacity;
        this.size++;
        return true;
    }
    dequeue():T|null{
        if(this.isEmpty()){
            return null;
        }
        const value = this.data[this.front];
        this.front = (this.front + 1) % this.capacity;
        this.size--;
        return value;
    }
    peek():T|null{
        if(this.isEmpty()){
            return null;
        }
        return this.data[this.front];
    }
}