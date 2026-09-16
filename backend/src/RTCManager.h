#pragma once
#include <rtc/rtc.hpp>
#include <iostream>
#include <memory>
#include <functional>
#include "NetworkProtocol.h"
#include "../libs/json/json.hpp"

using json = nlohmann::json;

class RTCManager{
    public:
        using PacketCallback = std::function<void(const rtc::binary&)>;

        RTCManager(int playerId,std::function<void(std::string)> sendWsMsg,PacketCallback packetForward = nullptr) : id(playerId), sendSignalingMessage(sendWsMsg),onPacketForward(packetForward) {
          
            rtc::Configuration config;
            config.iceServers.emplace_back("stun:stun.l.google.com:19302");

            // TURN Server configuration with Username & Password:
            rtc::IceServer turnServer("turn:openrelay.metered.ca:80");
            turnServer.username = "openrelay";
            turnServer.password = "openrelay";
            config.iceServers.push_back(turnServer);

            peerConnection = std::make_shared<rtc::PeerConnection>(config);

            peerConnection->onLocalDescription([this](rtc::Description description) {
                std::cout << "[RTCManager] Local Description generate hua";
                json msg = {{"type", description.typeString()}, {"sdp", std::string(description)}};
                sendSignalingMessage(msg.dump());
            });

            peerConnection->onLocalCandidate([this](rtc::Candidate candidate) {
                std::cout << "Naya ICE Candidate mila!\n";
                json msg = {{"type", "candidate"}, {"candidate", std::string(candidate)}, {"mid", candidate.mid()}};
                sendSignalingMessage(msg.dump());
            });
            peerConnection->onDataChannel([this](std::shared_ptr<rtc::DataChannel> dc) {
                std::string label = dc->label();
                std::cout << "🚀 [WebRTC] UDP DATA CHANNEL OPEN for Player " << id << "!\n";
            if (label == "gameStream") {
                    unreliableChannel = dc;
                } else {
                    reliableChannel = dc;
                }            
                static uint32_t udpPacketCount = 0;

                // Jab UDP se message aayega
                 dc->onMessage([this](std::variant<rtc::binary, rtc::string> data) {
                    if (std::holds_alternative<rtc::binary>(data)) {
                        auto binaryData = std::get<rtc::binary>(data);
                        udpPacketCount++;
                        if (udpPacketCount % 60 == 0) {
                            std::cout << "🌊 [UDP Stream] Player " << id << " se 60 UDP Packets Receive Hue! Total: " << udpPacketCount << "\n";
                        }
                        if(binaryData.size() >= sizeof(PacketHeader)){
                            if(onPacketForward){
                                onPacketForward(binaryData);
                            }
                        }                        
                      
                    }
                });
            });

            peerConnection->onStateChange([this](rtc::PeerConnection::State state) {
                std::cout << "🌐 [WebRTC State Player " << id << "]: " << state << "\n";
                if (state == rtc::PeerConnection::State::Connected) {
                    std::cout << "✅✅ [SUCCESS] WebRTC Peer Connection CONNECTED for Player " << id << "!\n";
                } else if (state == rtc::PeerConnection::State::Failed) {
                    std::cout << "❌❌ [FAILED] WebRTC Peer Connection FAILED for Player " << id << "! (UDP Blocked by ISP/NAT)\n";
                }
            });
        }

        ~RTCManager() {
            if (peerConnection) peerConnection->close();
        }
        void sendUDP(const rtc::binary& data) {
            if (data.empty()) return;
            uint8_t opcode = static_cast<uint8_t>(data[0]);
            // 0x02 = Bat Swing Stream, 0x09 = Joystick Stream (Unreliable 60Hz stream)
            bool isStreamPacket = (opcode == 0x02 || opcode == 0x09);
            if (isStreamPacket) {
                // 🌊 Unreliable 60Hz Telemetry -> Only over Unreliable Channel
                if (unreliableChannel && unreliableChannel->isOpen()) {
                    unreliableChannel->send(data);
                }
            } else {
                // 🎯 Critical Reliable Events -> Only over Reliable Channel
                if (reliableChannel && reliableChannel->isOpen()) {
                    reliableChannel->send(data);
                }
            }

        }
        int id;
        std::shared_ptr<rtc::PeerConnection> peerConnection;
        std::function<void(std::string)> sendSignalingMessage;
        PacketCallback onPacketForward;
        std::shared_ptr<rtc::DataChannel> reliableChannel;
        std::shared_ptr<rtc::DataChannel> unreliableChannel;
};