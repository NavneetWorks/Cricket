
import {serializeBatSwing,serializeBowlerRelease,serializeHitResult,PacketType,serializePing,serializePong} from './NetworkProtocol';
export default class NetWorkManager{
    private ws:WebSocket | null = null;
    private pc: RTCPeerConnection | null = null;
    private dataChannel: RTCDataChannel | null = null

    public myPlayerId:number = 0;
    public opponentId:number = 0;
    public myRole: 'BATSMAN' | 'BOWLER' | 'NONE' = 'NONE';
    public isConnected:boolean = false;

    public onMatchStart?:(role:'BATSMAN' | 'BOWLER' | 'NONE' , myId:number,oppId:number)=>void;
    public onOpponentBatSwing?:(tick:number,handleX:number,handleY:number,angle:number)=>void;
    public onBowlerRelease?: (startX: number, startY: number, startVx: number, startVy: number) => void;
    public onHitResult?: (exitX: number, exitY: number, exitVx: number, exitVy: number) => void;

    private heartbeatTimer: any = null;

    private rttSamples : number[] = [];
    private pingSequence  : number = 0;
    private pendingPings:Map<number,number> = new Map();
    private rttPingTimer: any = null;
    public lastRTT:number = 0;
    private readonly RTT_CLAMP_MIN = 20;
    private readonly RTT_WINDOW_SIZE = 8;

