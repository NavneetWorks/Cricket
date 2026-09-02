
import {serializeBatSwing,serializeBowlerRelease,serializeHitResult,PacketType} from './NetworkProtocol';
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

    public connect(serverUrl:string = "ws://localhost:9001"){
        this.ws = new WebSocket(serverUrl);
        this.ws.binaryType = "arraybuffer";
        this.ws.onopen = () => {
            console.log("🟢 WebSocket Connected! Initializing WebRTC Engine...");
            this.setupWebRTC();
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
}