    public connect(serverUrl:string = "ws://localhost:9001"){
        this.ws = new WebSocket(serverUrl);
        this.ws.binaryType = "arraybuffer";
        this.ws.onopen = () => {
            console.log("🟢 WebSocket Connected! Initializing WebRTC Engine...");
            this.setupWebRTC();

            // 💓 5-Second Keep-Alive Heartbeat to prevent idle disconnect
            if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = setInterval(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    const pingJson = JSON.stringify({ type: "PING" });
                    const encoder = new TextEncoder();
                    const textBuf = encoder.encode(pingJson);
                    const pkt = new Uint8Array(1 + textBuf.byteLength);
                    pkt[0] = 0x63;
                    pkt.set(textBuf, 1);
                    this.ws.send(pkt.buffer);
                }
            }, 5000);
        };
        this.ws.onmessage = async(event:MessageEvent) => {
            if(event.data instanceof ArrayBuffer){
                const view = new DataView(event.data);
                const firstByte = view.getUint8(0);

                if(firstByte == 0x63){
                    const textDecoder = new TextDecoder();
                    const jsonStr = textDecoder.decode(event.data.slice(1));
                    const signalingMsg = JSON.parse(jsonStr);
                    this.handleSignalingJSON(signalingMsg);
                }
            }
        }
        this.ws.onclose = () => {
            console.warn(" WebSocket Disconnected from Server");
            this.isConnected=false;
            this.stopRttHeartbeat();
            if (this.heartbeatTimer) {
                clearInterval(this.heartbeatTimer);
                this.heartbeatTimer = null;
            }
        };
    }

    private async setupWebRTC(){
        const rtcConfig:RTCConfiguration = {
            iceServers:[
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "turn:openrelay.metered.ca:80", username: "openrelay", credential: "openrelay" }
            ]
        };
        this.pc = new RTCPeerConnection(rtcConfig);
        this.dataChannel = this.pc.createDataChannel("gameData");
        this.dataChannel.binaryType = "arraybuffer";
        this.dataChannel.onopen = () => {
            console.log("UPDT data channel is now open and active")
            this.isConnected = true;
             this.startRttHeartbeat();
        };
        this.dataChannel.onmessage = (dcEvent:MessageEvent) => {
            if(dcEvent.data instanceof ArrayBuffer){
                this.handleBinaryUDPMessage(dcEvent.data);
            }
        };
        this.pc.onicecandidate = (event) => {
            if(event.candidate && this.ws && this.ws.readyState === WebSocket.OPEN){
                const candidateMsg = {
                    type: "candidate",
                    candidate:event.candidate.candidate,
                    mid:event.candidate.sdpMid,
                };
                const encoder = new TextEncoder();
                const jsonBytes = encoder.encode(JSON.stringify(candidateMsg));
                const payload = new Uint8Array(1+jsonBytes.length);
                payload[0] = 0x63;
                payload.set(jsonBytes,1);
                this.ws.send(payload.buffer);
            }
        };
        try{
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            const offerMsg = {type:"offer",sdp:offer.sdp};
            const encoder = new TextEncoder();
            const jsonBytes = encoder.encode(JSON.stringify(offerMsg));
            const payload = new Uint8Array(1+jsonBytes.length);
            payload[0] = 0x63;
            payload.set(jsonBytes,1);
            if(this.ws && this.ws.readyState === WebSocket.OPEN){
                this.ws.send(payload.buffer);
                console.log("WebRTC Offer sent to server for signaling.");
            }
        }catch(e){
            console.error("Error during WebRTC offer creation or sending:", e);
        }
        this.pc.ondatachannel = (event) => {
            console.log("WebRtc DataChannel Recieved from C++ Server:",event.channel.label);
            this.dataChannel = event.channel;
            this.dataChannel.binaryType = "arraybuffer";
            this.dataChannel.onopen = () => {
                console.log("UPDT data channel is now open and active")
                this.isConnected = true;
                this.startRttHeartbeat();
            };
            this.dataChannel.onmessage = (dcEvent:MessageEvent) => {
                if(dcEvent.data instanceof ArrayBuffer){
                    this.handleBinaryUDPMessage(dcEvent.data);
                }
            }
        }
    }

     private async handleSignalingJSON(msg: any) {
        if (msg.type === "MATCH_START") {
            this.myRole = msg.role;
            this.myPlayerId = msg.playerId;
            this.opponentId = msg.opponentId;

            console.log(`⚔️ MATCH STARTED! Role: ${this.myRole} | My ID: ${this.myPlayerId} | Opponent ID: ${this.opponentId}`);

            if (this.onMatchStart) {
                this.onMatchStart(this.myRole, this.myPlayerId, this.opponentId);
            }
        }
        else if (msg.type === "answer" && this.pc) {
            // C++ Backend Server se aaye SDP Answer ko accept karna:
            console.log("🌐 [Signaling] SDP Answer received from C++ Server!");
            await this.pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: msg.sdp }));
        }
        else if (msg.type === "candidate" && this.pc) {
            // ICE Candidate (Network Address) ko WebRTC me add karna:
            await this.pc.addIceCandidate(new RTCIceCandidate({ candidate: msg.candidate, sdpMid: msg.mid }));
        }
    }

    private handleBinaryUDPMessage(buffer:ArrayBuffer){
        const view = new DataView(buffer);
        const opcode = view.getUint8(0);

        if(opcode === PacketType.BOWLER_RELEASE){
            const senderId = view.getUint32(1,true);
            const tick = view.getUint16(5,true);
            const startX = view.getFloat32(7, true);
            const startY = view.getFloat32(11, true);
            const startVx = view.getFloat32(15, true);
            const startVy = view.getFloat32(19, true);   

            if (this.onBowlerRelease) {
                this.onBowlerRelease(startX, startY, startVx, startVy);
            }
        
        }else if(opcode === PacketType.BAT_SWING_STREAM){
            const senderId = view.getUint32(1,true);
            const tick = view.getUint16(5,true);
            const handleX = view.getFloat32(7, true);
            const handleY = view.getFloat32(11, true);
            const batAngle = view.getFloat32(15, true);
            if (this.onOpponentBatSwing) {
                this.onOpponentBatSwing(tick, handleX, handleY, batAngle);
            }
        }else if (opcode === PacketType.HIT_RESULT) {
            const senderId = view.getUint32(1, true);
            const tick = view.getUint16(5, true);
            const exitX = view.getFloat32(7, true);
            const exitY = view.getFloat32(11, true);
            const exitVx = view.getFloat32(15, true);
            const exitVy = view.getFloat32(19, true);
            if (this.onHitResult) {
                this.onHitResult(exitX, exitY, exitVx, exitVy);
            }
        }else if(opcode === PacketType.PING){
            const senderId = view.getUint32(1,true);
            const seq = view.getUint16(5,true);
            this.dataChannel!.send(serializePong(senderId,seq));
        }else if(opcode === PacketType.PONG){
            const seq = view.getUint16(5,true);
            const sendTime = this.pendingPings.get(seq);
            if(sendTime !== undefined){
                const sample = performance.now() - sendTime;
                this.pendingPings.delete(seq);
                this.rttSamples.push(sample);
                if(this.rttSamples.length > this.RTT_WINDOW_SIZE){
                    this.rttSamples.shift();
                }
                this.lastRTT = this.calculateMedianRTT();
                 console.log(`💓 RTT sample: ${sample.toFixed(1)}ms | Median RTT: ${this.lastRTT.toFixed(1)}ms`);
            }

        }
    }
    public sendBowlerRelease(tick: number, startX: number, startY: number, startVx: number, startVy: number) {
        if (this.dataChannel && this.dataChannel.readyState === "open") {
            const buffer = serializeBowlerRelease(this.myPlayerId, tick, startX, startY, startVx, startVy);
            this.dataChannel.send(buffer);
        }
    }

     public sendBatSwingUDP(tick: number, handleX: number, handleY: number, batAngle: number) {
        if (this.dataChannel && this.dataChannel.readyState === "open") {
            const buffer = serializeBatSwing(this.myPlayerId, tick, handleX, handleY, batAngle);
            this.dataChannel.send(buffer);
        }
    }
    public sendHitResult(tick: number, exitX: number, exitY: number, exitVx: number, exitVy: number) {
        if (this.dataChannel && this.dataChannel.readyState === "open") {
            const buffer = serializeHitResult(this.myPlayerId, tick, exitX, exitY, exitVx, exitVy);
            this.dataChannel.send(buffer);
        }
    }

    private startRttHeartbeat(){
        if(this.rttPingTimer) return;
        this.rttPingTimer = setInterval(()=>{
            if(this.dataChannel && this.dataChannel.readyState === "open"){
                const now = performance.now();
                this.pendingPings.forEach((sendTime,seq)=>{
                    if(now - sendTime > 3000){ 
                        this.pendingPings.delete(seq);
                    }
                });
                const seq = this.pingSequence; 
                this.pingSequence = (this.pingSequence + 1) % 65536;
                this.pendingPings.set(seq,performance.now());
                this.dataChannel!.send(serializePing(this.myPlayerId, seq));            }
        },500)
    }
    private stopRttHeartbeat(){
        if(this.rttPingTimer){
            clearInterval(this.rttPingTimer);
            this.rttPingTimer = null;
        }
        this.pendingPings.clear();
        this.rttSamples = [];
        this.lastRTT = 0;
    }

    private calculateMedianRTT(): number {
        if (this.rttSamples.length === 0) return 0;
        const sorted = [...this.rttSamples].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
        return Math.max(median, this.RTT_CLAMP_MIN); // Minimum clamp 20ms
    }
      public getRTT(): number {
        return this.lastRTT;
    }
}